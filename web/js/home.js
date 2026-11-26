// 家园 (homestead): the camp grows into a lasting home on the south coast of 数据草原. West of the spawn a fenced
// 宠物牧场 where the pets you own wander about; a 派遣告示板 that posts pets to gather the four region materials while
// you are away (real time, offline too, up to the 储物仓's hours); plots that the 家园管家 builds and upgrades with
// materials and 晶石 — 采集小屋 (more output), 储物仓 (longer storage), 温泉 (soak to heal, then a quick step), 瞭望塔
// (marks every unopened chest of a region on the world map). The home has its own save key: it lasts across visits
// and does not reset with the world.
import { T } from "./data.js";
import { WATER, F } from "./map.js";
import { petState, findPet } from "./petsave.js";
import { PETS, QUALITY } from "./petdata.js";
import { drawPet } from "./pets.js";
import { load, save } from "./save.js";

const KEY = "ai-girls-dungeon-home-v1";
const STAGE_MUL = [1, 1.4, 1.8];
// building ids → name, max level, per-level cost [草芯, 霜晶, 熔核, 梦砂, 晶石] (index = the level you build to)
export const BUILD = {
  farm: { name: "宠物牧场", max: 4, cost: [null, null, [10, 0, 0, 0, 300], [15, 10, 0, 0, 600], [20, 15, 10, 5, 1000]], fx: (lv) => `派遣栏位 ${lv + 1}` },
  hut: { name: "采集小屋", max: 3, cost: [null, [8, 0, 0, 0, 200], [12, 8, 4, 0, 500], [16, 12, 8, 6, 900]], fx: (lv) => `派遣产出 +${lv * 30}%` },
  store: { name: "储物仓", max: 3, cost: [null, [6, 4, 0, 0, 200], [10, 8, 6, 0, 400], [14, 12, 10, 6, 800]], fx: (lv) => `最多存放 ${CAP_H[lv]} 小时` },
  spring: { name: "温泉", max: 2, cost: [null, [0, 10, 6, 0, 300], [0, 14, 10, 6, 700]], fx: (lv) => (lv ? (lv > 1 ? "泡汤回满血盾 + 疾行 30 秒" : "泡汤回满血盾") : "未建造") },
  tower: { name: "瞭望塔", max: 3, cost: [null, [10, 0, 0, 0, 300], [10, 10, 0, 0, 500], [10, 10, 10, 8, 900]], fx: (lv) => (lv ? `大地图标出${["", "草原", "草原、冰原", "全部区域"][lv]}的未开宝箱` : "未建造") },
};
export const BUILD_ORDER = ["farm", "hut", "store", "spring", "tower"];
const CAP_H = [8, 16, 24, 48];
// which regions' chests the 瞭望塔 marks at each level (biome indices)
export const TOWER_REGIONS = [[], [0], [0, 1], [0, 1, 2, 3, 4, 5, 6]];

export function homeState() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (d && d.v === 1) return { lv: { farm: 1, hut: 0, store: 0, spring: 0, tower: 0, ...d.lv }, slots: d.slots || [], v: 1 };
  } catch (e) {}
  return { v: 1, lv: { farm: 1, hut: 0, store: 0, spring: 0, tower: 0 }, slots: [] };
}
export const homeSave = (h) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch (e) {}
};
export const slotCount = (h) => h.lv.farm + 1;
export const capHours = (h) => CAP_H[h.lv.store];
/** materials an hour from one pet: its stage and quality, the 采集小屋 */
export function petRate(p, h) {
  return 3 * STAGE_MUL[(p.stage || 1) - 1] * (1 + 0.15 * (p.q || 0)) * (1 + 0.3 * h.lv.hut);
}
/** bring every slot up to now (offline time counts), drop pets that are gone or now 出战 */
export function homeTick(h, now = Date.now()) {
  const st = petState();
  h.slots = h.slots.filter((s) => findPet(s.uid, st) && st.equipped !== s.uid).slice(0, slotCount(h));
  for (const s of h.slots) {
    const p = findPet(s.uid, st), rate = petRate(p, h), cap = rate * capHours(h);
    s.acc = Math.min(cap, (s.acc || 0) + (rate * Math.max(0, now - (s.t || now))) / 3600000);
    s.t = now;
  }
  return h;
}
/** gather everything stored: returns [草芯, 霜晶, 熔核, 梦砂] added */
export function harvest(h, mats) {
  homeTick(h);
  const got = mats.map(() => 0);
  for (const s of h.slots) {
    const n = Math.floor(s.acc || 0);
    if (!n) continue;
    got[s.mat] += n;
    s.acc -= n;
  }
  got.forEach((n, k) => (mats[k] += n));
  homeSave(h);
  return got;
}
export function canBuild(h, id, mats) {
  const B = BUILD[id], lv = h.lv[id];
  if (lv >= B.max) return "已满级";
  const c = B.cost[lv + 1];
  if (c.slice(0, 4).some((n, k) => mats[k] < n)) return "材料不足";
  if ((load().tokens || 0) < c[4]) return "晶石不足";
  return null;
}
export function build(h, id, mats) {
  const err = canBuild(h, id, mats);
  if (err) return err;
  const c = BUILD[id].cost[h.lv[id] + 1];
  c.slice(0, 4).forEach((n, k) => (mats[k] -= n));
  const m = load();
  m.tokens -= c[4];
  save();
  h.lv[id]++;
  homeSave(h);
  return null;
}

