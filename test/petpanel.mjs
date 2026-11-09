// 梦境伙伴面板（骑乘技能自动切到终极徽章）：左侧固定预览台（与右栏等高、与标题左对齐，芯片/箭头/滑动切换伙伴，阶段徽章切换形态），
// 右侧技能行（跟随/骑乘 × 普攻/大招）点击后在预览台播放真实战斗演示；804×360 / 667×375 / 877×393 / 1280×720
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775, OUT = process.argv[3] || "/tmp/pp";
const b = await chromium.launch(), res = {}, errors = [];
for (const [W, H] of [[804, 360], [667, 375], [877, 393], [1280, 720]]) {
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "warning" && /pet demo/.test(m.text()) && errors.push(m.text()));
  await p.addInitScript(() => { const k = Object.keys(localStorage); localStorage.setItem("__pp", "1"); });
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(1800);
  await p.evaluate(async () => { const s = await import("./js/save.js"); const m = s.load(); m.pets = { owned: { dragon: { stage: 2, xp: 500 }, fox: { stage: 3, xp: 1200 } }, equipped: "dragon" }; m.stash = 3; s.save(); });
  for (let i = 0; i < 6 && (await p.$(".modal")); i++) (await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove()))), await p.waitForTimeout(200);
  await p.evaluate(async () => (await import("./js/petui.js")).showPets()); await p.waitForTimeout(900);
  const r = (res[`${W}x${H}`] = {});
  const layout = () => p.evaluate(() => { const R = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; const pn = document.querySelector(".pet-panel"); return { panel: R(".pet-panel"), title: R(".pet-panel h2"), stage: R(".pp-stage"), info: R(".pp-info"), preview: R(".pp-anim canvas"), overflow: [pn.scrollWidth - pn.clientWidth, pn.scrollHeight - pn.clientHeight], clipped: [...pn.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(), P = pn.getBoundingClientRect(); return b.width && (b.right > P.right + 1 || b.bottom > P.bottom + 1 || b.left < P.left - 1); }).map((e) => e.className).slice(0, 5), clampedRows: [...document.querySelectorAll(".pp-ad")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent), trait: (() => { const e = document.querySelector(".pp-trait span"); return e.scrollHeight > 40; })() }; });
  r.layout = await layout();
  await p.screenshot({ path: `${OUT}_${W}_a.png` });
  const c0 = await p.evaluate(() => (window.__c0 = document.querySelector(".pp-anim canvas"), 1));
  // skills: each row plays its demo, the portrait canvas is never rebuilt
  r.acts = [];
  for (const a of ["atk", "ult", "rideAtk", "rideUlt"]) {
    await p.click(`.pp-act[data-act="${a}"]`); await p.waitForTimeout(a.startsWith("ride") ? 1500 : 1300);
    r.acts.push(await p.evaluate((a) => { const v = document.querySelector(".pp-view"), d = document.querySelector(".pp-demo").__demo?.(); return [a, v.classList.contains("demo"), d?.cfg.act, d?.g.enemies.length, document.querySelector(".pp-cap").textContent, document.querySelector(".pp-badge.on")?.dataset.stage]; }, a));
    if (a === "ult" || a === "rideUlt") await p.screenshot({ path: `${OUT}_${W}_${a}.png` });
  }
  await p.click(`.pp-act[data-act="rideUlt"]`); await p.waitForTimeout(200);
  r.back = await p.evaluate(() => !document.querySelector(".pp-view").classList.contains("demo") && document.querySelector(".pp-anim canvas") === window.__c0);
  // stage badge, then the next pet by arrow, then the chip
  await p.click(`.pp-badge[data-stage="3"]`); await p.waitForTimeout(300);
  r.stage = await p.evaluate(() => [document.querySelector(".pp-rar").textContent, document.querySelector(".pp-badge.on").dataset.stage]);
  await p.click(".pp-arw.r"); await p.waitForTimeout(500);
  r.next = await p.evaluate(() => [document.querySelector(".pp-name").textContent, document.querySelector(".pp-anim canvas").__pv.id, document.querySelector(".pp-anim canvas") === window.__c0]);
  await p.screenshot({ path: `${OUT}_${W}_b.png` });
  await p.click(`.pp-pick[data-id="phoenix"]`); await p.waitForTimeout(500);
  r.chip = await p.evaluate(() => [document.querySelector(".pp-name").textContent, document.querySelector(".pp-tag").textContent]);
  r.layout2 = await layout();
  await p.screenshot({ path: `${OUT}_${W}_c.png` });
  await p.close();
}
console.log(JSON.stringify(res, null, 1)); console.log("errors", errors.slice(0, 6)); await b.close();
