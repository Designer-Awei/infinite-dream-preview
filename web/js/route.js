// 梦境航线：单人主线每局生成一张 7 步分支路线，每一步在 2～3 个房间里选 1 个。
// 节点全部复用现有房间：战斗 / 精英 / 补给 / 首领，加上三种轻量新房间：事件（一次选择）、挑战（战斗 + 一条规则，
// 清场多拿一次选卡）、宝藏（一小波怪，必出本图稀有怪，道具更多）。
import { RUN } from "./data.js";
import { rng } from "./util.js";
import { PAL } from "../pixelfx/core/color.js";

export const NODE = {
  combat: { name: "战斗", col: "#d8d0c0" },
  elite: { name: "精英", col: "#ff8a5a" },
  shop: { name: "补给", col: "#7dffb0" },
  event: { name: "事件", col: "#c8a0ff" },
  challenge: { name: "挑战", col: "#ff5a6a" },
  treasure: { name: "宝藏", col: "#ffd84a" },
  boss: { name: "首领", col: "#ff5a5a" },
};
/** each kind of room gets its own portal colour (an 8-step pixelfx ramp) */
export const PORTAL_PAL = {
  combat: PAL.metal, elite: PAL.fire, shop: PAL.heal, event: PAL.arcane, challenge: PAL.blood, treasure: PAL.gold, boss: PAL.shadow,
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
  // the rooms of one step are all different kinds, so the portals of a fork are always a real choice
  for (let s = 1; s < STEPS - 1; s++) {
    const used = new Set();
    for (const n of cols[s]) {
      if (used.has(n.kind)) n.kind = pickKind(r, s, used);
      used.add(n.kind);
    }
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
function pickKind(r, s, not = null) {
  const w = s <= 1 ? { combat: 4, event: 2, treasure: 1, challenge: 1 } : { combat: 3, event: 2, challenge: 2, treasure: 1.2, elite: s >= 3 ? 1.5 : 0, shop: s === 2 || s === 5 ? 2 : 0.3 };
  const ks = Object.keys(w).filter((k) => w[k] > 0 && !(not && not.has(k)));
  return r.weighted(ks, (k) => w[k]);
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

/** the visitor who hosts each event (sprite rows in assets/npc/npc.json) and what it says after the choice */
export const NPCS = {
  altar: { name: "祭坛巫女", bye: "愿星光指引你。" },
  gamble: { name: "骰子狐", bye: "下次再来玩呀～" },
  spring: { name: "泉之精灵", bye: "一路顺风～" },
  curse: { name: "宝箱怪", bye: "嘎吱……" },
  merchant: { name: "奇遇商人", bye: "有缘再会，旅人～" },
};

// events: one choice each. apply(game, p) runs on the host; returns a short result line (shown as floating text)
export const EVENTS = {
  altar: {
    name: "献祭祭坛", text: "「向祭坛献上 1 点生命上限，我便让你挑一张 SR / SSR 卡。」",
    options: [
      { label: "献祭", apply: (g, p) => { p.maxHp = Math.max(1, p.maxHp - 1); p.hp = Math.min(p.hp, p.maxHp); g.offerCards(p, 3, "SR"); return "生命上限 -1"; } },
      { label: "离开", apply: () => "" },
    ],
  },
  // a dice game instead of a one-shot choice: bet a share of the coins (30%~80%) on odd or even, the die is rolled in the dialog
  // (game.rollDice / settleDice); leaving only closes the dialog, so you can come back. Two rounds a room.
  gamble: {
    name: "幸运骰子", text: "「挑好押注比例猜单双，猜中赢一倍，猜错输掉押注～」",
    dice: { rounds: 2 },
    options: [],
  },
  spring: {
    name: "星砂泉", text: "「泉水能回满你的生命和护盾；或者装走 20 星砂，结算时归你。」",
    options: [
      { label: "疗伤", apply: (g, p) => { p.hp = p.maxHp; p.shield = p.maxShield; return "生命与护盾回满"; } },
      { label: "装星砂", apply: (g) => { g.runStats.eventStars = (g.runStats.eventStars || 0) + 20; return "+20 星砂"; } },
    ],
  },
  curse: {
    name: "诅咒宝箱", text: "（宝箱怪咧开嘴，锁链哗啦作响）打开能选一张卡，但之后的敌人生命 +20%。",
    options: [
      { label: "打开", apply: (g, p) => { g.curseHp = (g.curseHp || 1) * 1.2; g.offerCards(p, 3); return "诅咒：敌人生命 +20%"; } },
      { label: "离开", apply: () => "" },
    ],
  },
  // a shop instead of a choice: paid with the account's 金铲 (梦境矿场) or 晶石, goods go straight to the account.
  // Two purchases a room, each kind once; 离开 only closes (come back while purchases remain). See game.merchantBuy
  merchant: {
    name: "奇遇小铺", text: "「宠物蛋和兑换卡，挑两样吧～同一样只卖一次哦。」",
    shop: {
      buys: 2,
      goods: [
        { id: "egg_base", name: "宠物蛋", sub: "品质随机", egg: "base", cost: { au: 2 } },
        { id: "egg_ur", name: "UR 宠物蛋", sub: "稀有及以上", egg: "ur", cost: { au: 5 } },
        { id: "egg_hur", name: "HUR 宠物蛋", sub: "史诗及以上", egg: "hur", cost: { au: 10 } },
        { id: "card", name: "兑换卡", sub: "换 SSR 或积攒点", card: 1, cost: { gem: 2000 } },
      ],
    },
    options: [],
  },
};
