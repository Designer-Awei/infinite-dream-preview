// 免费铜铲攒到 ≥1 把时：顶栏铜铲呼吸缩放 + 发光；没攒到时静止
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 904, height: 405 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
const hub = async (pend) => {
  await p.evaluate((pend) => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 1194, chars: ["deepseek", "gpt"], sel: "gpt", mine: { shovels: { cu: 0, ag: 1, au: 1 }, mats: 35, stars: 45, cards: 1, freePend: pend, freeAt: Date.now() + 3600e3 } })), pend);
  await p.reload(); await p.waitForTimeout(1300);
  await p.evaluate(async () => { const M = await import("./js/mineui.js"); M.showMineHub(); }); await p.waitForTimeout(500);
  const scales = [];
  for (let i = 0; i < 14; i++) { scales.push(await p.evaluate(() => { const m = getComputedStyle(document.querySelector(".mh-freecu")).transform; return m === "none" ? 1 : +m.split("(")[1].split(",")[0]; })); await p.waitForTimeout(100); }
  return { ready: await p.evaluate(() => document.querySelector(".mh-freecu").classList.contains("ready")), text: await p.evaluate(() => document.querySelector(".fc-v").textContent), min: Math.min(...scales), max: Math.max(...scales) };
};
const a = await hub(1); await p.screenshot({ path: "/home/claude/infinite-dream-preview/tmp/g/freecu_ready.png", clip: { x: 0, y: 0, width: 904, height: 60 } });
const z = await hub(0);
console.log("1 pending:", JSON.stringify(a), "| 0 pending:", JSON.stringify(z));
console.log("errors:", JSON.stringify(errs));
await b.close();
process.exit(a.ready && a.max - a.min > 0.08 && !z.ready && z.max === 1 && z.min === 1 && !errs.length ? 0 : 1);
