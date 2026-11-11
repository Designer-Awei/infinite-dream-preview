// Companion rules shared by save, UI and the authoritative battle simulation.
export const PHOENIX_STORM_RADIUS=124, FOX_RIDE_RANGE=PHOENIX_STORM_RADIUS*1.5;
export const PET_ATTACK_RANGE={dragon:150,fox:170,phoenix:180};
export const DRAGON_FIREBALL={interval:.5,damageScale:2.4,speed:280,radius:12,range:300,splash:56,converge:7}; // converge: how fast a ball eases onto the aim line (1/s)
export const DRAGON_TORNADO={count:1,radius:40,range:360,speed:110,duration:4.5,damage:36,interval:.4};
export const PETS = {
  dragon: { name: "赤焰火龙", color: "#ff9c56", elem: "dragon", passive: "伤害", stat: "dmg", bonus: [.08, .12, .18], attack: "焰弹", skill: "灼热龙息", rideAttack: "巨焰火球", rideUlt: "焚天火龙卷", desc: "龙嘴发射大火球，大型火龙卷自动追敌。", trait:"骑乘火球爆炸与火龙卷可破墙、烧草，外边界保留。", rideDesc:"点按或长按每0.5秒一发大火球，命中爆炸；大招召出一道大型自动索敌火龙卷。", skillCd: 9 },
  fox: { name: "霆尾灵狐", color: "#ffe69a", elem: "thunder", passive: "攻速", stat: "rate", bonus: [.08, .12, .18], attack: "雷针", skill: "连锁雷击", rideAttack: "弹射电弧", rideUlt: "雷影穿梭", desc: "每10秒释放光环，清空敌方弹幕。", trait:"出战每10秒释放雷电光环，清除全图敌方弹幕。", rideDesc:`电弧索敌或指向发射，最多弹射3次；大招无目标立即结束。`, skillCd: 8 },
  phoenix: { name: "霜羽冰凰", color: "#9aeaff", elem: "water", passive: "大招蓄力", stat: "ultG", bonus: [.10, .15, .22], attack: "冰羽", skill: "范围暴风雪", rideAttack: "极寒冰锥", rideUlt: "极寒风暴", desc: "骑乘飞行越过障碍，免疫地面危害。", trait:"骑乘无视场景障碍，免疫毒圈、火焰、爆炸与冰面。", rideDesc:"单发冰锥 / 跟随自身的124范围极寒风暴。", skillCd: 10 },
};
export const PET_ORDER = Object.keys(PETS);
export const PET_STAGES = ["幼年", "成长", "终极"];
export const PET_EVOLVE = { 2: { xp: 300, stars: 40 }, 3: { xp: 1200, stars: 120 } };
export const PET_MAX_XP = 1200;
export const PET_COST = { UR: 10 };
export const eggCount = (st) => Object.values(st.eggs || {}).reduce((a, n) => a + n, 0);
export const petPortrait = (id, stage = 3) => `assets/pets/${id}-${stage}.png`;
// ---------------------------------------------------------------- 宠物仓库：每只宠物独立养成
// A pet = { uid, id (kind), stage, xp, q (quality 0..5), skin (异色 id or null), traits: [[key, value], …], lock, t }.
// The quality is rolled first and decides each trait's range (its cap): a 普通 pet's 灵动 rolls 2~8%, a 传说 one 12~20%.
// Skins are code recolours (petskins.js), any stage can be one: an egg hatches 异色 with SHINY_CHANCE.
export const TRAITS = {
  dmg: { name: "利爪", desc: "宠物伤害", top: 20 },
  rate: { name: "迅捷", desc: "宠物攻速", top: 20 },
  cd: { name: "灵动", desc: "宠物技能冷却", top: 20, minus: true },
  carry: { name: "共鸣", desc: "携带加成", top: 40 },
  // these two act on the character that carries the pet, not on the pet
  crit: { name: "鹰眼", desc: "角色暴击率", top: 10, owner: true },
  critx: { name: "致命", desc: "角色暴击效果", top: 40, owner: true },
};
export const TRAIT_KEYS = Object.keys(TRAITS);
// 异色 drawn by petskins.js; "flow" (流彩) only comes with the 流彩 quality
export const SKIN_POOL = { dragon: ["frost", "sakura", "gold", "jade", "ember"], fox: ["sakura", "jade", "ember", "frost"], phoenix: ["blaze", "sakura", "gold", "jade"] };
export const skinsOf = (id) => [...SKIN_POOL[id], "flow"];
export const SHINY_CHANCE = 0.06;
// 融合：主宠（先选的）+ 副宠。种族 70% 随主宠、30% 随副宠；品质取两者较高，同品质且在史诗以下时 20% 再升一阶；
// 异色按双亲里异色的只数：0 只 20%、1 只 50%、2 只必出，颜色在结果种族的异色里随机；流彩另按保底概率
export const FUSE = { mainKind: 0.7, upgrade: 0.2, upgradeBelow: 3, shiny: [0.2, 0.5, 1] };
/** a fusion's odds for main A + sub B: { mainKind, q (quality kept), up (chance of one tier more), shiny } */
export const fuseOdds = (A, B) => ({ sameKind: A.id === B.id, q: Math.max(A.q, B.q), up: A.q === B.q && A.q < FUSE.upgradeBelow ? FUSE.upgrade : 0, shiny: FUSE.shiny[!!A.skin + !!B.skin] });
// 放生：品质基础经验 + 当前累计经验的 50%；注入经验每次 300（幼年到终极共 4 次）
export const RELEASE_KEEP = 0.5, INJECT_STEP = 300;
// 流彩：0.2% a hatch (fusions count), +0.05% for every hatch without one, at most 5%; back to 0.2% once one hatches
export const RAINBOW = { base: 0.002, step: 0.0005, max: 0.05 };
export const rainbowChance = (n) => Math.min(RAINBOW.max, RAINBOW.base + Math.max(0, n) * RAINBOW.step);
// quality: white / green / blue / purple / gold / 流彩. w = hatch weight, band = each trait's range as a share of its top,
// xp = what releasing it puts into the pool. 流彩 has three traits; 流彩晶 may push them to 150% of the top.
export const QUALITY = [
  { name: "普通", col: "#e8e4f0", xp: 100, w: 30, band: [0.1, 0.4] },
  { name: "优秀", col: "#6ee08a", xp: 200, w: 30, band: [0.2, 0.55] },
  { name: "稀有", col: "#5aa8ff", xp: 300, w: 22, band: [0.3, 0.7] },
  { name: "史诗", col: "#c27bff", xp: 400, w: 12, band: [0.45, 0.85] },
  { name: "传说", col: "#ffcf4a", xp: 600, w: 6, band: [0.6, 1] },
  { name: "流彩", col: "#ff8ad8", xp: 1000, w: 0, band: [0.9, 1], rainbow: true },
];
export const RELEASE_XP = 400;
// 宠物蛋：three kinds that only differ in the lowest quality they hatch (the top is the same for all)
// min = minutes in a 孵化槽 before it hatches
export const EGGS = {
  base: { name: "宠物蛋", floor: 0, min: 3 },
  ur: { name: "UR 宠物蛋", floor: 2, cost: 10, min: 5 },
  hur: { name: "HUR 宠物蛋", floor: 3, cost: 20, min: 8 },
};
// 孵化槽：eggs wait here in real time; 星砂 speeds one up (per minute left)
export const SLOTS = 3, SPEED_STARS = 4;
// 矿场: a safe extraction finds a 宠物蛋 with this chance
export const MINE_EGG_CHANCE = 0.35;
// 图鉴收集奖励: claimed once each when that many entries are collected
export const DEX_REWARDS = [
  { n: 3, egg: "base", text: "宠物蛋 ×1" },
  { n: 6, item: "ur", text: "淬灵露 ×1" },
  { n: 9, egg: "ur", text: "UR 宠物蛋 ×1" },
  { n: 12, pool: 600, text: "经验池 +600" },
  { n: 15, egg: "hur", text: "HUR 宠物蛋 ×1" },
  { n: 19, item: "hur", text: "流彩晶 ×1" },
];
export const EGG_KINDS = Object.keys(EGGS);
// 积攒 items: 淬灵露 raises one random trait 2~5 points up to its quality's cap (传说 and below);
// 流彩晶 does the same for a 流彩 pet only, and may go past the cap, up to 150% of the top
export const PET_ITEMS = {
  ur: { name: "淬灵露", r: "UR", cost: 10, desc: "传说及以下 · 随机词条 +2~5%，至品质上限" },
  hur: { name: "流彩晶", r: "HUR", cost: 20, desc: "仅流彩 · 随机词条 +2~5%，可破上限" },
};
export const OVERCAP = 1.5;
export const isRainbow = (p) => p.q === 5;
/** a trait's range for a quality: [lo, hi] in percent */
export const traitBand = (q, k) => QUALITY[q].band.map((f) => Math.max(1, Math.round(TRAITS[k].top * f)));
/** the highest a trait of this pet can go: its quality's cap, 150% of the top for a 流彩 pet */
export const traitCap = (p, k) => (isRainbow(p) ? Math.round(TRAITS[k].top * OVERCAP) : traitBand(p.q, k)[1]);
// 评分：(成长分 + 词条分) × 品质系数 × 异色系数。成长分 幼年 200 → 成长 400 → 终极 600，阶段内随经验连续增长；
// 词条分 每条 500 × 数值/满值（流彩 三条，流彩晶 可到 150%）。完美满词条的传说终极 (600+1000)×1.25 = 2000，
// 异色 ×1.05 约 2100；流彩 ×1.4，出生满值 2940，流彩晶淬满 (600+2250)×1.4 = 3990
export const SCORE = { stage: [200, 400, 600], grow: 200, trait: 500, q: [1, 1.05, 1.1, 1.15, 1.25, 1.4], shiny: 1.05 };
export function petScore(p) {
  if (!p) return 0;
  const s = Math.max(1, Math.min(3, p.stage || 1)), next = PET_EVOLVE[s + 1], from = s > 1 ? PET_EVOLVE[s].xp : 0;
  const grow = SCORE.stage[s - 1] + (next ? SCORE.grow * Math.max(0, Math.min(1, ((p.xp || 0) - from) / (next.xp - from))) : 0);
  const tr = (p.traits || []).reduce((a, [k, v]) => a + (TRAITS[k] ? (SCORE.trait * v) / TRAITS[k].top : 0), 0);
  const skin = p.skin && p.skin !== "flow" ? SCORE.shiny : 1;
  return Math.round((grow + tr) * (SCORE.q[p.q] || 1) * skin);
}
const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.floor(Number(v) || 0)));
// a small seeded random for the one-time migration of old saves (so every read of an old save agrees)
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)), ((h >>>= 0) % 100000) / 100000);
}
/** a quality by the hatch weights, at least floor; best: rolled twice, the higher kept (fusion) */
export function rollQuality(rand = Math.random, floor = 0, best = false) {
  const one = () => {
    const ok = QUALITY.map((Q, i) => (i >= floor ? Q.w : 0)), sum = ok.reduce((a, b) => a + b, 0);
    let r = rand() * sum;
    return ok.findIndex((w) => (r -= w) < 0);
  };
  return best ? Math.max(one(), one()) : one();
}
/** distinct traits for a quality (two, three for 流彩), each inside the quality's range */
export function rollTraits(q, rand = Math.random) {
  const keys = [...TRAIT_KEYS], out = [];
  for (let i = 0; i < (q === 5 ? 3 : 2); i++) {
    const k = keys.splice(Math.floor(rand() * keys.length), 1)[0], [lo, hi] = traitBand(q, k);
    out.push([k, Math.round(lo + rand() * (hi - lo))]);
  }
  return out;
}
export const newUid = (id) => id + "-" + Math.random().toString(36).slice(2, 8);
/** a freshly hatched young pet of kind id. o: { rainbow (流彩: three top traits, the 流彩 skin), floor (lowest quality),
 *  best (quality rolled with advantage), shiny (异色 chance), skins (parents' 异色, one is inherited 60% of the time) } */
