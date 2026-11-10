import { load, save, mineState } from "./save.js";
import { PETS, PET_ORDER, PET_COST, PET_EVOLVE, PET_MAX_XP, QUALITY, FUSE, fuseOdds, RELEASE_KEEP, INJECT_STEP, SKIN_POOL, TRAITS, rollTraits, newUid, EGGS, PET_ITEMS, SPEED_STARS, DEX_REWARDS, skinsOf, normalizePets, rollPet, rainbowChance, petQuality, isRainbow, traitCap } from "./petdata.js";

// 宠物仓库存档操作。ref = a pet's uid, or a kind id (then the pet `owned` maps that kind to).
export function petState() {
  const m = load(), legacy = m.pets && !Array.isArray(m.pets.list) && m.pets.owned;
  m.pets = normalizePets(m.pets);
  if (legacy) save(); // an old save becomes the warehouse once
  return m.pets;
}
export function findPet(ref, state = petState()) {
  return state.list.find((p) => p.uid === ref) || state.owned[ref] || null;
}
const addPet = (state, p) => {
  state.list.push(p);
  (state.dex[p.id] ||= { skins: [] });
  const k = p.skin || "base";
  if (!state.dex[p.id].skins.includes(k)) state.dex[p.id].skins.push(k);
  if (!state.equipped) state.equipped = p.uid;
};
/** UR exchange (积攒): a first pet of a kind you don't have yet */
export function exchangePet(id, rarity) {
  if (!Object.hasOwn(PETS, id) || !Object.hasOwn(PET_COST, rarity)) return { ok: false, reason: "无效兑换" };
  const m = load(), state = petState();
  if (state.list.some((p) => p.id === id)) return { ok: false, reason: "已拥有该宠物" };
  const cost = PET_COST[rarity];
  if (!Number.isFinite(m.stash) || m.stash < cost) return { ok: false, reason: "积攒点不足" };
  m.stash -= cost;
  const p = rollPet(id, Math.random, { rainbow: rollRainbow(state) });
  addPet(state, p);
  save();
  return { ok: true, first: state.list.length === 1, stage: 1, pet: p };
}
/** one 流彩 roll with the growing chance: resets the count when it hits */
function rollRainbow(state) {
  const hit = Math.random() < rainbowChance(state.rb);
  state.rb = hit ? 0 : state.rb + 1;
  return hit;
}
/** hatch one egg of a kind: a young pet of a random kind (maybe 异色, maybe 流彩); the egg's floor re-rolls the
 *  traits until the quality reaches it (a UR egg hatches 稀有 or better, a HUR egg 史诗 or better) */
