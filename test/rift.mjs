import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 804, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const errs = [];
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, chars: ["deepseek", "gpt"], sel: "gpt" })));
await p.reload(); await p.waitForTimeout(1800);
await p.evaluate(() => document.querySelector(".play-btn").click()); await p.waitForTimeout(3000);
await p.evaluate(() => { __app.game.runStats.boss = true; __app.game.runStats.rooms = 7; __app.offerRift(); }); await p.waitForTimeout(500);
await p.screenshot({ path: "/home/claude/infinite-dream-preview/tmp/rift_offer.png" });
await p.evaluate(() => [...document.querySelectorAll(".modal button")].find((x) => x.textContent.includes("进入裂隙")).click()); await p.waitForTimeout(1500);
for (let i = 0; i < 6; i++) { await p.evaluate(() => { const i = __dbg.input; i.my = 1; i.mx = 0; }); await p.waitForTimeout(800); }
await p.screenshot({ path: "/home/claude/infinite-dream-preview/tmp/rift_dive.png" });
await p.evaluate(() => { __dbg.input.my = 0; __app.dive.lite.left = 0.5; }); await p.waitForTimeout(2500);
await p.screenshot({ path: "/home/claude/infinite-dream-preview/tmp/rift_result.png" });
console.log(await p.evaluate(() => [...document.querySelectorAll(".res-chip")].map((n) => n.textContent).join(" | ")));
console.log("ERR", errs.join(" | "));
await b.close();
