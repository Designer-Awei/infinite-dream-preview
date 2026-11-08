import { load, save, mineState } from "./save.js";
import { PETS, PET_COST, PET_EVOLVE, PET_MAX_XP, normalizePets } from "./petdata.js";

export function petState() {
  const m = load();
  m.pets = normalizePets(m.pets);
  return m.pets;
}
export function exchangePet(id, rarity) {
  if (!Object.hasOwn(PETS, id) || !Object.hasOwn(PET_COST, rarity)) return { ok: false, reason: "无效兑换" };
  const m = load(), state = petState(), target = 1;
  if (state.owned[id]?.stage >= target) return { ok: false, reason: "已拥有该形态" };
  const cost = PET_COST[rarity];
  if (!Number.isFinite(m.stash) || m.stash < cost) return { ok: false, reason: "积攒点不足" };
  m.stash -= cost;
  state.owned[id] = { stage: target, xp: 0 };
  if (!state.equipped) state.equipped = id;
  save();
  return { ok: true, first: Object.keys(state.owned).length === 1, stage: target };
}
export function equipPet(id) {
  const state = petState();
  if (id !== null && !Object.hasOwn(state.owned,id)) return false;
  state.equipped = id; save(); return true;
}
export function evolvePet(id) {
  const state = petState(), own = state.owned[id];
  if (!own || own.stage >= 3) return { ok: false, reason: "已达终极或尚未拥有" };
  const need = PET_EVOLVE[own.stage + 1], ms = mineState();
  if (own.xp < need.xp) return { ok: false, reason: "伙伴经验不足" };
  if (ms.stars < need.stars) return { ok: false, reason: "星砂不足" };
  ms.stars -= need.stars; own.stage++; save();
  return { ok: true, stage: own.stage };
}
export function grantPetXP(id, amount) {
  const state = petState(), own = state.owned[id];
  if (!own || !Number.isFinite(amount) || amount <= 0) return 0;
  const before = own.xp; own.xp = Math.min(PET_MAX_XP, own.xp + Math.floor(amount)); save();
  return own.xp - before;
}
