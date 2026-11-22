// 称号系统: titles earned from 冒险 / 矿场 / 宠物 / 噩梦契约 milestones. One can be worn: it shows over the girl's head
// in every run (also to the other players online, it travels in the kit) and grants its own small effect in PVE.
// Every title is drawn from one rarity template (frame colours + motion), so a new title is only a line in TITLES.
import { load, save, mineState } from "./save.js";
import { petState, dexCount } from "./petsave.js";
import { PET_ORDER, DEX_TOTAL } from "./petdata.js";

/** the rarity templates: name, frame / text colours, and the motion the frame plays */
export const TITLE_RARITY = {
  c: { name: "普通", col: "#d8d4e4", bg: "#2a2638", fx: "" },
  r: { name: "稀有", col: "#5aa8ff", bg: "#12244a", fx: "pulse" },
  e: { name: "史诗", col: "#c27bff", bg: "#2a1248", fx: "shine" },
  l: { name: "传说", col: "#ffcf4a", bg: "#3a2408", fx: "shine spark" },
  x: { name: "流彩", col: "#ff8ad8", bg: "#2a1030", fx: "rainbow spark" },
};
export const TITLE_TABS = [["adv", "冒险"], ["mine", "矿场"], ["pet", "宠物"], ["shop", "兑换"]];

const st = () => load().stats || {};
const maxPact = () => Math.max(0, ...Object.values(load().pactBest || {}));
// id: { name, r: rarity key, tab, how (unlock text), prog() -> [have, need], fx: effect keys, fxText }
//   optional col / bg override the rarity's colours, still: true keeps the frame from colour-cycling (流彩 otherwise does)
// effect keys (PVE only, see applyTitle): coin0 start coins, dmg, boss (vs bosses), react (reaction dmg), dash (dodge
// cooldown cut), pd (完美闪避 window +s), shield (max shield), guard (chance a hit is shrugged off), coin, mag, speed,
// inv (+s of invulnerability after a hit), ult (ult charge), crit
export const TITLES = {
  novice: { name: "初入梦境", r: "c", tab: "adv", how: "完成 1 局冒险", prog: () => [st().runs || 0, 1], fx: { coin0: 10 }, fxText: "开局金币 +10" },
  slayer: { name: "百战幻影", r: "r", tab: "adv", how: "累计击败 1000 个敌人", prog: () => [st().kills || 0, 1000], fx: { dmg: 0.04 }, fxText: "伤害 +4%" },
  boss_hunter: { name: "首领猎手", r: "e", tab: "adv", how: "累计击败首领 30 次", prog: () => [st().bossKills || 0, 30], fx: { boss: 0.1 }, fxText: "对首领伤害 +10%" },
  reactor: { name: "元素指挥家", r: "e", tab: "adv", how: "累计触发元素反应 2000 次", prog: () => [st().reactions || 0, 2000], fx: { react: 0.15 }, fxText: "元素反应伤害 +15%" },
  phantom: { name: "幻影舞者", r: "l", tab: "adv", how: "累计完美闪避 100 次", prog: () => [st().perfect || 0, 100], fx: { dash: 0.2, pd: 0.1 }, fxText: "闪避冷却 -20%，完美闪避判定 +0.1 秒" },
  walker: { name: "回廊行者", r: "l", tab: "adv", how: "无尽回廊打到第 30 层", prog: () => [st().endlessBest || 0, 30], fx: { shield: 1 }, fxText: "护盾上限 +1" },
  nightmare: { name: "噩梦主宰", r: "x", col: "#ff4a4a", bg: "#3a0a12", still: true, tab: "adv", how: "以噩梦契约 19 级通关", prog: () => [maxPact(), 19], fx: { guard: 0.15 }, fxText: "受到攻击时 15% 概率完全抵消" },
  digger: { name: "见习矿工", r: "c", tab: "mine", how: "梦境矿场下潜 10 次", prog: () => [mineState().dives || 0, 10], fx: { mag: 0.15 }, fxText: "拾取范围 +15%" },
  prospector: { name: "深渊勘探者", r: "r", tab: "mine", how: "矿场最深到达 30 米", prog: () => [mineState().best || 0, 30], fx: { speed: 0.05 }, fxText: "移速 +5%" },
  contractor: { name: "委托达人", r: "e", tab: "mine", how: "完成每日委托 30 个", prog: () => [mineState().questsDone || 0, 30], fx: { coin: 0.15 }, fxText: "局内金币 +15%" },
  core_king: { name: "地心之王", r: "l", tab: "mine", how: "矿场最深到达 80 米", prog: () => [mineState().best || 0, 80], fx: { inv: 0.3 }, fxText: "受伤后无敌时间 +0.3 秒" },
  pet_pal: { name: "萌宠伙伴", r: "c", tab: "pet", how: "孵化 5 次宠物蛋", prog: () => [petState().stats.hatch, 5], fx: { ult: 0.05 }, fxText: "大招充能 +5%" },
  breeder: { name: "孵化专家", r: "r", tab: "pet", how: "孵化 50 次宠物蛋", prog: () => [petState().stats.hatch, 50], fx: { ult: 0.1 }, fxText: "大招充能 +10%" },
  legend_keeper: { name: "传说驯养师", r: "e", tab: "pet", how: "获得 10 只传说及以上宠物", prog: () => [petState().stats.legend, 10], fx: { crit: 0.05 }, fxText: "暴击率 +5%" },
  beast_master: { name: "驯兽大师", r: "l", tab: "pet", how: `宠物图鉴收集全部 ${DEX_TOTAL} 种`, prog: () => [dexCount(), DEX_TOTAL], fx: { dmg: 0.1, crit: 0.08 }, fxText: "伤害 +10%，暴击率 +8%" },
  rainbow_lord: { name: "流彩之主", r: "x", col: "#ff4a4a", bg: "#3a0a12", still: true, tab: "pet", how: `集齐全部 ${PET_ORDER.length} 种宠物的流彩`, prog: () => [petState().stats.rbKinds.length, PET_ORDER.length], fx: { dmg: 0.08 }, fxText: "伤害 +8%" },
  // 积攒兑换 titles: bought with 积攒点 in the 扭蛋机's exchange (stash: its price), never earned otherwise
  stash_luck: { name: "幸运积攒者", r: "r", tab: "shop", stash: 3, how: "扭蛋机「积攒」兑换 3 点", prog: () => [0, 1], fx: { coin0: 30 }, fxText: "开局金币 +30" },
  stash_star: { name: "梦境收藏家", r: "e", tab: "shop", stash: 8, how: "扭蛋机「积攒」兑换 8 点", prog: () => [0, 1], fx: { mag: 0.2, coin: 0.1 }, fxText: "拾取范围 +20%，局内金币 +10%" },
  stash_king: { name: "积攒之王", r: "l", tab: "shop", stash: 20, how: "扭蛋机「积攒」兑换 20 点", prog: () => [0, 1], fx: { dmg: 0.06, crit: 0.04 }, fxText: "伤害 +6%，暴击率 +4%" },
};
export const TITLE_ORDER = Object.keys(TITLES);