// ---------------------------------------------------------------- the layout (tiles relative to the spawn)
// the home takes the rock field west of the camp: cleared to grass at world build, with the pasture fence, the board,
// the steward and four building plots; chests / 采集点 / residents that fell inside are moved out of it
export function layoutHome(m, sx, sy) {
  const W = m.W, x0 = sx - 19, x1 = sx - 2, y0 = sy - 15, y1 = sy + 5; // (down over the headland on the shore: the 瞭望塔's spot)
  // the headland south of the 温泉 is built out into the sea (three more rows, rounded at the tip) so the tower stands well
  // inside the land, not on the waterline
  for (const [y, a, b] of [[sy + 2, sx - 8, sx - 2], [sy + 3, sx - 8, sx - 2], [sy + 4, sx - 7, sx - 2], [sy + 5, sx - 6, sx - 3]])
    for (let x = a; x <= b; x++) {
      const i = y * W + x;
      if (m.t[i] === WATER) (m.t[i] = F), (m.biome[i] = 0), m.land && (m.land[i] = 1);
    }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (m.t[i] === WATER) continue;
    m.t[i] = F;
    m.mud[i] = 0;
    m.road[i] = m.road[i] >= 2 ? m.road[i] : 0;
    delete m.crates[i];
    m.reach[i] = 1;
  }
  const inside = (o) => o.x / T >= x0 - 1 && o.x / T <= x1 + 1 && o.y / T >= y0 - 1 && o.y / T <= y1 + 1;
  m.chests = m.chests.filter((c) => !inside(c));
  m.nodes = m.nodes.filter((n) => !inside(n));
  for (const sp of m.spawners) sp.list = sp.list.filter((e) => !(e.x / T >= x0 - 12 && e.x / T <= x1 + 12 && e.y / T >= y0 - 12 && e.y / T <= y1 + 8));
  const px = (tx, ty) => ({ x: tx * T + T / 2, y: ty * T + T / 2 });
  // a path of packed earth from the camp to the board and along the plots
  for (let x = sx - 15; x <= sx - 1; x++) if (m.t[(sy - 6) * W + x] !== WATER) m.road[(sy - 6) * W + x] = 1;
  for (let y = sy - 7; y <= sy - 1; y++) if (m.t[y * W + sx - 2] !== WATER) m.road[y * W + sx - 2] = 1;
  m.home = {
    rect: [x0, y0, x1, y1],
    pen: { x0: (sx - 16) * T, y0: (sy - 13) * T, x1: (sx - 7) * T, y1: (sy - 8) * T }, // (px; the fence runs round it)
    board: px(sx - 5, sy - 10),
    steward: px(sx - 4, sy - 5),
    plots: { hut: px(sx - 15, sy - 3), store: px(sx - 11, sy - 3), spring: px(sx - 7, sy - 3), tower: px(sx - 4, sy + 3) }, // (瞭望塔 on the headland south of the 温泉, out in the sea)
    sign: px(sx - 1, sy - 3),
    quest: px(sx + 1, sy - 8),
  };
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) { const i = (sy - 8 + dy) * W + sx + 1 + dx; if (m.t[i] !== WATER) (m.t[i] = F), delete m.crates[i]; }
}