export function rollPet(id, rand = Math.random, o = {}) {
  const pool = SKIN_POOL[id], q = o.rainbow ? 5 : rollQuality(rand, o.floor || 0, !!o.best);
  let skin = null;
  if (o.rainbow) skin = "flow";
  else if (rand() < (o.shiny ?? SHINY_CHANCE)) skin = o.skins?.length && rand() < 0.6 ? o.skins[Math.floor(rand() * o.skins.length)] : pool[Math.floor(rand() * pool.length)];
  return { uid: newUid(id), id, stage: 1, xp: 0, q, skin, traits: rollTraits(q, rand), lock: false, t: Date.now() };
}
// the quality of a pet saved before qualities were stored: how high its traits sat in the old ranges
const OLD = { dmg: [4, 15], rate: [4, 15], cd: [5, 18], carry: [10, 35] };
function oldQuality(traits) {
  if (traits.length >= 3) return 5;
  const k = traits.reduce((a, [key, v]) => a + Math.min(1, Math.max(0, (v - OLD[key][0]) / (OLD[key][1] - OLD[key][0]))), 0) / Math.max(1, traits.length);
  return k >= 0.88 ? 4 : k >= 0.7 ? 3 : k >= 0.5 ? 2 : k >= 0.28 ? 1 : 0;
}
/** a pet's traits, kept inside its quality's range; a pet saved before qualities existed gets its quality from its old
 *  rolls and fresh values in that quality's range (seeded by its uid, so every read agrees) */
