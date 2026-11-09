"""Query structured project history without loading the full journal into context."""
import argparse
from collections import Counter
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
JOURNAL = Path('worklog.jsonl')
REPOSITORIES = ('infinite-dream-preview', 'infinite-dream')
WORKERS = {'Codex', 'Claude', 'human', 'mixed', 'unknown'}
KINDS = {'change', 'historical_commit', 'log_commit'}
STATUSES = {'committed', 'verified', 'reverted', 'superseded', 'pending'}
RELEASES = {'unknown', 'reported_success', 'reported_failure', 'not_released'}
GIT = shutil.which('git.exe') or ('C:/Program Files/Git/cmd/git.exe' if sys.platform == 'win32' else shutil.which('git'))
BRIEF = ('id', 'date', 'repository', 'worker', 'module', 'title', 'status', 'commit_ids')
REQUIRED = {'id', 'date', 'repository', 'worker', 'worker_basis', 'kind', 'module',
            'title', 'problem', 'solution', 'commit_ids', 'related_commits', 'status',
            'validation', 'release_status', 'superseded_by', 'source', 'order'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(root, *args):
    return subprocess.check_output([GIT, *args], cwd=root).decode('utf-8').strip()


def load(root):
    result = []
    for number, line in enumerate((root / JOURNAL).read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip():
            raise ValueError(f'{root.name}:{number}: blank line')
        try:
            result.append(json.loads(line))
        except json.JSONDecodeError as error:
            raise ValueError(f'{root.name}:{number}: {error}') from error
    return result


def select(rows, args):
    needles = [word.casefold() for word in args.query]
    result = []
    for row in rows:
        if row['kind'] == 'log_commit' and not (args.include_logs or args.kind or args.commit or args.id):
            continue
        if args.kind and row['kind'] != args.kind:
            continue
        if args.worker and row['worker'].casefold() != args.worker.casefold():
            continue
        if args.module and args.module.casefold() not in row['module'].casefold():
            continue
        if args.status and row['status'] != args.status:
            continue
        if args.since and row['date'] < args.since:
            continue
        if args.until and row['date'] > args.until:
            continue
        if args.id and row['id'] != args.id:
            continue
        if args.commit and not any(h.startswith(args.commit) for h in row['commit_ids']):
            continue
        haystack = json.dumps(row, ensure_ascii=False).casefold()
        if not all(word in haystack for word in needles):
            root = ROOT.parent / row['repository']
            haystack += detail(root, row).casefold()
            for reference in row['validation']['refs']:
                haystack += read_reference(root, reference).casefold()
            if not all(word in haystack for word in needles):
                continue
        result.append(row)
    result.sort(key=lambda r: (r['date'], r['order'], r['id']), reverse=True)
    return result[:args.limit]


@lru_cache(maxsize=8)
def source_lines(path):
    return path.read_text(encoding='utf-8-sig').splitlines()


def read_reference(root, source):
    if source.get('git'):
        return git(root, 'show', '-s', '--format=%B', source['git'])
    path = (root / source['file']).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Source reference escapes repository')
    lines = source_lines(path)
    require(1 <= source['line_start'] <= source['line_end'] <= len(lines), 'Source line range exceeds file')
    return '\n'.join(lines[source['line_start'] - 1:source['line_end']])


def detail(root, row):
    return read_reference(root, row['source'])


def validate(root, rows=None):
    rows = load(root) if rows is None else rows
    require(all(isinstance(row, dict) and isinstance(row.get('id'), str) for row in rows), 'Entries need string IDs')
    ids = {row['id'] for row in rows}
    require(len(ids) == len(rows), 'Duplicate record IDs')
    commits = set(git(root, 'rev-list', '--all').splitlines())
    repository_commits = {root.name: commits}
    by_id = {row['id']: row for row in rows}
    for row in rows:
        require(set(row) == REQUIRED, f'{row["id"]}: wrong fields')
        require(isinstance(row['id'], str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,160}', row['id']), 'Invalid record ID')
        date.fromisoformat(row['date'])
        require(row['repository'] == root.name, 'Entry belongs to another repository')
        require(row['worker'] in WORKERS and row['kind'] in KINDS, 'Invalid worker or kind')
        require(row['status'] in STATUSES and row['release_status'] in RELEASES, 'Invalid status')
        for key in ('title', 'solution', 'module', 'worker_basis'):
            require(isinstance(row[key], str) and bool(row[key].strip()), f'{key} must be nonempty text')
        require(len(row['title']) <= 120 and len(row['solution']) <= 300, 'Title or solution too long')
        require(row['problem'] is None or isinstance(row['problem'], str), 'Invalid problem')
        require(type(row['order']) is int, 'Invalid order')
        for key in ('commit_ids', 'related_commits', 'superseded_by'):
            require(isinstance(row[key], list), f'{key} must be an array')
        require(len(row['commit_ids']) == len(set(row['commit_ids'])), 'Duplicate commit IDs')
        require(all(isinstance(h, str) and len(h) == 40 and h in commits for h in row['commit_ids']), 'Commit does not exist in this repository')
        for related in row['related_commits']:
            require(set(related) == {'repository', 'id'} and related['repository'] in REPOSITORIES, 'Invalid related commit')
            require(isinstance(related['id'], str) and re.fullmatch('[0-9a-f]{40}', related['id']), 'Related commit needs full hash')
            other = root.parent / related['repository']
            if (other / '.git').exists():
                if related['repository'] not in repository_commits:
                    repository_commits[related['repository']] = set(git(other, 'rev-list', '--all').splitlines())
                require(related['id'] in repository_commits[related['repository']], 'Related commit does not exist')
        require(isinstance(row['validation'], dict) and set(row['validation']) == {'status', 'summary', 'refs'}, 'Invalid validation fields')
        require(row['validation']['status'] in {'not_recorded', 'reported', 'passed', 'failed'}, 'Invalid validation status')
        require(isinstance(row['validation']['summary'], str) and len(row['validation']['summary']) <= 200, 'Invalid validation summary')
        require(isinstance(row['validation']['refs'], list), 'Invalid validation references')
        for source in [row['source'], *row['validation']['refs']]:
            require(isinstance(source, dict), 'Invalid source')
            if 'git' in source:
                require(set(source) == {'git'} and source['git'] in commits, 'Invalid source commit')
            else:
                require(set(source) == {'file', 'line_start', 'line_end'}, 'Invalid file source')
                require(type(source['line_start']) is int and type(source['line_end']) is int and 1 <= source['line_start'] <= source['line_end'], 'Invalid source line range')
                require(bool(read_reference(root, source)), 'Missing source evidence')
        for reference in row['superseded_by']:
            require(reference in by_id and reference != row['id'], 'Invalid replacement record')
        require(row['status'] not in {'reverted', 'superseded'} or row['superseded_by'], 'Replacement record required')
    visiting, visited = set(), set()
    def visit(key):
        require(key not in visiting, 'Circular superseded_by relationship')
        if key in visited:
            return
        visiting.add(key)
        for successor in by_id[key]['superseded_by']:
            visit(successor)
        visiting.remove(key)
        visited.add(key)
    for key in by_id:
        visit(key)
    # Only the historical snapshot is audited here. Pure new journal commits do not self-reference.
    report = json.loads((root / 'docs/references/history/migration.json').read_text(encoding='utf-8'))
    old_commits = set(git(root, 'rev-list', report['source_head']).splitlines())
    represented = {h for row in rows for h in row['commit_ids']}
    require(old_commits <= represented, 'Historical commits omitted')
    archive = root / report['archive']
    require(hashlib.sha256(archive.read_bytes()).hexdigest() == report['archive_sha256'], 'Source archive changed')
    require(not (root / 'WORK_LOG.md').exists(), 'Old root journal remains active')
    return {'repository': root.name, 'records': len(rows), 'historical_commits': len(old_commits),
            'workers': dict(Counter(r['worker'] for r in rows)), 'source_archive_intact': True}


def revision(data):
    return hashlib.sha256(data).hexdigest()


def get_entry(root, entry_id):
    data = (root / JOURNAL).read_bytes()
    matches = [row for row in map(json.loads, data.decode('utf-8').splitlines()) if row['id'] == entry_id]
    require(len(matches) == 1, 'Record ID not found or not unique')
    return {'entry': matches[0], 'revision': revision(data)}


def build_entry(root, fields):
    """Fill mechanical fields; worker, module, title, solution and real commits stay explicit."""
    require(isinstance(fields, dict) and not (set(fields) - REQUIRED), 'Unknown entry fields')
    for key in ('worker', 'module', 'title', 'solution', 'commit_ids'):
        require(key in fields, f'Missing required input: {key}')
    require(isinstance(fields['commit_ids'], list) and fields['commit_ids'], 'A real committed change is required')
    primary = fields['commit_ids'][0]
    require(isinstance(primary, str) and re.fullmatch('[0-9a-f]{40}', primary), 'Use the complete commit hash')
    require(primary in git(root, 'rev-list', '--all').splitlines(), 'Commit does not exist in this repository')
    at = datetime.fromisoformat(git(root, 'show', '-s', '--format=%aI', primary)).astimezone(timezone(timedelta(hours=8)))
    row = {'id': f'{root.name}-{primary[:12]}-{uuid.uuid4().hex[:8]}', 'date': at.date().isoformat(),
           'repository': root.name, 'worker_basis': 'explicit_write_api', 'kind': 'change',
           'problem': None, 'related_commits': [], 'status': 'committed',
           'validation': {'status': 'not_recorded', 'summary': '', 'refs': []},
           'release_status': 'unknown', 'superseded_by': [], 'source': {'git': primary},
           'order': int(at.timestamp()) * 100}
    row.update(fields)
    return row


@contextmanager
def write_lock(root):
    root = root.resolve()
    path = root / JOURNAL
    require(root.name in REPOSITORIES and path.resolve().parent == root and not path.is_symlink(), 'Invalid journal target')
    cache = root.parent / '.cache' / 'worklog-writes'
    cache.mkdir(parents=True, exist_ok=True)
    require(cache.resolve().is_relative_to(root.parent), 'Write cache escapes project')
    lock = cache / (revision(os.path.normcase(str(root)).encode())[:16] + '.lock')
    try:
        handle = lock.open('x', encoding='utf-8')
    except FileExistsError as error:
        raise ValueError('Journal writer busy; retry after the active write finishes') from error
    try:
        with handle:
            handle.write(str(os.getpid()))
        yield cache
    finally:
        lock.unlink()


def write_entries(root, fields=None, entry_id=None, patch=None, expected_revision=None, dry_run=False):
    """Validate the entire candidate, then atomically replace only the requested data."""
    root = Path(root).resolve()
    with write_lock(root) as cache:
        path = root / JOURNAL
        before = path.read_bytes()
        require(expected_revision is None or revision(before) == expected_revision, 'Journal changed since read; read again before updating')
        lines = before.decode('utf-8').splitlines(keepends=True)
        require(not lines or before.endswith(b'\n'), 'Journal must end in a newline')
        rows = [json.loads(line) for line in lines]
        if entry_id is not None:
            require(expected_revision is not None, 'Update requires the revision returned by get_entry')
            require(isinstance(patch, dict) and patch and not (set(patch) - REQUIRED), 'Invalid patch fields')
            require(not ({'id', 'repository'} & set(patch)), 'Record identity cannot be changed')
            require('worker' not in patch or 'worker_basis' in patch, 'Worker correction needs its basis')
            matches = [i for i, row in enumerate(rows) if row['id'] == entry_id]
            require(len(matches) == 1, 'Record ID not found or not unique')
            index = matches[0]
            updated = dict(rows[index])
            updated.update(patch)
            if 'validation' in patch:
                require(isinstance(patch['validation'], dict), 'Validation patch must be an object')
                updated['validation'] = {**rows[index]['validation'], **patch['validation']}
            rows[index] = updated
            ending = '\r\n' if lines[index].endswith('\r\n') else '\n'
            lines[index] = json.dumps(updated, ensure_ascii=False, separators=(',', ':')) + ending
            ids, operation = [entry_id], 'update'
        else:
            inputs = fields if isinstance(fields, list) else [fields]
            require(bool(inputs), 'No entries supplied')
            entries = [build_entry(root, item) for item in inputs]
            ids, operation = [row['id'] for row in entries], 'append'
            rows.extend(entries)
            lines.extend(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n' for row in entries)
        source_lines.cache_clear()
        validate(root, rows)
        after = ''.join(lines).encode('utf-8')
        result = {'operation': operation, 'ids': ids, 'revision_before': revision(before),
                  'revision_after': revision(after), 'dry_run': dry_run}
        if not dry_run:
            temporary = cache / (uuid.uuid4().hex + '.jsonl')
            try:
                with temporary.open('xb') as output:
                    output.write(after)
                    output.flush()
                    os.fsync(output.fileno())
                require(path.read_bytes() == before, 'Journal changed during write; nothing replaced')
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
        return result


def append_entry(root, fields, *, dry_run=False):
    return write_entries(root, fields=fields, dry_run=dry_run)


def update_entry(root, entry_id, patch, *, expected_revision, dry_run=False):
    return write_entries(root, entry_id=entry_id, patch=patch, expected_revision=expected_revision, dry_run=dry_run)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query', nargs='*', help='AND-match keywords, case insensitive')
    parser.add_argument('--all', action='store_true', help='Search both sibling repositories')
    parser.add_argument('--repo', choices=REPOSITORIES)
    parser.add_argument('--worker')
    parser.add_argument('--module')
    parser.add_argument('--status', choices=sorted(STATUSES))
    parser.add_argument('--kind', choices=sorted(KINDS))
    parser.add_argument('--since')
    parser.add_argument('--until')
    parser.add_argument('--commit')
    parser.add_argument('--id')
    parser.add_argument('--include-logs', action='store_true')
    parser.add_argument('--limit', type=int, default=8)
    parser.add_argument('--full', action='store_true')
    parser.add_argument('--detail', action='store_true', help='Read only matched source paragraphs')
    parser.add_argument('--fields', help='Comma-separated JSON fields')
    parser.add_argument('--validate', action='store_true')
    parser.add_argument('--stats', action='store_true')
    operations = parser.add_mutually_exclusive_group()
    operations.add_argument('--get', metavar='ID', help='Return one entry and the revision for a precise update')
    operations.add_argument('--append', metavar='JSON_FILE', help='Append one object or an atomic batch; - reads stdin')
    operations.add_argument('--update', metavar='ID', help='Patch exactly one existing entry')
    parser.add_argument('--input', metavar='JSON_FILE', help='Update patch; - reads stdin')
    parser.add_argument('--expect-revision', help='Required for updates; returned by --get')
    parser.add_argument('--dry-run', action='store_true', help='Validate and preview a write without changing the journal')
    args = parser.parse_args(argv)
    if args.get or args.append or args.update:
        if args.all or args.query or args.validate or args.stats:
            parser.error('Read/write one explicit repository; do not combine with a cross-repository query')
        root = ROOT.parent / (args.repo or ROOT.name)
        if args.get:
            print(json.dumps(get_entry(root, args.get), ensure_ascii=False))
            return
        filename = args.append or args.input
        if not filename:
            parser.error('--update needs --input')
        text = sys.stdin.read() if filename == '-' else Path(filename).read_text(encoding='utf-8-sig')
        payload = json.loads(text)
        result = append_entry(root, payload, dry_run=args.dry_run) if args.append else update_entry(
            root, args.update, payload, expected_revision=args.expect_revision, dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False))
        return
    if args.input or args.expect_revision or args.dry_run:
        parser.error('Write options require --append or --update')
    if args.limit < 1 or args.limit > 200:
        parser.error('--limit must be 1..200')
    for value in (args.since, args.until):
        if value:
            date.fromisoformat(value)
    names = REPOSITORIES if args.all else (args.repo or ROOT.name,)
    roots = [ROOT.parent / name for name in names if (ROOT.parent / name / JOURNAL).exists()]
    if not roots:
        parser.error('No project journal found')
    if args.repo:
        roots = [root for root in roots if root.name == args.repo]
    for root in roots:
        if args.validate:
            print(json.dumps(validate(root), ensure_ascii=False))
    if args.validate:
        return
    rows = [row for root in roots for row in load(root)]
    if args.stats:
        print(json.dumps({'records': len(rows), 'repositories': dict(Counter(r['repository'] for r in rows)),
                          'workers': dict(Counter(r['worker'] for r in rows)),
                          'kinds': dict(Counter(r['kind'] for r in rows))}, ensure_ascii=False))
        return
    fields = args.fields.split(',') if args.fields else BRIEF
    for row in select(rows, args):
        result = dict(row) if args.full else {key: row[key] for key in fields}
        if args.detail:
            result['detail'] = detail(ROOT.parent / row['repository'], row)
        print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, AssertionError, KeyError, TypeError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
