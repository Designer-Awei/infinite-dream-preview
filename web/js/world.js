// 梦境大陆 (大地图探索): one fixed 256×256-tile world, the same for every player, built from the seed in ~30 ms.
// It is an ordinary room map object (t / mud / crates …, plus biome + road layers), so movement, collision, enemy AI,
// bullets, pets and fx run on it unchanged. What is new lives here: the world generator, 16×16-tile ground tiles drawn
// on demand and kept in a small LRU cache, enemies that spawn and sleep per 16×16 chunk, world chests, the fog map,
// the minimap, and the world save (its own localStorage key; only differences from the generated world are stored).
// Co-op: the world is deterministic and enemies are host-simulated like room enemies, so a host would only need to
// send the enemies near its guests and the opened-chest list — not done yet (solo offline first).
import { T, VIEW_W, VIEW_H } from "./data.js";
import { THEMES, WALL, WATER, BUSH, CRATE, BARREL, F, CRATE_HP } from "./map.js";
import { load, save } from "./save.js";

export const WORLD_W = 256, WORLD_H = 256, CHUNK = 16, WORLD_SEED = 20261122;
const CPX = CHUNK * T; // 512 px a chunk
export const BIOMES = [
  { id: "grass", name: "数据草原", theme: 0, hazard: "mud", lv: "Lv 1–10 · 泥沼减速", hp: 1, mm: [111, 191, 72],
    pool: ["slime", "slime", "bat", "eyeball", "frog", "snake_vine", "beetle", "mushroom", "spider", "slime_purple"], elite: ["frog_big", "slime_purple", "frog"] },
  { id: "ice", name: "显存冰原", theme: 2, hazard: "ice", lv: "Lv 10–20 · 冰面打滑", hp: 1.3, mm: [214, 228, 242],
    pool: ["slime_blue", "slime_blue", "hedgehog", "turtle", "bat_ice", "eye_ice", "ghost", "frostling", "snake_ice", "jelly_ice"], elite: ["slime_frost", "turtle", "hedgehog"] },
  { id: "lava", name: "算力熔炉", theme: 3, hazard: "lava", lv: "Lv 20–30 · 熔岩灼烧", hp: 1.6, mm: [96, 78, 74],
    pool: ["slime_lava", "slime_lava", "snail", "imp", "bat_fire", "salamander", "skull", "snake_lava"], elite: ["skull_core", "snail", "salamander"] },
  // the south-east sea and its islands: by ferry (the big one) or on a flying mount (the rest)
  { id: "isle", name: "幻梦群岛", theme: 1, hazard: "mud", lv: "Lv 25–35 · 渡船或飞行坐骑", hp: 1.5, mm: [138, 122, 200],
    pool: ["slime_purple", "slime_purple", "ghost", "jelly", "wisp", "eyeball", "bat", "frog"], elite: ["skull", "frog_big", "jelly"] },
];
// the world's rock: each region's look with stone instead of plank tops (big rock masses read as cliffs, not decks)
const STONE = [
  { top: "#a8aaa0", topHi: "#cfd0c4", front: "#6e7068", frontLo: "#52544c" },
  { top: "#c4d4e6", topHi: "#eef6ff", front: "#7d93b0", frontLo: "#5f7594" },
  { top: "#5e4c48", topHi: "#7c6660", front: "#3a2c2c", frontLo: "#261c1e" },
  { top: "#b8a8d8", topHi: "#e4dcf6", front: "#7a6aa8", frontLo: "#5a4a88" },
];
BIOMES.forEach((b, k) => ((b.rock = THEMES.length), THEMES.push({ ...THEMES[b.theme], ...STONE[k], name: b.name + "·岩" })));
export const tileTheme = (m, i) => (m.biome ? BIOMES[m.biome[i]].theme : m.theme);
export const wallTheme = (m, i) => (m.biome ? BIOMES[m.biome[i]].rock : m.theme);
export const tileHazard = (m, i) => (m.biome ? BIOMES[m.biome[i]].hazard : m.hazard);
export const hazardAt = (m, x, y) => {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  return tx < 0 || ty < 0 || tx >= m.W || ty >= m.H ? m.hazard : tileHazard(m, ty * m.W + tx);
};

// ---------------------------------------------------------------- noise (value noise, deterministic, no dependency)
function hash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s), top = a + (b - a) * u;
  return top + (c + (d - c) * u - top) * v;
}
const fbm = (x, y, s) => (vnoise(x, y, s) * 0.57 + vnoise(x * 2.03, y * 2.03, s + 7) * 0.29 + vnoise(x * 4.1, y * 4.1, s + 13) * 0.14) * 2 - 1;

