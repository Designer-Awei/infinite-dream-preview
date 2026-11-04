// 矿场玩法说明：吉普缇在演示里清晰（按屏幕尺寸缩小）、宝藏鼹鼠受击闪白是本体而不是白方块
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2.6 })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 9, chars: ["deepseek", "gpt"], sel: "gpt" })));
await p.reload(); await p.waitForTimeout(1800);
await p.evaluate(async () => { const M = await import("./js/mine.js"); const u = M.Dive.prototype.update; M.Dive.prototype.update = function (...a) { window.__mgDive = this; return u.apply(this, a); }; (await import("./js/mineguide.js")).showMineGuide(); }); await p.waitForTimeout(500);
for (let i = 0; i < 2; i++) (await p.click(".mg-arw.r"), await p.waitForTimeout(200));
await p.waitForTimeout(1500); await p.screenshot({ path: "/tmp/mg3.png" });
for (let i = 0; i < 5; i++) (await p.click(".mg-arw.r"), await p.waitForTimeout(200));
const shots = [];
await p.waitForTimeout(800);
// hold the mole in its hit flash for the screenshot
const hit = await p.evaluate(() => { const d = window.__mgDive, m = d && d.mobs.find((m) => m.d && m.d.draw === "mole"); if (!m) return false; window.__mgHold = setInterval(() => (m.flash = 0.1), 5); return true; });
await p.waitForTimeout(300); await p.screenshot({ path: "/tmp/mg8hit.png" }); if (hit) shots.push(1);
await p.screenshot({ path: "/tmp/mg8.png" });
console.log("mole hit captured:", shots.length > 0); console.log("errors", JSON.stringify(errs)); await b.close();
