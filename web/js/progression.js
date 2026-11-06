// Permanent character experience; pure helpers shared by UI and settlement.
export const XP_REQUIREMENTS = Object.freeze([611, 795, 1033, 1343, 1746, 2272]);
export const MAX_CHARACTER_XP = XP_REQUIREMENTS.reduce((a, b) => a + b, 0);
// Reward descriptions and cumulative PVE bonuses.
export const LEVEL_REWARDS = Object.freeze([
  { level: 1, name: "初始", text: "角色基础能力" },
  { level: 2, name: "伤害", text: "造成伤害 +20%" },
  { level: 3, name: "蓄能", text: "每次小技能增加 20% 大招进度" },
  { level: 4, name: "生命", text: "生命上限 +1" },
  { level: 5, name: "技能", text: "小技能冷却 -30%" },
  { level: 6, name: "护盾", text: "护盾恢复速度 +50%" },
  { level: 7, name: "觉醒", text: "大招蓄力 +30% · 满级星徽" },
]);
export function levelBonuses(value = 1) {
  const level = Number.isFinite(value) ? Math.max(1, Math.min(7, Math.floor(value))) : 1;
  return { level, dmg: level >= 2 ? 1.2 : 1, skillCharge: level >= 3 ? .2 : 0,
    hp: level >= 4 ? 1 : 0, cd: level >= 5 ? .7 : 1,
    shieldRegen: level >= 6 ? 1.5 : 1, ultG: level >= 7 ? 1.3 : 1 };
}
export function progressFromXP(value = 0) {
  const total = Math.max(0, Math.min(MAX_CHARACTER_XP, Math.floor(Number.isFinite(value) ? value : 0)));
  let current = total, level = 1;
  for (const need of XP_REQUIREMENTS) { if (current < need) break; current -= need; level++; }
  const need = XP_REQUIREMENTS[level - 1] || 0;
  return { level, total, current: need ? current : 0, need, fraction: need ? current / need : 1, maxed: level === 7 };
}
export function trackExperienceTime(session, dt, active, eligible) {
  if (!session || !eligible || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(.25, dt);
  session.idle = active ? 0 : (session.idle || 0) + dt;
  if (session.idle <= 10) session.seconds += dt;
}
export function sessionExperience({ seconds = 0, rooms = 0, bosses = 0, win = false, mine = false, extracted = false } = {}) {
  const safe = n => Math.max(0, Number.isFinite(n) ? n : 0);
  seconds = safe(seconds);
  const bonus = mine ? (extracted && seconds >= 30 ? 5 : 0) : Math.floor(safe(rooms)) * 2 + Math.floor(safe(bosses)) * 10 + (win ? 2 : 0);
  // 900 XP/hour equivalent cap also stops repeatedly resetting very short runs for boss bonuses.
  return Math.min(Math.floor(seconds / 6) + bonus, Math.floor(seconds / 4));
}
