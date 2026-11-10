import { load, save, mineState } from "./save.js";
import { PETS, PET_ORDER, PET_COST, PET_EVOLVE, PET_MAX_XP, QUALITY, FUSE_SHINY, FUSE_SHINY_PARENT, normalizePets, rollPet, rainbowChance, petQuality } from "./petdata.js";

// 伙伴仓库存档操作。ref = a pet's uid, or a kind id (then the pet `owned` maps that kind to).
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
  if (state.list.some((p) => p.id === id)) return { ok: false, reason: "已拥有该伙伴" };
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
/** hatch one egg: a young pet of a random kind (maybe 异色, maybe 流彩) */
export function hatchEgg() {
  const state = petState();
  if (state.eggs <= 0) return null;
  state.eggs--;
  const p = rollPet(PET_ORDER[Math.floor(Math.random() * PET_ORDER.length)], Math.random, { rainbow: rollRainbow(state) });
  addPet(state, p);
  save();
  return p;
}
export function grantEggs(n) {
  const state = petState(), k = Math.max(0, Math.floor(n) || 0);
  if (k) (state.eggs = Math.min(999, state.eggs + k)), save();
  return k;
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
export function evolvePet(ref) {
  const state = petState(), own = findPet(ref, state);
  if (!own || own.stage >= 3) return { ok: false, reason: "已达终极或尚未拥有" };
  const need = PET_EVOLVE[own.stage + 1], ms = mineState();
  if (own.xp < need.xp) return { ok: false, reason: "伙伴经验不足" };
  if (ms.stars < need.stars) return { ok: false, reason: "星砂不足" };
  ms.stars -= need.stars; own.stage++; save();
  return { ok: true, stage: own.stage };
}
export function grantPetXP(ref, amount) {
  const own = findPet(ref);
  if (!own || !Number.isFinite(amount) || amount <= 0) return 0;
  const before = own.xp; own.xp = Math.min(PET_MAX_XP, own.xp + Math.floor(amount)); save();
  return own.xp - before;
}
/** the xp the next injection fills up to: the next evolution's need above the pet's xp (300, then 1200) */
export function injectTarget(p) {
  return [PET_EVOLVE[2].xp, PET_EVOLVE[3].xp].find((x) => x > p.xp) ?? null;
}
/** 注入经验：move xp from the pool into a pet, up to its next evolution's need */
export function injectXP(uid) {
  const state = petState(), p = findPet(uid, state), to = p && injectTarget(p);
  if (!p || !to) return { ok: false, reason: "经验已满" };
  const give = Math.min(state.pool, to - p.xp);
  if (give <= 0) return { ok: false, reason: "经验池是空的" };
  state.pool -= give;
  p.xp += give;
  save();
  return { ok: true, give };
}
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
  if (!A || !B || A === B || A.id !== B.id) return { ok: false, reason: "需要两只同种伙伴" };
  if (!spendable(A, state) || !spendable(B, state)) return { ok: false, reason: "上锁或出战中的伙伴不能融合" };
  const skins = [A.skin, B.skin].filter((k) => k && k !== "flow");
  const p = rollPet(A.id, Math.random, { rainbow: rollRainbow(state), best: true, shiny: skins.length ? FUSE_SHINY_PARENT : FUSE_SHINY, skins });
  state.list = state.list.filter((q) => q !== A && q !== B);
  addPet(state, p);
  save();
  return { ok: true, pet: p };
}
/** what releasing a pet puts into the pool: by quality, 普通 100 … 传说 600, 流彩 1000 */
export const releaseXP = (p) => QUALITY[petQuality(p)].xp;
/** 放生：a pet that isn't locked or carried leaves; its quality's xp goes into the pool */
export function releasePet(uid) {
  const state = petState(), i = state.list.findIndex((p) => p.uid === uid), p = state.list[i];
  if (!p) return { ok: false, reason: "没有这只伙伴" };
  if (p.lock) return { ok: false, reason: "已上锁，先解锁" };
  if (state.equipped === uid) return { ok: false, reason: "出战中的伙伴不能放生" };
  const xp = releaseXP(p);
  state.list.splice(i, 1);
  state.pool += xp;
  save();
  return { ok: true, xp };
}
