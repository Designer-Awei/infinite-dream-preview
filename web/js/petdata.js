// Companion rules shared by save, UI and the authoritative battle simulation.
export const PETS = {
  dragon: { name: "赤焰火龙", color: "#ff9c56", elem: "dragon", passive: "伤害", stat: "dmg", bonus: [.08, .12, .18], attack: "焰弹", skill: "灼热龙息", rideAttack: "爆炎弹", rideUlt: "焚天龙息", desc: "四足火龙，持续龙息扫过前方敌人。", skillCd: 9 },
  fox: { name: "霆尾灵狐", color: "#ffe69a", elem: "thunder", passive: "攻速", stat: "rate", bonus: [.08, .12, .18], attack: "雷针", skill: "连锁雷击", rideAttack: "三重雷刃", rideUlt: "天雷连环", desc: "灵巧雷狐，闪电在敌人之间跳跃。", skillCd: 8 },
  phoenix: { name: "霜羽冰凰", color: "#9aeaff", elem: "water", passive: "大招蓄力", stat: "ultG", bonus: [.10, .15, .22], attack: "冰羽", skill: "范围暴风雪", rideAttack: "穿霜冰羽", rideUlt: "极寒风暴", desc: "双翼冰凰，暴风雪减速并冻结敌人。", skillCd: 10 },
};
export const PET_ORDER = Object.keys(PETS);
export const PET_STAGES = ["幼年", "成长", "终极"];
export const PET_EVOLVE = { 2: { xp: 300, stars: 40 }, 3: { xp: 1200, stars: 120 } };
export const PET_MAX_XP = 1200;
export const PET_COST = { UR: 10, HUR: 20 };
export const petPortrait = (id, stage = 3) => `assets/pets/${id}-${stage}.png`;
export function validPet(value) {
  if (!value || !Object.hasOwn(PETS, value.id)) return null;
  const stage = Math.max(1, Math.min(3, Math.floor(Number(value.stage) || 1)));
  return { id: value.id, stage };
}
export function normalizePets(value) {
  const owned = {};
  for (const id of PET_ORDER) {
    const v = value?.owned?.[id];
    if (!v || typeof v !== "object") continue;
    owned[id] = { stage: Math.max(1, Math.min(3, Math.floor(Number(v.stage) || 1))), xp: Math.max(0, Math.min(PET_MAX_XP, Math.floor(Number(v.xp) || 0))) };
  }
  return { owned, equipped: Object.hasOwn(owned,value?.equipped) ? value.equipped : null };
}
export function equippedPet(meta) {
  const state = normalizePets(meta.pets), id = state.equipped;
  return id ? { id, stage: state.owned[id].stage } : null;
}
export function petExperience({ seconds = 0, rooms = 0, bosses = 0 } = {}) {
  return Math.max(0, Math.floor(Math.max(0, seconds) / 6) + Math.max(0, rooms) * 4 + Math.max(0, bosses) * 8);
}
