// 每日委托 for 梦境矿场: three quests a day; progress accumulates over the day's dives; rewards are claimed in the hub.
import { ORES, QUESTS } from "./minedata.js";
import { mineState, mineQuests, save } from "./save.js";

const ORE_N = { copper: 6, iron: 4, coinbag: 2, glow: 3, silver: 3, amethyst: 2, pearl: 2, coral: 2 };

function gen(ms) {
  const best = ms.best || 0, kinds = Object.keys(QUESTS), out = [];
  const pool = [...kinds];
  while (out.length < 3 && pool.length) {
    const tot = pool.reduce((a, k) => a + QUESTS[k].w, 0);
    let x = Math.random() * tot, k = pool[0];
    for (const c of pool) if ((x -= QUESTS[c].w) <= 0) { k = c; break; }
    pool.splice(pool.indexOf(k), 1);
    if (k === "ore") {
      const ids = ["copper", "iron", "coinbag"].concat(best >= 25 ? ["glow", "silver", "amethyst"] : [], best >= 55 ? ["pearl", "coral"] : []);
      const id = ids[Math.floor(Math.random() * ids.length)], n = ORE_N[id];
      out.push({ k, id, n, prog: 0, stars: Math.max(2, Math.min(8, Math.ceil((ORES[id].v * n) / 4) + 1)), tokens: 0 });
    } else if (k === "depth") {
      const n = Math.min(110, Math.max(20, Math.ceil((best + 5) / 10) * 10));
      out.push({ k, n, prog: 0, stars: 2 + Math.round(n / 15), tokens: 0 });
    } else if (k === "kill") out.push({ k, n: best >= 40 ? 10 : 6, prog: 0, stars: 3, tokens: 15 });
    else if (k === "mole") out.push({ k, n: 1, prog: 0, stars: 5, tokens: 0 });
    else if (k === "relic") out.push({ k, n: 2, prog: 0, stars: 3, tokens: 0 });
    else if (k === "haul") out.push({ k, n: 1, v: 30 + 10 * Math.floor(best / 20), prog: 0, stars: 4, tokens: 0 });
    else if (k === "extract") out.push({ k, n: 3, prog: 0, stars: 1, tokens: 40 });
  }
  return out;
}
export function todayQuests() {
  const list = mineQuests(gen); let changed = false;
  for (const q of list) if (q.stars !== 20) {
    // Top up previously claimed old rewards once; retain today's tasks and progress.
    if (q.claimed) mineState().stars += Math.max(0, 20 - (q.stars || 0));
    q.stars = 20; changed = true;
  }
  if (changed) save();
  return list;
}
export function questText(q) {
  switch (q.k) {
    case "ore": return `带出 ${q.n} 个${ORES[q.id].name}`;
    case "depth": return `下潜到 ${q.n}m`;
    case "kill": return `击败 ${q.n} 只怪物`;
    case "mole": return "抓到宝藏地鼠";
    case "relic": return `打开 ${q.n} 个遗物箱`;
    case "haul": return `一次带出价值 ${q.v} 晶石以上`;
    case "extract": return `安全撤离 ${q.n} 次`;
  }
  return "";
}
/** apply one dive's result; returns the quests that just got completed */
export function progressQuests(res) {
  const list = todayQuests(), done = [];
  for (const q of list) {
    if (q.prog >= q.n) continue;
    if (q.k === "ore") q.prog += res.kept.filter((id) => id === q.id).length;
    else if (q.k === "depth") q.prog = Math.max(q.prog, res.depth);
    else if (q.k === "kill") q.prog += res.kills;
    else if (q.k === "mole") q.prog += res.moles || 0;
    else if (q.k === "relic") q.prog += res.relicsOpened || 0;
    else if (q.k === "haul") q.prog = res.value >= q.v ? 1 : q.prog;
    else if (q.k === "extract") q.prog += res.how === "extract" ? 1 : 0;
    q.prog = Math.min(q.prog, q.n);
    if (q.prog >= q.n) done.push(q);
  }
  save();
  return done;
}
export function claimQuest(i) {
  const list = todayQuests(), q = list[i], ms = mineState();
  if (!q || q.claimed || q.prog < q.n) return null;
  q.claimed = true;
  ms.stars += q.stars;
  save();
  return q;
}
export const claimable = () => todayQuests().filter((q) => q.prog >= q.n && !q.claimed).length;
