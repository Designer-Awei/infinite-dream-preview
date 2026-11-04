// 本批改动核对：工坊满级行高、兑换卡归零仍显示、吉普缇技能/大招打箱子、无尽伤害随层数、改名
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 900, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "gpt", mine: { up: { drill: 3, battery: 2 }, cards: 0, mats: 5 } })));
await p.reload(); await p.waitForTimeout(1800);
const out = {};
out.lobbyName = await p.evaluate(() => document.querySelector(".lb-name, .lb-info h2, .lb-left b")?.textContent || "");
await p.evaluate(async () => (await import("./js/mineui.js")).showMineHub()); await p.waitForTimeout(500);
out.rows = await p.evaluate(() => [...document.querySelectorAll(".mup")].slice(0, 4).map((r) => [r.querySelector("b").textContent, +r.getBoundingClientRect().height.toFixed(1), +r.querySelector("button").getBoundingClientRect().height.toFixed(1), +r.querySelector(".mu-t").getBoundingClientRect().height.toFixed(1)]));
out.pill = await p.evaluate(() => { const e = document.querySelector(".expill"); return e ? [getComputedStyle(e).display, e.textContent.trim()] : null; });
await p.screenshot({ path: "/tmp/v_hub.png" });
await p.evaluate(async () => (await import("./js/lobby.js")).showGacha()); await p.waitForTimeout(600);
out.gachaEx = await p.evaluate(() => [...document.querySelectorAll("button")].filter((x) => /兑换/.test(x.textContent) && x.offsetParent).map((x) => x.textContent.trim()));
await p.screenshot({ path: "/tmp/v_gacha.png" });
// 吉普缇：小技能 / 大招对箱子和炸药桶
for (const kind of ["skill", "ult"]) {
  await p.evaluate(() => __app.begin({ mode: "solo", pvp: false, seed: 3, opt: { map: "grass" }, players: [{ id: 1, cid: "gpt", name: "t" }], myId: 1 }));
  await p.waitForTimeout(1500);
  out["gpt_" + kind] = await p.evaluate(async (kind) => {
    const g = __app.game, me = __app.me, m = g.map, T = 32;
    g.enemies.length = 0;
    const tx = Math.floor(me.x / T), ty = Math.floor(me.y / T), res = [];
    const set = (dx, t) => { const i = ty * m.W + tx + dx; m.t[i] = t; m.crates[i] = { hp: t === 5 ? 30 : 12 }; return i; };
    const { CRATE, BARREL } = await import("./js/map.js");
    const ic = (() => { const i = ty * m.W + tx + 2; m.t[i] = CRATE; m.crates[i] = { hp: 30 }; return i; })();
    const ib = (() => { const i = (ty + 1) * m.W + tx + 2; m.t[i] = BARREL; m.crates[i] = { hp: 12 }; return i; })();
    me.face = 0; me.input.mx = 1; me.input.my = 0;
    if (kind === "skill") { me.skillCd = 0; me.input.skill = true; } else { me.ult = 1; me.input.ult = true; }
    await new Promise((r) => setTimeout(r, 2500));
    return { crate: m.crates[ic].dead ? "破" : m.crates[ic].hp, barrel: m.crates[ib].dead ? "爆" : m.crates[ib].hp };
  }, kind);
}
// 无尽：伤害随层数
await p.evaluate(() => __app.begin({ mode: "solo", pvp: false, seed: 4, opt: { map: "grass", endless: true }, players: [{ id: 1, cid: "deepseek", name: "t" }], myId: 1 }));
await p.waitForTimeout(1200);
out.dbg = await p.evaluate(() => [__app.game.endless, __app.game.pvp, __app.game.roomIdx]);
out.endless = await p.evaluate(() => {
  const g = __app.game, e = { kind: "enemy" }, el = { kind: "enemy", elite: true }, bo = { kind: "enemy", boss: true };
  const avg = (n, src, L) => { g.roomIdx = L; let s = 0; for (let i = 0; i < 2000; i++) s += g.scaleHurt(n, src); return +(s / 2000).toFixed(2); };
  return [1, 10, 20, 40].map((L) => ({ L, 小怪: avg(2, e, L), 精英: avg(2, el, L), BOSS: avg(2, bo, L) }));
});
console.log(JSON.stringify(out, null, 1)); console.log("errors", JSON.stringify(errs)); await b.close();
