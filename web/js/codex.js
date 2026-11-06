// 怪物图鉴 + 梦境藏品: every monster you've met (silhouette until then), how many you've beaten, where it lives and
// what it does; the rare monster of each map drops one of that map's 藏品.
import { COLLECTION } from "./collection.js";
import { ENEMIES, MAPS } from "./data.js";
import { MOBS } from "./minedata.js";
import { A } from "./assets.js";
import { load, save } from "./save.js";
import { el } from "./util.js";
import { sfx } from "./audio.js";
import { btn, uiRoot } from "./ui.js";
import { mineThumb } from "./mine.js";

/** 梦境藏品 (first set: three per map, dropped by that map's rare monster). col = the shard's colours */
export const CURIOS = {
  grass_dew: { map: "grass", name: "晨露珠", desc: "草原上第一滴被缓存下来的露水，里面映着还没加载完的天空。", col: ["#1f5a22", "#7ad85a", "#e0ffd0"] },
  grass_seed: { map: "grass", name: "初生种", desc: "据说整片数据草原都是从这颗种子里编译出来的。", col: ["#5a3a10", "#c8902e", "#fff0b0"] },
  grass_lens: { map: "grass", name: "幻眼镜片", desc: "透过它看世界，会多出一些并不存在的东西。", col: ["#2a1a5a", "#a070ff", "#ffffff"] },
  ice_flake: { map: "ice", name: "永冻雪花", desc: "存满了一段很久以前的画面，所以永远不会融化。", col: ["#1e4a7a", "#a8e0ff", "#ffffff"] },
  ice_bell: { map: "ice", name: "冰风铃", desc: "风吹过时会响起开机时的提示音。", col: ["#3a5a8a", "#c8d8ff", "#ffffff"] },
  ice_crown: { map: "ice", name: "霜王冰冠", desc: "冰封史莱姆王小时候戴过的王冠，有点小。", col: ["#2a6ab0", "#8ad0ff", "#fffbe0"] },
  lava_core: { map: "lava", name: "冷却核心", desc: "熔炉里唯一一颗不再发烫的核心，摸起来像一块温热的石头。", col: ["#5a1e10", "#ff7a2a", "#ffe0a0"] },
  lava_fan: { map: "lava", name: "静风叶", desc: "它最后一次转动时，熔炉的温度降了一度。", col: ["#3a3a4a", "#9a9aaa", "#ffffff"] },
  lava_gem: { map: "lava", name: "黑曜晶", desc: "黑曜骷髅的心脏，冷得发亮。", col: ["#1a0a2a", "#6a3aa0", "#ffb040"] },
};
/** what a rare monster's kill gives when its map's 藏品 are all collected already */
export const CURIO_DUP_GEMS = 40;
// PixelLab-generated icons, unique silhouettes; see assets/curios/manifest.json.
export function curioIcon(id) { return `assets/curios/${id}.png`; }

