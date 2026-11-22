// 每日梦境: one fixed run a day for everyone — the same seed (rooms, route), girl, map, two 噩梦契约 terms and a
// blessing, all derived from the local date. Finishing a daily run (win or lose) checks the day in: the 7-day
// calendar pays the streak day's reward once a day, a clear adds a bonus; a missed day starts the streak over.
import { FIXED_PACT, CHAR_ORDER, CHARS, MAPS, MAP_ORDER, PACTS } from "./data.js";
import { load, save } from "./save.js";
import { petState, grantEggs } from "./petsave.js";

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const prevKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
};
// FNV-1a over the date, then a small LCG for the picks
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) (h ^= s.charCodeAt(i)), (h = Math.imul(h, 16777619));
  return h >>> 0;
};
const lcg = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// 梦境祝福: the day's one gift at the start of the run
export const BLESSINGS = {
  card: { name: "灵感涌现", desc: "开局三选一一张 SR 起技能卡" },
  hp: { name: "坚实梦体", desc: "开局生命上限 +2" },
  coins: { name: "梦境盘缠", desc: "开局获得 120 金币" },
  ult: { name: "蓄势待发", desc: "开局大招充满" },
};
// the 7-day streak calendar (day 8 starts the week again); a clear adds DAILY_CLEAR 晶石 on top, once a day
export const DAILY_REWARDS = [
  { gems: 200, text: "200 晶石", icon: "gem" },
  { item: "ur", n: 1, text: "淬灵露 ×1", icon: "dew" },
  { gems: 300, text: "300 晶石", icon: "gem" },
  { egg: "ur", n: 1, text: "UR 宠物蛋 ×1", short: "UR 蛋×1", icon: "egg" },
  { item: "ur", n: 2, text: "淬灵露 ×2", icon: "dew" },
  { gems: 500, text: "500 晶石", icon: "gem" },
  { item: "hur", n: 1, text: "流彩晶 ×1", icon: "flow" },
];
export const DAILY_CLEAR = 300;

/** today's (or any date's) dream: { key, seed, cid, map, pact, pactIds, blessing } */
export function dailyOf(key = dayKey()) {
  const seed = hash("infinite-dream:" + key), r = lcg(seed);
  const cid = CHAR_ORDER[Math.floor(r() * CHAR_ORDER.length)], map = MAP_ORDER[Math.floor(r() * MAP_ORDER.length)];
  // two different terms at level 1, at most 4 points together (no 凶猛 + 护盾停转 double)
  const pool = PACTS.map((q) => q.id), pactIds = [];
  while (pactIds.length < 2) {
    const id = pool[Math.floor(r() * pool.length)];
    if (pactIds.includes(id)) continue;
    const pts = [...pactIds, id].reduce((a, k) => a + PACTS.find((q) => q.id === k).pts, 0);
    if (pts <= 4) pactIds.push(id);
  }
  const bk = Object.keys(BLESSINGS), blessing = bk[Math.floor(r() * bk.length)];
  // (the difficulty itself is fixed: every term at its top level but 护盾停转 — FIXED_PACT, applied by the game;
  // pactIds / pact stay for old callers)
  return { key, seed: seed % 1e9, cid, map, pact: { ...FIXED_PACT }, pactIds: Object.keys(FIXED_PACT), blessing };
}

/** the saved calendar: { last, streak, days: { [key]: { runs, win, best } } } (old days pruned to the last 40) */
export function dailyState() {
  const m = load();
  const d = (m.daily = m.daily && typeof m.daily === "object" ? m.daily : {});
  d.days = d.days && typeof d.days === "object" ? d.days : {};
  d.streak = Math.max(0, d.streak | 0);
  return d;
}
/** the streak as of today: a gap since the last check-in breaks it (shown as 0 until today's run) */
export function streakNow(key = dayKey()) {
  const d = dailyState();
  if (!d.last) return 0;
  return d.last === key || d.last === prevKey(key) ? d.streak : 0;
}
/** which calendar slot today's check-in fills (0..6) */
export function todaySlot(key = dayKey()) {
  const d = dailyState(), s = d.last === key ? d.streak : streakNow(key) + 1;
  return (s - 1) % 7;
}
export const checkedToday = (key = dayKey()) => dailyState().last === key;

/** the run start's 梦境祝福 (host): applied to every player once */
export function applyBlessing(g, id) {
  for (const p of g.players) {
    if (id === "hp") (p.maxHp += 2), (p.hp = p.maxHp);
    if (id === "coins") p.coins += 120;
    if (id === "ult") p.ult = 1;
    // an SR-and-up pick: queued behind a 开局选卡 talent's offer if one is already open
    if (id === "card") g.cardOffers[p.id]?.length ? (p.startCards = (p.startCards || 0) + 1) : g.offerCards(p, 3, "SR");
  }
}

/** a daily run has ended: record it and, the first time today, check in and pay. Returns result-screen rows */
export function finishDaily(key, win, rooms) {
  const d = dailyState(), today = dayKey(), rows = [];
  const day = (d.days[key] = d.days[key] || { runs: 0, win: false, best: 0 });
  day.runs++;
  day.best = Math.max(day.best, rooms | 0);
  // only today's dream checks in (a run started yesterday and finished after midnight just records)
  if (key === today && d.last !== today) {
    d.streak = d.last === prevKey(today) ? d.streak + 1 : 1;
    d.last = today;
    const rw = DAILY_REWARDS[(d.streak - 1) % 7];
    grant(rw);
    rows.push(["每日打卡", `连续 ${d.streak} 天 · ${rw.text}`]);
  }
  if (win && !day.win) {
    day.win = true;
    if (key === today) (load().tokens += DAILY_CLEAR), rows.push(["每日通关", `+${DAILY_CLEAR} 晶石`]);
  }
  const keys = Object.keys(d.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete d.days[k];
  save();
  return rows;
}
function grant(rw) {
  const m = load();
  if (rw.gems) m.tokens += rw.gems;
  if (rw.item) {
    const ps = petState(); // (one read: petState() re-normalizes the save object each call)
    ps.items[rw.item] = (ps.items[rw.item] || 0) + rw.n;
  }
  if (rw.egg) grantEggs(rw.n, rw.egg);
  save();
}
export const dailyName = (dd) => `${CHARS[dd.cid].short} · ${MAPS[dd.map].name}`;
