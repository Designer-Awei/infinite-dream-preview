// 梦境大陆: 每日委托 (three daily tasks from the guild girl at the home, plus a bonus for all three) and 世界事件 (every
// few minutes of play something happens somewhere near you: a 流星 falls — three elites guard its 陨星宝箱 — or a
// 迷途商人 sets up shop for a while). world.js hands in its helpers (grant / erupt / …) so this file imports nothing
// of it and the two do not import each other.
import { T } from "./data.js";

// ---------------------------------------------------------------- 每日委托
const KINDS = {
  kill: { n: (b) => (b ? 12 : 15), txt: (q, B) => `击败${B[q.b].name.slice(2)}的怪物` },
  elite: { n: () => 2, txt: () => "击败精英怪" },
  gather: { n: () => 4, txt: () => "去采集点采集" },
  chest: { n: () => 3, txt: () => "打开宝箱" },
  boss: { n: () => 1, txt: () => "击败任意区域首领" },
  harvest: { n: () => 1, txt: () => "在家园收获一次派遣" },
  event: { n: () => 1, txt: () => "完成一次世界事件" },
};
const strHash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)), (h >>> 0) / 4294967296);
};
/** today's three tasks (the same for everyone on the same day) */
export function questsFor(day) {
  const r = strHash("quest" + day), pool = Object.keys(KINDS), list = [];
  while (list.length < 3) {
    const kind = pool.splice(Math.floor(r() * pool.length), 1)[0], b = Math.floor(r() * 4);
    list.push({ kind, b, n: KINDS[kind].n(b), prog: 0, claimed: false, gems: kind === "boss" ? 200 : 100, mat: kind === "kill" ? b : Math.floor(r() * 4), matN: kind === "boss" ? 8 : 5 });
  }
  return { day, list, bonus: false };
}
export const questText = (q, B) => KINDS[q.kind].txt(q, B);
/** a step on today's tasks: returns the tasks that just completed */
export function questBump(ws, kind, b = -1, n = 1) {
  const done = [];
  for (const q of ws.quests?.list || []) {
    if (q.kind !== kind || q.prog >= q.n || (kind === "kill" && q.b !== b)) continue;
    q.prog = Math.min(q.n, q.prog + n);
    q.fresh = true;
    if (q.prog >= q.n) done.push(q);
  }
  return done;
}

// ---------------------------------------------------------------- 世界事件
const DIRS = ["东", "东南", "南", "西南", "西", "西北", "北", "东北"];
export const dirName = (dx, dy) => DIRS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
/** pick a spot 22–45 tiles from p on open, reachable land of an open region, outside the home */
function spotNear(m, p, H) {
  const W = m.W, [hx0, hy0, hx1, hy1] = m.home.rect;
  for (let k = 0; k < 80; k++) {
    const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 23, x = Math.round(p.x / T + Math.cos(a) * d), y = Math.round(p.y / T + Math.sin(a) * d);
    if (x < 4 || y < 4 || x >= W - 4 || y >= m.H - 4) continue;
    if (x >= hx0 - 6 && x <= hx1 + 6 && y >= hy0 - 6 && y <= hy1 + 6) continue;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) { const i = (y + dy) * W + x + dx; if (!m.reach[i] || m.t[i] !== 0 || H.BIOMES[m.biome[i]].locked) ok = false; }
    if (ok) return { x: x * T + T / 2, y: y * T + T / 2, b: m.biome[y * W + x] };
  }
  return null;
}
const TRADES = [
  { id: "ur", give: ["ur", 1], price: 400, name: "淬灵露 ×1" },
  { id: "egg_ur", give: ["egg_ur", 1], price: 800, name: "UR 宠物蛋 ×1" },
  { id: "stars", give: ["stars", 20], price: 300, name: "星砂 ×20" },
  { id: "pool", give: ["pool", 300], price: 250, name: "宠物经验池 +300" },
  { id: "mat0", give: ["mat0", 6], price: 150, name: "草芯 ×6" },
  { id: "mat1", give: ["mat1", 6], price: 150, name: "霜晶 ×6" },
  { id: "mat2", give: ["mat2", 6], price: 150, name: "熔核 ×6" },
  { id: "mat3", give: ["mat3", 6], price: 180, name: "梦砂 ×6" },
];
export function eventsUpdate(g, ws, m, me, dt, H) {
  if (ws.evNext === undefined) ws.evNext = g.time + 75; // the first one comes soon, then every 3–4 minutes
  const ev = ws.ev;
  if (!ev) {
    if (g.time < ws.evNext || ws.ride || me.downed) return;
    const at = spotNear(m, me, H);
    if (!at) return (ws.evNext = g.time + 20);
    const kind = ws.evForce || (Math.random() < 0.6 ? "meteor" : "trader"); // (evForce: tests)
    const tiles = Math.round(Math.hypot(at.x - me.x, at.y - me.y) / T), dir = dirName(at.x - me.x, at.y - me.y);
    ws.ev = { kind, ...at, t0: g.time, until: g.time + (kind === "meteor" ? 240 : 300), guards: null, open: false, sold: {} };
    if (kind === "trader") {
      const r = strHash("trade" + Math.floor(g.time) + at.x), pool = [...TRADES];
      ws.ev.offers = [0, 1, 2].map(() => pool.splice(Math.floor(r() * pool.length), 1)[0]);
    }
    g.banner = kind === "meteor" ? { text: "流星坠落", sub: `${dir}方约 ${tiles} 格 · 击败守卫打开陨星宝箱`, t: 3.2 } : { text: "迷途商人", sub: `${dir}方约 ${tiles} 格 · 停留 5 分钟`, t: 3.2 };
    g.sound(kind === "meteor" ? "explode" : "portal", 0.2);
    return;
  }
  const d = Math.hypot(me.x - ev.x, me.y - ev.y), left = ev.until - g.time;
  if (ev.kind === "meteor") {
    // guards come when you do; the chest opens when they are down
    if (!ev.guards && d < 700 && g.time - ev.t0 > 1.4) {
      const B = H.BIOMES[ev.b], pool = B.elite.length ? B.elite : B.pool, dd = Math.hypot(ev.x - m.spawn.x, ev.y - m.spawn.y) / T;
      ev.guards = [0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2 + 0.5, x = ev.x + Math.cos(a) * 70, y = ev.y + Math.sin(a) * 50;
        const e = g.spawnEnemy(pool[k % pool.length], x, y, true, 0);
        e.hp = e.maxHp = e.hp * (1 + dd / 100) * B.hp * 1.3;
        if (e.shieldMax) e.shieldHp = e.shieldMax = e.hp * 0.5;
        Object.assign(e, { home: { x, y }, chunk: "event", aggro: 0 });
        return e;
      });
    }
    const guardsDown = ev.guards && ev.guards.every((e) => e.dead || e.hp <= 0);
    if (!ev.open && d < 34) {
      if (!guardsDown) { if ((ev.warnT || 0) < g.time) (ev.warnT = g.time + 1.5), g.text(me.x, me.y - 48, "先击败守卫", "#ffb070", 1, 1.2); }
      else {
        ev.open = true;
        const groups = [["gems", H.grant(g, "gems", 150), 6], ["mat" + ev.b, H.grant(g, "mat" + ev.b, 6), 3]];
        if (Math.random() < 0.3) groups.push(["egg_ur", H.grant(g, "egg_ur", 1), 1]);
        else if (Math.random() < 0.15) groups.push(["hur", H.grant(g, "hur", 1), 1]);
        H.erupt(g, ev.x, ev.y, groups);
        H.quest(g, "chest");
        H.quest(g, "event");
        ev.until = g.time + 4;
        H.save(g);
      }
    }
  } else if (ev.kind === "trader") {
    // stand by the merchant to open the stall (world.js's station logic reads ws.ev)
  }
  if (left <= 0) {
    if (!ev.open && ev.kind === "meteor") g.text(me.x, me.y - 50, "陨星的光芒消散了", "#c8c0e0", 1, 1.6);
    if (ev.guards) for (const e of ev.guards) if (!e.dead && !e.aggro) (e.dead = true), (e.silent = true);
    ws.ev = null;
    ws.evNext = g.time + 180 + Math.random() * 60;
  }
}
/** the merchant's stall: buy one of each offer per visit */
export function tradeBuy(g, ws, offer, H, tokens) {
  const ev = ws.ev;
  if (!ev || ev.kind !== "trader") return "商人已经离开";
  if (ev.sold[offer.id]) return "已售罄";
  if (tokens() < offer.price) return "晶石不足";
  H.spend(offer.price);
  ev.sold[offer.id] = true;
  H.grant(g, ...offer.give);
  if (!ev.dealt) (ev.dealt = true), H.quest(g, "event");
  H.save(g);
  return null;
}

