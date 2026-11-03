// screenshots of each zone (teleporting the digger) + hub tabs
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 804), H = +(process.argv[3] || 360), touch = W < 1000;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 900, chars: ["deepseek", "gpt"], sel: "gpt", mine: { shovels: { cu: 1, ag: 1, au: 2 }, mats: 300, stars: 400, up: { drill: 3, battery: 5, bag: 3, armor: 2, radar: 2, beacon: 1, tank: 2 } } })));
await p.reload(); await p.waitForTimeout(1800);
const shot = (n) => p.screenshot({ path: `/home/claude/infinite-dream-preview/tmp/z_${n}_${W}.png` });
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(800);
await shot("hub");
await p.evaluate(() => document.querySelector('.mh-tab[data-t="shop"]').click()); await p.waitForTimeout(300);
await shot("shop");
await p.evaluate(() => document.querySelector('.mshv[data-k="au"]').click());
await p.evaluate(() => document.querySelector(".mh-go").click()); await p.waitForTimeout(800);
for (const row of [38, 70, 104]) {
  await p.evaluate((row) => {
    const d = __app.dive, MT = 24;
    // carve a pocket and drop her in
    for (let y = row - 2; y <= row; y++) for (let x = 11; x <= 14; x++) d.set(x, y, 0);
    d.p.x = 12.5 * MT; d.p.y = (row + 1) * MT; d.p.vy = 0; d.p.deepest = row; d.cam.y = d.p.y - 140;
    for (const m of d.mobs) if (Math.abs(m.y - d.p.y) < 200) m.awake = true;
  }, row);
  await p.waitForTimeout(1300);
  await p.keyboard.down("KeyJ"); await p.waitForTimeout(500); await p.keyboard.up("KeyJ");
  await shot("row" + row);
}
await p.keyboard.press("KeyK"); await p.waitForTimeout(700); await shot("bomb");
console.log("ERR", errs.join(" | "));
await b.close();