/** the save's title block: { own: {id: time}, eq: id | null, seen: [ids already announced] } (old 契约 title migrated) */
export function titleState() {
  const m = load();
  if (!m.titles || typeof m.titles !== "object") m.titles = { own: {}, eq: null, seen: [] };
  const t = m.titles;
  t.own = t.own && typeof t.own === "object" ? t.own : {};
  t.seen = Array.isArray(t.seen) ? t.seen : [];
  if (m.title && /主宰/.test(m.title) && !t.own.nightmare) t.own.nightmare = Date.now(); // 契约 milestone before titles existed
  if (t.eq && !t.own[t.eq]) t.eq = null;
  return t;
}
/** grant every title whose condition is now met; returns the ids newly earned (not yet announced) */
export function checkTitles() {
  const t = titleState(), fresh = [];
  for (const id of TITLE_ORDER) {
    if (t.own[id]) continue;
    let ok = false;
    try {
      const [a, b] = TITLES[id].prog();
      ok = a >= b;
    } catch {}
    if (ok) (t.own[id] = Date.now()), fresh.push(id);
  }
  if (fresh.length) save();
  return fresh;
}
export function equipTitle(id) {
  const t = titleState();
  if (id && !t.own[id]) return false;
  t.eq = id || null;
  save();
  return true;
}
export const wornTitle = () => titleState().eq;
/** a title earned somewhere that checkTitles can't see (granted directly) */
export function grantTitle(id) {
  const t = titleState();
  if (!TITLES[id] || t.own[id]) return false;
  t.own[id] = Date.now();
  save();
  return true;
}

