// 扭蛋机小球：剧烈段/平缓段循环；不出罩、不穿插；平缓段静止堆叠不抖；自转 ≤ 10°/s
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 904), H = +(process.argv[3] || 405), PORT = process.argv[4] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 1194, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "doubao" })));
await p.reload(); await p.waitForTimeout(1500);
await p.evaluate(async () => { const L = await import("./js/lobby.js"); L.showGacha(); }); await p.waitForTimeout(100);
// sample inside the page every animation frame for 14 s
const r = await p.evaluate(() => new Promise((res) => {
  const d = document.querySelector(".gm-dome"), out = { maxW: 0, maxOut: -1, maxOverlap: 0, calm: [], burst: [], settledCalm: [], bursts: 0, frames: 0 };
  let prevEnv = 0, calmSince = 0, prevPos = null, prevT = 0;
  const t0 = performance.now();
  const f = (now) => {
    const B = d.__balls, env = d.__env || 0, rr = 0.078;
    out.frames++;
    for (const x of B) out.maxW = Math.max(out.maxW, Math.abs(x.w) * 180 / Math.PI);
    for (const x of B) out.maxOut = Math.max(out.maxOut, Math.hypot(x.x, x.y) + rr - 0.5);
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) out.maxOverlap = Math.max(out.maxOverlap, 2 * rr - Math.hypot(B[i].x - B[j].x, B[i].y - B[j].y));
    const dtF = prevT ? (now - prevT) / 1000 : 0.016;
    const sp = prevPos ? B.reduce((m, x, i) => m + Math.hypot(x.x - prevPos[i][0], x.y - prevPos[i][1]), 0) / B.length / dtF : 0;
    prevPos = B.map((x) => [x.x, x.y]); prevT = now;
    if (env > 0.5) out.burst.push(sp); else out.calm.push(sp);
    if (env > 0 && prevEnv === 0) out.bursts++;
    if (env === 0) { if (!calmSince) calmSince = now; if (now - calmSince > 2000) out.settledCalm.push(sp); } else calmSince = 0;
    prevEnv = env;
    if (now - t0 < 14000) requestAnimationFrame(f); else res(out);
  };
  requestAnimationFrame(f);
}));
const avg = (a) => (a.reduce((m, x) => m + x, 0) / Math.max(1, a.length));
const W1 = await p.evaluate(() => document.querySelector(".gm-dome").clientWidth);
console.log(`${W}x${H} | bursts in 14 s: ${r.bursts} | mean speed (dome widths/s): burst ${avg(r.burst).toFixed(3)}, calm ${avg(r.calm).toFixed(3)}, calm after settling ${avg(r.settledCalm).toFixed(4)} (= ${(avg(r.settledCalm) * W1).toFixed(2)} px/s)`);
console.log(`max spin ${r.maxW.toFixed(2)}°/s | max past the glass ${(r.maxOut * W1).toFixed(2)}px | max overlap ${(r.maxOverlap * W1).toFixed(2)}px | frames ${r.frames}`);
console.log("errors:", JSON.stringify(errs));
await b.close();
process.exit(r.maxW <= 10.001 && r.bursts >= 2 && !errs.length ? 0 : 1);