// ---------------------------------------------------------------- generation
let WORLD = null;
export function getWorld() {
  return WORLD || (WORLD = buildWorld(WORLD_SEED));
}
export function buildWorld(seed) {
  const W = WORLD_W, H = WORLD_H, N = W * H;
  const m = { W, H, kind: "world", world: true, seed, theme: 0, hazard: "mud", t: new Uint8Array(N), mud: new Uint8Array(N), biome: new Uint8Array(N), road: new Uint8Array(N),
    spikes: [], crates: {}, poison: [], decals: [], pxW: W * T, pxH: H * T, flowMax: 44 };
  // regions: warped nearest-centre — 草原 south (the spawn), 冰原 north-west, 熔炉 north-east
  const centers = [[128, 182], [58, 66], [198, 64]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = x + fbm(x / 38, y / 38, seed + 21) * 34, wy = y + fbm(x / 38, y / 38, seed + 22) * 34;
    let best = 0, bd = 1e9;
    centers.forEach(([cx, cy], k) => {
      const d = (wx - cx) ** 2 + (wy - cy) ** 2 * (k ? 1 : 0.8);
      if (d < bd) (bd = d), (best = k);
    });
    m.biome[y * W + x] = best;
  }
  // the sea fills the south-east corner behind a wavy coast; four islands stand in it
  const isles = [[198, 214, 15], [234, 174, 10], [168, 240, 9], [238, 236, 9]];
  const sea = (x, y) => x + y + fbm(x / 30, y / 30, seed + 25) * 26 > 362;
  const isleAt = (x, y) => {
    for (let k = 0; k < isles.length; k++) {
      const [cx, cy, r] = isles[k];
      if (Math.hypot(x - cx, y - cy) + fbm(x / 9, y / 9, seed + 26 + k) * 5 < r) return k;
    }
    return -1;
  };
  m.isles = isles;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!x || !y || x === W - 1 || y === H - 1) { m.t[i] = WALL; continue; }
    const onSea = sea(x, y), il = onSea ? isleAt(x, y) : -1;
    if (onSea) m.biome[i] = 3;
    if (onSea && il < 0) { m.t[i] = WATER; continue; }
    const e = fbm(x / 24, y / 24, seed + 1), mo = fbm(x / 15, y / 15, seed + 2), hz = fbm(x / 8, y / 8, seed + 3), r = hash(x, y, seed + 4);
    let t = F;
    if (e < -0.33 && il < 0) t = WATER; // (no ponds on the islands)
    else if (e > (il >= 0 ? 0.45 : 0.33) && r > 0.06) t = WALL;
    else if (mo > (m.biome[i] === 2 ? 0.36 : 0.26) && r < 0.62) t = BUSH;
    else if (r < 0.008) t = CRATE;
    else if (r < 0.0105) t = BARREL;
    m.t[i] = t;
    if (t !== WATER && t !== WALL && hz > (m.biome[i] === 2 ? 0.34 : 0.4)) m.mud[i] = 1;
  }
  // roads: wobbly dirt paths from the spawn to every region and its corners, carved 3 tiles wide
  const sx = 118, sy = 212;
  const carve = (x, y, rad) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const X = Math.round(x + dx), Y = Math.round(y + dy);
      if (X < 2 || Y < 2 || X > W - 3 || Y > H - 3 || dx * dx + dy * dy > rad * rad + 0.5) continue;
      const j = Y * W + X;
      if ((m.biome[j] === 3 && m.t[j] === WATER) || m.road[j] === 2) continue; // (roads stop at the sea and the pier)
      m.t[j] = F; m.mud[j] = 0; m.road[j] = 1;
    }
  };
  const path = (ax, ay, bx, by, k) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let s = 0; s <= n; s++) {
      const q = s / n, w = Math.sin(q * Math.PI) * 14;
      const px = ax + (bx - ax) * q + fbm(q * 6, k, seed + 31) * w, py = ay + (by - ay) * q + fbm(k, q * 6, seed + 32) * w;
      carve(px, py, 1.3);
    }
  };
  // the ferry: from the big island's centre walk toward the camp; where the island ends and the mainland begins, a
  // 3-tile wooden pier runs out over the water on each side and a boat shuttles between their ends
  const [ix, iy] = isles[0], fl = Math.hypot(sx - ix, sy - iy), ux = (sx - ix) / fl, uy = (sy - iy) / fl;
  const at = (k) => [Math.round(ix + ux * k), Math.round(iy + uy * k)], land = (k) => m.t[at(k)[1] * W + at(k)[0]] !== WATER;
  let kB = 0;
  while (land(kB + 1)) kB++; // last island tile
  let kA = kB + 1;
  while (!land(kA)) kA++; // first mainland tile
  const pier = (k0, dir) => {
    for (let s2 = 1; s2 <= 3; s2++) {
      const [x, y] = at(k0 + dir * s2);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        const j = (y + dy) * W + x + dx;
        if (m.t[j] === WATER) (m.t[j] = F), (m.road[j] = 2), (m.biome[j] = 3);
      }
    }
    const [x, y] = at(k0 + dir * 3);
    return { x: x * T + T, y: y * T + T };
  };
  const pa = pier(kA, -1), pb = pier(kB, 1);
  m.ferries = [{ a: pa, b: pb, name: "幻梦渡口" }];
  const hubs = [[128, 176], [62, 70], [196, 68], [40, 200], at(kA), [128, 120], [96, 32], [170, 28]];
  path(sx, sy, ...hubs[0], 1); path(...hubs[0], ...hubs[5], 2); path(...hubs[5], ...hubs[1], 3); path(...hubs[5], ...hubs[2], 4);
  path(...hubs[0], ...hubs[3], 5); path(sx, sy, ...hubs[4], 6); path(...hubs[1], ...hubs[6], 7); path(...hubs[2], ...hubs[7], 8);
  path(...at(kB), ix, iy, 9); // the island's own track from its pier
  // the camp clearing round the spawn
  for (let dy = -6; dy <= 6; dy++) for (let dx = -7; dx <= 7; dx++) if (dx * dx / 49 + dy * dy / 36 <= 1) {
    const j = (sy + dy) * W + sx + dx;
    m.t[j] = F; m.mud[j] = 0;
  }
  // everything you can't walk to from the camp becomes rock (crates and barrels count as walkable: they break)
  // (islands are seeds of their own: reached by boat or wing, not on foot)
  const reach = new Uint8Array(N), q = [sy * W + sx];
  const pass = (t) => t !== WALL && t !== WATER;
  for (const [cx, cy] of isles) {
    let j = cy * W + cx;
    for (let r2 = 0; r2 < 6 && !pass(m.t[j]); r2++) j = cy * W + cx + r2; // (a centre that landed on rock)
    if (pass(m.t[j])) q.push(j);
  }
  for (const j of q) reach[j] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W;
    for (const j of [i + 1, i - 1, i + W, i - W]) {
      if (reach[j] || !pass(m.t[j]) || (j === i + 1 && x === W - 1) || (j === i - 1 && !x)) continue;
      reach[j] = 1;
      q.push(j);
    }
  }
  for (let i = 0; i < N; i++) if (!reach[i] && pass(m.t[i])) (m.t[i] = WALL), (m.mud[i] = 0);
  for (let i = 0; i < N; i++) if (m.t[i] === CRATE || m.t[i] === BARREL) m.crates[i] = { hp: m.t[i] === CRATE ? CRATE_HP : 12 };
  // a lake that straddles a border takes the region most of it lies in (no half-blue, half-lava pond)
  const seen = new Uint8Array(N);
  for (let i0 = 0; i0 < N; i0++) {
    if (seen[i0] || m.t[i0] !== WATER || m.biome[i0] === 3) continue;
    const comp = [i0], votes = [0, 0, 0, 0];
    seen[i0] = 1;
    for (let h = 0; h < comp.length; h++) {
      const i = comp[h];
      votes[m.biome[i]]++;
      for (const j of [i + 1, i - 1, i + W, i - W]) if (j >= 0 && j < N && !seen[j] && m.t[j] === WATER && m.biome[j] !== 3) (seen[j] = 1), comp.push(j);
    }
    const best = votes.indexOf(Math.max(...votes));
    for (const i of comp) m.biome[i] = best;
  }
  m.reach = reach;
  m.spawnT = { x: sx, y: sy };
  m.spawn = { x: sx * T + T / 2, y: sy * T + T / 2 };
  m.center = m.spawn;
  m.itemSpots = [m.spawn];
  const open = (x, y) => x > 1 && y > 1 && x < W - 2 && y < H - 2 && reach[y * W + x] && m.t[y * W + x] === F;
  const tdist = (x, y) => Math.hypot(x - sx, y - sy);
  // enemies: each 16×16 chunk outside the camp keeps 2–4 residents of its region (more and tougher further out)
  m.spawners = [];
  for (let cy = 0; cy < H / CHUNK; cy++) for (let cx = 0; cx < W / CHUNK; cx++) {
    const mx = cx * CHUNK + 8, my = cy * CHUNK + 8, dd = tdist(mx, my);
    if (dd < 18) continue;
    const n = 2 + Math.floor(hash(cx, cy, seed + 41) * 3) + (dd > 110 ? 1 : 0), list = [];
    for (let k = 0, tries = 0; list.length < n && tries < 40; tries++) {
      const x = cx * CHUNK + 1 + Math.floor(hash(cx * 31 + tries, cy, seed + 42) * (CHUNK - 2)), y = cy * CHUNK + 1 + Math.floor(hash(cx, cy * 31 + tries, seed + 43) * (CHUNK - 2));
      if (!open(x, y) || tdist(x, y) < 16) continue;
      const elite = hash(x, y, seed + 44) < 0.05 + dd / 3000, b = BIOMES[m.biome[y * W + x]]; // (each resident from the region it stands in)
      const pool = elite ? b.elite : b.pool, type = pool[Math.floor(hash(x, y, seed + 45) * pool.length)];
      list.push({ type, x: x * T + T / 2, y: y * T + T / 2, elite, k: k++, mul: (1 + dd / 100) * b.hp });
    }
    if (list.length) m.spawners.push({ key: cx + "," + cy, cx, cy, list });
  }
  // chests: one in most 32×32 blocks, tucked next to rock or bushes; the far and hidden ones are golden
  m.chests = [];
  for (let by = 0; by < H / 32; by++) for (let bx = 0; bx < W / 32; bx++) {
    if (hash(bx, by, seed + 51) < 0.12) continue;
    let pick = null;
    for (let tries = 0; tries < 60 && !pick; tries++) {
      const x = bx * 32 + 2 + Math.floor(hash(bx * 97 + tries, by, seed + 52) * 28), y = by * 32 + 2 + Math.floor(hash(bx, by * 97 + tries, seed + 53) * 28);
      if (!open(x, y) || tdist(x, y) < 12) continue;
      let cover = 0;
      for (const j of [-1, 1, -W, W]) if (m.t[y * W + x + j] === WALL || m.t[y * W + x + j] === BUSH) cover++;
      if (cover >= 1 || tries > 40) pick = [x, y, cover];
    }
    if (!pick) continue;
    const [x, y, cover] = pick, dd = tdist(x, y);
    m.chests.push({ id: y * W + x, x: x * T + T / 2, y: y * T + T / 2 + 4, gold: dd > 150 || (cover >= 3 && hash(x, y, seed + 54) < 0.45) });
  }
  // every island keeps a golden chest of its own (a chest's id is its tile, so a generator tweak keeps saves valid)
  for (const [cx, cy, r] of isles) {
    if (m.chests.some((c) => Math.hypot(c.x / T - cx, c.y / T - cy) < r)) continue;
    for (let tries = 0; tries < 80; tries++) {
      const x = cx + Math.round((hash(cx, tries, seed + 55) - 0.5) * r), y = cy + Math.round((hash(tries, cy, seed + 56) - 0.5) * r);
      if (open(x, y)) {
        m.chests.push({ id: y * W + x, x: x * T + T / 2, y: y * T + T / 2 + 4, gold: true });
        break;
      }
    }
  }
  return m;
}

