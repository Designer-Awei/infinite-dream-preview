// Meta progression kept in the player's own browser (no account needed).
import { START_CHARS, START_TOKENS, UNLOCKS, GACHA, CHAR_ORDER, LOADOUT_SLOTS } from "./data.js";

const KEY = "ai-girls-dungeon-v1";
const fresh = () => ({
  tokens: START_TOKENS,
  chars: [...START_CHARS],
  talents: {}, // id -> level
  cards: [], // unlocked locked-cards
  stats: { kills: 0, pulls: 0, reactions: 0, bossKills: 0, runs: 0, best: 0 },
  pity: 0,
  pity10: 0,
  sel: "deepseek",
  name: "",
  sound: true,
  music: true,
  seenUnlock: [],
  loadout: null, // cid -> [ssr talent id | null] (one page per character)
  maps: {}, // map id -> clears
});

let mem = null;
export function load() {
  if (mem) return mem;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    mem = Object.assign(fresh(), s || {});
    mem.stats = Object.assign(fresh().stats, (s && s.stats) || {});
  } catch {
    mem = fresh();
  }
  // first time with loadouts: put the SSR talents the player already owns on every page (they used to be always on)
  if (!mem.loadout) {
    const own = GACHA.pool.filter((it) => it.eq && mem.talents[it.id]).map((it) => it.id).slice(0, LOADOUT_SLOTS);
    mem.loadout = {};
    for (const id of CHAR_ORDER) mem.loadout[id] = [...own, null, null].slice(0, LOADOUT_SLOTS);
    mem.maps = mem.maps || {};
    if (mem.stats.bossKills) mem.maps.grass = mem.maps.grass || mem.stats.bossKills;
    save();
  }
  if (!mem.name) {
    mem.name = "玩家" + Math.floor(1000 + Math.random() * 9000);
    save();
  }
  return mem;
}
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {}
}
export const talent = (id) => load().talents[id] || 0;

/** the loadout page of one character (always LOADOUT_SLOTS long; unowned entries are dropped) */
export function loadoutOf(cid) {
  const m = load();
  const n = slotsOf(cid);
  const page = ((m.loadout && m.loadout[cid]) || []).map((id) => (id && m.talents[id] ? id : null));
  while (page.length < n) page.push(null);
  return page.slice(0, n);
}
/** 2 SSR slots, 3 with that girl's 梦核 */
export const slotsOf = () => LOADOUT_SLOTS; // 梦核 now strengthens the ult instead of adding a slot
export function setLoadout(cid, page) {
  const m = load();
  m.loadout = m.loadout || {};
  m.loadout[cid] = page.slice(0, slotsOf(cid));
  save();
}
/**
 * Everything the simulation needs to know about one player's meta progression, so the host can build
 * every player from their own save: passive talents (N/R/SR, always on), the equipped SSR page, unlocked cards.
 */
export function makeKit(cid) {
  const m = load(), tal = {}, eq = {};
  for (const it of GACHA.pool) {
    const lv = m.talents[it.id] || 0;
    if (!lv) continue;
    if (it.eq) continue;
    tal[it.id] = lv;
  }
  for (const id of loadoutOf(cid)) if (id) eq[id] = m.talents[id] || 1;
  return { tal, eq, cards: [...m.cards], core: (m.cores || {})[cid] ? 1 : 0 };
}

/** Check unlock conditions; returns newly unlocked char ids. */
export function checkUnlocks() {
  const m = load(), out = [];
  for (const id of CHAR_ORDER) {
    if (m.chars.includes(id)) continue;
    const u = UNLOCKS[id];
    if (u && (m.stats[u.stat] || 0) >= u.need) {
      m.chars.push(id);
      out.push(id);
    }
  }
  if (out.length) save();
  return out;
}
export function unlockProgress(id) {
  const u = UNLOCKS[id];
  if (!u) return 1;
  return Math.min(1, (load().stats[u.stat] || 0) / u.need);
}

