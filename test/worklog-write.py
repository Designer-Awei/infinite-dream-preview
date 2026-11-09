"""Exercise journal writes in an isolated real Git repository under the project cache."""
from pathlib import Path
import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
import uuid
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import worklog as W

base = ROOT.parent / '.cache' / ('journal-write-' + uuid.uuid4().hex)
root = base / 'infinite-dream-preview'
root.mkdir(parents=True, mode=0o777)
checks = []


def git(*args):
    return subprocess.check_output([W.GIT, *args], cwd=root, stderr=subprocess.PIPE).decode().strip()


def rejected(action, label):
    before = (root / W.JOURNAL).read_bytes()
    try:
        action()
    except (ValueError, OSError):
        pass
    else:
        raise AssertionError('Write unexpectedly accepted: ' + label)
    assert (root / W.JOURNAL).read_bytes() == before
    checks.append(label)


try:
    git('init', '--initial-branch=main')
    archive = root / 'docs/references/history/WORK_LOG.before-jsonl.md'
    archive.parent.mkdir(parents=True)
    archive.write_bytes(b'original source\n')
    git('add', '.')
    git('-c', 'user.name=JournalTest', '-c', 'user.email=journal@example.invalid', 'commit', '-m', 'Real source change')
    commit = git('rev-parse', 'HEAD')
    report = {'source_head': commit, 'archive': str(archive.relative_to(root)).replace('\\', '/'),
              'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
    (archive.parent / 'migration.json').write_text(json.dumps(report), encoding='utf-8')
    (root / W.JOURNAL).write_bytes(b'')
    payload = {'id': 'first', 'worker': 'Codex', 'module': 'logging', 'title': 'Real append',
               'solution': 'Append through the write API.', 'commit_ids': [commit]}
    dry = W.append_entry(root, payload, dry_run=True)
    assert dry['dry_run'] and (root / W.JOURNAL).read_bytes() == b''
    W.append_entry(root, payload)
    first_line = (root / W.JOURNAL).read_bytes()
    W.append_entry(root, {**payload, 'id': 'second'})
    before = (root / W.JOURNAL).read_bytes()
    assert before.startswith(first_line)
    found = W.get_entry(root, 'first')
    W.update_entry(root, 'first', {'validation': {'status': 'passed', 'summary': 'Executed fixture test'}},
                   expected_revision=found['revision'])
    after = (root / W.JOURNAL).read_bytes()
    assert before.splitlines(keepends=True)[1:] == after.splitlines(keepends=True)[1:]
    assert W.get_entry(root, 'first')['entry']['validation']['refs'] == []
    checks += ['dry_run', 'append_preserves_old_bytes', 'exact_id_patch', 'nested_patch_preserves_fields']
    rejected(lambda: W.append_entry(root, payload), 'duplicate_id')
    rejected(lambda: W.append_entry(root, {**payload, 'id': 'bad', 'worker': 'guess'}), 'invalid_worker')
    rejected(lambda: W.append_entry(root, {**payload, 'id': 'bad', 'commit_ids': ['f' * 40]}), 'unreal_commit')
    rejected(lambda: W.append_entry(root, {**payload, 'id': 'bad', 'surprise': 1}), 'unknown_field')
    rejected(lambda: W.append_entry(root, {**payload, 'id': 'bad', 'repository': 'infinite-dream'}), 'wrong_repository')
    rejected(lambda: W.append_entry(root, [{**payload, 'id': 'batch-valid'}, {**payload, 'id': 'bad', 'worker': 'guess'}]), 'atomic_batch_rejects_all')
    rejected(lambda: W.update_entry(root, 'first', {'status': 'verified'}, expected_revision=found['revision']), 'stale_revision')
    revision = W.get_entry(root, 'first')['revision']
    rejected(lambda: W.update_entry(root, 'missing', {'status': 'verified'}, expected_revision=revision), 'missing_id')
    rejected(lambda: W.update_entry(root, 'first', {'id': 'renamed'}, expected_revision=revision), 'immutable_identity')
    rejected(lambda: W.update_entry(root, 'first', {'worker': 'Claude'}, expected_revision=revision), 'worker_change_needs_basis')
    rejected(lambda: W.update_entry(root, 'first', {'status': 'superseded', 'superseded_by': ['missing']}, expected_revision=revision), 'invalid_relationship')
    with patch.object(W.os, 'replace', side_effect=OSError('Simulated interrupted replacement')):
        rejected(lambda: W.append_entry(root, {**payload, 'id': 'interrupted'}), 'interrupted_write_preserves_original')
    with W.write_lock(root):
        rejected(lambda: W.append_entry(root, {**payload, 'id': 'overlap'}), 'concurrent_writer_rejected')
    assert not list((root.parent / '.cache/worklog-writes').glob('*.jsonl'))
    assert not list((root.parent / '.cache/worklog-writes').glob('*.lock'))
    checks.append('temporary_and_lock_cleanup')
    outside = base / 'outside.txt'
    outside.write_text('outside', encoding='utf-8')
    bad_source = {'file': '../outside.txt', 'line_start': 1, 'line_end': 1}
    rejected(lambda: W.append_entry(root, {**payload, 'id': 'escape', 'source': bad_source}), 'source_path_escape')
    W.validate(root)
    print(json.dumps({'checks': checks, 'count': len(checks), 'real_git_fixture': True}, ensure_ascii=False))
finally:
    assert base.resolve().parent == (ROOT.parent / '.cache').resolve()
    # Windows Git marks object files read-only; remove only this known isolated fixture.
    def writable_retry(function, path, error):
        os.chmod(path, 0o700)
        function(path)
    shutil.rmtree(base, onerror=writable_retry)
