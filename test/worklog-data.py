"""Audit complete migration, bounded queries and preservation of authored website docs."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
sys.path.insert(0, str(ROOT / 'tools'))
import worklog


def command(*args):
    return subprocess.check_output([sys.executable, str(ROOT / 'tools/worklog.py'), *args], encoding='utf-8')


reports = [worklog.validate(WORKSPACE / name) for name in worklog.REPOSITORIES]
rows = [row for name in worklog.REPOSITORIES for row in worklog.load(WORKSPACE / name)]
assert len({r['id'] for r in rows}) == len(rows)
for name in worklog.REPOSITORIES:
    policy = json.loads((WORKSPACE / name / 'docs/rules/worker-policy.json').read_text(encoding='utf-8'))
    for row in rows:
        if row['repository'] != name or row['date'] >= '2026-11-06':
            continue
        assigned = {policy['commit_overrides'].get(h, policy['legacy_default']) for h in row['commit_ids']}
        assert row['worker'] == (next(iter(assigned)) if len(assigned) == 1 else 'mixed')
brief = [json.loads(line) for line in command('--all', '--limit', '2').splitlines()]
assert len(brief) == 2 and all(set(r) == set(worklog.BRIEF) for r in brief)
assert all(r['kind'] != 'log_commit' for r in [json.loads(x) for x in command('--all', '--full', '--limit', '200').splitlines()])
fox = [json.loads(line) for line in command('世界比例独立', '--module', 'pets.fox', '--limit', '8').splitlines()]
assert fox and any('f659337' in ''.join(row['commit_ids']) for row in fox), 'Keyword omitted by summary clipping'
claude = [json.loads(line) for line in command('--all', '--worker', 'Claude', '--limit', '5').splitlines()]
assert claude and all(r['worker'] == 'Claude' for r in claude)
old_log = next(row for row in rows if row['kind'] == 'log_commit' and row['repository'] == ROOT.name)
assert old_log['id'] in command('--commit', old_log['commit_ids'][0][:12], '--full')
assert any(r['status'] == 'reverted' and r['superseded_by'] for r in rows)

# Isolated, project-local copy of the publishing boundary; never delete the real docs during this check.
fixture = WORKSPACE / '.cache' / ('journal-publish-' + uuid.uuid4().hex)
fixture.mkdir(mode=0o777)
try:
    (fixture / 'tools').mkdir()
    (fixture / 'dist').mkdir()
    for folder in ['references/history', 'rules', 'assets']:
        (fixture / 'docs' / folder).mkdir(parents=True, exist_ok=True)
    (fixture / 'dist/game.js').write_bytes(b'new runtime\r\n')
    (fixture / 'docs/stale.js').write_text('old', encoding='utf-8')
    (fixture / 'docs/assets/stale.png').write_bytes(b'old')
    reference = fixture / 'docs/references/history/legacy.md'
    rule = fixture / 'docs/rules/worker.json'
    reference.write_bytes(b'original\r\nbyte-preserved\r\n')
    rule.write_bytes(b'{"worker":"Claude"}\r\n')
    before = {p.relative_to(fixture).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in [reference, rule]}
    shutil.copy2(ROOT / 'tools/publish_docs.py', fixture / 'tools/publish_docs.py')
    subprocess.run([sys.executable, str(fixture / 'tools/publish_docs.py')], check=True)
    assert not (fixture / 'docs/stale.js').exists() and not (fixture / 'docs/assets').exists()
    assert (fixture / 'docs/game.js').read_bytes() == b'new runtime\r\n'
    subprocess.run([sys.executable, str(ROOT / 'tools/manifest.py'), str(fixture / 'docs')], check=True, stdout=subprocess.PIPE)
    manifest = json.loads((fixture / 'docs/update.json').read_bytes())
    assert set(manifest['files']) == {'game.js'}, 'Authored docs entered hot-update download list'
    for path, digest in before.items():
        assert hashlib.sha256((fixture / path).read_bytes()).hexdigest() == digest
finally:
    assert fixture.resolve().parent == (WORKSPACE / '.cache').resolve()
    shutil.rmtree(fixture)

print(json.dumps({'migration': reports, 'boundedQueries': True, 'fullTextRecall': True,
                  'workerFilters': True, 'logCommitsQueryable': True, 'explicitRollback': True,
                  'authoredDocsSurvivePublish': True, 'authoredDocsExcludedFromHotUpdate': True}, ensure_ascii=False))
