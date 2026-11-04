// 11/04 新卡效果：属性类天赋生效、思维链闪电弹跳、检索增强进房掉道具、混合专家低血加成
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
await p.evaluate(() => localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 0, chars: ["deepseek", "gpt"], sel: "gpt" })));
await p.reload(); await p.waitForTimeout(1500);
const start = (kit) => p.evaluate((kit) => __app.begin({ mode: "solo", pvp: false, seed: 4242, opt: { map: "grass" }, players: [{ id: 1, cid: "gpt", name: "t", kit }], myId: 1 }), kit);
let ok = true;
const check = (name, cond, info) => (console.log((cond ? "✓ " : "✗ ") + name, info ?? ""), (ok = ok && cond));
// stat talents
await start({ tal: { t_rate: 5, t_range: 5, t_magnet: 3, t_cd: 5, t_elite: 5, t_shield2: 2, t_replay: 3 }, eq: {}, cards: [] });
await p.waitForTimeout(2600);
const st = await p.evaluate(() => { const me = __app.me, base = { shield: 0 }; return { rate: me.st.rate, range: me.st.range, mag: me.st.mag, cd: me.st.cd, elite: me.st.elite, replay: me.st.replay, maxShield: me.maxShield }; });
const gptShield = await p.evaluate(async () => (await import("./js/data.js")).CHARS.gpt.shield);
check("批处理 Lv5 攻速 ×1.10", Math.abs(st.rate - 1.1) < 1e-9, st.rate);
check("长上下文 Lv5 射程 ×1.15", Math.abs(st.range - 1.15) < 1e-9, st.range);
check("缓存命中 Lv3 吸取范围 ×1.45", Math.abs(st.mag - 1.45) < 1e-9, st.mag);
check("参数共享 Lv5 小技能冷却 ×0.80", Math.abs(st.cd - 0.8) < 1e-9, st.cd);
check("对抗训练 Lv5 精英伤害 ×1.25", Math.abs(st.elite - 1.25) < 1e-9, st.elite);
check("冗余存储 Lv2 护盾上限 +2", st.maxShield === gptShield + 2, `${gptShield} → ${st.maxShield}`);
const eliteHit = await p.evaluate(() => { const g = __app.game, me = __app.me; me.st.crit = 0; const e = g.enemies.find((x) => !x.dead && x.spawnT <= 0) || g.enemies[0]; e.spawnT = 0; e.hp = 1e6; e.vulnT = 0; e.freezeT = 0; e.elite = false; let h0 = e.hp; g.hit(e, 10, { p: me }); const n = h0 - e.hp; e.elite = true; h0 = e.hp; g.hit(e, 10, { p: me }); return [n, h0 - e.hp]; });
check("对抗训练：同一下打精英是普通的 1.25 倍", Math.abs(eliteHit[1] / eliteHit[0] - 1.25) < 1e-6, eliteHit.map((x) => x.toFixed(2)).join(" → "));
const ult = await p.evaluate(() => { const g = __app.game, me = __app.me, e = g.enemies.find((x) => !x.dead); me.ult = 0; e.elite = true; g.kill(e, me); return me.ult; });
check("经验回放 Lv3：击败精英大招 +30%", Math.abs(ult - 0.3) < 1e-9, ult);
// SSR 思维链
await start({ tal: {}, eq: { t_chain: 1 }, cards: [] });
await p.waitForTimeout(2600);
const chain = await p.evaluate(async () => {
  const g = __app.game, me = __app.me, S = await import("./js/skills.js");
  for (const e of g.enemies) e.spawnT = 0, e.hp = 1e6;
  // line them up near the player
  g.enemies.slice(0, 5).forEach((e, i) => ((e.x = me.x + 60 + i * 50), (e.y = me.y)));
  const n0 = g.lines.length; let hits = 0; const oh = g.hit.bind(g); g.hit = (e, a, src) => (src && src.elem === "thunder" && hits++, oh(e, a, src));
  me.atkCount = 4; S.fireAttack(g, me, 0, null);
  const zaps = g.lines.length - n0;
  me.atkCount = 5; S.fireAttack(g, me, 0, null);
  g.hit = oh;
  return { zaps, hits, after: g.lines.length - n0 - zaps };
});
check("思维链：第 5 次普攻放出闪电，弹 4 个敌人", chain.zaps === 4 && chain.hits === 4, JSON.stringify(chain));
check("思维链：第 6 次普攻不放", chain.after === 0);
// SSR 检索增强
await start({ tal: {}, eq: { t_rag: 1 }, cards: [] });
await p.waitForTimeout(1200);
const rag = await p.evaluate(() => { const g = __app.game, me = __app.me; const near = g.pickups.filter((q) => q.kind === "item" && Math.hypot(q.x - me.x, q.y - me.y) < 120); return { kind: g.room.kind, near: near.length, item: near[0] && near[0].item }; });
const ragOff = await (async () => { await start({ tal: {}, eq: {}, cards: [] }); await p.waitForTimeout(1200); return p.evaluate(() => { const g = __app.game, me = __app.me; return g.pickups.filter((q) => q.kind === "item" && Math.hypot(q.x - me.x, q.y - me.y) < 120).length; }); })();
check("检索增强：进战斗房间身边有 1 个道具（没装备时 0 个）", rag.near === 1 && ragOff === 0, `${JSON.stringify(rag)} / 未装备 ${ragOff}`);
// SSR 混合专家
await start({ tal: {}, eq: { t_moe: 1 }, cards: [] });
await p.waitForTimeout(800);
const moe = await p.evaluate(() => { const g = __app.game, me = __app.me; me.hp = me.maxHp; const full = g.dmgMul(me); me.hp = Math.floor(me.maxHp / 2); return [full, g.dmgMul(me)]; });
check("混合专家：半血时伤害 ×1.3", Math.abs(moe[1] / moe[0] - 1.3) < 1e-9, moe.map((x) => x.toFixed(2)).join(" → "));
console.log("errors:", JSON.stringify(errs));
await b.close();
process.exit(ok && !errs.length ? 0 : 1);