/** codex pages: which monsters live where (an entry may only appear once) */
export const CODEX = [
  { id: "grass", name: "数据草原", list: ["slime", "bat", "eyeball", "frog", "snake", "snake_vine", "mushroom", "beetle", "frog_big", "boss_eye", "slime_gold"] },
  { id: "ice", name: "显存冰原", list: ["slime_blue", "bat_ice", "eye_ice", "snake_ice", "jelly_ice", "hedgehog", "frostling", "slime_frost", "boss_frost", "jelly_aurora"] },
  { id: "lava", name: "算力熔炉", list: ["slime_lava", "bat_fire", "snake_lava", "salamander", "imp", "skull_core", "boss_core", "skull_obsidian"] },
  { id: "any", name: "各地通用", list: ["slime_purple", "ghost", "jelly", "skull", "wisp"] },
  { id: "mine", name: "梦境矿场", list: ["mine:mole", "mine:golem"] },
];
const MINE_NAMES = { mole: "宝藏地鼠", golem: "遗迹守护者" };
/** one line on what each monster does (codex only) */
const DESC = {
  slime: "跳一下停一下地靠近，撞到会掉血。", slime_blue: "冰原上的史莱姆，比普通的更耐打。", slime_purple: "死后留下毒池，别站在里面。",
  bat: "飞得快、轨迹乱，成群出现。", eyeball: "远远地瞄准你射出光弹。", frog: "蓄力后跳向你，落地有冲击。",
  ghost: "能穿墙，一次射出三发减速弹。", skull: "停下来施法，放出一圈火弹。", jelly: "周期性放电，靠近会被电到。",
  wisp: "冲过来自爆，打倒它也会爆炸。", snake: "蛇形游走，速度很快。", snake_vine: "碰到会被藤蔓缠住减速。",
  frog_big: "草原的精英，跳跃冲击范围更大。", boss_eye: "数据草原的首领：弹幕、冲撞、召唤眼球。",
  bat_ice: "碰到会被冻得减速。", eye_ice: "射出会减速的冰晶弹。", slime_frost: "冰原的精英，被打倒会分裂成两只小史莱姆。",
  boss_frost: "显存冰原的首领：冰刺、分裂、冰面滑行。", slime_lava: "死后留下火池，持续灼烧。", bat_fire: "碰到会着火。",
  skull_core: "熔炉的精英，火弹圈更密。", boss_core: "算力熔炉的首领：过热光束与火海。", snake_lava: "红褐色的熔岩蛇，碰到会着火。",
  salamander: "爬得快，碰到会着火，倒下时留下熔岩池。", imp: "在你身边乱飞，碰到会着火。", mushroom: "跳着靠近，死后散出毒孢子。",
  beetle: "壳很硬，横冲直撞。", hedgehog: "蓄力扑向你，碰到会被冻得减速。", frostling: "飘在空中，一次射出两发减速冰弹。",
  snake_ice: "冰原的蛇，碰到会减速。", jelly_ice: "冰原的水母，放电范围不变但更耐打。",
  slime_gold: "稀有！偶尔在数据草原出现，打倒必掉草原藏品。", jelly_aurora: "稀有！偶尔在显存冰原出现，打倒必掉冰原藏品。",
  skull_obsidian: "稀有！偶尔在算力熔炉出现，打倒必掉熔炉藏品。",
  "mine:mole": "梦境矿场里会逃跑、会钻土的地鼠，抓到它能拿到一堆好矿。", "mine:golem": "地底遗迹最深处的守护者，打倒后才能开星图宝箱。",
};

// ---------------------------------------------------------------- records (save.codex = {type: {seen, kills}}, save.curios = {id: n})
/** merge a run's / dive's sightings and kills into the save; returns the codex entries met for the first time */
export function recordCodex(seen = {}, kills = {}) {
  const m = load(), cx = (m.codex = m.codex || {}), fresh = [];
  for (const t of new Set([...Object.keys(seen), ...Object.keys(kills)])) {
    const e = cx[t] || (cx[t] = { seen: 0, kills: 0 });
    if (!e.seen) fresh.push(t);
    e.seen = 1;
    e.kills += kills[t] || 0;
  }
  save();
  return fresh;
}
/** add found 藏品; duplicates become 晶石. returns {fresh:[ids], gems} */
export function recordCurios(ids = []) {
  const m = load(), cu = (m.curios = m.curios || {});
  const fresh = [];
  let gems = 0;
  for (const id of ids) {
    if (!CURIOS[id]) continue;
    if (cu[id]) gems += CURIO_DUP_GEMS;
    else fresh.push(id);
    cu[id] = (cu[id] || 0) + 1;
  }
  m.tokens += gems;
  save();
  return { fresh, gems };
}
/** the rare monster of a map */
export const rareOf = (mapId) => Object.keys(ENEMIES).find((k) => ENEMIES[k].rare === mapId);
/** a 藏品 of that map for a rare kill: one not owned yet when there is one */
export function rollCurio(mapId, owned = load().curios || {}, pending = []) {
  const ids = Object.keys(CURIOS).filter((k) => CURIOS[k].map === mapId);
  const left = ids.filter((k) => !owned[k] && !pending.includes(k));
  const pool = left.length ? left : ids;
  return pool[Math.floor(Math.random() * pool.length)];
}
export function codexProgress() {
  const m = load(), cx = m.codex || {}, all = CODEX.flatMap((p) => p.list);
  return { seen: all.filter((t) => cx[t] && cx[t].seen).length, total: all.length, curios: Object.keys(m.curios || {}).length, curioTotal: Object.keys(CURIOS).length };
}
/** something new to look at: badge on the lobby button */
export function codexUnseen() {
  const m = load();
  return (m.codexNew || []).length;
}

