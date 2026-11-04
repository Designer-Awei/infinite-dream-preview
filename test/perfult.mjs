// 性能：一局里同时存在多个大招（克劳德领域等）+ 一群敌人时的帧耗时；CPU 降速模拟手机
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright"); const fs = require("fs");
const PORT = process.argv[2] || 8775, THR = +(process.argv[3] || 4), CID = process.argv[4] || "claude", PROF = process.argv[5];
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 0, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "claude" })));
await p.reload(); await p.waitForTimeout(1500);
const cdp = await p.context().newCDPSession(p);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: THR });
await p.evaluate((cid) => __app.begin({ mode: "solo", pvp: false, seed: 9, opt: { map: "grass", endless: true }, players: [{ id: 1, cid, name: "t" }], myId: 1 }), CID);
await p.waitForTimeout(2500);
// a crowd + repeated ults: every 1.4 s she casts again, so 4 or so ult zones overlap
await p.evaluate(() => { const g = __app.game, me = __app.me; me.maxHp = me.hp = 999; me.invuln = 1e9; for (let i = 0; i < 24; i++) { const e = g.spawnEnemy(["slime", "bat", "eyeball", "frog"][i % 4], me.x + 60 + (i % 6) * 30, me.y - 80 + Math.floor(i / 6) * 40, i % 5 === 0, 0); e.hp = e.maxHp = 1e6; } window.__ultT = setInterval(() => { __app.me.ult = 1; __app.me.input.ult = true; }, 1400); __app.me.input.atk = true; });
if (PROF) await cdp.send("Profiler.enable"), await cdp.send("Profiler.start");
await cdp.send("Performance.enable");
const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const r = await p.evaluate(() => new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = (now) => { ts.push(now - last); last = now; if (now - t0 < 8000) requestAnimationFrame(f); else res({ ts, zones: __app.game.zones.length, fx: __app.game.fx.list ? __app.game.fx.list.length : -1, enemies: __app.game.enemies.length }); }; requestAnimationFrame(f); }));
const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
if (PROF) { const { profile } = await cdp.send("Profiler.stop"); fs.writeFileSync(PROF, JSON.stringify(profile)); }
await p.evaluate(() => clearInterval(window.__ultT));
const ts = r.ts.slice(5).sort((a, b) => a - b), avg = ts.reduce((a, b) => a + b, 0) / ts.length, wall = m1.Timestamp - m0.Timestamp;
console.log(`${CID} CPU×${THR}: ${(1000 / avg).toFixed(1)} fps avg, p95 frame ${ts[Math.floor(ts.length * 0.95)].toFixed(1)} ms, worst ${ts[ts.length - 1].toFixed(0)} ms | script ${(((m1.ScriptDuration - m0.ScriptDuration) / wall) * 1000).toFixed(0)} ms/s, tasks ${(((m1.TaskDuration - m0.TaskDuration) / wall) * 1000).toFixed(0)} ms/s | zones ${r.zones}, fx ${r.fx}, enemies ${r.enemies}`);
console.log("errors", JSON.stringify(errs)); await b.close();