export function hatchEgg(kind = "base") {
  const state = petState(), egg = EGGS[kind];
  if (!egg || state.eggs[kind] <= 0) return null;
  state.eggs[kind]--;
  const p = rollPet(PET_ORDER[Math.floor(Math.random() * PET_ORDER.length)], Math.random, { rainbow: rollRainbow(state), floor: egg.floor });
  addPet(state, p);
  save();
  return p;
}
export function grantEggs(n, kind = "base") {
  const state = petState(), k = Math.max(0, Math.floor(n) || 0);
  if (k && EGGS[kind]) (state.eggs[kind] = Math.min(999, state.eggs[kind] + k)), save();
  return k;
}
/** 积攒兑换: "egg_ur" / "egg_hur" (宠物蛋) or "item_ur" / "item_hur" (淬灵露 / 流彩晶) */
export function stashExchange(what) {
  const m = load(), state = petState(), [type, r] = what.split("_"), def = type === "egg" ? EGGS[r] : PET_ITEMS[r];
  if (!def || !def.cost) return { ok: false, reason: "无效兑换" };
  if (!Number.isFinite(m.stash) || m.stash < def.cost) return { ok: false, reason: "积攒点不足" };
  m.stash -= def.cost;
  if (type === "egg") state.eggs[r]++;
  else state.items[r]++;
  save();
  return { ok: true, name: def.name };
}
/** which item a pet takes (流彩晶 for 流彩, else 淬灵露) and whether any of its traits can still go up */
export function itemFor(p) {
  const k = isRainbow(p) ? "hur" : "ur";
  return { k, item: PET_ITEMS[k], room: p.traits.some(([t, v]) => v < traitCap(p, t)) };
}
/** use one item on a pet: a random trait that isn't at its cap rises 2~5 points (clamped to the cap) */
export function useItem(uid) {
  const state = petState(), p = findPet(uid, state);
  if (!p) return { ok: false, reason: "没有这只宠物" };
  const { k, item, room } = itemFor(p);
  if (state.items[k] <= 0) return { ok: false, reason: `没有${item.name}` };
  if (!room) return { ok: false, reason: "词条都已到上限" };
  const open = p.traits.filter(([t, v]) => v < traitCap(p, t)), e = open[Math.floor(Math.random() * open.length)];
  const before = e[1];
  e[1] = Math.min(traitCap(p, e[0]), e[1] + 2 + Math.floor(Math.random() * 4));
  state.items[k]--;
  save();
  return { ok: true, key: e[0], add: e[1] - before, item: item.name };
}
export function equipPet(ref) {
  const state = petState();
  if (ref === null) return (state.equipped = null), save(), true;
  const p = findPet(ref, state);
  if (!p) return false;
  state.equipped = p.uid;
  save();
  return true;
}
// 进化 needs nothing but xp: a pet evolves the moment its xp reaches the next stage's need (in a run, at once)
const autoEvolve = (p) => {
  const from = p.stage;
  while (p.stage < 3 && p.xp >= PET_EVOLVE[p.stage + 1].xp) p.stage++;
  return p.stage > from;
};
export function evolvePet(ref) {
  const own = findPet(ref);
  if (!own || own.stage >= 3) return { ok: false, reason: "已达终极或尚未拥有" };
  if (!autoEvolve(own)) return { ok: false, reason: "宠物经验不足" };
  save();
  return { ok: true, stage: own.stage };
}
/** add xp to a pet (it evolves on the spot when it reaches a stage); returns the xp actually added */
export function grantPetXP(ref, amount) {
  const own = findPet(ref);
  if (!own || !Number.isFinite(amount) || amount <= 0) return 0;
  const before = own.xp; own.xp = Math.min(PET_MAX_XP, own.xp + Math.floor(amount));
  autoEvolve(own);
  save();
  return own.xp - before;
}
/** xp into the 经验池 (a run's pet xp a full pet could not take) */
export function addPool(n) {
  const state = petState(), k = Math.floor(n);
  if (!(k > 0)) return 0;
  state.pool += k;
  save();
  return k;
}
/** the xp a pet can still take (its 终极 cap), or null when full */
export function injectTarget(p) {
  return p.xp < PET_MAX_XP ? PET_MAX_XP : null;
}
/** 注入经验：up to 300 xp from the pool into a pet per tap (幼年 → 终极 in four taps); it evolves on the way */
export function injectXP(uid) {
  const state = petState(), p = findPet(uid, state);
  if (!p || p.xp >= PET_MAX_XP) return { ok: false, reason: "经验已满" };
  const give = Math.min(INJECT_STEP, state.pool, PET_MAX_XP - p.xp);
  if (give <= 0) return { ok: false, reason: "经验池是空的" };
  state.pool -= give;
  p.xp += give;
  const evolved = autoEvolve(p);
  save();
  return { ok: true, give, evolved, stage: p.stage };
}
/** what the next tap of 注入经验 would give this pet */
export const injectNext = (p, state = petState()) => Math.max(0, Math.min(INJECT_STEP, state.pool, PET_MAX_XP - p.xp));
export function toggleLock(uid) {
  const p = findPet(uid);
  if (!p) return false;
  p.lock = !p.lock;
  save();
  return p.lock;
}
/** pets that can be used up (fusion / release): not locked, not carried */
export const spendable = (p, state = petState()) => !!p && !p.lock && state.equipped !== p.uid;
/** 融合：two pets of one kind become one young pet of that kind — traits rolled with advantage, 异色 25% (50% if a
 *  parent is 异色, often inheriting its colour); counts as a hatch for the 流彩 chance */
export function fusePets(a, b) {
  const state = petState(), A = findPet(a, state), B = findPet(b, state);
  if (!A || !B || A === B) return { ok: false, reason: "需要两只宠物" };
  if (!spendable(A, state) || !spendable(B, state)) return { ok: false, reason: "上锁或出战中的宠物不能融合" };
  const o = fuseOdds(A, B), id = Math.random() < FUSE.mainKind ? A.id : B.id;
  let p;
  // 流彩: a 流彩 parent keeps it, otherwise the pity chance (each fusion counts like a hatch)
  if (rollRainbow(state) || o.q === 5) p = rollPet(id, Math.random, { rainbow: true });
  else {
    const q = Math.min(4, o.q + (Math.random() < o.up ? 1 : 0)), pool = SKIN_POOL[id];
    const skin = Math.random() < o.shiny ? pool[Math.floor(Math.random() * pool.length)] : null;
    // traits: two draws in the quality's range, the better set kept
    const worth = (t) => t.reduce((s, [k, v]) => s + v / TRAITS[k].top, 0), t1 = rollTraits(q), t2 = rollTraits(q);
    p = { uid: newUid(id), id, stage: 1, xp: 0, q, skin, traits: worth(t2) > worth(t1) ? t2 : t1, lock: false, t: Date.now() };
  }
  state.list = state.list.filter((q) => q !== A && q !== B);
  addPet(state, p);
  save();
  return { ok: true, pet: p, up: p.q > o.q && p.q !== 5 };
}
/** what releasing a pet puts into the pool: its quality's base (普通 100 … 传说 600, 流彩 1000) + half its xp */
export const releaseXP = (p) => QUALITY[petQuality(p)].xp + Math.floor((p.xp || 0) * RELEASE_KEEP);
/** 放生：a pet that isn't locked or carried leaves; its release xp goes into the pool */
export function releasePet(uid) {
  const state = petState(), i = state.list.findIndex((p) => p.uid === uid), p = state.list[i];
  if (!p) return { ok: false, reason: "没有这只宠物" };
  if (p.lock) return { ok: false, reason: "已上锁，先解锁" };
  if (state.equipped === uid) return { ok: false, reason: "出战中的宠物不能放生" };
  const xp = releaseXP(p);
  state.list.splice(i, 1);
  state.pool += xp;
  save();
  return { ok: true, xp };
}

