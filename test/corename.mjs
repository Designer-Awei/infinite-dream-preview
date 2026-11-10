// 梦核：角色窗口与台上名字流彩、没有梦核标签，详情里有梦核说明
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 9, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "claude", cores: { claude: 1 } })));
await p.reload(); await p.waitForTimeout(3000);
for (let i = 0; i < 8 && (await p.$(".modal")); i++) (await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove()))), await p.waitForTimeout(400);
await p.click(".lb-hero"); await p.waitForTimeout(500); // the card is in the character window since the 11-10 lobby redesign
const r = await p.evaluate(() => ({ chip: !!document.querySelector(".core-chip"), names: [...document.querySelectorAll(".core-name")].map((n) => n.textContent), anim: getComputedStyle(document.querySelector(".li-name")).animationName }));
await p.screenshot({ path: "/tmp/core_lobby.png" });
await p.click(".li-more"); await p.waitForTimeout(500); await p.screenshot({ path: "/tmp/core_detail.png" });
r.detail = await p.evaluate(() => [...document.querySelectorAll(".cd-h")].map((n) => n.textContent + " | " + (n.nextElementSibling ? n.nextElementSibling.textContent : "")).filter((t) => t.includes("梦核")));
console.log(JSON.stringify(r, null, 1)); console.log("errors", JSON.stringify(errs)); await b.close();