// ---------------------------------------------------------------- ground: 16×16-tile canvases, drawn on demand
const tiles = new Map(), TILE_CAP = 24;
// rects are collected per colour and filled in one go per colour (a fillStyle switch per rect made a tile ~4× slower)
function batcher() {
  const by = new Map();
  const r = (x, y, w, h, c) => {
    let a = by.get(c);
    if (!a) by.set(c, (a = []));
    a.push(x, y, w, h);
  };
  r.flush = (g) => {
    for (const [c, a] of by) {
      g.fillStyle = c;
      for (let k = 0; k < a.length; k += 4) g.fillRect(a[k], a[k + 1], a[k + 2], a[k + 3]);
    }
    by.clear();
  };
  return r;
}
const spare = []; // canvases of evicted tiles, reused (no new 512×512 texture per tile)
function renderTile(m, cx, cy) {
  let c = spare.pop();
  if (!c) (c = document.createElement("canvas")), (c.width = c.height = CPX);
  const g = c.getContext("2d"), W = m.W, x0 = cx * CHUNK, y0 = cy * CHUNK, S = m.seed, px = batcher();
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= m.H ? WALL : m.t[y * W + x]);
  const thOf = (i) => THEMES[BIOMES[m.biome[i]].theme];
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx, th = thOf(i), X = x * T, Y = y * T, h = hash(gx, gy, S + 61);
    px(X, Y, T, T, (gx + gy) % 2 ? th.g1 : th.g2);
    for (let k = 0; k < 4; k++) {
      const hx = X + 2 + ((h * (k * 7 + 3) * 997) % 26 | 0), hy = Y + 3 + ((h * (k * 5 + 11) * 619) % 25 | 0);
      px(hx, hy, 1, 2, th.gHi);
      px(hx + 1, hy + 1, 1, 1, th.gLo);
    }
  }
  px.flush(g);
  // where two regions meet, each side is dithered with the other's ground in 2×2 blocks, thinning out over 16 px
  // (edges and corners, from the global pixel position so it lines up across tiles): no hard seam between regions
  const land = (x, y) => x >= 0 && y >= 0 && x < W && y < m.H && m.t[y * W + x] !== WATER && m.road[y * W + x] !== 2;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx;
    if (m.t[i] === WATER || m.road[i] === 2) continue;
    const b = m.biome[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = gx + dx, ny = gy + dy;
      if (!land(nx, ny)) continue;
      const nb = m.biome[ny * W + nx];
      if (nb === b || (dx && dy && (m.biome[gy * W + nx] === nb || m.biome[ny * W + gx] === nb))) continue; // (a corner only when neither side already blends)
      const th = THEMES[BIOMES[nb].theme], X = x * T, Y = y * T;
      for (let cy2 = 0; cy2 < T; cy2 += 2) for (let cx2 = 0; cx2 < T; cx2 += 2) {
        const ex = dx > 0 ? T - 2 - cx2 : dx < 0 ? cx2 : 99, ey = dy > 0 ? T - 2 - cy2 : dy < 0 ? cy2 : 99;
        const d = dx && dy ? Math.hypot(ex, ey) : Math.min(ex, ey);
        if (d >= 16) continue;
        const ppx = gx * T + cx2, ppy = gy * T + cy2;
        if (hash(ppx, ppy, S + 81) < 0.8 * (1 - d / 16) ** 1.6) px(X + cx2, Y + cy2, 2, 2, ((ppx + ppy) >> 1) % 3 ? th.g1 : th.gHi);
      }
    }
  }
  px.flush(g);
  // the ferry piers: planks over the sea
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx;
    if (m.road[i] !== 2) continue;
    const th = thOf(i), X = x * T, Y = y * T;
    px(X, Y, T, T, th.water);
    for (let k = 0; k < 4; k++) {
      px(X, Y + k * 8, T, 7, "#b07a48");
      px(X, Y + k * 8, T, 1, "#e8c08a");
      px(X, Y + k * 8 + 6, T, 1, "#6a4428");
      px(X + ((gx * 7 + k * 11) % 20) + 4, Y + k * 8 + 3, 2, 1, "#8a5a34");
    }
    if (m.road[i - 1] !== 2) px(X, Y, 2, T, "#4a2e1c");
    if (m.road[i + 1] !== 2) px(X + T - 2, Y, 2, T, "#4a2e1c");
  }
  px.flush(g);
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx;
    if (m.road[i] !== 1) continue;
    const th = thOf(i), X = x * T, Y = y * T, h = hash(gx, gy, S + 63);
    px(X, Y, T, T, th.dirt);
    for (let k = 0; k < 3; k++) px(X + 3 + ((h * (k * 7 + 5) * 911) % 24 | 0), Y + 3 + ((h * (k * 3 + 7) * 733) % 24 | 0), 3, 2, th.dirtLo);
    // soft edge where the road meets grass
    if (gy > 0 && !m.road[i - W]) px(X, Y, T, 2, th.dirtLo);
    if (gx > 0 && !m.road[i - 1]) px(X, Y, 2, T, th.dirtLo);
  }
  px.flush(g);
  // mud / ice / lava patches with rounded edges (neighbours one tile outside too: their corners spill in), one path per colour
  const blobs = new Map();
  for (let y = -1; y <= CHUNK; y++) for (let x = -1; x <= CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y;
    if (gx < 0 || gy < 0 || gx >= W || gy >= m.H || !m.mud[gy * W + gx]) continue;
    const col = thOf(gy * W + gx).mud;
    if (!blobs.has(col)) blobs.set(col, []);
    blobs.get(col).push(x * T - 2, y * T - 2);
  }
  for (const [col, a] of blobs) {
    g.fillStyle = col;
    g.beginPath();
    for (let k = 0; k < a.length; k += 2) g.roundRect(a[k], a[k + 1], T + 4, T + 4, 9);
    g.fill();
  }
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx;
    if (!m.mud[i]) continue;
    const th = thOf(i), X = x * T, Y = y * T, h = hash(gx, gy, S + 65);
    for (let k = 0; k < 4; k++) px(X + 3 + ((h * (k * 7 + 3) * 877) % 23 | 0), Y + 3 + ((h * (k * 5 + 1) * 541) % 24 | 0), 2 + (k % 3), 2, th.mudHi);
    px(X + 6 + ((h * 401) % 14 | 0), Y + 6 + ((h * 769) % 14 | 0), 3, 3, th.mudDot || "#5a3e26");
  }
  px.flush(g);
  // block shadows, to the bottom-right (from one tile up / left as well)
  for (let y = -1; y < CHUNK; y++) for (let x = -1; x < CHUNK; x++) {
    const t = at(x0 + x, y0 + y);
    if (t === WALL || t === CRATE || t === BARREL) px(x * T + 6, y * T + 6, T, T, "rgba(20,40,10,0.28)");
  }
  px.flush(g);
  // water base with rims (its shimmer is drawn live)
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx;
    if (m.t[i] !== WATER) continue;
    const th = thOf(i), X = x * T, Y = y * T;
    px(X, Y, T, T, th.water);
  }
  px.flush(g);
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx;
    if (m.t[i] !== WATER) continue;
    const th = thOf(i), X = x * T, Y = y * T;
    if (at(gx, gy - 1) !== WATER) px(X, Y, T, 6, th.waterLo);
    if (at(gx, gy + 1) !== WATER) px(X, Y + T - 3, T, 3, th.waterHi);
  }
  px.flush(g);
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx;
    if (m.t[i] !== WATER) continue;
    const th = thOf(i), X = x * T, Y = y * T;
    if (at(gx, gy - 1) !== WATER) px(X, Y, T, 2, th.rim);
    if (at(gx - 1, gy) !== WATER) px(X, Y, 3, T, th.rim);
    if (at(gx + 1, gy) !== WATER) px(X + T - 3, Y, 3, T, th.rim);
  }
  px.flush(g);
  // decals: flowers, pebbles, tufts
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx, h = hash(gx, gy, S + 69);
    if (h > 0.09 || m.t[i] !== F || m.mud[i] || m.road[i]) continue;
    const th = thOf(i), dx = x * T + 6 + ((h * 7919) % 18 | 0), dy = y * T + 8 + ((h * 6007) % 16 | 0), k = Math.floor(h / 0.0225);
    if (k === 0) {
      const fl = th.flowers || ["#ffffff", "#ffe066", "#ff8ac0"], col = fl[(h * 5003 | 0) % fl.length];
      px(dx - 1, dy, 3, 1, col); px(dx, dy - 1, 1, 3, col); px(dx, dy, 1, 1, "#ffb030");
    } else if (k === 1) {
      px(dx, dy, 4, 3, "#c8c0b0"); px(dx, dy, 3, 1, "#f0ece0"); px(dx + 1, dy + 3, 3, 1, th.gLo);
    } else if (k === 2) {
      px(dx, dy, 1, 3, th.bushLo); px(dx + 2, dy - 1, 1, 4, th.bushLo); px(dx + 4, dy, 1, 3, th.bushLo); px(dx + 2, dy - 1, 1, 1, th.gHi);
    } else {
      px(dx, dy, 5, 2, th.dirt); px(dx + 1, dy + 2, 3, 1, th.dirtLo);
    }
  }
  px.flush(g);
  return c;
}
function tileAtCache(m, cx, cy) {
  const k = cx + "," + cy;
  let c = tiles.get(k);
  if (c) {
    tiles.delete(k);
    tiles.set(k, c); // most recently used last
    return c;
  }
  c = renderTile(m, cx, cy);
  tiles.set(k, c);
  while (tiles.size > TILE_CAP) {
    const k0 = tiles.keys().next().value;
    spare.push(tiles.get(k0));
    tiles.delete(k0);
  }
  return c;
}
let prefetching = false;
/** draw the ground under the camera (2–4 cached tiles); the ring around them is drawn ahead in idle time */
export function drawWorldGround(g, m, cx, cy) {
  const a0 = Math.max(0, Math.floor(cx / CPX)), a1 = Math.min(m.W / CHUNK - 1, Math.floor((cx + VIEW_W) / CPX));
  const b0 = Math.max(0, Math.floor(cy / CPX)), b1 = Math.min(m.H / CHUNK - 1, Math.floor((cy + VIEW_H) / CPX));
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) g.drawImage(tileAtCache(m, a, b), a * CPX - cx, b * CPX - cy);
  if (prefetching) return;
  for (let b = b0 - 1; b <= b1 + 1; b++) for (let a = a0 - 1; a <= a1 + 1; a++) {
    if (a < 0 || b < 0 || a >= m.W / CHUNK || b >= m.H / CHUNK || tiles.has(a + "," + b)) continue;
    prefetching = true;
    const go = () => {
      prefetching = false;
      if (!tiles.has(a + "," + b)) tileAtCache(m, a, b);
    };
    (window.requestIdleCallback || ((f) => setTimeout(f, 30)))(go, { timeout: 200 });
    return;
  }
}
export const worldTileCount = () => tiles.size; // (tests)
export function invalidateWorldTiles() {
  for (const c of tiles.values()) spare.push(c);
  tiles.clear();
}
/** rock broken / bushes burnt (the dragon): only the tiles holding them are drawn again */
export function refreshWorldTiles(m) {
  for (const [list, key] of [[m.brokenWalls || [], "_bw"], [m.burnedBushes || [], "_bb"]]) {
    for (let k = m[key] || 0; k < list.length; k++) {
      const i = list[k], x = i % m.W, y = Math.floor(i / m.W);
      // its shadow falls one tile right / down: that tile may sit in the next chunk
      for (const [a, b] of [[x, y], [x + 1, y + 1]]) {
        const key2 = Math.floor(a / CHUNK) + "," + Math.floor(b / CHUNK), c = tiles.get(key2);
        if (c) spare.push(c), tiles.delete(key2);
      }
    }
    m[key] = list.length;
  }
}

