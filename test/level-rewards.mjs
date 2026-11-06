import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const out = path.resolve('tmp/level-rewards');
await mkdir(out, { recursive: true });
const browser = await chromium.launchPersistentContext(path.resolve('../.cache/level-rewards-browser'), {
  channel: 'chrome', headless: true, viewport: { width: 804, height: 360 }, isMobile: true, hasTouch: true,
});
try {
  const p = await browser.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => localStorage.setItem('ai-girls-dungeon-v1', JSON.stringify({
    tutorialSeen: true, chars: ['deepseek', 'gpt', 'grok', 'claude', 'doubao', 'glm'],
    seenUnlock: ['deepseek', 'gpt', 'grok', 'claude', 'doubao', 'glm'], sel: 'gpt', sound: false, music: false,
  })));
  await p.goto('http://127.0.0.1:8775');
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(async () => {
    const { Game, applyCard } = await import('./js/game.js'), S = await import('./js/save.js');
    const { CHARS, CHAR_ORDER } = await import('./js/data.js');
    const { levelBonuses } = await import('./js/progression.js');
    const check = (v, message) => { if (!v) throw Error(message); };
    const near = (a, b, message) => check(Math.abs(a - b) < 1e-8, `${message}: ${a} != ${b}`);
    const fx = { spawn() {}, clearAll() {} }, kit = level => ({ tal: {}, eq: {}, cards: [], level });
    const combat = { kind: 'combat', waves: [], items: 0 };
    const create = (cid, level, pvp = false, extra = {}) => {
      const g = new Game({ pvp, fx, seed: 10 });
      const me = g.addPlayer({ id: 1, cid, local: true, kit: { ...kit(level), ...extra } });
      return [g, me];
    };
    for (const cid of CHAR_ORDER) {
      for (let level = 1; level <= 7; level++) {
        const [g, me] = create(cid, level);
        near(me.st.dmg, level >= 2 ? 1.2 : 1, `${cid} Lv${level} damage`);
        check(me.maxHp === CHARS[cid].hp + (level >= 4 ? 1 : 0), 'HP threshold');
        near(me.st.cd, level >= 5 ? .7 : 1, 'cooldown threshold');
        near(me.st.shieldRegen, level >= 6 ? 1.5 : 1, 'shield threshold');
        near(me.st.ultG, level >= 7 ? 1.3 : 1, 'ult threshold');
        {
          g.loadRoom(0, combat);
          const normal = CHARS[cid].skill.cd * me.st.cd;
          me.ult = 0;
          me.skillCd = 1; me.input.skill = true; g.updatePlayer(me, 0);
          near(me.ult, 0, 'rejected input must not charge ult');
          me.skillCd = 0; me.input.skill = true; g.updatePlayer(me, 0);
          near(me.skillCd, normal, `${cid} first cast`);
          near(me.ult, level >= 3 ? .2 : 0, `${cid} first charge`);
          me.skillCd = 0; me.input.skill = true; g.updatePlayer(me, 0);
          near(me.skillCd, normal, `${cid} second cast`);
          near(me.ult, level >= 3 ? .4 : 0, `${cid} repeated charge`);
          me.ult = .95; me.skillCd = 0; me.input.skill = true; g.updatePlayer(me, 0);
          near(me.ult, level >= 3 ? 1 : .95, 'ult progress capped at 100%');
        }
      }
      const [arena, neutral] = create(cid, 7, true);
      arena.loadRoom(0, combat);
      check(neutral.maxHp === CHARS[cid].hp && neutral.growth.skillCharge === 0, 'PVP HP/charge excluded');
      for (const stat of ['dmg', 'cd', 'shieldRegen', 'ultG']) near(neutral.st[stat], 1, 'PVP excluded ' + stat);
      neutral.ult = 0; neutral.input.skill = true; arena.updatePlayer(neutral, 0);
      near(neutral.skillCd, CHARS[cid].skill.cd, 'PVP skill cooldown');
      near(neutral.ult, 0, 'PVP has no skill charge');
    }
    // Every successful manual cast grants fixed 20 percentage points, in every PVE room/phase.
    const [g, me] = create('gpt', 7);
    for (const kind of ['combat', 'elite', 'boss', 'shop']) {
      g.loadRoom(1, { ...combat, kind, boss: 'boss_eye' });
      for (const phase of ['clear', kind === 'shop' ? 'shop' : 'fight']) {
        g.phase = phase; me.ult = 0; me.skillCd = 0; me.input.skill = true; g.updatePlayer(me, 0);
        near(me.skillCd, CHARS.gpt.skill.cd * .7, kind + ' cooldown');
        near(me.ult, .2, kind + ' manual charge');
      }
    }
    // Forced echo and linked casts do not grant extra fixed charge.
    const [echoGame, echoUser] = create('gpt', 7);
    echoGame.loadRoom(0, combat); echoUser.cards.echo = 1; echoUser.links = ['deepseek'];
    echoUser.ult = 0; echoUser.input.skill = true;
    const random = Math.random;
    try { Math.random = () => 0; echoGame.updatePlayer(echoUser, 0); } finally { Math.random = random; }
    near(echoUser.ult, .2, 'linked skill does not duplicate charge');
    const echo = echoGame.timers.find(t => t.t === .45); check(echo, 'echo scheduled'); echo.fn();
    near(echoUser.ult, .2, 'echo does not duplicate charge');
    echoUser.ult = 0;
    for (let i = 1; i <= 5; i++) {
      echoUser.skillCd = 0; echoUser.input.skill = true; echoGame.updatePlayer(echoUser, 0);
      near(echoUser.ult, Math.min(1, i * .2), 'five manual casts fill ultimate');
    }
    // Max legal passive + collection + two cooldown cards remains positive and multiplicative.
    const [combo, stacked] = create('gpt', 7, false, {
      tal: { t_cd: 5, t_hp: 5, t_dmg: 5, t_shield: 5 }, collection: { cd: -.03, dmg: .05, shieldRegen: .1, ultG: .1 },
    });
    combo.loadRoom(0, combat);
    applyCard(combo, stacked, 'cd_down'); applyCard(combo, stacked, 'cd_down');
    near(stacked.st.cd, .8 * .97 * .7 * .8 * .8, 'stacked cooldown');
    near(stacked.st.dmg, 1.2 * 1.05 * 1.2, 'stacked damage');
    near(stacked.st.shieldRegen, 1.5 * 1.1 * 1.5, 'stacked shield');
    check(stacked.maxHp === CHARS.gpt.hp + 5 + 1, 'stacked HP');
    stacked.input.skill = true; combo.updatePlayer(stacked, 0);
    near(stacked.skillCd, CHARS.gpt.skill.cd * .8 * .97 * .7 * .8 * .8, 'stacked actual cast');
    check(stacked.skillCd > 0, 'positive cooldown');
    for (const cid of CHAR_ORDER) for (const core of [0, 1]) for (const eq of [{}, { t_overclock: 1, u_echo: 1 }, { u_links: 1, u_second_ult: 1 }]) {
      const [equipped, user] = create(cid, 7, false, { core, eq });
      equipped.loadRoom(0, combat); equipped.applyLoadouts();
      near(user.st.ultG, 1.3 * (eq.t_overclock ? 1.3 : 1), 'SSR ult multiplier');
      user.ult = 0; user.input.skill = true; equipped.updatePlayer(user, 0);
      near(user.skillCd, CHARS[cid].skill.cd * .7, 'core/SSR cooldown');
      near(user.ult, .2, 'core/SSR keeps charge fixed at 20%');
      user.ult = 1; user.input.ult = true; equipped.updatePlayer(user, 0);
      check([user.hp, user.st.dmg, user.st.cd, user.st.ultG, user.ult].every(Number.isFinite), 'core/SSR finite stats');
    }
    g.loadRoom(0, combat); me.input.skill = false; me.ult = 0;
    const enemy = { kind: 'enemy', id: 99, hp: 1000, maxHp: 1000, x: 0, y: 0, r: 10, marks: {} };
    const damage = g.hit(enemy, 10, { p: me, noCrit: true, noReact: true });
    near(damage, 12, 'actual hit damage');
    near(me.ult, 12 / CHARS.gpt.ult.need * 1.3, 'actual hit ult gain');
    me.shield = 0; me.shieldT = 0; me.lastHit = 99; g.updatePlayer(me, .1);
    near(me.shieldT, .15, 'actual shield recovery speed');
    // Each peer's kit survives the real host receive path, rather than inheriting host level.
    const { Net } = await import('./js/net.js');
    let started;
    const net = new Net({ beginLoading(cfg) { started = cfg; } });
    net.isHost = true; net.pvp = false; net.members = [{ id: 1, cid: 'gpt', name: 'host', kit: kit(1) }];
    net.t = { send() {} }; net.showRoom = () => {};
    net.onHostMsg('guest', { t: 'hello', cid: 'claude', name: 'guest', kit: kit(7) });
    net.start();
    check(started.players[1].kit.level === 7, 'received peer level retained');
    const coop = new Game({ fx, mode: 'host' });
    const peers = started.players.map(d => coop.addPlayer(d));
    check(peers[0].maxHp === CHARS.gpt.hp && peers[1].maxHp === CHARS.claude.hp + 1, 'own levels in coop');
    check(levelBonuses(999).level === 7 && levelBonuses(Infinity).level === 1 && levelBonuses(-2).level === 1, 'level bounds');
    S.load().characterXP = { gpt: 2439, claude: 0 }; S.save();
    check(S.makeKit('gpt').level === 4 && S.makeKit('claude').level === 1, 'per-character save kit');
    const [beforeGame, before] = create('gpt', S.makeKit('gpt').level);
    S.grantCharacterXP('gpt', 1746 + 1343 + 2272);
    check(before.growth.level === 4 && before.st.ultG === 1, 'level-up does not mutate finished run');
    const [afterGame, after] = create('gpt', S.makeKit('gpt').level);
    check(after.growth.level === 7 && after.st.ultG === 1.3, 'next run applies new rewards');
    return 'PASS six characters × seven reward tiers, real casts/hits/regen, stacking, PVP, own peer levels and next-run application';
  }));
  for (const [width, height] of [[804, 360], [667, 375], [877, 393], [1280, 720]]) {
    await p.setViewportSize({ width, height });
    await p.evaluate(async () => { (await import('./js/lobby.js')).showLobby(); });
    await p.waitForTimeout(500);
    assert.equal(await p.locator('.li-level .level-star').count(), 1);
    await p.locator('.help-btn').click();
    await p.getByRole('button', { name: '角色养成', exact: true }).click();
    assert.equal(await p.getByRole('button', { name: '养成', exact: true }).count(), 0);
    const layout = await p.evaluate(() => {
      const main = document.querySelector('.hp-main'), rows = [...main.querySelectorAll('.hp-level')];
      return { overflow: main.scrollWidth - main.clientWidth, lastBottom: rows.at(-1).getBoundingClientRect().bottom, mainBottom: main.getBoundingClientRect().bottom, rows: rows.map(row => {
        const columns = [...row.children].map(cell => {
          const range = document.createRange(); range.selectNodeContents(cell);
          const r = cell.getBoundingClientRect();
          return { x: r.left, overflow: cell.scrollWidth - cell.clientWidth, inkHeight: range.getBoundingClientRect().height };
        });
        return columns;
      }) };
    });
    assert.equal(layout.rows.length, 7); assert(layout.overflow <= 1);
    assert(layout.lastBottom <= layout.mainBottom, 'all seven tiers visible on opening');
    for (const columns of layout.rows) for (let i = 0; i < columns.length; i++) {
      assert(Math.abs(columns[i].x - layout.rows[0][i].x) < 1, 'aligned columns');
      assert(columns[i].overflow <= 1 && columns[i].inkHeight < 26, 'single-line complete description');
    }
    await p.screenshot({ path: path.join(out, `${width}-growth-help.png`) });
    await p.evaluate(() => document.querySelector('.help-md').remove());
  }
  // Phone's actual pixel dimensions, with the same layout size at DPR 3.
  const phone = await browser.browser().newContext({ viewport: { width: 804, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await phone.addInitScript(() => localStorage.setItem('ai-girls-dungeon-v1', JSON.stringify({ tutorialSeen: true, sel: 'gpt', sound: false, music: false })));
  const page = await phone.newPage();
  await page.goto('http://127.0.0.1:8775'); await page.waitForTimeout(1300);
  await page.evaluate(async () => { (await import('./js/ui.js')).showHelp(); });
  await page.getByRole('button', { name: '角色养成', exact: true }).click();
  await page.screenshot({ path: path.join(out, '2412x1080-growth-help.png') });
  await phone.close();
  assert.deepEqual(errors, []);
  console.log('PASS aligned single-line help across four viewports, max-level badge and phone screenshot');
} finally { await browser.close(); }
