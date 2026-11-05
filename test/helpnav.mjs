// 玩法说明：左侧分区按钮不滚动、整体与右侧内容区上下对齐
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const errs = [];
for (const [W, H] of [[804, 360], [877, 393], [667, 375], [1280, 720]]) {
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: W < 1000, hasTouch: W < 1000 })).newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript(() => { if (!sessionStorage.getItem("s")) (sessionStorage.setItem("s", "1"), localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 9, chars: ["deepseek"], sel: "deepseek" }))); });
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(1800);
  await p.evaluate(async () => (await import("./js/ui.js")).showHelp()); await p.waitForTimeout(400);
  const r = await p.evaluate(() => { const n = document.querySelector(".hp-nav"), m = document.querySelector(".hp-main").getBoundingClientRect(), t = [...n.children].map((c) => c.getBoundingClientRect()); return { scrollable: n.scrollHeight - n.clientHeight, navTop: Math.round(t[0].top), mainTop: Math.round(m.top), navBottom: Math.round(t.at(-1).bottom), mainBottom: Math.round(m.bottom), tabH: Math.round(t[0].height), tabs: t.length }; });
  console.log(W + "x" + H, JSON.stringify(r));
  if (W === 804) await p.screenshot({ path: "/tmp/helpnav.png" });
  await p.close();
}
console.log("errors", JSON.stringify(errs)); await b.close();
