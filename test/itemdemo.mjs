// 卡池每张卡的效果预览：实战演示能跑起来（画面在变、没有报错），并截下每张卡的演示画面
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775, ONLY = process.argv[3];
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 904, height: 405 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !/404|willReadFrequently/.test(m.text()) && errs.push(m.text()));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 1194, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "doubao", talents: {} })));
await p.reload(); await p.waitForTimeout(1500);
await p.evaluate(async () => { const L = await import("./js/lobby.js"); L.showGacha(); }); await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector(".gp-poolbtn:not(.gp-exbtn)").click()); await p.waitForTimeout(400);
const ids = (await p.evaluate(() => [...document.querySelectorAll(".pool-modal .vc")].map((n) => n.dataset.id))).filter((id) => !ONLY || id === ONLY);
const fs = require("fs"); fs.mkdirSync("/home/claude/infinite-dream-preview/tmp/demo", { recursive: true });
let bad = 0;
for (const id of ids) {
  const e0 = errs.length;
  await p.evaluate((id) => document.querySelector(`.pool-modal [data-id="${id}"]`).click(), id);
  await p.waitForTimeout(900);
  const sig = () => p.evaluate(() => { const c = document.querySelector(".sc-cv"); if (!c) return null; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0, v = 0; for (let i = 0; i < d.length; i += 97) (h = (h * 31 + d[i]) | 0), (v += d[i]); return [h, v]; });
  const a = await sig(); await p.waitForTimeout(1500); const z = await sig();
  const box = await p.evaluate(() => { const n = document.querySelector(".sc"); const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  await p.screenshot({ path: `/home/claude/infinite-dream-preview/tmp/demo/${id}.png`, clip: box });
  const live = a && z && a[0] !== z[0];
  const ok = (live || !a) && errs.length === e0;
  if (!ok) bad++;
  console.log((ok ? "✓ " : "✗ ") + id, a ? (live ? "live, changing" : "STATIC") : "card scene", errs.slice(e0).join(" | "));
  await p.evaluate(() => document.querySelector(".pv-modal").click()); await p.waitForTimeout(250);
}
console.log(`${ids.length} items, ${bad} bad`);
await b.close();
process.exit(bad ? 1 : 0);