// ---------------------------------------------------------------- save
const KEY = "ai-girls-dungeon-world-v1", FOG = 64; // fog: 64×64 cells of 4×4 tiles
export function loadWorldSave() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (d && d.v === 1) return { opened: [], fog: "", ...d };
  } catch (e) {}
  return { v: 1, opened: [], fog: "", x: null, y: null, chests: 0, visits: 0 };
}
const fogBytes = (s) => {
  const out = new Uint8Array(FOG * FOG);
  try {
    const bin = atob(s || "");
    for (let i = 0; i < out.length; i++) out[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch (e) {}
  return out;
};
const fogString = (f) => {
  let s = "";
  for (let i = 0; i < f.length; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) b |= f[i + k] << k;
    s += String.fromCharCode(b);
  }
  return btoa(s);
};
export function explored(fog) {
  let n = 0;
  for (const v of fog) n += v;
  return Math.round((n / fog.length) * 100);
}
export function worldSaveNow(g) {
  const ws = g.ws, p = g.players.find((q) => q.local) || g.players[0];
  if (!ws) return;
  const d = { v: 1, opened: [...ws.opened], fog: fogString(ws.fog), x: p && !p.downed ? Math.round(p.x) : null, y: p && !p.downed ? Math.round(p.y) : null, chests: ws.opened.size, visits: ws.visits };
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch (e) {}
}
/** how much of the world the save has uncovered (lobby card) */
export const worldExplored = () => explored(fogBytes(loadWorldSave().fog));

// ---------------------------------------------------------------- runtime (called by Game when opt.world)
export function worldEnter(g) {
  // every visit starts from the generated world (crates broken and rock burnt last time are back); ~0.1 s, behind the loading doors
  if (WORLD?.used) (WORLD = null), invalidateWorldTiles();
  const m = getWorld(), sv = loadWorldSave();
  m.used = true;
  g.map = m;
  g.ws = { chunks: new Map(), opened: new Set(sv.opened), fog: fogBytes(sv.fog), fogDirty: true, region: -1, saveT: 4, visits: (sv.visits || 0) + 1, gems: 0, chestsNow: 0 };
  const ok = sv.x != null && m.reach[Math.floor(sv.y / T) * m.W + Math.floor(sv.x / T)] && m.t[Math.floor(sv.y / T) * m.W + Math.floor(sv.x / T)] === F;
  const sp = ok ? { x: sv.x, y: sv.y } : m.spawn;
  g.players.forEach((p, i) => ((p.x = sp.x + (i % 2) * 26), (p.y = sp.y + (i >> 1) * 26)));
  revealAround(g);
}
const tileIdx = (m, x, y) => Math.floor(y / T) * m.W + Math.floor(x / T);
function revealAround(g) {
  const ws = g.ws;
  for (const p of g.players) {
    if (p.dead) continue;
    const fx = Math.floor(p.x / (T * 4)), fy = Math.floor(p.y / (T * 4));
    for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = fx + dx, y = fy + dy;
      if (x < 0 || y < 0 || x >= FOG || y >= FOG || dx * dx / 36 + dy * dy / 25 > 1) continue;
      if (!ws.fog[y * FOG + x]) (ws.fog[y * FOG + x] = 1), (ws.fogDirty = true);
    }
  }
}
/** enemy AI gate: residents sleep until a player comes near (or hits them) and walk home when left behind */
export function worldAwake(g, e, dt) {
  if (!e.home) return true;
  let d = 1e9;
  for (const p of g.alivePlayers()) d = Math.min(d, Math.hypot(p.x - e.x, p.y - e.y));
  if (!e.aggro && d < (e.elite ? 240 : 200)) e.aggro = 1;
  if (e.aggro && d > 560) (e.aggro = 0), (e.returning = true);
  if (e.aggro) return true;
  e.anim += dt;
  e.t += dt;
  if (e.returning) {
    const hx = e.home.x - e.x, hy = e.home.y - e.y, l = Math.hypot(hx, hy);
    if (l < 8) e.returning = false;
    else {
      const s = Math.min(l, ((e.def.spd || 50) + 30) * dt);
      e.x += (hx / l) * s;
      e.y += (hy / l) * s;
      e.face = hx < 0 ? -1 : 1;
    }
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
  }
  return false;
}
export function worldKilled(g, e) {
  const st = g.ws?.chunks.get(e.chunk);
  if (!st) return;
  st.alive[e.slot] = false;
  if (st.alive.every((v) => !v)) st.clearedAt = g.time;
}
const RESPAWN = 150; // s until a cleared chunk refills (this visit)
export function worldUpdate(g, dt) {
  const m = g.map, ws = g.ws, me = g.players.find((q) => q.local) || g.players[0];
  if (!ws || !me) return;
  const alive = g.alivePlayers();
  ws.tick = (ws.tick || 0) - dt;
  if (ws.tick <= 0) (ws.tick = 0.25), residents(g, ws, m, alive);
  ferry(g, ws, m, me, dt);
  // chests: walk into one to open it
  for (const c of m.chests) {
    if (ws.opened.has(c.id) || Math.abs(me.x - c.x) > 40 || Math.abs(me.y - c.y) > 40) continue;
    for (const p of alive) if (Math.hypot(p.x - c.x, p.y - c.y) < 30) {
      openWorldChest(g, c, p);
      break;
    }
  }
  // fog, region banner, autosave
  revealAround(g);
  const b = m.biome[tileIdx(m, me.x, me.y)];
  if (b !== ws.region) {
    if (ws.region >= 0 || !g.banner) g.banner = { text: BIOMES[b].name, sub: BIOMES[b].lv, t: 2.4 };
    ws.region = b;
  }
  ws.saveT -= dt;
  if (ws.saveT <= 0) (ws.saveT = 5), worldSaveNow(g);
}
// ---------------------------------------------------------------- the ferry
const BOAT_SPEED = 130; // px/s
/** stand still at a pier's end for a moment to board; the boat then carries you (and your pet) to the other pier */
function ferry(g, ws, m, me, dt) {
  const R = ws.ride;
  if (R) {
    R.t += dt;
    const k = Math.min(1, R.t / R.dur), u = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) ** 2;
    me.x = R.from.x + (R.to.x - R.from.x) * u;
    me.y = R.from.y + (R.to.y - R.from.y) * u + Math.sin(R.t * 3) * 1.5;
    me.invuln = Math.max(me.invuln || 0, 0.3);
    me.moving = false;
    me.face = R.to.x < R.from.x ? Math.PI : 0;
    if (me.pet) Object.assign(me.pet, { x: me.x - 14, y: me.y + 2, moving: false });
    if (k >= 1) {
      ws.ride = null;
      me.boat = false;
      ws.cool = 1.5;
      g.text(me.x, me.y - 70, "靠岸", "#fff6c0", 1.1, 1.2);
    }
    return;
  }
  ws.cool = Math.max(0, (ws.cool || 0) - dt);
  ws.hint = null;
  for (const f of m.ferries) for (const [from, to] of [[f.a, f.b], [f.b, f.a]]) {
    if (Math.hypot(me.x - from.x, me.y - from.y) > 30 || me.downed || flyingNow(me)) continue;
    ws.hint = { at: from, k: ws.board || 0 };
    if (ws.cool > 0 || me.moving) return void (ws.board = 0);
    ws.board = (ws.board || 0) + dt;
    if (ws.board >= 0.9) {
      ws.board = 0;
      ws.ride = { from: { x: me.x, y: me.y }, to, t: 0, dur: Math.hypot(to.x - me.x, to.y - me.y) / BOAT_SPEED };
      me.boat = true;
      g.sound("portal", 0.3);
      g.text(me.x, me.y - 70, f.name, "#9ef0ff", 1.2, 1.4);
    }
    return;
  }
  ws.board = 0;
}
const flyingNow = (p) => !!(p.mounted && p.pet?.id === "phoenix" && p.pet.stage === 3); // (a flier just flies over)
function boatSprite(g, x, y, sway) {
  const X = Math.round(x), Y = Math.round(y + sway), K = 1.35; // (drawn 1.35× so the hull shows round the rider)
  const r = (a, b, w, h, c) => ((g.fillStyle = c), g.fillRect(X + Math.round(a * K), Y + Math.round(b * K), Math.round(w * K), Math.round(h * K)));
  r(-30, 9, 60, 3, "rgba(255,255,255,0.4)"); // wake
  r(-28, -10, 56, 20, "#1a1020"); // outline
  r(-26, -9, 52, 6, "#c88a4a"); // gunwale
  r(-26, -9, 52, 1, "#f0c080");
  r(-22, -4, 44, 4, "#5a3418"); // the floor you stand on
  r(-26, 0, 52, 8, "#9a5e2c"); // hull side
  r(-26, 0, 52, 1, "#c88a4a");
  r(-20, 4, 40, 1, "#6a3c1c");
  r(-32, -14, 7, 14, "#1a1020"); r(25, -14, 7, 14, "#1a1020"); // bow and stern
  r(-31, -13, 5, 11, "#c88a4a"); r(26, -13, 5, 11, "#c88a4a");
  r(-31, -13, 5, 1, "#f0c080"); r(26, -13, 5, 1, "#f0c080");
}
/** in the world, under the sprites: the boats (docked at the far side, or carrying you) and the boarding ring */
export function drawWorldFloor(g, game, me, t) {
  const m = game.map, ws = game.ws;
  if (!ws || !m.ferries) return;
  for (const f of m.ferries) {
    if (ws.ride) boatSprite(g, me.x, me.y + 6, Math.sin(t * 3) * 1);
    else {
      // the boat waits at whichever pier you are nearer
      const near = Math.hypot(me.x - f.a.x, me.y - f.a.y) < Math.hypot(me.x - f.b.x, me.y - f.b.y) ? f.a : f.b;
      boatSprite(g, near.x + 38, near.y + 30, Math.sin(t * 2) * 1.5);
    }
  }
  const h = ws.hint;
  if (h && !ws.ride) {
    g.strokeStyle = "rgba(10,8,20,0.55)";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(h.at.x, h.at.y, 20, 9, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#9ef0ff";
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(h.at.x, h.at.y, 20, 9, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, h.k / 0.9));
    g.stroke();
  }
}
/** labels over the piers (screen text drawn by the renderer's outlined text) */
export function worldLabels(R, g, game, me) {
  const m = game.map, ws = game.ws;
  if (!ws || !m.ferries || ws.ride) return;
  for (const f of m.ferries) for (const at of [f.a, f.b]) {
    if (Math.abs(me.x - at.x) > 420 || Math.abs(me.y - at.y) > 260) continue;
    const near = ws.hint && ws.hint.at === at;
    R.text(g, near ? "站稳登船" : "渡口", at.x, at.y - 30 + Math.round(Math.sin(R.t * 3) * 1.5), near ? "#9ef0ff" : "#fff6c0", near ? 12 : 11);
  }
}

