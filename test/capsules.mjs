// 扭蛋机小球：失重漂浮、实时碰撞反射；不出罩、不穿插；速度平稳；碰撞带出自转且 ≤ 10°/s；摇杆时加速
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 904), H = +(process.argv[3] || 405), PORT = process.argv[4] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 1194, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "doubao" })));
await p.reload(); await p.waitForTimeout(1500);
await p.evaluate(async () => { const L = await import("./js/lobby.js"); L.showGacha(); }); await p.waitForTimeout(100);
const run = (ms, crank) => p.evaluate(([ms, crank]) => new Promise((res) => {
  const d = document.querySelector(".gm-dome"), g = document.querySelector(".gm"), rr = 0.078, out = { maxW: 0, maxOut: -1, maxOverlap: 0, speeds: [], spinKicks: 0, spinning: 0, frames: 0 };
  if (crank) g.classList.add("crank");
  let prev = null, prevT = 0, prevW = null;
  const t0 = performance.now();
  const f = (now) => {
    const B = d.__balls;
    out.frames++;
    for (const x of B) out.maxW = Math.max(out.maxW, Math.abs(x.w) * 180 / Math.PI), out.maxOut = Math.max(out.maxOut, Math.hypot(x.x, x.y) + rr - 0.5);
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) out.maxOverlap = Math.max(out.maxOverlap, 2 * rr - Math.hypot(B[i].x - B[j].x, B[i].y - B[j].y));
    if (prev) { const dt = (now - prevT) / 1000; out.speeds.push(B.reduce((m, x, i) => m + Math.hypot(x.x - prev[i][0], x.y - prev[i][1]), 0) / B.length / dt); }
    if (prevW) B.forEach((x, i) => { if (Math.abs(x.w - prevW[i]) > 0.005) out.spinKicks++; });
    out.spinning += B.filter((x) => Math.abs(x.w) > 0.01).length / B.length;
    prev = B.map((x) => [x.x, x.y]); prevW = B.map((x) => x.w); prevT = now;
    if (now - t0 < ms) requestAnimationFrame(f); else (g.classList.remove("crank"), res(out));
  };
  requestAnimationFrame(f);
}), [ms, crank]);
const avg = (a) => a.reduce((m, x) => m + x, 0) / Math.max(1, a.length);
const Wd = await p.evaluate(() => document.querySelector(".gm-dome").clientWidth);
const r = await run(10000, false);
const sp = r.speeds.map((x) => x * Wd).sort((a, b) => a - b);
console.log(`${W}x${H} idle 10 s | speed px/s: mean ${avg(sp).toFixed(1)}, 5% ${sp[Math.floor(sp.length * 0.05)].toFixed(1)}, 95% ${sp[Math.floor(sp.length * 0.95)].toFixed(1)} | spin kicks ${r.spinKicks}, avg share spinning ${(r.spinning / r.frames * 100).toFixed(0)}%, max spin ${r.maxW.toFixed(2)}°/s`);
console.log(`  max past the glass ${(r.maxOut * Wd).toFixed(2)}px | max overlap ${(r.maxOverlap * Wd).toFixed(2)}px`);
const c = await run(1500, true);
console.log(`  cranking: mean speed ${(avg(c.speeds) * Wd).toFixed(1)} px/s | max spin ${c.maxW.toFixed(2)}°/s`);
console.log("errors:", JSON.stringify(errs));
await b.close();
process.exit(r.maxW <= 10.001 && c.maxW <= 10.001 && r.maxOut <= 0.001 && !errs.length ? 0 : 1);