/** what an SSR pull gives once every SSR is maxed */
export const STASH_ITEM = { id: "cardgold", r: "SSR", name: "积攒点 +1", desc: "SSR 已全部收齐，这张转化为 1 点积攒", max: 1 };
/** every SSR owned at max level (from then on SSR pulls become 积攒点) */
export const ssrDone = () => {
  const m = load();
  return GACHA.pool.filter((p) => p.r === "SSR").every((p) => (m.talents[p.id] || 0) >= p.max);
};
/** every card in the pool at max level (the lobby stops showing a pull count) */
export const gachaDone = () => {
  const m = load();
  return GACHA.pool.every((p) => (m.talents[p.id] || 0) >= p.max);
};
/** One gacha pull with pity. Returns {item, dup, refund}. */
export function pull(rand = Math.random) {
  const m = load();
  m.pity++;
  m.pity10++;
  m.stats.pulls++;
  let r;
  if (m.pity >= GACHA.pity) r = "SSR";
  else {
    const x = rand();
    const { N, R: Rr, SR } = GACHA.rates;
    r = x < N ? "N" : x < N + Rr ? "R" : x < N + Rr + SR ? "SR" : "SSR";
    if (m.pity10 >= 10 && (r === "N" || r === "R")) r = "SR";
  }
  if (r === "SSR") m.pity = 0;
  if (r === "SR" || r === "SSR") m.pity10 = 0;
  // SSR never repeats: only SSRs that aren't owned / maxed can come out; once every SSR is maxed an SSR pull turns into
  // one 积攒点 (stash point), saved without a cap. N/R/SR may repeat and refund crystals when maxed.
  let pool = GACHA.pool.filter((p) => p.r === r);
  if (r === "SSR") {
    pool = pool.filter((p) => (m.talents[p.id] || 0) < p.max);
    if (!pool.length) {
      m.stash = (m.stash || 0) + 1;
      return { item: STASH_ITEM, r, dup: false, refund: 0, stash: true, lv: m.stash };
    }
  }
  const item = pool[Math.floor(rand() * pool.length)];
  const lv = m.talents[item.id] || 0;
  let dup = false, refund = 0;
  if (lv >= item.max) {
    dup = true;
    refund = GACHA.refund[r];
    m.tokens += refund;
  } else {
    m.talents[item.id] = lv + 1;
    if (item.card && !m.cards.includes(item.card)) m.cards.push(item.card);
  }
  return { item, r, dup, refund, lv: m.talents[item.id] || 0 };
}

// ---------------------------------------------------------------- save export / import (move to a new install / device)
const SAVE_TAG = "IDSAVE1";
function crc(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
/** the whole save as one copyable line: IDSAVE1.<base64 json>.<checksum> */
export function exportSave() {
  const json = JSON.stringify(load());
  const b = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return `${SAVE_TAG}.${b}.${crc(b)}`;
}
/** returns the decoded save or throws a readable error (does not apply it) */
export function parseSave(code) {
  const parts = String(code || "").replace(/\s+/g, "").split(".");
  if (parts.length !== 3 || parts[0] !== SAVE_TAG) throw new Error("这不是无限梦境的存档码");
  if (crc(parts[1]) !== parts[2]) throw new Error("存档码不完整（复制时可能少了一部分）");
  const bytes = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  const s = JSON.parse(new TextDecoder().decode(bytes));
  if (!s || typeof s !== "object" || !Array.isArray(s.chars)) throw new Error("存档内容无效");
  return s;
}
export function importSave(code) {
  const s = parseSave(code);
  localStorage.setItem(KEY, JSON.stringify(s));
  mem = null;
  return load();
}

// ---------------------------------------------------------------- 梦境矿场 (mine) meta
export function mineState() {
  const m = load();
  if (!m.mine) m.mine = {};
  const s = m.mine;
  s.shovels = Object.assign({ cu: 1, ag: 0, au: 0 }, s.shovels || {});
  s.up = Object.assign({ drill: 0, battery: 0, bag: 0, armor: 0, radar: 0, beacon: 0, tank: 0, dr: 0 }, s.up || {});
  s.mats = s.mats || 0;
  s.stars = s.stars || 0;
  s.cards = s.cards || 0;
  s.best = s.best || 0;
  s.dives = s.dives || 0;
  if (s.freeAt == null) s.freeAt = Date.now();
  return s;
}
/** free copper shovels pile up (one every FREE_SHOVEL_HOURS, up to the cap) until the player claims them into stock.
 *  returns ms until the next one (0 while the pile is full: the clock waits) */
export function refreshFreeShovels(hours, cap) {
  const s = mineState(), per = hours * 3600e3, now = Date.now();
  s.freePend = s.freePend || 0;
  while (s.freePend < cap && now - s.freeAt >= per) (s.freePend++), (s.freeAt += per);
  if (s.freePend >= cap) s.freeAt = now;
  save();
  return s.freePend >= cap ? 0 : per - (now - s.freeAt);
}
/** move the pending free shovels into stock; returns how many */
export function claimFreeShovels() {
  const s = mineState(), n = s.freePend || 0;
  s.shovels.cu += n;
  s.freePend = 0;
  save();
  return n;
}

/** 每日委托: today's three quests (regenerated when the local date changes) */
export function mineQuests(gen) {
  const s = mineState(), day = new Date().toDateString();
  if (!s.quests || s.quests.day !== day) s.quests = { day, list: gen(s) };
  return s.quests.list;
}
