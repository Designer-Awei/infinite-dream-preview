// 矿场修正：喷气不能飞出天空顶部；怪物伤害按层分档（最终减伤有用）；地下商人按钮等宽；背包可丢弃
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 804, height: 360 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.addInitScript(() => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", "1"); localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 800, chars: ["deepseek", "gpt"], sel: "deepseek", mine: { shovels: { cu: 2, ag: 1, au: 1 }, mats: 60, up: { dr: 1 } } })); });
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(2000);
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(900);
await p.evaluate(() => document.querySelector('.mshv[data-k="au"]').click()); await p.waitForTimeout(200);
await p.evaluate(() => document.querySelector(".mh-go").click()); await p.waitForTimeout(1500);
const out = {};
// 1) hold "up" with infinite power for 4 s: she must stay on screen
out.fly = await p.evaluate(async () => { const d = __app.dive; d.p.energy = d.p.maxE = 9999; let minY = 1e9; for (let i = 0; i < 40; i++) { __dbg.input.my = -1; await new Promise((r) => setTimeout(r, 100)); minY = Math.min(minY, d.p.y); } __dbg.input.my = 0; const cam = d.cam.y; return { minY: Math.round(minY), camTop: Math.round(cam), headOnScreen: minY - 30 > cam }; });
await p.screenshot({ path: "/tmp/mf_fly.png" });
// 2) damage tiers: a mob of each kind placed in each zone
out.dmg = await p.evaluate(() => { const d = __app.dive, MT = 24, rows = { pit: 10, cave: 40, sea: 70, ruin: 100 }; const r = {}; for (const [z, row] of Object.entries(rows)) r[z] = Object.fromEntries(["bat", "slime", "slime_purple", "jelly", "ghost", "skull"].map((t) => [t, d.mkMob(t, 100, row * MT).dmg])); return r; });
// 3) hurt with 最终减伤 1: a 2-damage hit takes 1
out.hurt = await p.evaluate(() => { const d = __app.dive; d.p.inv = 0; const h0 = d.p.hp; d.hurt(2); const h1 = d.p.hp; d.p.inv = 0; d.hurt(1); return { hit2: h0 - h1, hit1: h1 - d.p.hp }; });
// 4) bag: fill it with a mix, open, drop
await p.evaluate(() => { const d = __app.dive; d.p.hp = d.p.maxHp; d.bag = ["copper", "copper", "copper", "iron", "iron", "glow", "silver", "amethyst"]; });
await p.evaluate(() => document.querySelector(".mhud .bag").click()); await p.waitForTimeout(400);
out.bag = await p.evaluate(() => ({ open: !!document.querySelector(".bagm"), paused: __app.paused, rows: [...document.querySelectorAll(".bg-it b")].map((b) => b.textContent), widths: [...document.querySelectorAll(".bg-it .bg-1")].map((b) => Math.round(b.getBoundingClientRect().width)) }));
await p.screenshot({ path: "/tmp/mf_bag.png" });
await p.click(".bg-all"); await p.waitForTimeout(200); await p.click(".bg-1"); await p.waitForTimeout(200);
out.bagAfter = await p.evaluate(() => ({ bag: __app.dive.bag.join(","), rows: document.querySelectorAll(".bg-it").length }));
await p.click(".bg-close .btn"); await p.waitForTimeout(300);
out.closed = await p.evaluate(() => ({ open: !!document.querySelector(".bagm"), paused: __app.paused }));
// 5) merchant buttons
await p.evaluate(() => { const d = __app.dive; d.bag = Array(12).fill("silver"); d.shop = true; }); await p.waitForTimeout(600);
out.shop = await p.evaluate(() => [...document.querySelectorAll(".ms-it .btn")].map((b) => [b.textContent.trim(), Math.round(b.getBoundingClientRect().width)]));
await p.screenshot({ path: "/tmp/mf_shop.png" });
console.log(JSON.stringify(out, null, 1)); console.log("errors", JSON.stringify(errs)); await b.close();
