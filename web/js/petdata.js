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
