"""Query structured project history without loading the full journal into context."""
import argparse
from collections import Counter
from datetime import date
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
JOURNAL = Path('worklog.jsonl')
REPOSITORIES = ('infinite-dream-preview', 'infinite-dream')
WORKERS = {'Codex', 'Claude', 'human', 'mixed', 'unknown'}
KINDS = {'change', 'historical_commit', 'log_commit'}
STATUSES = {'committed', 'verified', 'reverted', 'superseded', 'pending'}
RELEASES = {'unknown', 'reported_success', 'reported_failure', 'not_released'}
GIT = shutil.which('git.exe') or ('C:/Program Files/Git/cmd/git.exe' if sys.platform == 'win32' else shutil.which('git'))
BRIEF = ('id', 'date', 'repository', 'worker', 'module', 'title', 'status', 'commit_ids')


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
    return '\n'.join(lines[source['line_start'] - 1:source['line_end']])


def detail(root, row):
    return read_reference(root, row['source'])


def validate(root):
    rows = load(root)
    ids = {row['id'] for row in rows}
    assert len(ids) == len(rows), 'Duplicate record IDs'
    commits = set(git(root, 'rev-list', '--all').splitlines())
    by_id = {row['id']: row for row in rows}
    required = {'id', 'date', 'repository', 'worker', 'worker_basis', 'kind', 'module',
                'title', 'problem', 'solution', 'commit_ids', 'related_commits', 'status',
                'validation', 'release_status', 'superseded_by', 'source', 'order'}
    for row in rows:
        assert set(row) == required, (row['id'], 'Wrong fields')
        date.fromisoformat(row['date'])
        assert row['repository'] == root.name
        assert row['worker'] in WORKERS and row['kind'] in KINDS
        assert row['status'] in STATUSES and row['release_status'] in RELEASES
        assert row['title'] and len(row['title']) <= 120
        assert row['problem'] is None or isinstance(row['problem'], str)
        assert isinstance(row['order'], int)
        assert len(row['solution']) <= 300
        assert len(row['commit_ids']) == len(set(row['commit_ids']))
        assert all(len(h) == 40 and h in commits for h in row['commit_ids'])
        assert row['validation']['status'] in {'not_recorded', 'reported', 'passed', 'failed'}
        assert len(row['validation']['summary']) <= 200
        for reference in row['superseded_by']:
            assert reference in by_id and reference != row['id']
        assert row['status'] not in {'reverted', 'superseded'} or row['superseded_by']
        assert detail(root, row), (row['id'], 'Missing source evidence')
    # Only the historical snapshot is audited here. Pure new journal commits do not self-reference.
    report = json.loads((root / 'docs/references/history/migration.json').read_text(encoding='utf-8'))
    old_commits = set(git(root, 'rev-list', report['source_head']).splitlines())
    represented = {h for row in rows for h in row['commit_ids']}
    assert old_commits <= represented, 'Historical commits omitted'
    archive = root / report['archive']
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == report['archive_sha256']
    assert not (root / 'WORK_LOG.md').exists(), 'Old root journal remains active'
    return {'repository': root.name, 'records': len(rows), 'historical_commits': len(old_commits),
            'workers': dict(Counter(r['worker'] for r in rows)), 'source_archive_intact': True}


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
    args = parser.parse_args(argv)
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
    except (ValueError, AssertionError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
