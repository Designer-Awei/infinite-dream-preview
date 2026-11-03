// 梦境矿场 end-to-end: lobby tile -> hub -> dive with a scripted digger -> bomb -> beacon -> results
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 804), H = +(process.argv[3] || 360), touch = W < 1000;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message + " " + (e.stack || "").split("\n")[1])); p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 800, chars: ["deepseek", "gpt"], sel: "deepseek", mine: { shovels: { cu: 2, ag: 1, au: 1 }, mats: 60 } })));
await p.reload(); await p.waitForTimeout(1800);
const shot = (n) => p.screenshot({ path: `/home/claude/infinite-dream-preview/tmp/m_${n}_${W}.png` });
await shot("lobby");
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(900);
await shot("hub");
await p.evaluate(() => document.querySelector('.mshv[data-k="au"]').click()); await p.waitForTimeout(200);
await p.evaluate(() => document.querySelector(".mh-go").click()); await p.waitForTimeout(1200);
await shot("dive0");
const step = async (ms, keys) => { for (const k of keys) await p.keyboard.down(k); await p.waitForTimeout(ms); for (const k of keys) await p.keyboard.up(k); };
await step(2500, ["KeyS"]);
await shot("dive1");
for (let i = 0; i < 18; i++) { await step(900, ["KeyS", "KeyJ"]); if (i % 4 === 1) await step(500, [i % 8 < 4 ? "KeyD" : "KeyA", "KeyJ"]); }
await shot("dive2");
const st = await p.evaluate(() => { const d = __app.dive; return d ? { y: Math.round(d.p.y / 24), hp: d.p.hp, e: Math.round(d.p.energy), bag: d.bag.length, mobs: d.mobs.length, ended: d.ended && d.ended.how } : "ended"; });
console.log(W, JSON.stringify(st));
await p.keyboard.press("KeyK"); await p.waitForTimeout(1600); await shot("bomb");
await p.keyboard.press("KeyL"); await p.waitForTimeout(2600); await shot("result");
console.log("result visible:", await p.evaluate(() => !!document.querySelector(".mres")), JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")).mine)));
console.log("ERR", errs.slice(0, 6).join(" | "));
await b.close();