/** four times a second: residents of chunks coming into range wake into the world, far-away sleepers go back */
function residents(g, ws, m, alive) {
  // spawn the residents of chunks coming into range; put far-away sleepers back into their chunk
  for (const s of m.spawners) {
    const mx = s.cx * CPX + CPX / 2, my = s.cy * CPX + CPX / 2;
    let d = 1e9;
    for (const p of alive) d = Math.min(d, Math.hypot(p.x - mx, p.y - my));
    let st = ws.chunks.get(s.key);
    if (d > 980 || st?.active) continue;
    if (!st) ws.chunks.set(s.key, (st = { alive: s.list.map(() => true), active: false, clearedAt: -1 }));
    if (st.clearedAt >= 0) {
      if (g.time - st.clearedAt < RESPAWN) continue;
      st.alive.fill(true);
      st.clearedAt = -1;
    }
    st.active = true;
    for (const r of s.list) {
      if (!st.alive[r.k]) continue;
      const e = g.spawnEnemy(r.type, r.x, r.y, r.elite, 0);
      e.hp = e.maxHp = e.hp * r.mul;
      if (e.shieldMax) e.shieldHp = e.shieldMax = e.hp * 0.5;
      e.home = { x: r.x, y: r.y };
      e.chunk = s.key;
      e.slot = r.k;
      e.aggro = 0;
    }
  }
  for (const e of g.enemies) {
    if (!e.chunk || e.aggro || e.dead) continue;
    let d = 1e9;
    for (const p of alive) d = Math.min(d, Math.hypot(p.x - e.x, p.y - e.y));
    if (d < 1400) continue;
    e.dead = true;
    e.silent = true;
    const st = ws.chunks.get(e.chunk);
    if (st) st.active = false;
  }
  // a chunk whose residents are all gone (despawned or killed) can come back later
  const live = new Set();
  for (const e of g.enemies) if (e.chunk && !e.dead) live.add(e.chunk);
  for (const [k, st] of ws.chunks) if (st.active && !live.has(k)) st.active = false;
}
function openWorldChest(g, c, p) {
  const ws = g.ws;
  ws.opened.add(c.id);
  ws.chestsNow++;
  g.vfx("pickups/chest-open", c.x, c.y + 10, {});
  g.sound("pickup");
  for (let i = 0; i < (c.gold ? 10 : 5); i++) g.spawnCoin(c.x, c.y);
  if (c.gold) {
    const m = load(), n = 40;
    m.tokens += n;
    save();
    ws.gems += n;
    g.text(c.x, c.y - 40, `晶石 +${n}`, "#7fe0ff", 1.3, 1.8);
  }
  g.offerCards(p, 3, c.gold ? "SR" : null);
  worldSaveNow(g);
}
/** everyone down: wake up at the camp a moment later, with a third of the gold gone */
export function worldRespawn(g) {
  const m = g.map;
  g.players.forEach((p, i) => {
    p.x = m.spawn.x + (i % 2) * 26;
    p.y = m.spawn.y + (i >> 1) * 26;
    p.downed = false;
    p.dead = false;
    p.hp = p.maxHp;
    p.shield = p.maxShield;
    p.invuln = 2;
    p.coins = Math.floor((p.coins || 0) * 0.67);
    g.vfx("arcane/magic-circle-cast", p.x, p.y + 4, {});
  });
  for (const e of g.enemies) if (e.aggro) (e.aggro = 0), (e.returning = true);
  g.bullets = g.bullets.filter((b) => b.side !== "e");
  g.banner = { text: "在营地醒来", sub: "失去了三分之一的金币", t: 2.4 };
  g.sound("heal");
}

