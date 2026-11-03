// 21:29 checklist: screenshots of every changed screen + a few behaviour checks
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const W = +(process.argv[2] || 804), H = +(process.argv[3] || 360), touch = W < 1000;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message + " " + (e.stack || "").split("\n")[1])); p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
const dir = "/home/claude/infinite-dream-preview/tmp/r", shot = (n) => p.screenshot({ path: `${dir}/${n}_${W}.png` });
await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(200);
// every SSR maxed (so pulls become 积攒点), every N/R/SR maxed too (lobby shows no pull count)
await p.evaluate(async () => {
  const { GACHA } = await import("./js/data.js");
  const talents = {}; for (const it of GACHA.pool) talents[it.id] = it.max;
  localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 5000, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "claude", talents, stash: 23, cores: { claude: 1 }, mine: { shovels: { cu: 1, ag: 1, au: 1 }, mats: 300, stars: 400 } }));
});
await p.reload(); await p.waitForTimeout(2000);
for (let i = 0; i < 3; i++) await p.evaluate(() => { const b = [...document.querySelectorAll(".modal .btn")].find((n) => n.textContent.includes("太好了")); b && b.click(); }), await p.waitForTimeout(400);
await shot("lobby");
console.log("gacha badge:", await p.evaluate(() => (document.querySelector(".t-gacha .badge") || {}).textContent || "none"));
// gacha: stash bar, one pull → 积攒点
await p.evaluate(() => document.querySelector(".t-gacha").click()); await p.waitForTimeout(1200);
await shot("gacha");
console.log("stashbar:", await p.evaluate(() => (document.querySelector(".stashbar .sb-n") || {}).textContent));
const st0 = await p.evaluate(() => JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")).stash);
// force SSR via pity
await p.evaluate(() => { const m = JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")); });
await p.evaluate(async () => { const S = await import("./js/save.js"); const m = S.load(); m.pity = 49; S.save(); });
await p.evaluate(() => document.querySelectorAll(".pull-btn")[0].click()); await p.waitForTimeout(800);
await p.waitForTimeout(1800); await p.evaluate(() => document.querySelector(".pull-ov").click()); await p.waitForTimeout(2600);
await shot("gacha_pull");
console.log("stash after SSR pull:", st0, "→", await p.evaluate(() => JSON.parse(localStorage.getItem("ai-girls-dungeon-v1")).stash));
await p.evaluate(() => { const x = [...document.querySelectorAll(".pull-ov .btn")].find((n) => n.textContent.includes("收下")); x && x.click(); }); await p.waitForTimeout(800);
console.log("pull overlay closed:", await p.evaluate(() => !document.querySelector(".pull-ov")));
await p.evaluate(() => document.querySelector(".stashbar") && document.querySelector(".stashbar").click()); await p.waitForTimeout(400);
await shot("stash");
await p.evaluate(() => document.querySelector(".stash-md") && document.querySelector(".stash-md").remove());
// loadout name + core
await p.evaluate(async () => { const L = await import("./js/lobby.js"); L.showLobby(); }); await p.waitForTimeout(800);
await p.evaluate(async () => { const L = await import("./js/lobby.js"); L.showLoadout("claude"); }); await p.waitForTimeout(700);
await shot("loadout");
await p.evaluate(() => document.querySelector(".kit-panel .x-btn").click()); await p.waitForTimeout(300);
// mine hub
await p.evaluate(() => document.querySelector(".t-mine").click()); await p.waitForTimeout(900);
await shot("hub");
const gap = await p.evaluate(() => { const l = document.querySelector(".mh-l").getBoundingClientRect(), r = document.querySelector(".mh-r").getBoundingClientRect(); return Math.round(r.left - l.right); });
const widths = await p.evaluate(() => [...document.querySelectorAll(".mu-b")].map((b) => Math.round(b.getBoundingClientRect().width)));
const clipped = await p.evaluate(() => [...document.querySelectorAll(".mup .mu-t span")].filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent));
console.log("hub gap:", gap, "upgrade btn widths:", JSON.stringify([...new Set(widths)]), "clipped descs:", JSON.stringify(clipped));
const al = await p.evaluate(() => { const a = document.querySelector(".mh-shovels").getBoundingClientRect(), s = document.querySelector(".mh-sup").getBoundingClientRect(); return [Math.round(a.left), Math.round(a.right), Math.round(s.left), Math.round(s.right)]; });
console.log("shovels vs supplies left/right:", JSON.stringify(al));
await p.evaluate(() => document.querySelector('.curpill[data-cur="star"]').click()); await p.waitForTimeout(300);
await shot("curinfo");
await p.evaluate(() => document.querySelector(".cur-md").click());
await p.evaluate(() => document.querySelector('.mh-tab[data-t="shop"]').click()); await p.waitForTimeout(300);
await shot("workshop");
await p.evaluate(() => document.querySelector('.mh-tab[data-t="quest"]').click()); await p.waitForTimeout(300);
await shot("quests");
await p.evaluate(() => document.querySelector(".mh-help").click()); await p.waitForTimeout(1500);
await shot("guide0");
for (let i = 1; i < 4; i++) { await p.evaluate(() => { const a = document.querySelectorAll(".mg-arw"); a[a.length - 1].click(); }); await p.waitForTimeout(1600); await shot("guide" + i); }
console.log("guide pages:", await p.evaluate(() => document.querySelectorAll(".mg-dots i").length));
await p.evaluate(() => document.querySelector(".mg-x").click()); await p.waitForTimeout(300);
// beacon confirm
await p.evaluate(() => document.querySelector('.mshv[data-k="cu"]').click());
await p.evaluate(() => document.querySelector(".mh-go").click()); await p.waitForTimeout(1200);
await p.keyboard.press("KeyL"); await p.waitForTimeout(400);
await shot("beacon");
console.log("beacon confirm shown:", await p.evaluate(() => !!document.querySelector(".bc-md")), "beacons left:", await p.evaluate(() => __app.dive.p.beacons));
await p.evaluate(() => [...document.querySelectorAll(".bc-md .btn")].find((n) => /取消|继续/.test(n.textContent)).click()); await p.waitForTimeout(300);
console.log("after cancel: beacons", await p.evaluate(() => __app.dive.p.beacons), "paused", await p.evaluate(() => __app.paused));
console.log("ERR", errs.join(" | "));
await b.close();
