// Permanent character experience; pure helpers shared by UI and settlement.
export const XP_REQUIREMENTS = Object.freeze([611, 795, 1033, 1343, 1746, 2272]);
export const MAX_CHARACTER_XP = XP_REQUIREMENTS.reduce((a, b) => a + b, 0);
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
