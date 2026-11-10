// Companion rules shared by save, UI and the authoritative battle simulation.
export const PHOENIX_STORM_RADIUS=124, FOX_RIDE_RANGE=PHOENIX_STORM_RADIUS*1.5;
export const PET_ATTACK_RANGE={dragon:150,fox:170,phoenix:180};
export const DRAGON_FIREBALL={interval:.5,damageScale:2.4,speed:280,radius:12,range:300,splash:56};
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
export const petPortrait = (id, stage = 3) => `assets/pets/${id}-${stage}.png`;
// ---------------------------------------------------------------- 伙伴仓库：每只伙伴独立养成
// A pet = { uid, id (kind), stage, xp, skin (异色 id or null), traits: [[key, value], [key, value]], lock, t }.
// Traits roll uniformly inside their range; the quality grade is how high the rolls landed. Skins are code recolours
// (petskins.js), any stage can be one: an egg hatches 异色 with SHINY_CHANCE.
export const TRAITS = {
  dmg: { name: "利爪", desc: "伙伴伤害", min: 4, max: 15 },
  rate: { name: "迅捷", desc: "伙伴攻速", min: 4, max: 15 },
  cd: { name: "灵动", desc: "伙伴技能冷却", min: 5, max: 18, minus: true },
  carry: { name: "共鸣", desc: "携带加成", min: 10, max: 35 },
};
export const TRAIT_KEYS = Object.keys(TRAITS);
export const SKIN_POOL = { dragon: ["frost", "shadow", "gold", "jade", "ember"], fox: ["shadow", "jade", "ember"], phoenix: ["blaze", "shadow", "gold", "jade"] };
export const SHINY_CHANCE = 0.06;
export const RELEASE_XP = 400;
export const QUALITY = [
  { name: "普通", col: "#d8d0e8" },
  { name: "优秀", col: "#6ee08a" },
  { name: "稀有", col: "#6ab8ff" },
  { name: "完美", col: "#ffcf4a" },
];
const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.floor(Number(v) || 0)));
// a small seeded random for the one-time migration of old saves (so every read of an old save agrees)
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)), ((h >>>= 0) % 100000) / 100000);
}
export function rollTraits(rand = Math.random) {
  const keys = [...TRAIT_KEYS], out = [];
  for (let n = 0; n < 2; n++) {
    const k = keys.splice(Math.floor(rand() * keys.length), 1)[0], t = TRAITS[k];
    out.push([k, Math.round(t.min + rand() * (t.max - t.min))]);
  }
  return out;
}
export const newUid = (id) => id + "-" + Math.random().toString(36).slice(2, 8);
/** a freshly hatched young pet of kind id: random traits, 异色 with SHINY_CHANCE */
export function rollPet(id, rand = Math.random) {
  const shiny = rand() < SHINY_CHANCE, pool = SKIN_POOL[id];
  return { uid: newUid(id), id, stage: 1, xp: 0, skin: shiny ? pool[Math.floor(rand() * pool.length)] : null, traits: rollTraits(rand), lock: false, t: Date.now() };
}
function cleanTraits(v, uid) {
  const out = [], seen = new Set();
  if (Array.isArray(v)) for (const e of v) {
    const k = Array.isArray(e) ? e[0] : null, t = TRAITS[k];
    if (!t || seen.has(k) || out.length >= 2) continue;
    seen.add(k);
    out.push([k, clampInt(e[1], t.min, t.max)]);
  }
  return out.length ? out : rollTraits(seeded(uid));
}
function cleanPet(v) {
  if (!v || typeof v !== "object" || !Object.hasOwn(PETS, v.id)) return null;
  const uid = typeof v.uid === "string" && /^[a-z0-9-]{1,24}$/.test(v.uid) ? v.uid : null;
  if (!uid) return null;
  return { uid, id: v.id, stage: clampInt(v.stage || 1, 1, 3), xp: clampInt(v.xp, 0, PET_MAX_XP), skin: SKIN_POOL[v.id].includes(v.skin) ? v.skin : null, traits: cleanTraits(v.traits, uid), lock: !!v.lock, t: Number(v.t) || 0 };
}
/** 0..3: how high the trait rolls landed (普通 / 优秀 / 稀有 / 完美) */
export function petQuality(p) {
  const k = p.traits.reduce((a, [key, v]) => a + (v - TRAITS[key].min) / (TRAITS[key].max - TRAITS[key].min), 0) / Math.max(1, p.traits.length);
  return k >= 0.85 ? 3 : k >= 0.6 ? 2 : k >= 0.35 ? 1 : 0;
}
/** the battle multipliers of a pet's traits */
export function traitMul(traits) {
  const tr = { dmg: 1, rate: 1, cd: 1, carry: 1 };
  for (const [k, v] of traits || []) if (TRAITS[k]) tr[k] = k === "cd" ? 1 - v / 100 : 1 + v / 100;
  return tr;
}
/** the pet a player brings into a run, as sent to the host: kind, stage, 异色 and trait multipliers (all clamped) */
export function validPet(value) {
  if (!value || !Object.hasOwn(PETS, value.id)) return null;
  const stage = Math.max(1, Math.min(3, Math.floor(Number(value.stage) || 1)));
  const src = value.tr || traitMul(value.traits), tr = {};
  for (const k of TRAIT_KEYS) {
    const t = TRAITS[k], lo = k === "cd" ? 1 - t.max / 100 : 1, hi = k === "cd" ? 1 : 1 + t.max / 100;
    tr[k] = Math.max(lo, Math.min(hi, Number(src[k]) || 1));
  }
  return { id: value.id, stage, skin: SKIN_POOL[value.id].includes(value.skin) ? value.skin : null, tr };
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
    const skins = new Set([...(Array.isArray(d?.skins) ? d.skins : []).filter((k) => SKIN_POOL[id].includes(k)), ...list.filter((p) => p.id === id && p.skin).map((p) => p.skin)]);
    if (d || list.some((p) => p.id === id)) dex[id] = { skins: [...skins] };
  }
  const out = { v: 2, list, equipped, eggs: clampInt(value?.eggs, 0, 999), pool: clampInt(value?.pool, 0, 999999), dex };
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
