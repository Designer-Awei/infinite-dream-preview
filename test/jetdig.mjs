// 喷气向上时顶到天花板也会向上挖：悬空在坑里按住 W，头顶的土块应被挖开
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 804, height: 360 } })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 900, chars: ["deepseek", "gpt"], sel: "deepseek", mine: { shovels: { cu: 1, ag: 1, au: 1 }, mats: 0, stars: 0 } })));
await p.reload(); await p.waitForTimeout(1800);
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector(".mh-go").click()); await p.waitForTimeout(900);
const res = await p.evaluate(async () => {
  const d = __app.dive, MT = 24;
  for (let y = 15; y <= 20; y++) for (let x = 10; x <= 14; x++) d.set(x, y, 0);
  for (let x = 10; x <= 14; x++) d.set(x, 14, 1), d.set(x, 21, 2);
  d.p.x = 12.5 * MT; d.p.y = 21 * MT; d.p.vy = 0; d.p.energy = d.p.maxE;
  return d.get(12, 14);
});
await p.waitForTimeout(400);
await p.keyboard.down("KeyW");
let jetSeen = false, broke = false;
for (let i = 0; i < 40 && !broke; i++) {
  await p.waitForTimeout(100);
  const s = await p.evaluate(() => ({ jet: __app.dive.p.jet, dig: __app.dive.p.dig && __app.dive.p.dig.dir, t: __app.dive.get(12, 14) }));
  if (s.jet && s.dig === "up") jetSeen = true;
  if (s.t === 0) broke = true;
}
await p.keyboard.up("KeyW");
console.log("ceiling before:", res, "| jet + dig up at once:", jetSeen, "| ceiling broken while flying:", broke);
console.log("errors:", JSON.stringify(errs));
await b.close();
process.exit(jetSeen && broke && !errs.length ? 0 : 1);