// ---------------------------------------------------------------- the look: the falling star, the crater and chest, the merchant
export function eventSprites(ws, out, imgs) {
  const ev = ws.ev;
  if (!ev) return;
  if (ev.kind === "meteor") out.push({ y: ev.y + 10, draw: (g, t) => {
    const age = t - (ev.tDraw ??= t), fall = Math.min(1, age / 1.2);
    if (fall < 1) { // the star coming down from the upper right, with a trail
      const sx = ev.x + 520 * (1 - fall), sy = ev.y - 700 * (1 - fall);
      g.save(); g.globalCompositeOperation = "lighter";
      for (let k = 0; k < 10; k++) { const f = k / 10; g.globalAlpha = 0.6 * (1 - f); g.fillStyle = k < 3 ? "#ffffff" : "#ffd84a"; g.beginPath(); g.arc(sx + 52 * f * 1.4, sy - 70 * f * 1.4, 12 * (1 - f) + 2, 0, Math.PI * 2); g.fill(); }
      g.restore();
      return;
    }
    if (age < 1.6) { g.save(); g.globalAlpha = 1 - (age - 1.2) / 0.4; g.fillStyle = "#fff6c0"; g.beginPath(); g.ellipse(ev.x, ev.y, 110, 50, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    g.fillStyle = "rgba(30,18,24,0.55)"; g.beginPath(); g.ellipse(ev.x, ev.y + 6, 46, 16, 0, 0, Math.PI * 2); g.fill();
    if (!ev.open) {
      const im = imgs.meteor, pulse = 0.5 + Math.sin(t * 5) * 0.5;
      g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.35 + pulse * 0.25; g.fillStyle = "#ffd84a";
      g.fillRect(ev.x - 5, ev.y - 150, 10, 150); g.globalAlpha = 0.8; g.fillRect(ev.x - 1.5, ev.y - 140, 3, 140); g.restore();
      if (im?.complete && im.naturalWidth) (g.imageSmoothingEnabled = false), g.drawImage(im, Math.round(ev.x - im.naturalWidth / 2), Math.round(ev.y + 12 - im.naturalHeight));
    }
  } });
  else if (ev.kind === "trader") out.push({ y: ev.y + 10, draw: (g, t) => {
    imgs.npc(g, "trader", ev.x, ev.y + 12, t, 3.1);
  } });
}
