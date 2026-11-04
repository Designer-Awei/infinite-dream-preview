// 扭蛋机漂浮小球的性能开销：同一页面，小球运动开着 vs 停掉，各 8 秒，比较主线程脚本/样式/布局/绘制时间
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775, THROTTLE = +(process.argv[3] || 1);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 904, height: 405 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true })).newPage();
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 1194, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "doubao" })));
await p.reload(); await p.waitForTimeout(1500);
const cdp = await p.context().newCDPSession(p);
await cdp.send("Performance.enable");
if (THROTTLE > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
await p.evaluate(async () => { const L = await import("./js/lobby.js"); L.showGacha(); }); await p.waitForTimeout(1500);
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const fps = () => p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = (t) => (n++, t - t0 < 8000 ? requestAnimationFrame(f) : res(n / ((t - t0) / 1000))); requestAnimationFrame(f); }));
const measure = async (label) => {
  const a = await metrics(); const f = await fps(); const z = await metrics(); const s = z.Timestamp - a.Timestamp;
  const ms = (k) => (((z[k] - a[k]) / s) * 1000).toFixed(1);
  console.log(`${label}: ${f.toFixed(0)} fps | per second of wall time — script ${ms("ScriptDuration")}ms, style ${ms("RecalcStyleDuration")}ms, layout ${ms("LayoutDuration")}ms, total main-thread tasks ${ms("TaskDuration")}ms`);
};
await measure(`CPU ×${THROTTLE}, capsules moving`);
// stop the motion but keep the capsules on screen: swap in a frozen copy of the dome (the loop ends when its dome leaves the page)
await p.evaluate(() => { const d = document.querySelector(".gm-dome"), c = d.cloneNode(true); d.replaceWith(c); });
await p.waitForTimeout(300);
await measure(`CPU ×${THROTTLE}, capsules frozen `);
// raw cost of the physics step itself
const us = await p.evaluate(async () => {
  const L = await import("./js/lobby.js"); L.showGacha(); await new Promise((r) => setTimeout(r, 400));
  const d = document.querySelector(".gm-dome"); const B = d.__balls; return B.length;
});
console.log("capsules:", us);
await b.close();
