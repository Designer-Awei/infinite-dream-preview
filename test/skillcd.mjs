// 小技能冷却最后一帧：从 "0.x" 到可用时按钮必须变回可用（以前会卡在灰色 0.0）
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 0, chars: ["deepseek", "gpt"], sel: "gpt" })));
await p.reload(); await p.waitForTimeout(1500);
await p.evaluate(() => __app.begin({ mode: "solo", pvp: false, seed: 77, opt: { map: "grass" }, players: [{ id: 1, cid: "gpt", name: "t" }], myId: 1 }));
await p.waitForTimeout(1500);
let stuck = 0, seen0 = 0;
for (let i = 0; i < 40; i++) {
  // a cooldown that ends within one frame, with a remaining fraction that rounds to the same HUD key as "ready"
  await p.evaluate(() => (__app.me.skillCd = 2)); await p.waitForTimeout(120); // grey with a countdown
  await p.evaluate((i) => { const me = __app.me; me.skillCd = 0.02 + (i % 5) * 0.004; }, i); // rounds to the same HUD key as "ready"
  await p.waitForTimeout(200);
  const s = await p.evaluate(() => { const me = __app.me, n = document.querySelector(".b-skill") || document.querySelector(".s-skill"); return { cd: me.skillCd, ready: n.classList.contains("ready"), txt: (n.querySelector(".cdt") || {}).textContent }; });
  if (s.cd <= 0 && !s.ready) stuck++;
  if (s.txt === "0.0") seen0++;
}
console.log("button stuck grey after the cooldown ended:", stuck, "/ 40 | showed \"0.0\":", seen0);
console.log("errors:", JSON.stringify(errs));
await b.close();
process.exit(stuck || seen0 || errs.length ? 1 : 0);
