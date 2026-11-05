// 新怪物（PixelLab）与地图配色：局内逐个摆出来截图；稀有怪掉藏品；结算写入图鉴
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 804, height: 360 }, deviceScaleFactor: 2 })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.addInitScript(() => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 0, chars: ["deepseek", "gpt"], sel: "deepseek" })); });
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(2000);
const out = {};
for (const [map, list] of [["grass", ["mushroom", "beetle", "snake_vine", "slime_gold", "snake"]], ["ice", ["hedgehog", "frostling", "snake_ice", "jelly_ice", "jelly_aurora"]], ["lava", ["salamander", "imp", "snake_lava", "skull_obsidian", "slime_lava"]]]) {
  await p.evaluate((map) => __app.begin({ mode: "solo", pvp: false, seed: 5, opt: { map }, players: [{ id: 1, cid: "deepseek", name: "t" }], myId: 1 }), map); await p.waitForTimeout(2200);
  await p.evaluate((list) => { const g = __app.game, me = __app.me; me.invuln = 1e9; me.maxHp = me.hp = 999; g.enemies.length = 0; g.spawnWave = () => false; const sp = [...g.map.spots].sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y)); list.forEach((t, i) => { const s = sp[i * 2] || sp[i]; const e = g.spawnEnemy(t, s.x, s.y, false, 0); e.cd = 99; e.def = { ...e.def, spd: 0 }; }); }, list);
  await p.waitForTimeout(900); await p.screenshot({ path: `/tmp/mon_${map}.png` });
}
// a rare kill drops a 藏品; the end of the run writes the codex and the 藏品
out.rare = await p.evaluate(() => { const g = __app.game, e = g.enemies.find((x) => x.def.rare); g.kill(e, __app.me); return { found: g.curiosFound, killed: g.killedTypes, seen: Object.keys(g.seen) }; });
await p.evaluate(() => __app.endRun(false)); await p.waitForTimeout(800);
out.result = await p.evaluate(() => [...document.querySelectorAll(".res-x, .rx, .extras div, .res-extra")].map((n) => n.textContent).slice(0, 8));
await p.screenshot({ path: "/tmp/mon_result.png" });
out.saved = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")); return { codex: Object.keys(s.codex || {}).length, skull_obsidian: s.codex && s.codex.skull_obsidian, curios: s.curios }; });
console.log(JSON.stringify(out, null, 1)); console.log("errors", JSON.stringify(errs)); await b.close();
