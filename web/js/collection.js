// Permanent PVE collection bonuses. Each owned ID counts once, never once per duplicate.
export const COLLECTION = {
 grass_dew: { stat: "ultG", value: .05, text: "大招蓄力 +5%" },
 grass_seed: { stat: "coin", value: .1, text: "局内金币 +10%" },
 grass_lens: { stat: "rate", value: .05, text: "攻击速度 +5%" },
 ice_flake: { stat: "cd", value: -.03, text: "小技能冷却 -3%" },
 ice_bell: { stat: "ultG", value: .05, text: "大招蓄力 +5%" },
 ice_crown: { stat: "rate", value: .05, text: "攻击速度 +5%" },
 lava_core: { stat: "dmg", value: .05, text: "造成伤害 +5%" },
 lava_fan: { stat: "speed", value: .05, text: "移动速度 +5%" },
 lava_gem: { stat: "shieldRegen", value: .1, text: "护盾恢复 +10%" },
};
export function collectionBonuses(owned = {}) {
 const out = {};
 for (const [id,b] of Object.entries(COLLECTION)) if (owned[id] > 0) out[b.stat] = (out[b.stat] || 0) + b.value;
 return out;
}
