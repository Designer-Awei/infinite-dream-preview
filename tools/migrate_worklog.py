"""One-time, lossless migration of legacy journals plus every reachable main commit."""
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

GIT = 'C:/Program Files/Git/cmd/git.exe'
BASES = {'infinite-dream-preview': '19f2d85', 'infinite-dream': 'e02eae3'}
ARCHIVE = 'docs/references/history/WORK_LOG.before-jsonl.md'
LINK = re.compile(r'https://github.com/Designer-Awei/(infinite-dream(?:-preview)?)/commit/([0-9a-f]{7,40})')
HASH = re.compile(r'(?<![0-9a-f])[0-9a-f]{7,40}(?![0-9a-f])')


def run(root, *args):
    return subprocess.check_output([GIT, *args], cwd=root).decode('utf-8').strip()


def plain(text):
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text).replace('`', '')
    return re.sub(r'\s+', ' ', text).strip()


def short(text, limit):
    text = plain(text)
    return text if len(text) <= limit else text[:limit - 1] + '…'


def module(text):
    lead = plain(text).split('。')[0][:180].casefold()
    creatures = [(lead.find(word), key) for key, words in [
        ('pets.dragon', ['火龙', 'dragon']), ('pets.phoenix', ['冰凰', '凤凰', 'phoenix']),
        ('pets.fox', ['灵狐', 'fox'])] for word in words if word in lead]
    if creatures:
        return min(creatures)[1]
    for key, words in [
        ('pets', ['宠物', '伙伴', '骑乘']), ('movement', ['移速', 'slowdown']),
        ('ui.exchange', ['兑换卡', '积攒', '兑换按钮']), ('progression', ['等级', '经验', 'xp']),
        ('network', ['联机', 'webrtc', 'peerjs', 'network', 'p2p']),
        ('mining', ['矿场', '矿石', '铲', 'mining']), ('endless', ['无尽', 'endless']),
        ('ui.results', ['结算', '收获明细', 'result']), ('ui.gacha', ['扭蛋', '抽卡', 'gacha']),
        ('assets', ['素材', '图标', '动画', 'sprite', '字体']),
        ('release', ['热更新', '发布', '构建', 'ci/cd', 'apk', 'build']),
        ('documentation', ['工作记录', '说明', 'readme', '文档'])]:
        if any(word.casefold() in text.casefold() for word in words):
            return key
    return 'gameplay'


def metadata(root):
    raw = run(root, 'log', '--reverse', '--format=%H%x1f%aI%x1f%an%x1f%s%x1f%B%x1e')
    records = {}
    for block in raw.split('\x1e'):
        if not block.strip():
            continue
        h, at, author, title, body = block.strip().split('\x1f', 4)
        local = datetime.fromisoformat(at).astimezone(timezone(timedelta(hours=8)))
        records[h] = {'id': h, 'date': local.date().isoformat(), 'author': author,
                      'title': title, 'body': body, 'order': int(local.timestamp())}
    return records


