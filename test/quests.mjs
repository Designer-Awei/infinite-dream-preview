// 每日委托: three quests appear, a dive's result advances them, claiming pays out once; they reset on a new day
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 667), H = +(process.argv[3] || 375), touch = W < 1000;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(200);
const day = await p.evaluate(() => new Date().toDateString());
await p.evaluate((day) => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 100, chars: ["deepseek", "gpt"], sel: "deepseek", mine: { shovels: { cu: 2 }, best: 30, stars: 0, quests: { day, list: [
  { k: "kill", n: 6, prog: 0, stars: 3, tokens: 15 }, { k: "extract", n: 3, prog: 2, stars: 1, tokens: 40 }, { k: "ore", id: "copper", n: 6, prog: 0, stars: 3, tokens: 0 } ] } } })), day);
await p.reload(); await p.waitForTimeout(1800);
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(900);
await p.evaluate(() => document.querySelector('.mh-tab[data-t="quest"]').click()); await p.waitForTimeout(300);
await p.screenshot({ path: `tmp/quests0_${W}.png` });
await p.evaluate(() => document.querySelector(".mh-go").click()); await p.waitForTimeout(1000);
// fake a good dive: 7 kills, 6 copper in the bag, then extract
await p.evaluate(() => { const d = __app.dive; d.kills = 7; for (let i = 0; i < 6; i++) d.bag.push("copper"); d.finish("extract"); });
await p.waitForTimeout(1500);
await p.screenshot({ path: `tmp/quests_res_${W}.png` });
console.log("result line:", await p.evaluate(() => (document.querySelector(".mres-q") || {}).textContent));
await p.evaluate(() => [...document.querySelectorAll(".mres .btn")].pop().click()); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('.mh-tab[data-t="quest"]').click()); await p.waitForTimeout(300);
console.log("dot:", await p.evaluate(() => document.querySelector(".qdot").textContent));
await p.screenshot({ path: `tmp/quests1_${W}.png` });
const before = await p.evaluate(() => { const m = JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")); return [m.tokens, m.mine.stars]; });
for (let i = 0; i < 3; i++) { await p.evaluate(() => { const b = document.querySelector(".mq-b:not(.gray)"); b && b.click(); }); await p.waitForTimeout(250); }
const after = await p.evaluate(() => { const m = JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")); return [m.tokens, m.mine.stars, m.mine.quests.list.map((q) => q.claimed)]; });
console.log("tokens/stars before", before, "after", JSON.stringify(after), "pill", await p.evaluate(() => document.querySelector(".mine-hub .stars").textContent));
// new day → new list
await p.evaluate(() => { const m = JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")); m.mine.quests.day = "Mon Jan 01 2000"; localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify(m)); });
await p.reload(); await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(700);
await p.evaluate(() => document.querySelector('.mh-tab[data-t="quest"]').click()); await p.waitForTimeout(300);
console.log("new day:", await p.evaluate(() => [...document.querySelectorAll(".mq b")].map((n) => n.textContent).join(" / ")));
await p.screenshot({ path: `tmp/quests2_${W}.png` });
console.log("ERR", errs.join(" | "));
await b.close();
