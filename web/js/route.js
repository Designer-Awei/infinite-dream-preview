// 梦境航线：单人主线每局生成一张 7 步分支路线，每一步在 2～3 个房间里选 1 个。
// 节点全部复用现有房间：战斗 / 精英 / 补给 / 首领，加上三种轻量新房间：事件（一次选择）、挑战（战斗 + 一条规则，
// 清场多拿一次选卡）、宝藏（一小波怪，必出本图稀有怪，道具更多）。
import { RUN } from "./data.js";
import { rng } from "./util.js";

export const NODE = {
  combat: { name: "战斗", col: "#d8d0c0" },
  elite: { name: "精英", col: "#ff8a5a" },
  shop: { name: "补给", col: "#7dffb0" },
  event: { name: "事件", col: "#c8a0ff" },
  challenge: { name: "挑战", col: "#ff5a6a" },
  treasure: { name: "宝藏", col: "#ffd84a" },
  boss: { name: "首领", col: "#ff5a5a" },
};
export const CHALLENGES = {
  timer: { name: "限时清场", desc: "60 秒内清场；超时敌人消散，但拿不到额外选卡" },
  noshield: { name: "护盾停转", desc: "本房间护盾不会自动恢复" },
  elite: { name: "精英潮", desc: "所有敌人都是精英，波次减少" },
  swarm: { name: "怪潮", desc: "每波敌人数量 +50%" },
};
export const STEPS = 7;

/** a route: cols[step] = nodes {kind, next:[indices into cols[step+1]], challenge?}. step 0 = fight, step 6 = boss */
export function makeRoute(seed) {
  const r = rng(seed * 7 + 99);
  const cols = [[{ kind: "combat" }]];
  for (let s = 1; s < STEPS - 1; s++) {
    const n = s === 1 ? 2 : r.int(2, 3), col = [];
    for (let i = 0; i < n; i++) col.push({ kind: pickKind(r, s) });
    cols.push(col);
  }
  cols.push([{ kind: "boss" }]);
  // at least one supply on step 2 or 5, at least one elite on step 3 or 4, at most one event per column
  const ensure = (steps, kind) => {
    if (steps.some((s) => cols[s].some((n) => n.kind === kind))) return;
    const s = steps[r.int(0, steps.length - 1)];
    cols[s][r.int(0, cols[s].length - 1)].kind = kind;
  };
  ensure([2, 5], "shop");
  ensure([3, 4], "elite");
  for (const col of cols) {
    let ev = 0;
    for (const n of col) if (n.kind === "event" && ev++) n.kind = "combat";
  }
  for (const col of cols) for (const n of col) if (n.kind === "challenge") n.challenge = r.pick(Object.keys(CHALLENGES));
  // links: every node reaches 1~2 neighbours in the next column and every next node is reachable (no crossing lines)
  for (let s = 0; s < STEPS - 1; s++) {
    const a = cols[s], b = cols[s + 1];
    a.forEach((n, i) => {
      const lo = Math.floor((i * b.length) / a.length), hi = Math.ceil(((i + 1) * b.length) / a.length) - 1;
      n.next = [];
      for (let j = lo; j <= Math.max(lo, hi); j++) n.next.push(j);
    });
    b.forEach((_, j) => {
      if (!a.some((n) => n.next.includes(j))) a.reduce((best, n, i) => (Math.abs(i / a.length - j / b.length) < Math.abs(best.i / a.length - j / b.length) ? { n, i } : best), { n: a.at(0), i: 0 }).n.next.push(j);
    });
    a.forEach((n) => n.next.sort((x, y) => x - y));
  }
  return { cols, step: 0, at: 0, path: [0], choices: 0 };
}
function pickKind(r, s) {
  const w = s <= 1 ? { combat: 4, event: 2, treasure: 1, challenge: 1 } : { combat: 3, event: 2, challenge: 2, treasure: 1.2, elite: s >= 3 ? 1.5 : 0, shop: s === 2 || s === 5 ? 2 : 0.3 };
  return r.weighted(Object.keys(w), (k) => w[k]);
}

/** the room definition for a node on step s (combat difficulty follows the step, like the old fixed run) */
export function nodeRoom(node, s, seed) {
  const fights = RUN.filter((d) => d.kind === "combat"), byStep = [0, 0, 1, 2, 2, 3, 3];
  const base = fights.at(Math.min(fights.length - 1, byStep.at(s)));
  const r = rng(seed + s * 131);
  switch (node.kind) {
    case "shop": return { kind: "shop" };
    case "boss": return RUN.at(-1);
    case "event": return { kind: "event", event: r.pick(Object.keys(EVENTS)), items: 0 };
    case "treasure": return { kind: "combat", waves: [base.waves.at(0).slice(0, 4)], items: 4, treasure: true };
    case "elite": {
      // the next step's fight, every third foe an elite
      const d = fights.at(Math.min(fights.length - 1, byStep.at(s) + 1));
      return { ...d, elite: true, waves: d.waves.map((w) => w.map((k, i) => (i % 3 === 0 ? k.replace("*", "") + "*" : k))) };
    }
    case "challenge": {
      const c = node.challenge, d = { ...base, challenge: c };
      if (c === "elite") d.waves = base.waves.slice(0, 2).map((w) => w.slice(0, 4).map((k) => k.replace("*", "") + "*"));
      if (c === "swarm") d.waves = base.waves.map((w) => [...w, ...w.slice(0, Math.ceil(w.length / 2))]);
      if (c === "timer") d.timeLimit = 60;
      if (c === "noshield") d.noShield = true;
      return d;
    }
    default: return base;
  }
}

// events: one choice each. apply(game, p) runs on the host; returns a short result line (shown as floating text)
export const EVENTS = {
  altar: {
    name: "献祭祭坛", text: "一座发着微光的祭坛：献上一点生命，换取更强的力量。",
    options: [
      { label: "献祭 1 点生命上限，选一张 SR / SSR 卡", apply: (g, p) => { p.maxHp = Math.max(1, p.maxHp - 1); p.hp = Math.min(p.hp, p.maxHp); g.offerCards(p, 3, "SR"); return "生命上限 -1"; } },
      { label: "离开", apply: () => "" },
    ],
  },
  gamble: {
    name: "幸运骰子", text: "一个笑嘻嘻的骰子：押上全部金币，一半概率翻倍，一半概率清零。",
    options: [
      { label: "押上全部金币", apply: (g, p) => { const win = Math.random() < 0.5; p.coins = win ? p.coins * 2 : 0; return win ? "金币翻倍！" : "金币清零……"; } },
      { label: "离开", apply: () => "" },
    ],
  },
  spring: {
    name: "星砂泉", text: "泉水里闪着星砂：可以疗伤，也可以装走星砂。",
    options: [
      { label: "回满生命和护盾", apply: (g, p) => { p.hp = p.maxHp; p.shield = p.maxShield; return "生命与护盾回满"; } },
      { label: "装走 20 星砂（结算时获得）", apply: (g) => { g.runStats.eventStars = (g.runStats.eventStars || 0) + 20; return "+20 星砂"; } },
    ],
  },
  curse: {
    name: "诅咒宝箱", text: "一只缠着锁链的宝箱：里面有好东西，但打开后之后的敌人都会更强。",
    options: [
      { label: "打开：选一张卡，之后的敌人生命 +20%", apply: (g, p) => { g.curseHp = (g.curseHp || 1) * 1.2; g.offerCards(p, 3); return "诅咒：敌人生命 +20%"; } },
      { label: "离开", apply: () => "" },
    ],
  },
};