// ---------------------------------------------------------------- drawing a monster into a little canvas
function mineMob(type) {
  return MOBS[type.slice(5)];
}
/** draw entry t (critter strip frame `fr`, or a mine monster) fitted into a w×h canvas */
function drawThumb(cv, t, fr, dark) {
  const g = cv.getContext("2d"), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  if (t.startsWith("mine:")) {
    g.save();
    if (dark) g.filter = "brightness(0) opacity(.55)";
    mineThumb(g, t.slice(5), W, H, fr);
    g.restore();
    return;
  }
  const d = ENEMIES[t], s = d && A.critters[d.sprite];
  if (!s) return;
  // fit the frame's opaque box (cached per sprite) into the canvas, whole pixels
  const bb = s.__bb || (s.__bb = frameBox(s));
  const k = Math.max(1, Math.floor(Math.min((W - 10) / bb.w, (H - 10) / bb.h) * 2) / 2);
  const dw = s.w * k, dh = s.h * k, dx = Math.round(W / 2 - (bb.x + bb.w / 2) * k), dy = Math.round(H / 2 - (bb.y + bb.h / 2) * k);
  g.save();
  if (dark) g.filter = "brightness(0) opacity(.55)";
  g.drawImage(s.img, (fr % s.n) * s.w, 0, s.w, s.h, dx, dy, dw, dh);
  g.restore();
}
function frameBox(s) {
  // the body's box over a few frames: solid pixels only, and rows / columns with a few of them (dust, sparks and
  // shadows around the strips would otherwise shrink the creature to a dot)
  const c = document.createElement("canvas");
  c.width = s.w;
  c.height = s.h;
  const g = c.getContext("2d"), cols = new Uint16Array(s.w), rows = new Uint16Array(s.h);
  for (const f of [0, Math.floor(s.n / 2)]) {
    g.clearRect(0, 0, s.w, s.h);
    g.drawImage(s.img, f * s.w, 0, s.w, s.h, 0, 0, s.w, s.h);
    const px = g.getImageData(0, 0, s.w, s.h).data;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (px[(y * s.w + x) * 4 + 3] > 180) cols[x]++, rows[y]++;
  }
  const lim = (a) => Math.max(2, Math.max(...a) * 0.12);
  const cl = lim(cols), rl = lim(rows);
  let x0 = cols.findIndex((v) => v >= cl), x1 = s.w - 1 - [...cols].reverse().findIndex((v) => v >= cl);
  let y0 = rows.findIndex((v) => v >= rl), y1 = s.h - 1 - [...rows].reverse().findIndex((v) => v >= rl);
  return x0 < 0 || y0 < 0 ? { x: 0, y: 0, w: s.w, h: s.h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const nameOf = (t) => (t.startsWith("mine:") ? MINE_NAMES[t.slice(5)] : ENEMIES[t].name);
function tagOf(t) {
  if (t.startsWith("mine:")) return t === "mine:golem" ? ["首领", "boss"] : ["稀有", "rare"];
  const d = ENEMIES[t];
  if (d.rare) return ["稀有", "rare"];
  if (d.boss) return ["首领", "boss"];
  if (CODEX.some((p) => p.id !== "any" && MAPS[p.id] && (MAPS[p.id].elites || []).includes(t))) return ["精英", "elite"];
  return null;
}
function statLine(t) {
  if (t.startsWith("mine:")) {
    const d = mineMob(t);
    return `生命 ${d.hp}${d.dmg ? ` · 碰撞伤害 ${d.dmg}` : " · 不会攻击"}`;
  }
  const d = ENEMIES[t], bits = [`生命 ${d.hp}`];
  if (d.touch) bits.push(`碰撞伤害 ${d.touch}`);
  if (d.shot) bits.push(d.shot.ring ? `一圈 ${d.shot.n} 发火弹` : `射击 ${d.shot.n} 发`);
  if (d.fly) bits.push("飞行");
  if (d.phase) bits.push("穿墙");
  return bits.join(" · ");
}

// ---------------------------------------------------------------- the codex
export function showCodex() {
  const m = load(), cx = m.codex || {}, cu = m.curios || {};
  m.codexNew = [];
  save();
  const md = el("div", "modal cdx-md");
  let page = 0, sel = null, raf = 0;
  const pr = codexProgress();
  md.innerHTML = `<div class="panel cdx-p">
    <div class="cdx-h"><h2 class="outline">怪物图鉴</h2><span class="o1">已发现 <b>${pr.seen}</b> / ${pr.total} · 梦境藏品 <b>${pr.curios}</b> / ${pr.curioTotal}</span><span class="cdx-x"></span></div>
    <div class="cdx-b"><div class="cdx-tabs">${[...CODEX.map((p) => p.name), "梦境藏品"].map((n, i) => `<button class="hp-tab cdx-tab" data-i="${i}">${n}</button>`).join("")}</div>
      <div class="cdx-main"><div class="cdx-grid"></div><div class="cdx-info o1"></div></div></div></div>`;
  q(".cdx-x", md).appendChild(btn("关闭", "gray small", () => close()));
  const grid = q(".cdx-grid", md), info = q(".cdx-info", md);
  const cards = [];
  const showInfo = (t) => {
    sel = t;
    grid.querySelectorAll(".cdx-c").forEach((c) => c.classList.toggle("on", c.dataset.t === t));
    info.classList.toggle("curio-info", page === CODEX.length);
    if (page === CODEX.length) {
      const c = CURIOS[t], n = cu[t] || 0;
      const source = n ? `${MAPS[c.map].name} · 首领 / 稀有怪物掉落 · 已获得 ${n} 次` : `${MAPS[c.map].name} · 首领 35% / 稀有怪物必掉`;
      info.innerHTML = `<b>${n ? c.name : "？？？"}</b><span title="${source}">${source}</span><p class="curio-desc">${n ? c.desc : "尚未获得，收集后解锁藏品描述。"}</p><p class="curio-effect">效果：${COLLECTION[t].text}（${n ? "PVE，同件不叠加" : "获得后 PVE 生效，同件不叠加"}）</p>`;
      return;
    }
    const e = cx[t];
    if (!e || !e.seen) return void (info.innerHTML = `<b>？？？</b><span>还没有遇到过</span><p>${tagOf(t) && tagOf(t)[1] === "rare" ? "稀有怪物，只在特定地图偶尔出现。" : "在冒险中遇到它后会记录在这里。"}</p>`);
    const tg = tagOf(t);
    info.innerHTML = `<b>${nameOf(t)}${tg ? `<i class="cdx-tag ${tg[1]}">${tg[0]}</i>` : ""}</b><span>${statLine(t)} · 已击败 ${e.kills}</span><p>${DESC[t] || ""}</p>`;
  };
  const draw = () => {
    cancelAnimationFrame(raf);
    md.querySelectorAll(".cdx-tab").forEach((b) => b.classList.toggle("on", +b.dataset.i === page));
    cards.length = 0;
    if (page === CODEX.length) {
      // 藏品: grouped by map
      grid.className = "cdx-grid curio";
      grid.innerHTML = Object.keys(CURIOS).map((id) => {
        const c = CURIOS[id], n = cu[id] || 0;
        return `<button class="cdx-c${n ? "" : " no"}" data-t="${id}"><img src="${curioIcon(id)}" alt=""><b>${n ? c.name : "？？？"}</b><small>${MAPS[c.map].name}</small></button>`;
      }).join("");
    } else {
      grid.className = "cdx-grid";
      grid.innerHTML = CODEX[page].list.map((t) => {
        const e = cx[t], tg = tagOf(t), seen = !!(e && e.seen);
        return `<button class="cdx-c${seen ? "" : " no"}" data-t="${t}"><canvas width="96" height="72"></canvas><b>${seen ? nameOf(t) : "？？？"}</b><small>${seen ? `已击败 ${e.kills}` : "未遇到"}</small>${tg && seen ? `<i class="cdx-tag ${tg[1]}">${tg[0]}</i>` : ""}</button>`;
      }).join("");
      grid.querySelectorAll(".cdx-c").forEach((c) => {
        const t = c.dataset.t, seen = !!(cx[t] && cx[t].seen);
        cards.push({ cv: q("canvas", c), t, seen });
      });
      // the met ones move (their own animation, ~10 fps); the rest stay dark silhouettes
      let last = -1;
      const tick = (now) => {
        const f = Math.floor(now / 90);
        if (f !== last) {
          last = f;
          for (const c of cards) drawThumb(c.cv, c.t, c.seen ? f : 0, !c.seen);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    grid.querySelectorAll(".cdx-c").forEach((c) => (c.onclick = () => (sfx("click"), showInfo(c.dataset.t))));
    const first = grid.querySelector(".cdx-c");
    if (first) showInfo(first.dataset.t);
  };
  md.querySelectorAll(".cdx-tab").forEach((b) => (b.onclick = () => (sfx("click"), (page = +b.dataset.i), draw())));
  const close = () => (cancelAnimationFrame(raf), md.remove());
  md.onclick = (e) => e.target === md && close();
  uiRoot().appendChild(md);
  draw();
}
function q(s, r) {
  return r.querySelector(s);
}