// ---------------------------------------------------------------- 孵化槽
export const slotLeft = (sl, now = Date.now()) => (sl ? Math.max(0, sl.t0 + sl.dur - now) : 0);
export const speedCost = (sl) => Math.max(1, Math.ceil(slotLeft(sl) / 60000)) * SPEED_STARS;
/** put an egg of a kind into the first free 孵化槽 */
export function incubate(kind) {
  const state = petState(), i = state.slots.findIndex((x) => !x);
  if (!EGGS[kind] || state.eggs[kind] <= 0) return { ok: false, reason: "没有这种蛋" };
  if (i < 0) return { ok: false, reason: "孵化槽已满" };
  state.eggs[kind]--;
  state.slots[i] = { kind, t0: Date.now(), dur: EGGS[kind].min * 60000 };
  save();
  return { ok: true, slot: i };
}
/** 加速: pay 星砂 for the minutes left, the egg is ready at once */
export function speedSlot(i) {
  const state = petState(), sl = state.slots[i], ms = mineState();
  if (!sl || !slotLeft(sl)) return { ok: false, reason: "已经可以孵化了" };
  const cost = speedCost(sl);
  if (ms.stars < cost) return { ok: false, reason: `星砂不足（需要 ${cost}）` };
  ms.stars -= cost;
  sl.t0 = Date.now() - sl.dur;
  save();
  return { ok: true, cost };
}
/** 直接孵化 costs 星砂 for the egg's whole incubation time (minutes × SPEED_STARS) */
export const hatchNowCost = (kind) => EGGS[kind].min * SPEED_STARS;
export function hatchNow(kind) {
  const state = petState(), ms = mineState(), cost = hatchNowCost(kind);
  if (!EGGS[kind] || state.eggs[kind] <= 0) return { ok: false, reason: "没有这种蛋" };
  if (ms.stars < cost) return { ok: false, reason: `星砂不足（需要 ${cost}）` };
  ms.stars -= cost;
  state.eggs[kind]--;
  const p = rollPet(PET_ORDER[Math.floor(Math.random() * PET_ORDER.length)], Math.random, { rainbow: rollRainbow(state), floor: EGGS[kind].floor });
  addPet(state, p);
  save();
  return { ok: true, pet: p, cost };
}
/** a ready egg hatches: a young pet of a random kind with the egg's quality floor (maybe 异色 / 流彩) */
export function hatchSlot(i) {
  const state = petState(), sl = state.slots[i];
  if (!sl || slotLeft(sl) > 0) return null;
  state.slots[i] = null;
  const p = rollPet(PET_ORDER[Math.floor(Math.random() * PET_ORDER.length)], Math.random, { rainbow: rollRainbow(state), floor: EGGS[sl.kind].floor });
  addPet(state, p);
  save();
  return { pet: p, kind: sl.kind };
}
export const readySlots = (state = petState()) => state.slots.filter((x) => x && !slotLeft(x)).length;

// ---------------------------------------------------------------- 图鉴收集奖励
export const dexCount = (state = petState()) => PET_ORDER.reduce((a, id) => a + ["base", ...skinsOf(id)].filter((k) => state.dex[id]?.skins.includes(k)).length, 0);
export const dexClaimable = (state = petState()) => DEX_REWARDS.filter((r) => dexCount(state) >= r.n && !state.dexClaim.includes(r.n));
export function claimDex(n) {
  const state = petState(), r = DEX_REWARDS.find((x) => x.n === n);
  if (!r || state.dexClaim.includes(n)) return { ok: false, reason: "已领取" };
  if (dexCount(state) < n) return { ok: false, reason: `收集 ${n} 种后可领取` };
  if (r.egg) state.eggs[r.egg]++;
  if (r.item) state.items[r.item]++;
  if (r.pool) state.pool += r.pool;
  state.dexClaim.push(n);
  save();
  return { ok: true, text: r.text };
}
