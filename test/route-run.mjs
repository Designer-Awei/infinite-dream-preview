// 梦境航线 end-to-end: a bot plays solo main-map runs, walking into fork portals, talking to event visitors (J), through to the boss.
// usage: node test/route-run.mjs [port] [seeds=3]
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const PORT = process.argv[2] || 8775, N = +(process.argv[3] || 3);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 844, height: 390 } }); const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(2000);
const out = [];
for (let s = 0; s < N; s++) {
  const seed = 1000 + s * 77;
  await p.evaluate((seed) => { document.querySelectorAll('.modal').forEach((m) => m.remove()); __app.ended = false; __app.begin({ mode: 'solo', pvp: false, seed, players: [{ id: 1, cid: 'gpt', name: 'T' }], myId: 1, opt: { map: 'grass' } }); }, seed);
  await p.waitForTimeout(800);
  const res = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = __app.game, me = __app.me, log = { kinds: [], panels: 0, events: [], challenge: [], screens: 0 };
    const t0 = performance.now();
    while (performance.now() - t0 < (window.__T||90000)) {
      if (document.querySelector('.result, .result-panel, .res-panel')) break;
      if (document.querySelector('.route-modal')) { log.routeModal = true; break; }
      const em = document.querySelector('.event-modal');
      if (em) { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' })); const bs = [...em.querySelectorAll('.ev-opts .btn')]; log.events.push(g.room.event); log.faces = (log.faces || 0) + !!em.querySelector('canvas.ev-face'); bs.at(0).click(); await sleep(150); continue; }
      const rift = [...document.querySelectorAll('.rift-modal .btn')].find((x) => x.textContent.includes('放弃'));
      if (rift) { rift.click(); await sleep(150); continue; }
      const card = document.querySelector('.card-pick .card, .cards .card, .cardsel .card');
      if (g.cardOffers[me.id]?.length) { g.pickCard(me.id, g.cardOffers[me.id][0]); await sleep(100); continue; }
      if (g.room && log.kinds.at(-1)?.idx !== g.roomIdx) log.kinds.push({ idx: g.roomIdx, kind: g.room.kind, ch: g.room.challenge || null, ev: g.room.event || null, tr: !!g.room.treasure, el: !!g.room.elite });
      me.hp = me.maxHp; me.invuln = 1;
      if (g.phase === 'fight') for (const e of g.enemies) if (!e.dead && e.spawnT <= 0) g.hit(e, 1e7, { p: me });
      if (g.chest && !g.chest.opened) g.openChest(me);
      if (g.shovelItem && !g.shovelItem.got) { me.x = g.shovelItem.x; me.y = g.shovelItem.y; }
      else if (g.npc && !g.eventDone && g.phase === 'event') {
        // walk up to the visitor and press J
        me.x = g.npc.x + 20; me.y = g.npc.y + 10;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' })); await sleep(120);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' }));
      }
      else if (g.portals && g.phase !== 'cards') {
        if (log.kinds.at(-1)?.forkSeen !== g.roomIdx) { log.panels++; log.kinds.at(-1).forkSeen = g.roomIdx; log.forks = (log.forks || []).concat([g.portals.map((q) => q.name + (q.sub ? ':' + q.sub : '')).join('/')]); }
        const q = g.portals.at(-1); me.x = q.x; me.y = q.y;
      }
      else if (g.portal && g.phase !== 'cards') { me.x = g.portal.x; me.y = g.portal.y; }
      await sleep(60);
    }
    log.route = g.route && { path: g.route.path, choices: g.route.choices, step: g.route.step };
    log.ended = !!document.querySelector('.result, .result-panel, .res-panel') || __app.ended;
    log.secs = Math.round((performance.now() - t0) / 1000);
    return log;
  });
  out.push(res);
}
console.log(JSON.stringify(out.map((r) => ({ ended: r.ended, secs: r.secs, panels: r.panels, route: r.route, rooms: r.kinds.map((k) => k.kind + (k.ch ? ':' + k.ch : '') + (k.ev ? ':' + k.ev : '') + (k.tr ? ':宝藏' : '') + (k.el ? ':精英' : '')).join(' > '), events: r.events, faces: r.faces, forks: r.forks, routeModal: !!r.routeModal })), null, 1));
console.log('errors', errs);
await b.close();
