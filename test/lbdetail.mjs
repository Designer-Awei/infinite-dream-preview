// 大厅信息卡：天赋按钮位置、点详情/天赋时背景不闪；详情页一屏放下；天赋装配卡片左边框不被裁
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775, W = +(process.argv[3] || 877), H = +(process.argv[4] || 393);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`);
await p.evaluate(async () => { const D = await import("./js/data.js"); const tal = {}; for (const g of D.GACHA.pool) tal[g.id] = g.r === "SSR" ? 1 : Math.min(3, g.max || 1); const ssr = D.GACHA.pool.filter((g) => g.r === "SSR").map((g) => g.id); localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 242, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "claude", cores: { claude: 1 }, talents: tal, loadout: { claude: ssr.slice(0, 2) }, seenUnlock: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"] })); });
await p.reload(); await p.waitForTimeout(3000);
for (let i = 0; i < 8 && (await p.$(".modal")); i++) (await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove()))), await p.waitForTimeout(400);
await p.screenshot({ path: "/tmp/ld_lobby.png" });
const chipH = await p.evaluate(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.top * 10) / 10, Math.round(b.height * 10) / 10]; }; return { role: r(".li-chips .role"), more: r(".li-more"), fs: [getComputedStyle(document.querySelector(".li-chips .role")).fontSize, getComputedStyle(document.querySelector(".li-more")).fontSize] }; });
// watch the lobby for re-renders while the detail opens: mutations on .lb-info / hero, and the hero/info animations
const watch = async (sel) => {
  await p.evaluate(() => { window.__mut = []; const mo = new MutationObserver((ms) => { for (const m of ms) if (!m.target.closest || !m.target.closest(".modal")) window.__mut.push((m.target.className || m.target.nodeName) + ":" + m.type + (m.attributeName ? "/" + m.attributeName : "")); }); mo.observe(document.getElementById("ui"), { subtree: true, childList: true, attributes: true }); window.__mo = mo; });
  await p.click(sel); await p.waitForTimeout(700);
  const r = await p.evaluate(() => (window.__mo.disconnect(), [...new Set(window.__mut)].filter((x) => !/^lbp|lb-motes|ksGlow/.test(x)).slice(0, 30)));
  return r;
};
const det = await watch(".li-more");
await p.screenshot({ path: "/tmp/ld_detail.png" });
const fit = await p.evaluate(() => { const b = document.querySelector(".cd-body"), [l, r] = b.querySelectorAll(".cd-sec"), end = (sec) => Math.round(Math.max(...[...sec.children].map((c) => c.getBoundingClientRect().bottom))); return { sh: b.scrollHeight, ch: b.clientHeight, leftEnd: end(l), rightEnd: end(r) }; });
await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove()));
const kit = await watch(".li-kit");
await p.waitForTimeout(400); await p.screenshot({ path: "/tmp/ld_kit.png" });
const clip = await p.evaluate(() => { const l = document.querySelector(".kit-list"), c = l.querySelector(":scope > *"), lr = l.getBoundingClientRect(), cr = c.getBoundingClientRect(); return { listLeft: lr.left, cardLeft: cr.left, slotTop: Math.round(document.querySelector(".kslot").getBoundingClientRect().top), cardTop: Math.round(cr.top), sub: document.querySelector(".kit-sub").textContent }; });
console.log(JSON.stringify({ chipH, det, kit, fit, clip }, null, 1)); console.log("errors", JSON.stringify(errs)); await b.close();
