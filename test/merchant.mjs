// 地下商人 + 宝藏鼹鼠: the mole flees/drops loot, the merchant trades bag ore (下潜补给 was removed: nothing is charged)
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 804), H = +(process.argv[3] || 360), touch = W < 1000;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message + " " + (e.stack || "").split("\n")[1])); p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 100, chars: ["deepseek", "gpt"], sel: "deepseek", mine: { shovels: { cu: 2, ag: 1, au: 1 }, mats: 60 } })));
await p.reload(); await p.waitForTimeout(1800);
if (touch) await p.touchscreen.tap(5, H - 5);
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(900);

await p.screenshot({ path: `tmp/hub_sup_${W}.png` });
await p.evaluate(() => document.querySelector('.mshv[data-k="au"]').click());
const goTxt = await p.evaluate(() => document.querySelector(".mh-go").textContent);
await p.evaluate(() => document.querySelector(".mh-go").click()); await p.waitForTimeout(1200);
const s0 = await p.evaluate(() => { const d = __app.dive; return { tokens: JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")).tokens, bombs: d.p.bombs, hp: d.p.maxHp, merchant: d.merchant && d.merchant.r, mole: d.mobs.filter((m) => m.d.flee).map((m) => Math.round(m.y / 24)) }; });
console.log("go:", goTxt, JSON.stringify(s0));
// mole: walk the player next to it, check it runs, then shoot it down
const mole = await p.evaluate(() => { const d = __app.dive, m = d.mobs.find((m) => m.d.flee); d.p.x = m.x + 60; d.p.y = m.y + 8; d.cam.y = m.y - 120; return { x0: m.x }; });
await p.waitForTimeout(1200);
const mv = await p.evaluate(() => { const m = __app.dive.mobs.find((m) => m.d.flee); return m ? { awake: m.awake, x: m.x } : null; });
await p.screenshot({ path: `tmp/mole_${W}.png` });
console.log("mole ran:", mv && mv.awake, mv && Math.round(mv.x - mole.x0));
const bag0 = await p.evaluate(() => __app.dive.bag.length);
await p.evaluate(() => { const d = __app.dive, m = d.mobs.find((m) => m.d.flee); if (m) d.hitMob(m, 999); });
await p.waitForTimeout(300);
console.log("mole loot:", await p.evaluate((b0) => ({ items: __app.dive.bag.length - b0, stars: __app.dive.stars }), bag0));
// merchant: stand next to them
await p.evaluate(() => { const d = __app.dive, mc = d.merchant; d.p.x = mc.x - 10; d.p.y = mc.y; d.p.vy = 0; d.cam.y = mc.y - 130; d.bag.push("silver", "silver", "silver", "pearl", "pearl", "copper", "iron"); });
await p.waitForTimeout(400);
await p.evaluate(() => { const d = __app.dive, mc = d.merchant; d.p.x = mc.x - 10; d.p.y = mc.y; });
await p.waitForTimeout(1500);
const sh = await p.evaluate(() => ({ open: !!document.querySelector(".mshop"), bv: __app.dive.bagValue() }));
await p.screenshot({ path: `tmp/shop_${W}.png` });
console.log("shop open:", sh.open, "bag value", sh.bv);
const hp0 = await p.evaluate(() => { const d = __app.dive; d.p.hp = 1; return d.p.hp; });
await p.evaluate(() => document.querySelector('.ms-it button[data-k="heal"]').click()); await p.waitForTimeout(300);
console.log("after heal:", JSON.stringify(await p.evaluate(() => ({ hp: __app.dive.p.hp, bv: __app.dive.bagValue() }))));
await p.evaluate(() => document.querySelector('.ms-it button[data-k="relic"]').click()); await p.waitForTimeout(800);
console.log("relic pick after shop:", await p.evaluate(() => !!document.querySelector(".relic-modal") && !document.querySelector(".mshop")));
await p.evaluate(() => document.querySelector(".relic-modal .card2").click()); await p.waitForTimeout(800);
console.log("rel:", JSON.stringify(await p.evaluate(() => __app.dive.rel)), "paused:", await p.evaluate(() => !!(__app.dive.shop || __app.dive.choice)));
console.log("ERR", errs.join(" | "));
await b.close();