/** the title plate as HTML (the one template for every title): <span class="ttl t-x">名字</span> */
export function titleHTML(id, extra = "") {
  const T = TITLES[id];
  if (!T) return "";
  const own = T.col ? ` style="--tc:${T.col};--tb:${T.bg || TITLE_RARITY[T.r].bg}"` : "";
  // 传说 / 流彩: a hexagonal tag (pointed ends) built from three stacked layers — black ring, frame colour, fill — so the
  // points share the plate's outline at every size
  const hex = T.r === "l" || T.r === "x";
  return `<span class="ttl t-${T.r}${hex ? " hex" : ""}${T.still ? " still" : ""} ${extra}" data-r="${T.r}"${own}>${hex ? `<i class="tt-hx"></i>` : ""}<i class="tt-sh"></i><b>${T.name}</b></span>`;
}

/** apply the worn title's effect to a new player (PVE only; the plate is shown in every mode) */
export function applyTitle(p, id, pve) {
  const T = TITLES[id];
  p.title = T ? id : null;
  p.tfx = {};
  if (!T || !pve) return;
  const f = (p.tfx = { ...T.fx });
  if (f.coin0) p.coins += f.coin0;
  if (f.dmg) p.st.dmg *= 1 + f.dmg;
  if (f.coin) p.st.coin *= 1 + f.coin;
  if (f.mag) p.st.mag *= 1 + f.mag;
  if (f.speed) p.st.speed *= 1 + f.speed;
  if (f.ult) p.st.ultG *= 1 + f.ult;
  if (f.crit) p.st.crit += f.crit;
  if (f.shield) (p.maxShield += f.shield), (p.shield += f.shield);
}

/** draw the plate on the game canvas, centred at (x, y): the same rarity template as the HTML one */
export function drawTitlePlate(g, id, x, y, t) {
  const T = TITLES[id];
  if (!T) return;
  const R = TITLE_RARITY[T.r];
  g.save();
  g.font = "10px Cubic, 'PingFang SC', sans-serif";
  const w = Math.ceil(g.measureText(T.name).width) + 10, h = 13, x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
  let col = T.col || R.col;
  if (T.r === "x" && !T.still) col = `hsl(${(t * 120) % 360},90%,72%)`;
  if (T.r === "l" || T.r === "x") {
    // hexagonal tag: black ring, frame colour, fill — the same three layers as the HTML plate
    const hexp = (d, sh) => {
      g.beginPath();
      g.moveTo(x0 - d + sh, y0 - d); g.lineTo(x0 + w + d - sh, y0 - d); g.lineTo(x0 + w + d + sh * 0.0 + 1, y0 + h / 2);
      g.lineTo(x0 + w + d - sh, y0 + h + d); g.lineTo(x0 - d + sh, y0 + h + d); g.lineTo(x0 - d - 1, y0 + h / 2);
      g.closePath(); g.fill();
    };
    g.fillStyle = "#0c0814"; hexp(1.5, 5);
    g.fillStyle = col; hexp(0, 5);
    g.fillStyle = T.bg || R.bg; hexp(-1, 5);
  } else {
    g.fillStyle = "#0c0814";
    g.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    g.fillStyle = T.bg || R.bg;
    g.fillRect(x0, y0, w, h);
    g.fillStyle = col;
    g.fillRect(x0, y0, w, 1);
    g.fillRect(x0, y0 + h - 1, w, 1);
    g.fillRect(x0, y0, 1, h);
    g.fillRect(x0 + w - 1, y0, 1, h);
  }
  // a light sweep across 史诗 and up
  if (R.fx.includes("shine") || T.r === "x") {
    const u = ((t * 0.6) % 1.6) - 0.3, sx = x0 + u * w;
    // only inside the plate's fill (inside the frame line): clip to it
    g.save();
    g.beginPath();
    if (T.r === "l" || T.r === "x") {
      g.moveTo(x0 + 5, y0 + 1); g.lineTo(x0 + w - 5, y0 + 1); g.lineTo(x0 + w, y0 + h / 2);
      g.lineTo(x0 + w - 5, y0 + h - 1); g.lineTo(x0 + 5, y0 + h - 1); g.lineTo(x0, y0 + h / 2);
      g.closePath();
    } else g.rect(x0 + 1, y0 + 1, w - 2, h - 2);
    g.clip();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.moveTo(sx, y0); g.lineTo(sx + 4, y0); g.lineTo(sx + 1, y0 + h); g.lineTo(sx - 3, y0 + h);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = "source-over";
    g.restore();
  }
  g.fillStyle = col;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(T.name, x, y0 + h / 2 + 0.5);
  g.restore();
}
