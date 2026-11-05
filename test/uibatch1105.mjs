// 本批界面：天赋装配「通用天赋」标题固定只滚列表；联机面板布局、无昵称框；首页火力整数；怪物图鉴
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775, W = +(process.argv[3] || 804), H = +(process.argv[4] || 360);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.addInitScript(() => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); });
await p.goto(`http://localhost:${PORT}/index.html`);
await p.evaluate(async () => { const D = await import("./js/data.js"); const tal = {}; for (const g of D.GACHA.pool) tal[g.id] = g.r === "SSR" ? 1 : Math.min(3, g.max || 1); const ssr = D.GACHA.pool.filter((g) => g.r === "SSR").map((g) => g.id); localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 242, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "claude", cores: { claude: 1 }, talents: tal, loadout: { claude: ssr.slice(0, 2) }, seenUnlock: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], codex: { slime: { seen: 1, kills: 12 }, bat: { seen: 1, kills: 5 }, mushroom: { seen: 1, kills: 2 }, frog_big: { seen: 1, kills: 1 }, slime_gold: { seen: 1, kills: 1 }, "mine:mole": { seen: 1, kills: 1 }, "mine:golem": { seen: 1, kills: 0 } }, curios: { grass_dew: 1 } })); });
await p.reload(); await p.waitForTimeout(3000);
for (let i = 0; i < 8 && (await p.$(".modal")); i++) (await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove()))), await p.waitForTimeout(300);
const out = {};
out.fire = await p.evaluate(() => [...document.querySelectorAll(".li-bars .sv")].map((n) => n.textContent));
await p.click(".li-kit"); await p.waitForTimeout(500);
const kp = async () => p.evaluate(() => { const h = document.querySelector(".kit-pass .kp-h").getBoundingClientRect(), gEl = document.querySelector(".kp-grid"), slot = document.querySelector(".kslot").getBoundingClientRect(); return { headTop: Math.round(h.top), headBottom: Math.round(h.bottom), slotBottom: Math.round(slot.bottom + 4), gridScroll: gEl.scrollTop, gridCanScroll: gEl.scrollHeight > gEl.clientHeight }; });
out.kitBefore = await kp();
await p.evaluate(() => (document.querySelector(".kp-grid").scrollTop = 200)); await p.waitForTimeout(200);
out.kitAfter = await kp();
await p.screenshot({ path: "/tmp/u_kit.png" });
await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove()));
await p.evaluate(async () => (await import("./js/ui.js")).showNet()); await p.waitForTimeout(500);
out.net = await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }; return { nameInput: !!document.querySelector(".netp .nm"), back: r(".np-h .back .btn"), panel: r(".np2"), cols: [...document.querySelectorAll(".np-col")].map((c) => { const b = c.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; }) }; });
await p.screenshot({ path: "/tmp/u_net.png" });
await p.evaluate(async () => { (await import("./js/main.js")).app.leaveNet && 0; document.querySelectorAll(".modal").forEach((m) => m.remove()); });
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(2500);
for (let i = 0; i < 8 && (await p.$(".modal")); i++) (await p.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove()))), await p.waitForTimeout(300);
await p.click(".codex-btn"); await p.waitForTimeout(800);
await p.screenshot({ path: "/tmp/u_codex.png" });
out.codex = await p.evaluate(() => ({ cards: document.querySelectorAll(".cdx-c").length, seen: document.querySelectorAll(".cdx-c:not(.no)").length, head: document.querySelector(".cdx-h span.o1").textContent }));
for (const i of [4, 5]) { await p.click(`.cdx-tab[data-i="${i}"]`); await p.waitForTimeout(500); await p.screenshot({ path: `/tmp/u_codex${i}.png` }); }
console.log(JSON.stringify(out, null, 1)); console.log("errors", JSON.stringify(errs)); await b.close();
