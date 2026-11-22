// 梦境大陆 (大地图探索): one fixed 256×256-tile world, the same for every player, built from the seed in ~30 ms.
// It is an ordinary room map object (t / mud / crates …, plus biome + road layers), so movement, collision, enemy AI,
// bullets, pets and fx run on it unchanged. What is new lives here: the world generator, 16×16-tile ground tiles drawn
// on demand and kept in a small LRU cache, enemies that spawn and sleep per 16×16 chunk, world chests, the fog map,
// the minimap, and the world save (its own localStorage key; only differences from the generated world are stored).
// Co-op: the world is deterministic and enemies are host-simulated like room enemies, so a host would only need to
// send the enemies near its guests and the opened-chest list — not done yet (solo offline first).
import { T, VIEW_W, VIEW_H } from "./data.js";
import { THEMES, WALL, WATER, BUSH, CRATE, BARREL, F, CRATE_HP } from "./map.js";
import { load, save, mineState, grantCharacterXP } from "./save.js";
import { grantEggs, petState, addPool } from "./petsave.js";
import { ENEMIES } from "./data.js";
import { grantTitle } from "./titles.js";

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
  // three continents kept for the next maps: drawn and on the world map, but closed (a soft barrier turns you back)
  { id: "desert", name: "遗迹沙海", theme: -1, hazard: "mud", lv: "尚未开放", hp: 1.8, mm: [226, 196, 120], locked: true, pool: [], elite: [] },
  { id: "forest", name: "幽影森林", theme: -1, hazard: "mud", lv: "尚未开放", hp: 1.8, mm: [58, 122, 90], locked: true, pool: [], elite: [] },
  { id: "cloud", name: "云巅浮庭", theme: -1, hazard: "ice", lv: "尚未开放", hp: 1.8, mm: [224, 220, 240], locked: true, pool: [], elite: [] },
];
// the reserved regions' palettes (code-drawn ground, rock and bushes need only colours)
const NEW_THEMES = [
  { name: "遗迹沙海", g1: "#e8c878", g2: "#e0bf6c", gHi: "#f8e0a0", gLo: "#c8a050", dirt: "#c89858", dirtLo: "#a87840", top: "#d8b070", topHi: "#f0d090", front: "#a87840", frontLo: "#805a30", ink: "#2a1a10",
    bush: "#6a9a3a", bushHi: "#8ac050", bushLo: "#4a7a2a", water: "#3aa8c8", waterHi: "#8ae0f0", waterLo: "#2a7a9a", rim: "#f0e0b0", mud: "#c89050", mudHi: "#e0b070", flowers: ["#ff8a5a", "#ffe066", "#ffffff"] },
  { name: "幽影森林", g1: "#3a7a5a", g2: "#357352", gHi: "#4e9a70", gLo: "#2a5a42", dirt: "#6a5a3a", dirtLo: "#4a3e28", top: "#5a6a5a", topHi: "#7a8a78", front: "#3a4a3a", frontLo: "#2a362a", ink: "#0e1a12",
    bush: "#1e5a3a", bushHi: "#2e7a4e", bushLo: "#123a26", water: "#2a6a7a", waterHi: "#6ab0b8", waterLo: "#1a4a5a", rim: "#8ab89a", mud: "#2a4a3a", mudHi: "#4a6a4a", flowers: ["#c8a0ff", "#8ae0c0", "#ffffff"] },
  { name: "云巅浮庭", g1: "#e8e4f4", g2: "#e0dcee", gHi: "#ffffff", gLo: "#c8c0dc", dirt: "#d0c8e0", dirtLo: "#b0a8c8", top: "#f0ecfa", topHi: "#ffffff", front: "#a8a0c8", frontLo: "#8880a8", ink: "#1e1a30",
    bush: "#c8b8f0", bushHi: "#e8dcff", bushLo: "#9a88c8", water: "#8ab8f0", waterHi: "#d0e8ff", waterLo: "#6a90d0", rim: "#ffffff", mud: "#b8d0f0", mudHi: "#e8f4ff", flowers: ["#ffd0f0", "#c8e8ff", "#fff6c0"] },
];
for (const [k, th] of NEW_THEMES.entries()) (BIOMES[4 + k].theme = THEMES.length), THEMES.push(th);
// the world's rock: each region's look with stone instead of plank tops (big rock masses read as cliffs, not decks)
const STONE = [
  { top: "#a8aaa0", topHi: "#cfd0c4", front: "#6e7068", frontLo: "#52544c" },
  { top: "#c4d4e6", topHi: "#eef6ff", front: "#7d93b0", frontLo: "#5f7594" },
  { top: "#5e4c48", topHi: "#7c6660", front: "#3a2c2c", frontLo: "#261c1e" },
  { top: "#b8a8d8", topHi: "#e4dcf6", front: "#7a6aa8", frontLo: "#5a4a88" },
  { top: "#c8a070", topHi: "#e8c890", front: "#8a6440", frontLo: "#6a4a2c" },
  { top: "#5a6a62", topHi: "#7a8a80", front: "#3a4640", frontLo: "#28322c" },
  { top: "#dcd8ec", topHi: "#ffffff", front: "#9a94b8", frontLo: "#7a7498" },
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
// Continents in a sea (after the user's reference map): every region is a plate of land with a ragged coast, the
// plates are kept apart by straits; rivers wind through each one; bridges span the narrow straits and the rivers the
// roads cross, a ferry the wide one; the reserved continents have no crossing (and turn travellers back).
const PLATES = [
  { b: 0, x: 108, y: 150, r: 62 }, // 数据草原 (the camp)
  { b: 1, x: 54, y: 62, r: 50 }, // 显存冰原
  { b: 2, x: 176, y: 58, r: 52 }, // 算力熔炉
  { b: 4, x: 30, y: 188, r: 40 }, // 遗迹沙海 (reserved)
  { b: 5, x: 214, y: 150, r: 44 }, // 幽影森林 (reserved)
  { b: 6, x: 116, y: 22, r: 24 }, // 云巅浮庭 (reserved)
];
export function buildWorld(seed) {
  const W = WORLD_W, H = WORLD_H, N = W * H;
  const m = { W, H, kind: "world", world: true, seed, theme: 0, hazard: "mud", t: new Uint8Array(N), mud: new Uint8Array(N), biome: new Uint8Array(N), road: new Uint8Array(N), bdir: new Uint8Array(N),
    spikes: [], crates: {}, poison: [], decals: [], pxW: W * T, pxH: H * T, flowMax: 44 };
  m.biome.fill(3); // the sea
  m.t.fill(WATER);
  const isles = [[194, 222, 13], [234, 206, 9], [156, 238, 8]];
  m.isles = isles;
  const isleAt = (x, y) => {
    for (let k = 0; k < isles.length; k++) {
      const [cx, cy, r] = isles[k];
      if (Math.hypot(x - cx, y - cy) + fbm(x / 9, y / 9, seed + 26 + k) * 5 < r) return k;
    }
    return -1;
  };
  // each plate is a few overlapping lobes (peninsulas, bays), its distance the nearest lobe's
  const lobes = PLATES.map((P, k) => [[P.x, P.y, P.r * 0.78], ...[0, 1, 2].map((q) => {
    const a = hash(k, q, seed + 36) * Math.PI * 2, d = P.r * (0.35 + hash(q, k, seed + 37) * 0.25);
    return [P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, P.r * (0.42 + hash(k + 9, q, seed + 38) * 0.22)];
  })]);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x;
    const wx = x + fbm(x / 30, y / 30, seed + 21) * 20, wy = y + fbm(x / 30, y / 30, seed + 22) * 20;
    let k1 = -1, d1 = 9e9, d2 = 9e9, r1 = 1;
    lobes.forEach((Ls, k) => {
      let d = 9e9, rr = 1;
      for (const [lx, ly, lr] of Ls) {
        const dd = Math.hypot(wx - lx, wy - ly) - lr; // (distance past the lobe's rim, in tiles)
        if (dd < d) (d = dd), (rr = lr);
      }
      if (d < d1) (d2 = d1), (d1 = d), (k1 = k), (r1 = rr);
      else if (d < d2) d2 = d;
    });
    const P = PLATES[k1], coast = fbm(x / 11, y / 11, seed + 23) * 7 + fbm(x / 5, y / 5, seed + 24) * 2.5;
    const strait = d2 - d1 < 7 + fbm(x / 13, y / 13, seed + 29) * 4; // the channel between neighbouring plates
    if (d1 < coast && !strait) (m.biome[i] = P.b), (m.t[i] = F);
    else if (isleAt(x, y) >= 0) m.t[i] = F; // (biome 3: the islands)
  }
  // no specks: any scrap of land smaller than 160 tiles (cut off by a strait or a wiggly coast) goes back to the sea
  {
    const seen = new Uint8Array(N);
    for (let i0 = 0; i0 < N; i0++) {
      if (seen[i0] || m.t[i0] === WATER) continue;
      const comp = [i0];
      seen[i0] = 1;
      for (let h = 0; h < comp.length; h++) for (const j of [comp[h] + 1, comp[h] - 1, comp[h] + W, comp[h] - W]) if (!seen[j] && m.t[j] !== WATER) (seen[j] = 1), comp.push(j);
      if (comp.length < 160) for (const j of comp) (m.t[j] = WATER), (m.biome[j] = 3);
    }
  }
  // terrain on the land: ponds, rock, bushes, a few crates, the regions' floor hazard
  for (let i = 0; i < N; i++) {
    if (m.t[i] !== F) continue;
    const x = i % W, y = (i / W) | 0, b = m.biome[i];
    const e = fbm(x / 24, y / 24, seed + 1), mo = fbm(x / 15, y / 15, seed + 2), hz = fbm(x / 8, y / 8, seed + 3), r = hash(x, y, seed + 4);
    let t = F;
    if (e < -0.4 && b !== 3) t = WATER;
    else if (e > (b === 3 ? 0.45 : 0.36) && r > 0.06) t = WALL;
    else if (mo > (b === 2 ? 0.36 : 0.26) && r < 0.62) t = BUSH;
    else if (r < 0.008) t = CRATE;
    else if (r < 0.0105) t = BARREL;
    m.t[i] = t;
    if (t !== WATER && t !== WALL && hz > (b === 2 ? 0.34 : 0.4)) m.mud[i] = 1;
  }
  // rivers: from inside each continent they meander out to the coast, 1–2 tiles wide, in their region's colours
  PLATES.forEach((P, k) => {
    const n = P.r > 45 ? 3 : 2;
    for (let q = 0; q < n; q++) {
      // a source near the middle, flowing outward and meandering about that heading (not wandering in circles)
      const a0 = (q / n) * Math.PI * 2 + hash(k, q, seed + 33) * 1.6;
      let a = a0, x = P.x + Math.cos(a0) * P.r * 0.15, y = P.y + Math.sin(a0) * P.r * 0.15;
      const wide = hash(q, k, seed + 34) < 0.45;
      for (let s2 = 0; s2 < 160; s2++) {
        a = a0 + fbm(s2 / 14, k * 7 + q, seed + 35) * 1.4;
        x += Math.cos(a);
        y += Math.sin(a);
        const X = Math.round(x), Y = Math.round(y);
        if (X < 2 || Y < 2 || X > W - 3 || Y > H - 3) break;
        const j = Y * W + X;
        if (m.biome[j] === 3 && m.t[j] === WATER) break; // reached the sea
        for (const jj of wide ? [j, j + 1, j + W] : [j]) if (m.biome[jj] === P.b) (m.t[jj] = WATER), (m.mud[jj] = 0);
      }
    }
  });
  const land = (x, y) => m.t[y * W + x] !== WATER;
  const nudge = (x, y, b) => { // the nearest dry tile of that region
    for (let r2 = 0; r2 < 20; r2++) for (let dy = -r2; dy <= r2; dy++) for (let dx = -r2; dx <= r2; dx++) {
      const X = x + dx, Y = y + dy, j = Y * W + X;
      if (X > 2 && Y > 2 && X < W - 3 && Y < H - 3 && m.biome[j] === b && m.t[j] !== WATER) return [X, Y];
    }
    return [x, y];
  };
  const [sx, sy] = nudge(108, 196, 0);
  // roads: wobbly dirt paths; over a river or pond they become a little bridge, they stop at the sea
  let dirNow = 0; // the run's heading while carving: 1 = east–west (bridge boards stand upright), 0 = north–south
  const carve = (x, y, rad, force) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const X = Math.round(x + dx), Y = Math.round(y + dy);
      if (X < 2 || Y < 2 || X > W - 3 || Y > H - 3 || dx * dx + dy * dy > rad * rad + 0.5) continue;
      const j = Y * W + X;
      if (m.road[j] >= 2) continue;
      if (m.t[j] === WATER) {
        if (m.biome[j] === 3 && !force) continue;
        m.t[j] = F; m.mud[j] = 0; m.road[j] = 3; m.bdir[j] = dirNow; // a bridge
        continue;
      }
      m.t[j] = F; m.mud[j] = 0; m.road[j] = 1;
    }
  };
  const path = (ax, ay, bx, by, k) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    dirNow = Math.abs(bx - ax) > Math.abs(by - ay) ? 1 : 0;
    for (let s2 = 0; s2 <= n; s2++) {
      const q = s2 / n, w = Math.sin(q * Math.PI) * Math.min(12, n / 6);
      carve(ax + (bx - ax) * q + fbm(q * 6, k, seed + 31) * w, ay + (by - ay) * q + fbm(k, q * 6, seed + 32) * w, 1.3);
    }
  };
  // a crossing between two continents along the line of their centres: a bridge over a narrow strait, else a ferry
  m.ferries = [];
  const cross = (A, B, name, k) => {
    const l = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / l, uy = (B.y - A.y) / l, at = (s2) => [Math.round(A.x + ux * s2), Math.round(A.y + uy * s2)];
    const own = (s2, b) => { const [x, y] = at(s2), j = y * W + x; return m.biome[j] === b && m.t[j] !== WATER; };
    let a1 = 0;
    for (let s2 = 0; s2 < l; s2++) if (own(s2, A.b)) a1 = s2; else if (m.biome[at(s2)[1] * W + at(s2)[0]] !== A.b) break;
    let b1 = a1 + 1;
    while (b1 < l && !own(b1, B.b)) b1++;
    const gap = b1 - a1;
    if (gap <= 16) {
      dirNow = Math.abs(ux) > Math.abs(uy) ? 1 : 0;
      for (let s2 = a1; s2 <= b1; s2++) { const [x, y] = at(s2); carve(x, y, 1.1, true); }
      return { a: at(a1 - 1), b: at(b1 + 1) };
    }
    // a ferry: a 3-tile pier from each shore and a boat between their ends
    const pier = (s0, dir) => {
      for (let s3 = 1; s3 <= 3; s3++) {
        const [x, y] = at(s0 + dir * s3);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
          const j = (y + dy) * W + x + dx;
          if (m.t[j] === WATER) (m.t[j] = F), (m.road[j] = 2), (m.biome[j] = 3), (m.bdir[j] = Math.abs(ux) > Math.abs(uy) ? 1 : 0);
        }
      }
      const [x, y] = at(s0 + dir * 3);
      return { x: x * T + T, y: y * T + T };
    };
    m.ferries.push({ a: pier(a1, 1), b: pier(b1, -1), name });
    return { a: at(a1 - 1), b: at(b1 + 1) };
  };
  const hub = (P) => nudge(P.x, P.y, P.b);
  const G = PLATES[0], I = PLATES[1], L = PLATES[2], main = { x: isles[0][0], y: isles[0][1], b: 3 };
  const toIce = cross(G, I, "冰原长桥", 1), toLava = cross(G, L, "熔炉长桥", 2), toIsle = cross(G, main, "幻梦渡口", 3);
  const [gx, gy] = hub(G), [ix, iy] = hub(I), [lx, ly] = hub(L);
  path(sx, sy, gx, gy, 1);
  path(gx, gy, ...toIce.a, 2); path(...toIce.b, ix, iy, 3);
  path(gx, gy, ...toLava.a, 4); path(...toLava.b, lx, ly, 5);
  path(sx, sy, ...toIsle.a, 6); path(...toIsle.b, main.x, main.y, 7);
  // inside each region a second road to its far side (the boss arena), and a spur on the grassland
  const far = (P, ang) => nudge(Math.round(P.x + Math.cos(ang) * P.r * 0.55), Math.round(P.y + Math.sin(ang) * P.r * 0.55), P.b);
  const bossG = far(G, Math.PI * 0.95), bossI = far(I, -Math.PI * 0.75), bossL = far(L, -Math.PI * 0.3);
  path(gx, gy, ...bossG, 8); path(ix, iy, ...bossI, 9); path(lx, ly, ...bossL, 10); path(gx, gy, ...far(G, -Math.PI * 0.2), 11);
  // 传送门 and the region bosses' arenas
  const wpI = nudge(ix + 6, iy + 4, 1), wpL = nudge(lx - 6, ly + 4, 2), wpG = nudge(gx + 5, gy - 6, 0), wpS = nudge(...toIsle.b, 3);
  const wp = [["草原传送门", ...wpG], ["冰原传送门", ...wpI], ["熔炉传送门", ...wpL], ["群岛传送门", ...wpS]];
  m.waypoints = wp.map(([name, x, y], k) => ({ id: k, name, x: x * T + T / 2, y: y * T + T / 2 }));
  const bossAt = [["boss_eye", ...bossG, 0], ["boss_frost", ...bossI, 1], ["boss_core", ...bossL, 2], ["boss_baku", main.x, main.y, 3]];
  m.bosses = bossAt.map(([type, x, y, b], k) => ({ id: k, type, x: x * T + T / 2, y: y * T + T / 2, region: b }));
  const clear = (cx, cy, rx, ry) => {
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) if (dx * dx / (rx * rx) + dy * dy / (ry * ry) <= 1) {
      const j = (cy + dy) * W + cx + dx;
      if (cx + dx < 2 || cy + dy < 2 || cx + dx > W - 3 || cy + dy > H - 3 || (m.t[j] === WATER && m.biome[j] === 3) || m.road[j] >= 2) continue;
      m.t[j] = F; m.mud[j] = 0;
    }
  };
  for (const [, x, y] of wp) clear(x, y, 3, 3);
  for (const [, x, y] of bossAt) clear(x, y, 8, 6);
  clear(sx, sy, 7, 6); // the camp clearing
  // reach: walking from the camp, plus each island (by boat or wing); crates and barrels count (they break)
  const pass = (t) => t !== WALL && t !== WATER;
  let reach;
  const flood = () => {
    reach = new Uint8Array(N);
    const q = [sy * W + sx];
    for (const [cx, cy] of isles) { const [x, y] = nudge(cx, cy, 3); if (pass(m.t[y * W + x])) q.push(y * W + x); }
    for (const j of q) reach[j] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const j of [i + 1, i - 1, i + W, i - W]) if (!reach[j] && pass(m.t[j]) && !BIOMES[m.biome[j]].locked) (reach[j] = 1), q.push(j);
    }
  };
  flood();
  // land the rivers cut off: a short bridge to the nearest reachable bank (pockets of the open regions, a few rounds)
  for (let round = 0; round < 6; round++) {
    let built = 0;
    const seen = new Uint8Array(N);
    for (let i0 = 0; i0 < N; i0++) {
      if (reach[i0] || seen[i0] || !pass(m.t[i0]) || BIOMES[m.biome[i0]].locked || m.biome[i0] === 3) continue;
      const comp = [i0];
      seen[i0] = 1;
      for (let h = 0; h < comp.length; h++) for (const j of [comp[h] + 1, comp[h] - 1, comp[h] + W, comp[h] - W]) if (!seen[j] && pass(m.t[j]) && m.biome[j] === m.biome[i0]) (seen[j] = 1), comp.push(j);
      if (comp.length < 24) continue;
      let best = null;
      for (const i of comp) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let s2 = 2; s2 <= 7; s2++) {
        const j = i + dy * s2 * W + dx * s2;
        if (j < 0 || j >= N || (m.biome[j] === 3 && m.t[j] === WATER)) break;
        if (reach[j]) { if (!best || s2 < best[1]) best = [i, s2, dx, dy]; break; }
      }
      if (!best) continue;
      const [i, len, dx, dy] = best;
      for (let s2 = 0; s2 <= len; s2++) {
        const j = i + dy * s2 * W + dx * s2;
        for (const jj of [j, j + (dx ? W : 1)]) {
          if (m.t[jj] === WATER) (m.t[jj] = F), (m.road[jj] = 3), (m.mud[jj] = 0), (m.bdir[jj] = dx ? 1 : 0); // a little bridge over the river
          else if (m.t[jj] === WALL) (m.t[jj] = F), (m.mud[jj] = 0); // (a gap through a rock edge)
        }
      }
      built++;
    }
    if (!built) break;
    flood();
  }
  for (let i = 0; i < N; i++) if (m.t[i] === CRATE || m.t[i] === BARREL) m.crates[i] = { hp: m.t[i] === CRATE ? CRATE_HP : 12 };
  m.reach = reach;
  m.spawnT = { x: sx, y: sy };
  m.spawn = { x: sx * T + T / 2, y: sy * T + T / 2 };
  m.center = m.spawn;
  m.itemSpots = [m.spawn];
  const open = (x, y) => x > 1 && y > 1 && x < W - 2 && y < H - 2 && reach[y * W + x] && m.t[y * W + x] === F && !m.road[y * W + x];
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
      const b = BIOMES[m.biome[y * W + x]];
      if (b.locked) continue;
      const elite = hash(x, y, seed + 44) < 0.05 + dd / 3000;
      const pool = elite ? b.elite : b.pool, type = pool[Math.floor(hash(x, y, seed + 45) * pool.length)];
      list.push({ type, x: x * T + T / 2, y: y * T + T / 2, elite, k: k++, mul: (1 + dd / 100) * b.hp });
    }
    if (list.length) m.spawners.push({ key: cx + "," + cy, cx, cy, list });
  }
  // chests: one in most 32×32 blocks, tucked next to rock or bushes; far or hidden ones are golden; every island and
  // the larger islets only a flier reaches keep a golden one (a chest's id is its tile)
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
  const seen2 = new Uint8Array(N);
  for (let i0 = 0; i0 < N; i0++) {
    if (seen2[i0] || reach[i0] || m.t[i0] !== F || BIOMES[m.biome[i0]].locked) continue;
    const comp = [i0];
    seen2[i0] = 1;
    for (let h = 0; h < comp.length; h++) for (const j of [comp[h] + 1, comp[h] - 1, comp[h] + W, comp[h] - W]) if (!seen2[j] && m.t[j] !== WATER && !reach[j]) (seen2[j] = 1), comp.push(j);
    if (comp.length < 24 || m.chests.filter((q) => q.wing).length >= 6) continue;
    const c = comp.find((j) => m.t[j] === F) ?? comp[0];
    m.chests.push({ id: c, x: (c % W) * T + T / 2, y: Math.floor(c / W) * T + T / 2 + 4, gold: true, wing: true });
  }
  // 采集点: a region's material lying about (herbs / frost crystals / ember ore / dream sand), back every day
  m.nodes = [];
  for (let cy = 0; cy < H / CHUNK; cy++) for (let cx = 0; cx < W / CHUNK; cx++) {
    if (hash(cx, cy, seed + 61) > 0.42) continue;
    for (let tries = 0; tries < 20; tries++) {
      const x = cx * CHUNK + 2 + Math.floor(hash(cx * 13 + tries, cy, seed + 62) * (CHUNK - 4)), y = cy * CHUNK + 2 + Math.floor(hash(cx, cy * 13 + tries, seed + 63) * (CHUNK - 4));
      if (!open(x, y) || tdist(x, y) < 9 || m.chests.some((c) => c.id === y * W + x)) continue;
      m.nodes.push({ id: y * W + x, x: x * T + T / 2, y: y * T + T / 2 + 4, b: m.biome[y * W + x] });
      break;
    }
  }
  // the camp workshop (exchange materials) stands just north-east of the spawn
  const [wx2, wy2] = nudge(sx + 4, sy - 3, 0);
  m.shop = { x: wx2 * T + T / 2, y: wy2 * T + T / 2 };
  // the exploration count: only fog cells holding land you can reach (on foot, by boat or wing), so 100% is possible
  m.fogLand = new Uint8Array(64 * 64);
  for (let i = 0; i < N; i++) if (m.t[i] !== WATER && !BIOMES[m.biome[i]].locked) m.fogLand[Math.floor(((i / W) | 0) / 4) * 64 + Math.floor((i % W) / 4)] = 1;
  for (const [cx, cy, r] of isles) {
    if (m.chests.some((c) => Math.hypot(c.x / T - cx, c.y / T - cy) < r)) continue;
    for (let tries = 0; tries < 80; tries++) {
      const x = cx + Math.round((hash(cx, tries, seed + 55) - 0.5) * r), y = cy + Math.round((hash(tries, cy, seed + 56) - 0.5) * r);
      if (open(x, y)) { m.chests.push({ id: y * W + x, x: x * T + T / 2, y: y * T + T / 2 + 4, gold: true }); break; }
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
  const land = (x, y) => x >= 0 && y >= 0 && x < W && y < m.H && m.t[y * W + x] !== WATER && m.road[y * W + x] < 2;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const gx = x0 + x, gy = y0 + y, i = gy * W + gx;
    if (m.t[i] === WATER || m.road[i] >= 2) continue;
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
    if (m.road[i] < 2) continue;
    const th = thOf(i), X = x * T, Y = y * T, br = (j) => m.road[j] >= 2, across = m.bdir[i] === 1; // (an east–west run: boards stand upright)
    px(X, Y, T, T, th.water);
    for (let k = 0; k < 4; k++) {
      if (across) {
        px(X + k * 8, Y, 7, T, "#b07a48"); px(X + k * 8, Y, 1, T, "#e8c08a"); px(X + k * 8 + 6, Y, 1, T, "#6a4428");
        px(X + k * 8 + 3, Y + ((gy * 7 + k * 11) % 20) + 4, 1, 2, "#8a5a34");
      } else {
        px(X, Y + k * 8, T, 7, "#b07a48"); px(X, Y + k * 8, T, 1, "#e8c08a"); px(X, Y + k * 8 + 6, T, 1, "#6a4428");
        px(X + ((gx * 7 + k * 11) % 20) + 4, Y + k * 8 + 3, 2, 1, "#8a5a34");
      }
    }
    if (across) {
      if (!br(i - W)) px(X, Y, T, 2, "#4a2e1c");
      if (!br(i + W)) px(X, Y + T - 2, T, 2, "#4a2e1c");
    } else {
      if (!br(i - 1)) px(X, Y, 2, T, "#4a2e1c");
      if (!br(i + 1)) px(X + T - 2, Y, 2, T, "#4a2e1c");
    }
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
    if (d && d.v === 1) return { opened: [], fog: "", gates: [], bossDay: {}, flag: null, mats: [0, 0, 0, 0], nodeDay: {}, miles: [], ...d };
  } catch (e) {}
  return { v: 1, opened: [], fog: "", x: null, y: null, chests: 0, visits: 0, gates: [], bossDay: {}, flag: null, mats: [0, 0, 0, 0], nodeDay: {}, miles: [] };
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
export function explored(fog, mask = getWorld().fogLand) {
  let n = 0, all = 0;
  for (let i = 0; i < fog.length; i++) if (mask[i]) (all++, (n += fog[i]));
  return all ? Math.min(100, Math.floor((n / all) * 100)) : 0;
}
export function worldSaveNow(g) {
  const ws = g.ws, p = g.players.find((q) => q.local) || g.players[0];
  if (!ws) return;
  const d = { v: 1, opened: [...ws.opened], fog: fogString(ws.fog), x: p && !p.downed && !ws.ride ? Math.round(p.x) : null, y: p && !p.downed && !ws.ride ? Math.round(p.y) : null, chests: ws.opened.size, visits: ws.visits, gates: [...ws.gates], bossDay: ws.bossDay, flag: ws.flag, mats: ws.mats, nodeDay: ws.nodeDay, miles: ws.miles };
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
  g.ws = { chunks: new Map(), opened: new Set(sv.opened), fog: fogBytes(sv.fog), fogDirty: true, region: -1, saveT: 4, visits: (sv.visits || 0) + 1, gems: 0, chestsNow: 0,
    gates: new Set(sv.gates), bossDay: sv.bossDay || {}, flag: sv.flag, loot: {}, bossesNow: 0,
    mats: [0, 1, 2, 3].map((k) => sv.mats?.[k] || 0), nodeDay: sv.nodeDay || {}, miles: sv.miles || [], shopArmed: true };
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
  if (!e.aggro && d < (e.worldBoss ? 280 : e.elite ? 240 : 200)) e.aggro = 1;
  if (e.aggro && d > (e.worldBoss ? 780 : 560)) (e.aggro = 0), (e.returning = true);
  if (e.worldBoss && e.aggro) {
    g.map.center = e.arena; // (boss attacks that work round "the room's centre" use its arena)
    if (!e.announced) (e.announced = true), (g.banner = { text: e.def.name, sub: "区域首领 · " + (e.def.title || ""), t: 3, boss: true }), g.sound("boss");
  }
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
const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
function award(g, label, n, col = "#ffe36a") {
  const ws = g.ws;
  ws.loot[label] = (ws.loot[label] || 0) + n;
  return `${label} +${n}`;
}
/** 局外养成: what the world hands out goes straight into the save (晶石, 宠物蛋, 淬灵露 / 流彩晶, 星砂, 宠物经验池, 角色经验) */
function grant(g, kind, n) {
  const m = load(), me = g.players.find((q) => q.local) || g.players[0];
  if (kind === "gems") (m.tokens += n), save(), (g.ws.gems += n);
  else if (kind === "egg_base" || kind === "egg_ur" || kind === "egg_hur") grantEggs(n, kind.slice(4));
  else if (kind === "ur" || kind === "hur") {
    const ps = petState();
    ps.items[kind] = (ps.items[kind] || 0) + n;
    save();
  } else if (kind === "stars") (mineState().stars += n), save();
  else if (kind === "pool") addPool(n);
  else if (kind === "xp" && me) grantCharacterXP(me.cid, n);
  else if (kind.startsWith("mat")) g.ws.mats[+kind[3]] += n;
  return award(g, LOOT_NAME[kind], n);
}
// the four regions' materials (by biome index): spent at the camp workshop
export const MATS = [{ name: "草芯", col: "#8ad85a" }, { name: "霜晶", col: "#9ad8ff" }, { name: "熔核", col: "#ff8a3a" }, { name: "梦砂", col: "#c8a0ff" }];
export const LOOT_NAME = { gems: "晶石", egg_base: "宠物蛋", egg_ur: "UR 宠物蛋", egg_hur: "HUR 宠物蛋", ur: "淬灵露", hur: "流彩晶", stars: "星砂", pool: "宠物经验池", xp: "角色经验", mat0: "草芯", mat1: "霜晶", mat2: "熔核", mat3: "梦砂" };
// 营地工坊: materials into lasting rewards. cost: [草芯, 霜晶, 熔核, 梦砂]; once: a title, bought a single time
export const WORKSHOP = [
  { id: "pool", give: ["pool", 200], cost: [8, 0, 0, 0] },
  { id: "ur", give: ["ur", 1], cost: [6, 4, 0, 0] },
  { id: "stars", give: ["stars", 10], cost: [0, 0, 5, 0] },
  { id: "egg_ur", give: ["egg_ur", 1], cost: [0, 8, 8, 0] },
  { id: "hur", give: ["hur", 1], cost: [0, 0, 6, 10] },
  { id: "egg_hur", give: ["egg_hur", 1], cost: [0, 10, 10, 15] },
  { id: "title", give: ["title", 1], cost: [20, 20, 20, 20], once: "world_walker" },
];
export function workshopBuy(g, offer) {
  const ws = g.ws;
  if (offer.once && titleOwned(offer.once)) return "已兑换";
  if (offer.cost.some((c, k) => ws.mats[k] < c)) return "材料不足";
  offer.cost.forEach((c, k) => (ws.mats[k] -= c));
  if (offer.once) grantTitle(offer.once), award(g, "称号「大陆旅者」", 1);
  else grant(g, ...offer.give);
  worldSaveNow(g);
  return null;
}
const titleOwned = (id) => !!load().titles?.own?.[id];
const roll = (table) => {
  let x = Math.random();
  for (const r of table) if ((x -= r[0]) < 0) return r.slice(1);
  return table.at(-1).slice(1);
};
function showLoot(g, x, y, lines) {
  lines.forEach((t, k) => g.after(k * 0.28, () => g.text(x, y - 50 - k * 4, t, k ? "#ffe36a" : "#7fe0ff", 1.15, 2)));
}
export function worldKilled(g, e) {
  if (e.worldBoss && g.ws) {
    // a region boss: today's kill (it is back tomorrow) and its loot
    const ws = g.ws;
    ws.bossDay[e.worldBoss - 1] = dayKey();
    ws.bossesNow++;
    g.map.center = g.map.spawn;
    const lines = [grant(g, "gems", 200), grant(g, "xp", 300), grant(g, "ur", 2), grant(g, "mat" + g.map.bosses[e.worldBoss - 1].region, 10)];
    lines.push(Math.random() < 0.25 ? grant(g, "egg_hur", 1) : grant(g, "egg_ur", 1));
    if (Math.random() < 0.35) lines.push(grant(g, "hur", 1));
    showLoot(g, e.x, e.y - 30, lines);
    worldSaveNow(g);
    return;
  }
  // an elite: a skill card for this visit's build (the world's chests give lasting rewards instead)
  if (e.elite && g.ws) {
    const p = e.lastBy ? g.player(e.lastBy) : null, b = g.map.biome[tileIdx(g.map, e.x, e.y)];
    if (b <= 3) g.text(e.x, e.y - 40, grant(g, "mat" + b, 2), MATS[b].col, 1.1, 1.6);
    g.after(0.4, () => g.offerCards(p || g.players[0], 3));
  }
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
  // 采集点: walk into one to gather it (back tomorrow)
  const today = dayKey();
  for (const n of m.nodes) {
    if (ws.nodeDay[n.id] === today || Math.abs(me.x - n.x) > 26 || Math.abs(me.y - n.y) > 26) continue;
    ws.nodeDay[n.id] = today;
    const k = 2 + ((n.id * 7) % 2);
    g.text(n.x, n.y - 40, grant(g, "mat" + n.b, k), MATS[n.b].col, 1.1, 1.6);
    g.vfx("pickups/collect-burst", n.x, n.y - 8, { palette: ["#140e22", "#3a2a5a", MATS[n.b].col, "#ffffff"] });
    g.sound("pickup", 0.1);
  }
  // 营地工坊: stand by it a moment to open the exchange (step away to arm it again)
  const ds = Math.hypot(me.x - m.shop.x, me.y - (m.shop.y + 20));
  if (ds > 80) ws.shopArmed = true;
  ws.shopT = ds < 40 && ws.shopArmed && !me.moving ? (ws.shopT || 0) + dt : 0;
  if (ws.shopT > 0.5) (ws.shopT = 0), (ws.shopArmed = false), g.onUi("worldShop");
  // 传送门: walk up to one to light it
  for (const w of m.waypoints) if (!ws.gates.has(w.id) && Math.hypot(me.x - w.x, me.y - w.y) < 34) {
    ws.gates.add(w.id);
    g.text(w.x, w.y - 60, `${w.name} · 已点亮`, "#9ef0ff", 1.3, 1.8);
    g.vfx("holy/sunburst", w.x, w.y - 20, { palette: ["#06121e", "#0a3a5a", "#1a7ab0", "#3ac0e8", "#9ef0ff", "#ffffff", "#ffffff", "#ffffff"] });
    g.sound("portal", 0.3);
    worldSaveNow(g);
  }
  // chests: walk into one to open it
  for (const c of m.chests) {
    if (ws.opened.has(c.id) || Math.abs(me.x - c.x) > 40 || Math.abs(me.y - c.y) > 40) continue;
    for (const p of alive) if (Math.hypot(p.x - c.x, p.y - c.y) < 30) {
      openWorldChest(g, c, p);
      break;
    }
  }
  // the reserved continents turn travellers back (fliers too)
  const bHere = m.biome[tileIdx(m, me.x, me.y)];
  if (BIOMES[bHere].locked && !ws.ride) {
    if (ws.safe) (me.x = ws.safe.x), (me.y = ws.safe.y);
    if ((ws.lockT || 0) < g.time) (ws.lockT = g.time + 1.5), g.text(me.x, me.y - 70, `「${BIOMES[bHere].name}」尚未开放`, "#ffb0bc", 1.2, 1.4);
  } else ws.safe = { x: me.x, y: me.y };
  // fog, region banner, exploration milestones, autosave
  revealAround(g);
  if (ws.fogDirty || ws.mileT === undefined) {
    const pct = explored(ws.fog, m.fogLand);
    for (const [at, kind, n, title] of MILES) if (pct >= at && !ws.miles.includes(at)) {
      ws.miles.push(at);
      const lines = [`探索度 ${at}%`, grant(g, kind, n)];
      if (title && grantTitle(title)) lines.push(`称号「${title === "world_explorer" ? "大陆探险家" : "大陆制图师"}」`);
      showLoot(g, me.x, me.y - 20, lines);
      worldSaveNow(g);
    }
    ws.mileT = 0;
  }
  const ti = tileIdx(m, me.x, me.y), b = m.biome[ti], atSea = b === 3 && (m.t[ti] === WATER || m.road[ti] >= 2); // (a bridge or the open sea is no region)
  if (b !== ws.region && !atSea) {
    if (ws.region >= 0 || !g.banner) g.banner = { text: BIOMES[b].name, sub: BIOMES[b].lv, t: 2.4 };
    ws.region = b;
  }
  ws.saveT -= dt;
  if (ws.saveT <= 0) (ws.saveT = 5), worldSaveNow(g);
}
// ---------------------------------------------------------------- the ferry
const BOAT_SPEED = 170; // px/s
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
function gateSprite(g, x, y, lit, t) {
  const r = (a, b, w, h, c) => ((g.fillStyle = c), g.fillRect(Math.round(x + a), Math.round(y + b), w, h));
  g.fillStyle = "rgba(10,8,20,0.35)";
  g.beginPath();
  g.ellipse(x, y + 8, 26, 9, 0, 0, Math.PI * 2);
  g.fill();
  r(-24, 0, 48, 10, "#1a1020"); r(-22, 1, 44, 7, "#8a8aa0"); r(-22, 1, 44, 2, "#c8c8dc"); // plinth
  r(-20, -44, 10, 46, "#1a1020"); r(10, -44, 10, 46, "#1a1020"); // pillars
  r(-18, -42, 6, 43, "#a8a8bc"); r(12, -42, 6, 43, "#a8a8bc"); r(-18, -42, 2, 43, "#dcdcec"); r(12, -42, 2, 43, "#dcdcec");
  r(-22, -50, 44, 8, "#1a1020"); r(-20, -49, 40, 5, "#c8c8dc"); // lintel
  const glow = lit ? 0.55 + 0.25 * Math.sin(t * 3) : 0.12;
  g.fillStyle = lit ? `rgba(120,230,255,${glow})` : "rgba(140,140,170,0.25)";
  g.fillRect(Math.round(x - 10), Math.round(y - 40), 20, 40);
  const cy = y - 24 + Math.sin(t * 2) * 2;
  r(-5, cy - y - 8, 10, 16, "#1a1020"); r(-3, cy - y - 6, 6, 12, lit ? "#9ef0ff" : "#7a7a90"); r(-3, cy - y - 6, 2, 5, "#ffffff");
}
function flagSprite(g, x, y, t) {
  const r = (a, b, w, h, c) => ((g.fillStyle = c), g.fillRect(Math.round(x + a), Math.round(y + b), w, h));
  g.fillStyle = "rgba(10,8,20,0.35)";
  g.beginPath();
  g.ellipse(x, y + 2, 10, 4, 0, 0, Math.PI * 2);
  g.fill();
  r(-2, -46, 4, 48, "#1a1020"); r(-1, -45, 2, 46, "#e8d8b0");
  for (let k = 0; k < 18; k++) {
    const w = Math.round(Math.sin(t * 6 - k * 0.5) * 2);
    r(1 + k, -44 + w, 1, 14, k % 6 < 3 ? "#ff6ab8" : "#ff9ad0");
  }
  r(1, -45, 18, 1, "#1a1020");
}
export function drawWorldFloor(g, game, me, t) {
  const m = game.map, ws = game.ws;
  if (!ws || !m.ferries) return;
  const near = (o, k = 700) => Math.abs(o.x - me.x) < k && Math.abs(o.y - me.y) < k * 0.7;
  // a boss arena: a dark ring on the ground
  for (const B of m.bosses) if (near(B, 800)) {
    g.strokeStyle = "rgba(80,10,40,0.35)";
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(B.x, B.y, 9 * T - 10, 7 * T - 10, 0, 0, Math.PI * 2);
    g.stroke();
  }
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
// 采集点 by region: a herb clump, a frost crystal, an ember ore, a dream-sand mound
function nodeSprite(g, x, y, b, t) {
  const r = (a, c, w, h, col) => ((g.fillStyle = col), g.fillRect(Math.round(x + a), Math.round(y + c), w, h));
  g.fillStyle = "rgba(10,8,20,0.3)";
  g.beginPath();
  g.ellipse(x, y + 2, 11, 4, 0, 0, Math.PI * 2);
  g.fill();
  const tw = Math.sin(t * 4 + x) > 0.85; // a glint now and then
  if (b === 0) {
    r(-8, -10, 16, 12, "#1a1020"); r(-7, -9, 6, 10, "#5aa83a"); r(-1, -12, 6, 13, "#6fbf48"); r(4, -8, 4, 9, "#4a8a2a");
    r(-5, -7, 2, 2, "#ffe066"); r(2, -10, 2, 2, "#ffffff"); r(5, -6, 2, 2, "#ff8ac0");
  } else if (b === 1) {
    r(-7, -18, 14, 20, "#1a1020"); r(-5, -16, 5, 17, "#9ad8ff"); r(0, -14, 5, 15, "#c8ecff"); r(-6, -6, 4, 7, "#6ab4e0"); r(-4, -15, 1, 8, "#ffffff");
  } else if (b === 2) {
    r(-9, -9, 18, 11, "#1a1020"); r(-8, -8, 16, 9, "#4a3a38"); r(-6, -6, 3, 3, "#ff8a3a"); r(1, -7, 4, 3, "#ffc23a"); r(3, -3, 3, 2, "#ff6a2a");
  } else {
    r(-9, -6, 18, 8, "#1a1020"); r(-8, -5, 16, 6, "#c8a0ff"); r(-5, -8, 10, 4, "#1a1020"); r(-4, -7, 8, 3, "#e8d0ff"); r(-2, -6, 2, 2, "#ffffff");
  }
  if (tw) r(-1, -20, 2, 5, "#ffffff"), r(-3, -18, 6, 1, "#ffffff");
}
function shopSprite(g, x, y, t) {
  const r = (a, c, w, h, col) => ((g.fillStyle = col), g.fillRect(Math.round(x + a), Math.round(y + c), w, h));
  g.fillStyle = "rgba(10,8,20,0.35)";
  g.beginPath();
  g.ellipse(x, y + 22, 36, 10, 0, 0, Math.PI * 2);
  g.fill();
  r(-34, -2, 68, 26, "#1a1020"); r(-32, 0, 64, 22, "#9a5e2c"); r(-32, 0, 64, 3, "#c88a4a"); // counter
  r(-26, 6, 10, 8, "#5aa83a"); r(-12, 5, 9, 9, "#9ad8ff"); r(2, 7, 9, 7, "#ff8a3a"); r(16, 6, 9, 8, "#c8a0ff"); // the four materials on display
  r(-32, -40, 4, 40, "#1a1020"); r(28, -40, 4, 40, "#1a1020"); r(-31, -40, 2, 40, "#c88a4a"); r(29, -40, 2, 40, "#c88a4a"); // posts
  for (let k = 0; k < 8; k++) r(-36 + k * 9, -48 + (k % 2), 9, 12, k % 2 ? "#ffe8c0" : "#ff6a8a"); // awning
  r(-36, -49, 72, 2, "#1a1020"); r(-36, -36, 72, 2, "#1a1020");
  r(-8, -30, 16, 14, "#1a1020"); r(-7, -29, 14, 12, "#ffd84a"); r(-3, -26, 6, 6, "#9a5e2c"); // a hammer sign
}
/** the world's standing things (传送门, your flag, 采集点, the workshop), y-sorted with the characters by the renderer */
export function worldSprites(game, me) {
  const m = game.map, ws = game.ws, out = [];
  if (!ws || !me) return out;
  const near = (o) => Math.abs(o.x - me.x) < 520 && Math.abs(o.y - me.y) < 340, today = dayKey();
  for (const n of m.nodes) if (ws.nodeDay[n.id] !== today && near(n)) out.push({ y: n.y, draw: (g, t) => nodeSprite(g, n.x, n.y, n.b, t) });
  if (near(m.shop)) out.push({ y: m.shop.y + 22, draw: (g, t) => shopSprite(g, m.shop.x, m.shop.y, t) });
  for (const w of m.waypoints) if (near(w)) out.push({ y: w.y + 6, draw: (g, t) => gateSprite(g, w.x, w.y, ws.gates.has(w.id), t) });
  if (ws.flag && near(ws.flag)) out.push({ y: ws.flag.y, draw: (g, t) => flagSprite(g, ws.flag.x, ws.flag.y, t) });
  return out;
}
/** labels over the piers (screen text drawn by the renderer's outlined text) */
export function worldLabels(R, g, game, me) {
  const m = game.map, ws = game.ws;
  if (!ws || !m.ferries || ws.ride) return;
  for (const w of m.waypoints) if (Math.abs(me.x - w.x) < 420 && Math.abs(me.y - w.y) < 260) R.text(g, w.name, w.x, w.y - 64, ws.gates.has(w.id) ? "#9ef0ff" : "#c8c8dc", 11);
  if (Math.abs(me.x - m.shop.x) < 420 && Math.abs(me.y - m.shop.y) < 260) R.text(g, ws.shopT > 0 ? "站稳打开" : "营地工坊", m.shop.x, m.shop.y - 60, ws.shopT > 0 ? "#9ef0ff" : "#ffe36a", 12);
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
    if (!(e.chunk || e.worldBoss) || e.aggro || e.dead) continue;
    let d = 1e9;
    for (const p of alive) d = Math.min(d, Math.hypot(p.x - e.x, p.y - e.y));
    if (d < 1400) continue;
    e.dead = true;
    e.silent = true;
    const st = ws.chunks.get(e.chunk);
    if (st) st.active = false;
  }
  // region bosses: one a region in its arena, back every day (local date) after it falls
  const today = dayKey();
  for (const B of m.bosses) { // (region bosses)
    if (ws.bossDay[B.id] === today || g.enemies.some((e) => e.worldBoss === B.id + 1)) continue;
    let d = 1e9;
    for (const p of alive) d = Math.min(d, Math.hypot(p.x - B.x, p.y - B.y));
    if (d > 900) continue;
    const e = g.spawnEnemy(B.type, B.x, B.y, false, 0), mul = BIOMES[B.region].hp * 0.9; // (about a dungeon boss's life: the world's builds are thinner)
    e.hp = e.maxHp = e.hp * mul;
    e.home = { x: B.x, y: B.y };
    e.arena = { x: B.x, y: B.y };
    e.worldBoss = B.id + 1;
    e.aggro = 0;
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
  // lasting rewards (no skill cards: that is what the dungeon's chests are for)
  const lines = c.gold
    ? [grant(g, "gems", 60), grant(g, "xp", 120), grant(g, ...roll([[0.35, "ur", 2], [0.3, "egg_ur", 1], [0.2, "hur", 1], [0.1, "stars", 10], [0.05, "egg_hur", 1]]))]
    : [grant(g, "gems", 20), grant(g, ...roll([[0.45, "pool", 60], [0.25, "stars", 3], [0.15, "ur", 1], [0.1, "egg_base", 1], [0.05, "egg_ur", 1]]))];
  const b = g.map.biome[tileIdx(g.map, c.x, c.y)];
  if (b <= 3) lines.push(grant(g, "mat" + b, c.gold ? 5 : 2));
  showLoot(g, c.x, c.y, lines);
  worldSaveNow(g);
}
// exploration milestones: [%, reward, amount, title]
const MILES = [[10, "gems", 150], [25, "egg_ur", 1], [50, "hur", 1, "world_explorer"], [75, "egg_hur", 1], [100, "hur", 3, "world_cartographer"]];
// ---------------------------------------------------------------- travel: 回营地 / 旗帜 / 传送门
export const inCombat = (g) => g.enemies.some((e) => e.aggro && !e.dead);
/** jump to a point (the map panel's buttons); refused while something is chasing you or on the boat */
export function worldTeleport(g, to, name) {
  const me = g.players.find((q) => q.local) || g.players[0];
  if (!me || !g.ws || g.ws.ride) return "坐船中不能传送";
  if (me.downed) return "倒地中不能传送";
  if (inCombat(g)) return "战斗中不能传送";
  g.vfx("arcane/blink-out", me.x, me.y - 10, {});
  g.players.forEach((p, i) => {
    p.x = to.x + (i % 2) * 26;
    p.y = to.y + 18 + (i >> 1) * 26;
    p.invuln = Math.max(p.invuln || 0, 1);
    if (p.mounted && p.pet?.id === "phoenix") Object.assign(p.pet, { x: p.x, y: p.y });
  });
  for (const p of g.players) if (p.pet && !p.mounted) Object.assign(p.pet, { x: p.x - 16, y: p.y + 10, route: [], nav: null });
  g.bullets = g.bullets.filter((b) => b.side !== "e");
  g.vfx("arcane/blink-in", me.x, me.y - 10, {});
  g.sound("portal", 0.3);
  g.banner = { text: name, sub: "传送完成", t: 1.6 };
  revealAround(g);
  worldSaveNow(g);
  return null;
}
/** plant (or move) your flag where you stand: travel back to it later, this visit or the next */
export function placeFlag(g) {
  const me = g.players.find((q) => q.local) || g.players[0], m = g.map;
  if (!me || g.ws.ride) return "坐船中不能插旗";
  if (me.downed) return "倒地中不能插旗";
  const i = tileIdx(m, me.x, me.y);
  if (m.t[i] !== F && m.t[i] !== BUSH) return "这里不能插旗";
  g.ws.flag = { x: Math.round(me.x), y: Math.round(me.y) };
  g.text(me.x, me.y - 70, "插下旗帜", "#ff8ad8", 1.2, 1.4);
  g.sound("pickup");
  worldSaveNow(g);
  return null;
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
    else if (m.road[i] >= 2) c = [176, 122, 72];
    if (BIOMES[m.biome[i]].locked) c = c.map((v) => v * 0.62 + 30);
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
/** the HUD minimap: a small canvas in the top-left corner (drawn ~8 times a second, not every frame); tap → the world map */
let miniT = 0;
export function drawMiniHud(game, me, now) {
  const cv = document.querySelector(".hud .wmini");
  if (!cv || !game.ws || !me || now - miniT < 120) return;
  miniT = now;
  const m = game.map, ws = game.ws, g = cv.getContext("2d"), S = cv.width, span = 80, k = S / span;
  const tx = Math.max(0, Math.min(m.W - span, Math.floor(me.x / T) - span / 2)), ty = Math.max(0, Math.min(m.H - span, Math.floor(me.y / T) - span / 2));
  g.imageSmoothingEnabled = false;
  g.drawImage(baseMap(m), tx, ty, span, span, 0, 0, S, S);
  g.drawImage(fogMap(ws), tx / 4, ty / 4, span / 4, span / 4, 0, 0, S, S);
  const dot = (x, y, c, r = 2) => {
    const X = (x / T - tx) * k, Y = (y / T - ty) * k;
    if (X >= -r && Y >= -r && X < S + r && Y < S + r) (g.fillStyle = c), g.fillRect(Math.round(X - r), Math.round(Y - r), r * 2 + 1, r * 2 + 1);
  };
  const seen = (o) => ws.fog[Math.floor(o.y / T / 4) * FOG + Math.floor(o.x / T / 4)];
  for (const c of m.chests) if (!ws.opened.has(c.id) && seen(c)) dot(c.x, c.y, c.gold ? "#ffd84a" : "#e0a050", 1.5);
  for (const f of m.ferries || []) for (const at of [f.a, f.b]) if (seen(at)) dot(at.x, at.y, "#9ef0ff", 2);
  for (const w of m.waypoints) dot(w.x, w.y, ws.gates.has(w.id) ? "#3ac0e8" : "#8a8aa0", 2.5);
  for (const B of m.bosses) if (ws.bossDay[B.id] !== dayKey()) dot(B.x, B.y, "#ff3a6a", 2.5);
  if (ws.flag) dot(ws.flag.x, ws.flag.y, "#ff6ab8", 2.5);
  dot(m.spawn.x, m.spawn.y, "#7fe0ff", 3);
  for (const e of game.enemies) if (e.aggro) dot(e.x, e.y, "#ff4a5a", 1);
  dot(me.x, me.y, "#ffffff", 2.5);
}
export { baseMap, fogMap, FOG, dayKey };
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
