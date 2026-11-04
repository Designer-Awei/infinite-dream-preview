// 扭蛋机 / 卡池预览 / 兑换卡 / 货币说明 layout shots + measurements
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 904), H = +(process.argv[3] || 405), PORT = process.argv[4] || 8775, touch = W < 1000;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message + " " + (e.stack || "").split("\n")[1])); p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
const dir = "/home/claude/infinite-dream-preview/tmp/g", shot = (n) => p.screenshot({ path: `${dir}/${n}_${W}.png` });
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
const full = process.argv[5] === "full";
await p.evaluate(async (full) => {
  const { GACHA } = await import("./js/data.js");
  const talents = {}; for (const it of GACHA.pool) if (full || it.r !== "SSR" || Math.random() < 0.5) talents[it.id] = it.max;
  localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 1194, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "doubao", talents, stash: 4, pity: 9, mine: { shovels: { cu: 0, ag: 1, au: 1 }, mats: 35, stars: 45, cards: 2 } }));
}, full);
await p.reload(); await p.waitForTimeout(2000);
for (let i = 0; i < 3; i++) await p.evaluate(() => { const b = [...document.querySelectorAll(".modal .btn")].find((n) => n.textContent.includes("太好了")); b && b.click(); }), await p.waitForTimeout(400);
await shot("lobby");
await p.evaluate(() => document.querySelector(".t-gacha").click()); await p.waitForTimeout(1200);
await shot("gacha");
const R = (sel) => p.evaluate((sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }, sel);
for (const s of [".gacha2 .logo", ".gacha2 .topbar .pill", ".gm", ".gm-dome", ".gm-base", ".stashbar", ".gp", ".gp-banner", ".gp-title", ".gp-feat", ".gp-btns"]) console.log(s, JSON.stringify(await R(s)));
console.log("feat cards:", await p.evaluate(() => document.querySelectorAll(".gp-feat .vc").length));
await p.evaluate(() => document.querySelector(".gp-poolbtn:not(.gp-exbtn)").click()); await p.waitForTimeout(500);
await shot("pool");
await p.evaluate(() => { const c = document.querySelector(".pool-modal [data-id]"); c && c.click(); window.__plH = document.querySelector(".pool-panel").getBoundingClientRect().height; }); await p.waitForTimeout(700);
await shot("pool_detail");
await p.evaluate(() => { document.querySelectorAll(".pv-modal").forEach((n) => n.remove()); document.querySelectorAll(".pool-modal").forEach((n) => n.remove()); });
const ex = await p.evaluate(() => { const n = document.querySelector(".gp-exbtn, .gx-ex"); n && n.click(); return !!n; }); await p.waitForTimeout(600);
console.log("exchange entry on gacha:", ex);
await shot("exchange");
await p.evaluate(() => { document.querySelectorAll(".modal").forEach((n) => n.remove()); });
// currency info on the gacha screen
await p.evaluate(() => document.querySelector(".gacha2 .curpill").click()); await p.waitForTimeout(400); const ci = await p.evaluate(() => !!document.querySelector(".cur-md"));
console.log("gacha currency info:", ci); await shot("gacha_cur");
await p.evaluate(() => document.querySelectorAll(".cur-md").forEach((n) => n.remove()));
// lobby currency info
await p.evaluate(async () => { const L = await import("./js/lobby.js"); L.showLobby(); }); await p.waitForTimeout(900);
await p.evaluate(() => document.querySelector(".screen .curpill").click()); await p.waitForTimeout(400); const li = await p.evaluate(() => !!document.querySelector(".cur-md"));
console.log("lobby currency info:", li); await shot("lobby_cur");
await p.evaluate(() => document.querySelectorAll(".cur-md").forEach((n) => n.remove()));
// mine hub
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(900);
await p.evaluate(() => document.querySelector('.mh-tab[data-t="shop"]').click()); await p.waitForTimeout(300);
await shot("hub_shop");
const hubEx = await p.evaluate(() => { const e = document.querySelector(".expill"), g = document.querySelector('.curpill[data-cur="gem"]'); return e && e.style.display !== "none" && e.getBoundingClientRect().right <= g.getBoundingClientRect().left; });
console.log("hub exchange pill:", hubEx, "old link:", await p.evaluate(() => !!document.querySelector(".mshop-use, .mu-usecard")));
await p.evaluate(() => document.querySelector(".expill").click()); await p.waitForTimeout(600); await shot("hub_exchange");
await p.evaluate(() => { const c = [...document.querySelectorAll(".ex-modal .vc")].find((n) => !n.classList.contains("no")); c && c.click(); }); await p.waitForTimeout(700); await shot("hub_exchange_pv");
console.log("exchange preview has button:", await p.evaluate(() => (document.querySelector(".pvm-act") || {}).textContent));
await p.evaluate(() => document.querySelector(".pvm-act").click()); await p.waitForTimeout(500);
console.log("after exchange cards:", await p.evaluate(() => JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")).mine.cards));
await p.evaluate(() => document.querySelectorAll(".modal").forEach((n) => n.remove()));
console.log("💎 left in DOM text:", await p.evaluate(() => document.body.innerText.includes("💎")));
console.log("errors:", JSON.stringify(errs));
await b.close();
