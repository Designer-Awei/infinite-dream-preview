// each map: a combat room and its own boss (screenshots), new residents spawn; boss drops a shovel, a portal opens above, entering it settles the run
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = 804, H = 360;
const dir = "/home/claude/infinite-dream-preview/tmp/r";
for (const map of ["grass", "ice", "lava"]) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message + " " + (e.stack || "").split("\n")[1]));
  await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(200);
  await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, chars: ["deepseek", "gpt"], sel: "gpt", maps: { grass: 1, ice: 1, lava: 1 } })));
  await p.reload(); await p.waitForTimeout(1600);
  await p.evaluate((map) => __app.begin({ mode: "solo", pvp: false, seed: 1234, opt: { map }, players: [{ id: 1, cid: "gpt", name: "t" }], myId: 1 }), map);
  await p.waitForTimeout(2500);
  // invulnerable tester
  await p.evaluate(() => { const me = __app.me; me.maxHp = me.hp = 999; });
  await p.waitForTimeout(1500);
  const types = await p.evaluate(() => [...new Set(__app.game.enemies.map((e) => e.type))]);
  await p.screenshot({ path: `${dir}/map_${map}_room.png` });
  // look at the whole run's monster list for this map
  const all = await p.evaluate(() => { const g = __app.game, s = new Set(); for (let i = 0; i < 7; i++) { const d = g.roomDef(i); if (d && d.waves) d.waves.flat().forEach((k) => s.add(k)); if (d && d.boss) s.add("BOSS:" + d.boss); } return [...s]; });
  console.log(map, "room1 enemies:", JSON.stringify(types), "\n  run:", JSON.stringify(all));
  // jump to the boss room
  await p.evaluate(() => { const g = __app.game; g.roomIdx = 5; g.nextRoom(); });
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${dir}/map_${map}_boss.png` });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${dir}/map_${map}_boss2.png` });
  const bossInfo = await p.evaluate(() => { const g = __app.game, e = g.enemies.find((x) => x.boss); return e ? { type: e.type, name: e.def.name, theme: g.map.theme, hazard: g.hazard, bar: document.querySelector(".bossbar .nm").textContent } : null; });
  console.log("  boss:", JSON.stringify(bossInfo));
  // kill the boss → shovel drop → portal
  await p.evaluate(() => { const g = __app.game; for (const e of [...g.enemies]) (e.hp = 1), g.hit(e, 99999, { p: __app.me }); });
  await p.waitForTimeout(800);
  const drop = await p.evaluate(() => { const g = __app.game; return { shovel: g.shovelItem && g.shovelItem.kind, portal: !!g.portal, rs: g.runStats.shovel }; });
  await p.waitForTimeout(3600);
  const rift = await p.evaluate(() => { const b = [...document.querySelectorAll(".modal .btn")].find((n) => /不了|不进|放弃|跳过|离开|算了/.test(n.textContent)); if (b) { b.click(); return b.textContent; } return null; });
  if (rift) console.log("  (rift offered, declined:", rift + ")");
  await p.screenshot({ path: `${dir}/map_${map}_drop.png` });
  const after = await p.evaluate(() => { const g = __app.game, c = g.map.center; return { portal: g.portal && { dy: Math.round(g.portal.y - c.y), victory: !!g.portal.victory }, shovel: g.shovelItem && { dy: Math.round(g.shovelItem.y - c.y), dx: Math.round(g.shovelItem.x - c.x) } }; });
  console.log("  after boss:", JSON.stringify(drop), JSON.stringify(after));
  // walk onto the shovel, then into the portal
  const got = rift ? "rift" : await p.evaluate(async () => { const g = __app.game, me = __app.me; me.x = g.shovelItem.x; me.y = g.shovelItem.y; await new Promise((r) => setTimeout(r, 300)); return g.shovelItem.got; });
  if (!rift) await p.evaluate(() => { const g = __app.game, me = __app.me; me.x = g.portal.x; me.y = g.portal.y; });
  await p.waitForTimeout(2500);
  const res = await p.evaluate(() => [...document.querySelectorAll(".res-chip, .rs-x, .res-extra")].map((n) => n.textContent).join(" | ") || document.body.innerText.match(/梦境矿场[^\n]*/)?.[0]);
  console.log("  picked:", got, "settlement:", res, "shovels:", await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")).mine.shovels)));
  await p.screenshot({ path: `${dir}/map_${map}_res.png` });
  console.log("  ERR", errs.slice(0, 3).join(" | "));
  await b.close();
}