function cleanTraits(v, uid, q0) {
  const raw = [], seen = new Set();
  if (Array.isArray(v)) for (const e of v) {
    const k = Array.isArray(e) ? e[0] : null;
    if (!TRAITS[k] || seen.has(k) || raw.length >= 3) continue;
    seen.add(k);
    raw.push([k, Number(e[1]) || 0]);
  }
  if (Number.isInteger(q0) && q0 >= 0 && q0 <= 5 && raw.length === (q0 === 5 ? 3 : 2)) {
    const p = { q: q0 };
    return { q: q0, traits: raw.map(([k, x]) => [k, clampInt(x, traitBand(q0, k)[0], traitCap(p, k))]) };
  }
  const rand = seeded(uid);
  if (!raw.length) {
    const q = rollQuality(rand);
    return { q, traits: rollTraits(q, rand) };
  }
  // keep the old trait kinds, roll their values again inside the new quality's ranges
  const q = oldQuality(raw), traits = raw.slice(0, q === 5 ? 3 : 2).map(([k]) => {
    const [lo, hi] = traitBand(q, k);
    return [k, Math.round(lo + rand() * (hi - lo))];
  });
  return { q, traits };
}
// 暗影 (purple) became 绯樱
const skinOk = (id, k) => (k === "shadow" ? "sakura" : skinsOf(id).includes(k) ? k : null);
function cleanPet(v) {
  if (!v || typeof v !== "object" || !Object.hasOwn(PETS, v.id)) return null;
  const uid = typeof v.uid === "string" && /^[a-z0-9-]{1,24}$/.test(v.uid) ? v.uid : null;
  if (!uid) return null;
  const { q, traits } = cleanTraits(v.traits, uid, v.q);
  const skin = q === 5 ? "flow" : skinOk(v.id, v.skin) === "flow" ? null : skinOk(v.id, v.skin);
  return { uid, id: v.id, stage: clampInt(v.stage || 1, 1, 3), xp: clampInt(v.xp, 0, PET_MAX_XP), q, skin, traits, lock: !!v.lock, t: Number(v.t) || 0 };
}
/** 0..5 = 普通 / 优秀 / 稀有 / 史诗 / 传说 / 流彩 */
export const petQuality = (p) => p.q ?? 0;
/** the battle multipliers of a pet's traits */
export function traitMul(traits) {
  const tr = { dmg: 1, rate: 1, cd: 1, carry: 1, crit: 1, critx: 1 };
  for (const [k, v] of traits || []) if (TRAITS[k]) tr[k] = k === "cd" ? 1 - v / 100 : 1 + v / 100;
  return tr;
}
/** the pet a player brings into a run, as sent to the host: kind, stage, 异色 and trait multipliers (all clamped) */
export function validPet(value) {
  if (!value || !Object.hasOwn(PETS, value.id)) return null;
  const stage = Math.max(1, Math.min(3, Math.floor(Number(value.stage) || 1)));
  const src = value.tr || traitMul(value.traits), tr = {};
  for (const k of TRAIT_KEYS) {
    const top = (TRAITS[k].top * OVERCAP) / 100, lo = k === "cd" ? 1 - top : 1, hi = k === "cd" ? 1 : 1 + top;
    tr[k] = Math.max(lo, Math.min(hi, Number(src[k]) || 1));
  }
  return { id: value.id, stage, skin: skinOk(value.id, value.skin), tr };
}
/** the save's pets: { v: 2, list, equipped (uid), eggs, pool (养成经验池), dex }. An old save ({ owned: { kind: { stage, xp } } })
 *  becomes one pet per kind whose uid is the kind's id, so an old equipped kind stays equipped. `owned` (not saved) is a
 *  per-kind view — the equipped pet of that kind, else the most grown — for code that only knows kinds. */