// ---------------------------------------------------------------- minimap (world view in the top-right) and lobby preview
let base = null, fogCv = null, fogImg = null;
function baseMap(m) {
  if (base) return base;
  base = document.createElement("canvas");
  base.width = m.W;
  base.height = m.H;
  const g = base.getContext("2d"), img = g.createImageData(m.W, m.H);
  for (let i = 0; i < m.W * m.H; i++) {
    const t = m.t[i], [r, gg, b] = BIOMES[m.biome[i]].mm;
    let c = [r, gg, b];
    if (t === WATER) c = m.biome[i] === 2 ? [150, 40, 20] : m.biome[i] === 3 ? [64, 196, 214] : [63, 150, 220];
    else if (m.road[i] === 2) c = [176, 122, 72];
    else if (t === WALL) c = [r * 0.55, gg * 0.55, b * 0.55];
    else if (m.road[i]) c = [200, 162, 106];
    else if (t === BUSH) c = [r * 0.8, gg * 0.85, b * 0.8];
    img.data.set([c[0], c[1], c[2], 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  return base;
}
function fogMap(ws) {
  if (!fogCv) {
    fogCv = document.createElement("canvas");
    fogCv.width = fogCv.height = FOG;
    fogImg = fogCv.getContext("2d").createImageData(FOG, FOG);
  }
  if (ws.fogDirty) {
    for (let i = 0; i < FOG * FOG; i++) fogImg.data.set(ws.fog[i] ? [0, 0, 0, 0] : [20, 14, 34, 255], i * 4);
    fogCv.getContext("2d").putImageData(fogImg, 0, 0);
    ws.fogDirty = false;
  }
  return fogCv;
}
export function drawMinimap(g, game, me) {
  const m = game.map, ws = game.ws;
  if (!ws || !me) return;
  const S = 64, X = 12, Y = 50, span = 96; // under the coin row, top-left (the right side holds the ult and mount buttons); 96×96 tiles round the player
  const tx = Math.max(0, Math.min(m.W - span, Math.floor(me.x / T) - span / 2)), ty = Math.max(0, Math.min(m.H - span, Math.floor(me.y / T) - span / 2));
  g.save();
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#140e22";
  g.fillRect(X - 3, Y - 3, S + 6, S + 6);
  g.drawImage(baseMap(m), tx, ty, span, span, X, Y, S, S);
  g.drawImage(fogMap(ws), tx / 4, ty / 4, span / 4, span / 4, X, Y, S, S);
  const k = S / span;
  for (const c of m.chests) {
    if (ws.opened.has(c.id)) continue;
    const cx = c.x / T - tx, cy = c.y / T - ty;
    if (cx < 0 || cy < 0 || cx >= span || cy >= span || !ws.fog[Math.floor(c.y / T / 4) * FOG + Math.floor(c.x / T / 4)]) continue;
    g.fillStyle = c.gold ? "#ffd84a" : "#e0a050";
    g.fillRect(X + Math.round(cx * k) - 1, Y + Math.round(cy * k) - 1, 3, 3);
  }
  for (const f of m.ferries || []) for (const at of [f.a, f.b]) {
    const fx = at.x / T - tx, fy = at.y / T - ty;
    if (fx >= 0 && fy >= 0 && fx < span && fy < span) (g.fillStyle = "#9ef0ff"), g.fillRect(X + Math.round(fx * k) - 1, Y + Math.round(fy * k) - 1, 3, 3);
  }
  const sx = m.spawn.x / T - tx, sy = m.spawn.y / T - ty;
  if (sx >= 0 && sy >= 0 && sx < span && sy < span) (g.fillStyle = "#7fe0ff"), g.fillRect(X + Math.round(sx * k) - 2, Y + Math.round(sy * k) - 2, 4, 4);
  for (const e of game.enemies) {
    if (!e.aggro) continue;
    const ex = e.x / T - tx, ey = e.y / T - ty;
    if (ex >= 0 && ey >= 0 && ex < span && ey < span) (g.fillStyle = "#ff4a5a"), g.fillRect(X + Math.round(ex * k), Y + Math.round(ey * k), 2, 2);
  }
  g.fillStyle = "#ffffff";
  g.fillRect(X + Math.round((me.x / T - tx) * k) - 1, Y + Math.round((me.y / T - ty) * k) - 1, 3, 3);
  g.strokeStyle = "#0c0814";
  g.lineWidth = 2;
  g.strokeRect(X - 2, Y - 2, S + 4, S + 4);
  g.strokeStyle = "#fff6c0";
  g.lineWidth = 1;
  g.strokeRect(X - 0.5, Y - 0.5, S + 1, S + 1);
  g.restore();
}
/** the lobby card: the whole world, unexplored parts dark */
let prevKey = null, prevUrl = null;
export function worldPreview() {
  const m = getWorld(), sv = loadWorldSave();
  if (prevKey === sv.fog && prevUrl) return prevUrl;
  const f = fogBytes(sv.fog), c = document.createElement("canvas");
  c.width = m.W;
  c.height = m.H;
  const g = c.getContext("2d");
  g.drawImage(baseMap(m), 0, 0);
  g.fillStyle = "rgba(20,14,34,0.72)";
  for (let i = 0; i < FOG * FOG; i++) if (!f[i]) g.fillRect((i % FOG) * 4, Math.floor(i / FOG) * 4, 4, 4);
  g.fillStyle = "#ffffff";
  g.fillRect(m.spawn.x / T - 2, m.spawn.y / T - 2, 5, 5);
  prevKey = sv.fog;
  return (prevUrl = c.toDataURL());
}
