// 遗迹守护者: the gold-shovel chamber has a guardian; the star chest is sealed while it lives; it attacks; killing it pays out and offers a relic
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 804), H = +(process.argv[3] || 360), touch = W < 1000;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message + " " + (e.stack || "").split("\n")[1])); p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, chars: ["deepseek", "gpt"], sel: "deepseek", mine: { shovels: { au: 1 } } })));
await p.reload(); await p.waitForTimeout(1800);
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(900);
await p.evaluate(() => document.querySelector(".mh-go").click()); await p.waitForTimeout(1200);
const info = await p.evaluate(() => { const d = __app.dive, g = d.mobs.find((m) => m.d.boss), gr = d.guardRoom; return { room: gr, golem: g && { hp: g.hp, awake: g.awake } }; });
console.log("room", JSON.stringify(info));
// drop the player into the chamber (lamp relic so the shot is readable), make them sturdy
await p.evaluate(() => { const d = __app.dive, gr = d.guardRoom; d.rel.lamp = 3; d.p.maxHp = d.p.hp = 40; d.p.x = (gr.x1 - 3) * 24; d.p.y = gr.fy * 24 - 1; d.p.vy = 0; d.cam.y = d.p.y - 150; d.cam.x = d.p.x - 300; });
await p.waitForTimeout(1600);
const s1 = await p.evaluate(() => { const d = __app.dive, g = d.mobs.find((m) => m.d.boss); return { awake: g.awake, hp: d.p.hp, rocks: d.bullets.filter((b) => b.rock).length, act: g.act && g.act.k }; });
await p.screenshot({ path: `tmp/golem_${W}.png` });
console.log("after entering:", JSON.stringify(s1));
// try to dig the star chest while it lives
const sealed = await p.evaluate(() => { const d = __app.dive, i = +Object.entries(d.chest).find(([, k]) => k === "star")[0]; d.p.x = (i % 26) * 24 - 12; return i; });
await p.keyboard.down("KeyD"); await p.waitForTimeout(1500); await p.keyboard.up("KeyD");
console.log("chest still sealed:", await p.evaluate((i) => __app.dive.t[i] === 12, sealed));
await p.waitForTimeout(2500);
console.log("player hp after fighting a while:", await p.evaluate(() => __app.dive.p.hp));
// kill it
const st0 = await p.evaluate(() => __app.dive.stars);
await p.evaluate(() => { const d = __app.dive, g = d.mobs.find((m) => m.d.boss); d.hitMob(g, 999); });
await p.waitForTimeout(800);
console.log("boss down:", JSON.stringify(await p.evaluate((st0) => ({ stars: __app.dive.stars - st0, relicPick: !!document.querySelector(".relic-modal"), bossLeft: __app.dive.mobs.some((m) => m.d.boss) }), st0)));
await p.screenshot({ path: `tmp/golem_down_${W}.png` });
await p.evaluate(() => document.querySelector(".relic-modal .card2").click()); await p.waitForTimeout(700);
await p.keyboard.down("KeyD"); await p.waitForTimeout(1500); await p.keyboard.up("KeyD");
console.log("chest opened after:", await p.evaluate((i) => __app.dive.t[i] !== 12, sealed));
console.log("ERR", errs.join(" | "));
await b.close();