export function normalizePets(value) {
  const list = [], seen = new Set();
  if (Array.isArray(value?.list)) {
    for (const v of value.list) {
      const p = cleanPet(v);
      if (p && !seen.has(p.uid)) seen.add(p.uid), list.push(p);
    }
  } else for (const id of PET_ORDER) {
    const v = value?.owned?.[id];
    if (v && typeof v === "object") list.push(cleanPet({ uid: id, id, stage: v.stage, xp: v.xp }));
  }
  const equipped = list.some((p) => p.uid === value?.equipped) ? value.equipped : null;
  const dex = {};
  for (const id of PET_ORDER) {
    const d = value?.dex?.[id];
    // 图鉴: "base" (原色) and every 异色 ever owned, kept after a pet is released or fused
    const skins = new Set([...(Array.isArray(d?.skins) ? d.skins : []).map((k) => (k === "base" ? k : skinOk(id, k))).filter(Boolean), ...list.filter((p) => p.id === id).map((p) => p.skin || "base")]);
    if (d || list.some((p) => p.id === id)) dex[id] = { skins: [...skins] };
  }
  // rb: hatches / fusions since the last 流彩 (its chance grows with it)
  // eggs by kind (an old save's number is plain 宠物蛋) and 积攒 items
  const ev = value?.eggs, eggs = {}, items = {};
  for (const k of EGG_KINDS) eggs[k] = clampInt(typeof ev === "number" ? (k === "base" ? ev : 0) : ev?.[k], 0, 999);
  for (const k of Object.keys(PET_ITEMS)) items[k] = clampInt(value?.items?.[k], 0, 999);
  // 孵化槽 ({ kind, t0, dur } or null) and the 图鉴 rewards already claimed
  const slots = Array.from({ length: SLOTS }, (_, i) => {
    const v = value?.slots?.[i];
    return v && EGGS[v.kind] && Number.isFinite(v.t0) ? { kind: v.kind, t0: v.t0, dur: clampInt(v.dur, 0, 36e5) } : null;
  });
  const dexClaim = (Array.isArray(value?.dexClaim) ? value.dexClaim : []).filter((n) => DEX_REWARDS.some((r) => r.n === n));
  const out = { v: 2, list, equipped, eggs, items, pool: clampInt(value?.pool, 0, 999999), rb: clampInt(value?.rb, 0, 99999), dex, slots, dexClaim };
  Object.defineProperty(out, "owned", {
    enumerable: false,
    get() {
      const o = {};
      for (const p of out.list) {
        const cur = o[p.id];
        if (!cur || p.uid === out.equipped || (cur.uid !== out.equipped && (p.stage > cur.stage || (p.stage === cur.stage && p.xp > cur.xp)))) o[p.id] = p;
      }
      return o;
    },
  });
  return out;
}
export function equippedPet(meta) {
  const state = normalizePets(meta.pets), p = state.list.find((q) => q.uid === state.equipped);
  return p ? { id: p.id, stage: p.stage, skin: p.skin, traits: p.traits } : null;
}
export function petExperience({ seconds = 0, rooms = 0, bosses = 0 } = {}) {
  return Math.max(0, Math.floor(Math.max(0, seconds) / 6) + Math.max(0, rooms) * 4 + Math.max(0, bosses) * 8);
}
