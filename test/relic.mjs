// 梦境遗物: relic chests exist per zone, opening one pauses the dive with a 1-of-3 pick, the buff applies and shows in the HUD/result
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 804), H = +(process.argv[3] || 360), touch = W < 1000;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 800, chars: ["deepseek", "gpt"], sel: "deepseek", mine: { shovels: { cu: 2, ag: 1, au: 1 }, mats: 60 } })));
await p.reload(); await p.waitForTimeout(1800);
if (touch) await p.touchscreen.tap(5, H - 5);
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(900);
await p.evaluate(() => document.querySelector('.mshv[data-k="au"]').click()); await p.waitForTimeout(200);
await p.evaluate(() => document.querySelector(".mh-go").click()); await p.waitForTimeout(1200);
const info = await p.evaluate(() => { const d = __app.dive; const rel = Object.entries(d.chest).filter(([, k]) => k === "relic").map(([i]) => Math.floor(i / __app.dive.MW)); return { relicRows: rel }; });
console.log("relic chest rows", JSON.stringify(info.relicRows));
for (let round = 0; round < 3; round++) {
  await p.evaluate(() => { const d = __app.dive; const i = +Object.entries(d.chest).find(([, k]) => k === "relic")[0]; d.breakTile(i % __app.dive.MW, Math.floor(i / __app.dive.MW)); });
  await p.waitForTimeout(700);
  const st = await p.evaluate(() => ({ choice: __app.dive.choice, modal: !!document.querySelector(".relic-modal"), t: __app.dive.time }));
  if (round === 0) await p.screenshot({ path: `tmp/relic_pick_${W}.png` });
  await p.waitForTimeout(400);
  const t2 = await p.evaluate(() => __app.dive.time);
  console.log("offer", JSON.stringify(st.choice), "modal", st.modal, "paused", t2 === st.t);
  await p.evaluate(() => document.querySelector(".relic-modal .card2").click()); await p.waitForTimeout(800);
}
const after = await p.evaluate(() => { const d = __app.dive; return { rel: d.rel, hp: d.p.maxHp, e: d.p.maxE, bag: d.bagCap, bombs: d.p.bombs, choice: d.choice }; });
console.log("after", JSON.stringify(after));
await p.waitForTimeout(400);
await p.screenshot({ path: `tmp/relic_hud_${W}.png` });
await p.keyboard.press("KeyL"); await p.waitForTimeout(2600);
await p.screenshot({ path: `tmp/relic_res_${W}.png` });
console.log("result relics shown:", await p.evaluate(() => !!document.querySelector(".mres-rel")));
console.log("ERR", errs.join(" | "));
await b.close();