def migrate(root, all_meta):
    source = root / 'WORK_LOG.md'
    target = root / 'worklog.jsonl'
    assert source.is_file() and not target.exists(), 'One-time migration refuses overwrite'
    original = source.read_bytes()
    archive = root / ARCHIVE
    archive.parent.mkdir(parents=True, exist_ok=True)
    assert not archive.exists()
    shutil.copy2(source, archive)
    assert archive.read_bytes() == original
    text = source.read_text(encoding='utf-8-sig')
    own = all_meta[root.name]
    base = run(root, 'rev-parse', BASES[root.name])
    before = set(run(root, 'rev-list', base).splitlines())

    def resolve(repo, prefix):
        hits = [h for h in all_meta[repo] if h.startswith(prefix)]
        return hits[0] if len(hits) == 1 else None

    def worker(hashes, day):
        # User explicitly confirmed that personal Git identity was also used by Claude.
        values = {'Claude' if h in before else 'Codex' for h in hashes}
        if not values:
            return ('Claude', 'user_confirmed_before_2026-11-06') if day < '2026-11-06' else ('unknown', 'not_recorded')
        return (next(iter(values)), 'user_confirmed_legacy_and_verified_handoff') if len(values) == 1 else ('mixed', 'commit_worker_mapping')

    headings = list(re.finditer(r'^### (\d{4}-\d{2}-\d{2}) · (.+)$', text, re.M))
    rows, unresolved = [], []
    for index, heading in enumerate(headings):
        end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
        section = text[heading.end():end]
        local_ids, related = [], []
        for repo, prefix in LINK.findall(section):
            resolved = resolve(repo, prefix)
            if not resolved:
                unresolved.append({'section': heading[2], 'repository': repo, 'prefix': prefix})
            elif repo == root.name:
                local_ids.append(resolved)
            else:
                related.append({'repository': repo, 'id': resolved})
        for prefix in HASH.findall(LINK.sub('', section)):
            if resolved := resolve(root.name, prefix):
                local_ids.append(resolved)
        local_ids = list(dict.fromkeys(local_ids))
        related = [dict(pair) for pair in dict.fromkeys(tuple(item.items()) for item in related)]
        bullets = list(re.finditer(r'^- (.+(?:\n(?!\n|[-#]).+)*)', section, re.M))
        validation = [m for m in bullets if re.match(r'^(验证|最终验证|dist/docs|按 .*生成|部署后|Pages|线上|发布结果)', m[1])]
        summary = short(' '.join(m[1] for m in validation), 180)
        evidence = [{'file': ARCHIVE, 'line_start': text[:heading.end() + m.start()].count('\n') + 1,
                     'line_end': text[:heading.end() + m.end()].count('\n') + 1} for m in validation]
        reason = next((plain(m[1]).split('：', 1)[-1] for m in bullets if m[1].startswith('原因：')), None)
        assigned, basis = worker(local_ids, heading[1])
        for number, bullet in enumerate(bullets):
            if bullet in validation or bullet[1].startswith(('对应 commit', '对应提交', '对应源码提交', '原因：')):
                continue
            raw = bullet[1]
            cleaned = re.sub(r'^(更新内容|同提交|修复)[:：]\s*', '', raw)
            cleaned = re.sub(r'^(本次实际更新提交|实际更新提交|以下实际更新对应提交|本次更新提交)[:：].*?。', '', cleaned)
            if not plain(cleaned):
                continue
            title = short(plain(cleaned).split('。')[0], 110)
            key = hashlib.sha256((heading[0] + '\n' + raw).encode()).hexdigest()[:12]
            rows.append({'id': root.name + '-' + key, 'date': heading[1], 'repository': root.name,
                         'worker': assigned, 'worker_basis': basis, 'kind': 'change',
                         'module': module(cleaned), 'title': title,
                         'problem': short(reason, 200) if reason else (short(heading[2], 120) if re.search('修复|修正|溢出|失败|回滚', heading[2]) else None),
                         'solution': short(cleaned, 280), 'commit_ids': local_ids,
                         'related_commits': related, 'status': 'committed',
                         'validation': {'status': 'reported' if validation else 'not_recorded', 'summary': summary, 'refs': evidence},
                         'release_status': 'unknown', 'superseded_by': [],
                         'source': {'file': ARCHIVE,
                                    'line_start': text[:heading.end() + bullet.start()].count('\n') + 1,
                                    'line_end': text[:heading.end() + bullet.end()].count('\n') + 1},
                         'order': max((own[h]['order'] for h in local_ids), default=0) * 100 + number})
    # Missing history predates the MD journal or consists of record-only commits.
    covered = {h for row in rows for h in row['commit_ids']}
    for h, info in own.items():
        if h in covered:
            continue
        files = run(root, 'diff-tree', '--root', '--no-commit-id', '--name-only', '-r', h).splitlines()
        log_only = bool(files) and set(files) <= {'WORK_LOG.md'}
        assigned, basis = worker([h], info['date'])
        rows.append({'id': root.name + '-commit-' + h[:12], 'date': info['date'], 'repository': root.name,
                     'worker': assigned, 'worker_basis': basis,
                     'kind': 'log_commit' if log_only else 'historical_commit',
                     'module': 'documentation' if log_only else module(info['title']),
                     'title': short(info['title'], 110), 'problem': None,
                     'solution': short(info['body'].split('\n\nCo-Authored-By:')[0], 280),
                     'commit_ids': [h], 'related_commits': [], 'status': 'committed',
                     'validation': {'status': 'not_recorded', 'summary': '', 'refs': []},
                     'release_status': 'unknown', 'superseded_by': [], 'source': {'git': h}, 'order': info['order'] * 100})
    assert not unresolved, unresolved
    # Explicit rollback in legacy source, not an inference from repeated keywords.
    old = [r for r in rows if r['kind'] == 'change' and 'fc5edcd' in ''.join(r['commit_ids'])]
    rollback = next((r for r in rows if r['kind'] == 'change' and r['title'].startswith('用户实际试玩反馈新版更卡')), None)
    if rollback:
        for row in old:
            if row['id'] != rollback['id'] and '0ce6bdb' not in ''.join(row['commit_ids']):
                row.update(status='reverted', superseded_by=[rollback['id']])
    rows.sort(key=lambda r: (r['date'], r['order'], r['id']), reverse=True)
    target.write_text(''.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n' for r in rows), encoding='utf-8', newline='\n')
    report = {'source_head': run(root, 'rev-parse', 'HEAD'), 'archive': ARCHIVE,
              'archive_sha256': hashlib.sha256(original).hexdigest(), 'legacy_sections': len(headings),
              'historical_commits': len(own), 'records': len(rows),
              'workers': dict(Counter(r['worker'] for r in rows)), 'unresolved_commit_refs': unresolved,
              'handoff_base': base, 'worker_policy': 'Before verified handoff Claude per user confirmation; verified subsequent agent work Codex; explicit overrides take precedence.',
              'imported_validation': 'Historical source reports, not newly rerun tests; release success is not inferred.'}
    (archive.parent / 'migration.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    assert archive.read_bytes() == original and source.resolve().parent == root.resolve()
    source.unlink()
    print(json.dumps({'repository': root.name, **{k: report[k] for k in ['legacy_sections', 'historical_commits', 'records', 'workers']}}, ensure_ascii=False))


if __name__ == '__main__':
    workspace = Path(__file__).resolve().parents[2]
    roots = [workspace / name for name in BASES]
    histories = {root.name: metadata(root) for root in roots}
    for root in roots:
        migrate(root, histories)
