// 改名：点右上角名字弹出改名；首次免费，之后每次 500 晶石，晶石不足不能改
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
// the save is written before the page's own scripts run (setting it from a live page races with that page saving its own state on unload)
await p.addInitScript(() => { if (!sessionStorage.getItem("seeded")) (sessionStorage.setItem("seeded", "1"), localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 800, name: "熊二", chars: ["deepseek", "gpt"], sel: "deepseek" }))); });
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(2500);
const st = () => p.evaluate(() => { const s = JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")); return { name: s.name, tokens: s.tokens, renamed: s.renamed || 0, pill: document.querySelector(".pname").textContent, tok: document.querySelector(".tok").textContent }; });
const rename = async (v) => { await p.click(".name-pill"); await p.waitForTimeout(300); const cost = await p.textContent(".rn-cost"); await p.fill(".rn-in", v); await p.waitForTimeout(100); const err = await p.textContent(".rn-err"); await p.screenshot({ path: `/tmp/rn_${v.length}.png` }); await p.click(".rn-acts .btn:last-child"); await p.waitForTimeout(300); const left = !!(await p.$(".rn-p")); if (left) await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove())); return { cost: cost.trim(), err, closed: !left, ...(await st()) }; };
console.log("0 start:", JSON.stringify(await st()));
console.log("1 free:", JSON.stringify(await rename("梦境旅人")));
console.log("2 paid:", JSON.stringify(await rename("吉普缇粉丝")));
console.log("3 broke:", JSON.stringify(await rename("没钱了")));
console.log("4 too long:", JSON.stringify(await rename("一二三四五六七八九十一二三")));
await p.reload(); await p.waitForTimeout(2000); console.log("after reload:", JSON.stringify(await st()));
console.log("errors", JSON.stringify(errs)); await b.close();