// ---------------------------------------------------------------- the pasture: your pets wander inside the fence
const roam = new Map();
/** the pets shown in the pasture: dispatched ones first, then the rest of the warehouse (not the 出战 one), up to 6 */
function pasturePets(h) {
  const st = petState(), out = [], seen = new Set();
  for (const s of h.slots) { const p = findPet(s.uid, st); if (p && !seen.has(p.uid)) out.push([p, s]), seen.add(p.uid); }
  for (const p of st.list) if (out.length < 6 && !seen.has(p.uid) && st.equipped !== p.uid) out.push([p, null]), seen.add(p.uid);
  return out;
}
export function updatePasture(m, dt, h) {
  const pen = m.home?.pen;
  if (!pen) return;
  const list = pasturePets(h), live = new Set();
  for (const [p, s] of list) {
    live.add(p.uid);
    let r = roam.get(p.uid);
    if (!r) {
      const rx = pen.x0 + 30 + Math.random() * (pen.x1 - pen.x0 - 60), ry = pen.y0 + 30 + Math.random() * (pen.y1 - pen.y0 - 50);
      r = { pet: { id: p.id, stage: p.stage, skin: p.skin || null, x: rx, y: ry, face: 0, anim: Math.random() * 3, walkT: 0, moving: false, castT: 0, castMax: 0, r: 8 }, tx: rx, ty: ry, wait: Math.random() * 2, dead: false, downed: false, mounted: false, work: s };
      roam.set(p.uid, r);
    }
    r.work = s;
    r.pet.skin = p.skin || null;
    r.pet.stage = p.stage;
    const q = r.pet;
    q.anim += dt;
    if (r.wait > 0) { r.wait -= dt; q.moving = false; continue; }
    const dx = r.tx - q.x, dy = r.ty - q.y, l = Math.hypot(dx, dy);
    if (l < 4) {
      r.wait = 1.5 + Math.random() * 3;
      r.tx = pen.x0 + 30 + Math.random() * (pen.x1 - pen.x0 - 60);
      r.ty = pen.y0 + 34 + Math.random() * (pen.y1 - pen.y0 - 56);
      q.moving = false;
      continue;
    }
    const sp = 34 * dt;
    q.x += (dx / l) * Math.min(sp, l);
    q.y += (dy / l) * Math.min(sp, l);
    q.face = Math.atan2(dy, dx);
    q.moving = true;
    q.walkT += dt;
  }
  for (const k of [...roam.keys()]) if (!live.has(k)) roam.delete(k);
}
// the fence (code-drawn rails and posts) and the pets, as y-sorted sprites
export function pastureSprites(m, out, mats) {
  const pen = m.home?.pen;
  if (!pen) return;
  const { x0, y0, x1, y1 } = pen;
  const post = (g, x, y) => {
    g.fillStyle = "#1a1020"; g.fillRect(x - 4, y - 22, 8, 24);
    g.fillStyle = "#b07a44"; g.fillRect(x - 3, y - 21, 6, 22);
    g.fillStyle = "#d8a466"; g.fillRect(x - 3, y - 21, 6, 3);
  };
  const rail = (g, xa, xb, y) => {
    g.fillStyle = "#1a1020"; g.fillRect(xa, y - 17, xb - xa, 5); g.fillRect(xa, y - 9, xb - xa, 5);
    g.fillStyle = "#c88a4a"; g.fillRect(xa, y - 16, xb - xa, 3); g.fillRect(xa, y - 8, xb - xa, 3);
  };
  // back and front rails with a gate gap on the east side near the board
  out.push({ y: y0, draw: (g) => { rail(g, x0, x1, y0); for (let x = x0; x <= x1; x += 48) post(g, x, y0); post(g, x1, y0); } });
  out.push({ y: y1, draw: (g) => { rail(g, x0, x1, y1); for (let x = x0; x <= x1; x += 48) post(g, x, y1); post(g, x1, y1); } });
  for (let y = y0 + 32; y < y1; y += 32) {
    out.push({ y, draw: (g) => { post(g, x0, y); g.fillStyle = "#c88a4a"; g.fillRect(x0 - 2, y - 30, 4, 32); } });
    if (y < y1 - 70 || y > y1 - 34) out.push({ y, draw: (g) => { post(g, x1, y); g.fillStyle = "#c88a4a"; g.fillRect(x1 - 2, y - 30, 4, 32); } }); // (the gate)
  }
  for (const r of roam.values()) out.push({ y: r.pet.y, draw: (g, time) => {
    drawPet(g, r, time);
    if (r.work) { // a dispatched pet: a little bubble with its material
      const x = Math.round(r.pet.x), y = Math.round(r.pet.y - 70 - (r.pet.stage - 1) * 10), im = mats[r.work.mat];
      g.fillStyle = "#1a1020"; g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff6e0"; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff6e0"; g.beginPath(); g.moveTo(x - 4, y + 7); g.lineTo(x, y + 14); g.lineTo(x + 3, y + 7); g.fill();
      if (im?.complete && im.naturalWidth) (g.imageSmoothingEnabled = false), g.drawImage(im, x - 8, y - 8, 16, 16);
    }
  } });
}
export const petLabel = (p) => `${PETS[p.id].name}${p.skin ? "·异色" : ""}`;
export const qualityOf = (p) => QUALITY[p.q || 0];
