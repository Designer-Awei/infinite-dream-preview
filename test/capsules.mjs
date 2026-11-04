// 扭蛋机小球物理：都待在球形罩内、持续在动、互相不穿插；摇杆时更剧烈
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 904), H = +(process.argv[3] || 405), PORT = process.argv[4] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 1194, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "doubao" })));
await p.reload(); await p.waitForTimeout(1500);
await p.evaluate(async () => { const L = await import("./js/lobby.js"); L.showGacha(); }); await p.waitForTimeout(300);
const sample = () => p.evaluate(() => {
  const d = document.querySelector(".gm-dome"), dr = d.getBoundingClientRect(), bw = (d.offsetWidth - d.clientWidth) / 2;
  const cx = dr.left + bw + d.clientWidth / 2, cy = dr.top + bw + d.clientHeight / 2, R = d.clientWidth / 2;
  return [...d.querySelectorAll(".capsule")].map((c) => { const r = c.getBoundingClientRect(), rad = c.offsetWidth / 2; const x = r.left + r.width / 2, y = r.top + r.height / 2; return { x, y, out: Math.hypot(x - cx, y - cy) + rad - R, rad }; });
});
let maxOut = -99, maxOverlap = 0, moved = 0, prev = null;
for (let t = 0; t < 30; t++) {
  const s = await sample();
  for (const a of s) maxOut = Math.max(maxOut, a.out);
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) maxOverlap = Math.max(maxOverlap, s[i].rad * 2 - Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y));
  if (prev) moved += s.reduce((m, a, i) => m + Math.hypot(a.x - prev[i].x, a.y - prev[i].y), 0);
  prev = s;
  await p.waitForTimeout(150);
}
console.log(`${W}x${H} capsules: ${prev.length} radius ${prev[0].rad.toFixed(1)}px | max past the glass ${maxOut.toFixed(1)}px | max overlap ${maxOverlap.toFixed(1)}px | total motion over 4.5s ${Math.round(moved)}px`);
// crank: motion should jump
await p.evaluate(() => document.querySelector(".gm").classList.add("crank")); let m2 = 0; prev = await sample();
for (let t = 0; t < 5; t++) { await p.waitForTimeout(150); const s = await sample(); m2 += s.reduce((m, a, i) => m + Math.hypot(a.x - prev[i].x, a.y - prev[i].y), 0); prev = s; }
await p.evaluate(() => document.querySelector(".gm").classList.remove("crank"));
console.log("motion per 150ms: idle", Math.round(moved / 29), "| cranking", Math.round(m2 / 5));
console.log("errors:", JSON.stringify(errs));
await b.close();
