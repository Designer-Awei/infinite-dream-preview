// 梦境大陆 (大地图探索): one fixed 256×256-tile world, the same for every player, built from the seed in ~30 ms.
// It is an ordinary room map object (t / mud / crates …, plus biome + road layers), so movement, collision, enemy AI,
// bullets, pets and fx run on it unchanged. What is new lives here: the world generator, 16×16-tile ground tiles drawn
// on demand and kept in a small LRU cache, enemies that spawn and sleep per 16×16 chunk, world chests, the fog map,
// the minimap, and the world save (its own localStorage key; only differences from the generated world are stored).
// Co-op: the world is deterministic and enemies are host-simulated like room enemies, so a host would only need to
// send the enemies near its guests and the opened-chest list — not done yet (solo offline first).
import { T, VIEW_W, VIEW_H } from "./data.js";
import { input } from "./input.js";
const talkHint = () => (input.touch ? "按攻击键交谈" : "按 J 交谈");
import { THEMES, WALL, WATER, BUSH, CRATE, BARREL, F, CRATE_HP } from "./map.js";
import { load, save, mineState, grantCharacterXP } from "./save.js";
import { grantEggs, petState, addPool } from "./petsave.js";
import { ENEMIES } from "./data.js";
import { grantTitle, TITLES } from "./titles.js";
import { layoutHome, homeState, homeTick, updatePasture, pastureSprites, BUILD } from "./home.js";
import { questsFor, questBump, questText, eventsUpdate, eventSprites, tradeBuy, dirName } from "./worldevents.js";

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
  // the three outer continents (V6): each with its own floor hazard and a region feature (worldfx in drawRegionFx / regionTick)
  { id: "desert", name: "遗迹沙海", theme: -1, hazard: "sand", lv: "Lv 30–40 · 流沙下陷 · 沙暴", hp: 1.8, mm: [226, 196, 120],
    pool: ["scorpion", "scorpion", "snake_sand", "slime_sand", "bat_sand", "skull_sand", "beetle_sand"], elite: ["scorpion_king", "nest_sand", "skull_sand"] },
  { id: "forest", name: "幽影森林", theme: -1, hazard: "bog", lv: "Lv 35–45 · 瘴沼中毒 · 林间幽暗", hp: 2, mm: [58, 122, 90],
    pool: ["moth", "moth", "mushroom_shadow", "spider_shadow", "frog_bog", "ghost", "wisp_shadow", "snake_vine"], elite: ["nest_forest", "spider_shadow", "mushroom_shadow"] },
  { id: "cloud", name: "云巅浮庭", theme: -1, hazard: "wind", lv: "Lv 40–50 · 气流推送 · 阵风", hp: 2.2, mm: [224, 220, 240],
    pool: ["skylark", "skylark", "jelly_cloud", "slime_cloud", "eye_cloud", "wisp_cloud", "drone"], elite: ["nest_cloud", "jelly_cloud", "eye_cloud"] },
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
// 家园: its own warm meadow ground (in game, on the minimap and the world map) so the homestead reads apart from the wild
export const HOME_TH = THEMES.length;
THEMES.push({ ...THEMES[0], name: "家园", g1: "#b4d862", g2: "#acd05a", gHi: "#d6ee8a", gLo: "#8cb444" }); // (the roads keep the grassland's dirt colour)
export const inHome = (m, i) => {
  const r = m.home && m.home.rect;
  if (!r) return false;
  const x = i % m.W, y = (i / m.W) | 0;
  return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3] && m.t[i] !== WATER; // (the sea inside the rect stays sea)
};
export const tileTheme = (m, i) => (m.biome ? (inHome(m, i) ? HOME_TH : BIOMES[m.biome[i]].theme) : m.theme);
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
  // the coast as generated (before lakes and rivers): the world map draws these plates raised over the sea, with cliffs
  m.land = Uint8Array.from(m.t, (v) => (v === WATER ? 0 : 1));
  m.labels = [...PLATES.map((P) => ({ b: P.b, x: P.x, y: P.y })), { b: 3, x: isles[0][0], y: isles[0][1] }];
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
    if (t === F && hz > (b === 2 ? 0.34 : b === 6 ? 0.24 : b === 4 ? 0.3 : 0.4)) m.mud[i] = 1; // (hazard floor only on open ground: no crate, barrel or bush standing in the lava)
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
        if (!force) { m.t[j] = F; m.mud[j] = 0; m.road[j] = 1; continue; } // (a road over a river or pond inside a continent: a filled dirt causeway, no planks — planks are for the sea crossings)
        m.t[j] = F; m.mud[j] = 0; m.road[j] = 3; m.bdir[j] = dirNow; // a bridge over a strait
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
      return { x: x * T + T, y: y * T + T, ox: ux * dir, oy: uy * dir }; // (ox, oy: out over the water, where the boat waits)
    };
    m.ferries.push({ a: pier(a1, 1), b: pier(b1, -1), name });
    return { a: at(a1 - 1), b: at(b1 + 1) };
  };
  // a ferry between two islands of the same region (or any two shores): leave A's land along the line, cross the water
  // to the next land; piers from both shores
  const isleFerry = (A, B, name) => {
    const l = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / l, uy = (B.y - A.y) / l, at = (s2) => [Math.round(A.x + ux * s2), Math.round(A.y + uy * s2)];
    const wet = (s2) => { const [x, y] = at(s2); return m.t[y * W + x] === WATER; };
    let a1 = 0;
    while (a1 < l && !wet(a1 + 1)) a1++;
    let b1 = a1 + 1;
    while (b1 < l && wet(b1)) b1++;
    if (b1 - a1 < 8 || b1 >= l) return;
    const pier = (s0, dir) => {
      for (let s3 = 1; s3 <= 3; s3++) {
        const [x, y] = at(s0 + dir * s3);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
          const j = (y + dy) * W + x + dx;
          if (m.t[j] === WATER) (m.t[j] = F), (m.road[j] = 2), (m.bdir[j] = Math.abs(ux) > Math.abs(uy) ? 1 : 0);
        }
      }
      const [x, y] = at(s0 + dir * 3);
      return { x: x * T + T, y: y * T + T, ox: ux * dir, oy: uy * dir };
    };
    m.ferries.push({ a: pier(a1, 1), b: pier(b1, -1), name });
  };
  const hub = (P) => nudge(P.x, P.y, P.b);
  const G = PLATES[0], I = PLATES[1], L = PLATES[2], main = { x: isles[0][0], y: isles[0][1], b: 3 };
  const toIce = cross(G, I, "冰原长桥", 1), toLava = cross(G, L, "熔炉长桥", 2), toIsle = cross(G, main, "幻梦渡口", 3);
  const D = PLATES[3], Fo = PLATES[4], Cl = PLATES[5];
  const toDes = cross(G, D, "沙海长桥", 12), toFor = cross(G, Fo, "幽林渡口", 13), toCld = cross(L, Cl, "云梯长桥", 14);
  // more boat routes: the big isle to its two neighbours, and the grassland's south coast straight to the west isle
  isleFerry(main, { x: isles[1][0], y: isles[1][1] }, "东屿渡口");
  isleFerry(main, { x: isles[2][0], y: isles[2][1] }, "南屿渡口");
  { // (from the grassland shore nearest the west isle: walk from the isle towards the grassland's middle to its coast)
    const [bx, by] = isles[2], l = Math.hypot(G.x - bx, G.y - by);
    for (let s2 = 0; s2 < l; s2++) {
      const x = Math.round(bx + ((G.x - bx) / l) * s2), y = Math.round(by + ((G.y - by) / l) * s2);
      if (m.biome[y * W + x] === 0 && m.t[y * W + x] !== WATER) {
        const x2 = Math.round(x + ((G.x - bx) / l) * 3), y2 = Math.round(y + ((G.y - by) / l) * 3);
        isleFerry({ x: x2, y: y2 }, { x: bx, y: by }, "草原南渡口");
        break;
      }
    }
  }
  const [gx, gy] = hub(G), [ix, iy] = hub(I), [lx, ly] = hub(L);
  path(sx, sy, gx, gy, 1);
  path(gx, gy, ...toIce.a, 2); path(...toIce.b, ix, iy, 3);
  path(gx, gy, ...toLava.a, 4); path(...toLava.b, lx, ly, 5);
  path(sx, sy, ...toIsle.a, 6); path(...toIsle.b, main.x, main.y, 7);
  const [dsx, dsy] = hub(D), [fx0, fy0] = hub(Fo), [csx, csy] = hub(Cl);
  path(gx, gy, ...toDes.a, 12); path(...toDes.b, dsx, dsy, 13);
  path(gx, gy, ...toFor.a, 14); path(...toFor.b, fx0, fy0, 15);
  path(lx, ly, ...toCld.a, 16); path(...toCld.b, csx, csy, 17);
  // inside each region a second road to its far side (the boss arena), and a spur on the grassland
  const far = (P, ang) => nudge(Math.round(P.x + Math.cos(ang) * P.r * 0.55), Math.round(P.y + Math.sin(ang) * P.r * 0.55), P.b);
  const bossG = far(G, Math.PI * 0.95), bossI = far(I, -Math.PI * 0.75), bossL = far(L, -Math.PI * 0.3);
  path(gx, gy, ...bossG, 8); path(ix, iy, ...bossI, 9); path(lx, ly, ...bossL, 10); path(gx, gy, ...far(G, -Math.PI * 0.2), 11);
  const bossD = far(D, Math.PI * 0.55), bossF = far(Fo, 0.15), bossC = far(Cl, Math.PI * 0.95);
  path(dsx, dsy, ...bossD, 18); path(fx0, fy0, ...bossF, 19); path(csx, csy, ...bossC, 20);
  // 传送门 and the region bosses' arenas
  const wpI = nudge(ix + 6, iy + 4, 1), wpL = nudge(lx - 6, ly + 4, 2), wpG = nudge(gx + 5, gy - 6, 0), wpS = nudge(...toIsle.b, 3);
  const wpD = nudge(dsx + 5, dsy - 5, 4), wpF = nudge(fx0 - 5, fy0 - 5, 5), wpC = nudge(csx + 4, csy + 3, 6);
  const wp = [["草原传送门", ...wpG], ["冰原传送门", ...wpI], ["熔炉传送门", ...wpL], ["群岛传送门", ...wpS], ["沙海传送门", ...wpD], ["幽林传送门", ...wpF], ["浮庭传送门", ...wpC]];
  m.waypoints = wp.map(([name, x, y], k) => ({ id: k, name, x: x * T + T / 2, y: y * T + T / 2 }));
  const bossAt = [["boss_eye", ...bossG, 0], ["boss_frost", ...bossI, 1], ["boss_core", ...bossL, 2], ["boss_baku", main.x, main.y, 3], ["boss_colossus", ...bossD, 4], ["boss_myco", ...bossF, 5], ["boss_tempest", ...bossC, 6]];
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
    for (const f of m.ferries) for (const e of [f.a, f.b]) { const j = Math.floor(e.y / T) * W + Math.floor(e.x / T); if (pass(m.t[j])) q.push(j); } // (both shores of every boat route)
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
          if (m.t[jj] === WATER) (m.t[jj] = F), (m.mud[jj] = 0); // a strip of land across the river (planks only at sea crossings)
          else if (m.t[jj] === WALL) (m.t[jj] = F), (m.mud[jj] = 0); // (a gap through a rock edge)
        }
      }
      built++;
    }
    if (!built) break;
    flood();
  }
  // scraps of water inside a continent (a pond of a few tiles, or what a causeway cut off a river): back to ground — they read as noise
  {
    const seen = new Uint8Array(N);
    for (let i0 = 0; i0 < N; i0++) {
      if (seen[i0] || m.t[i0] !== WATER || m.biome[i0] === 3) continue;
      const comp = [i0];
      seen[i0] = 1;
      for (let h = 0; h < comp.length; h++) for (const j of [comp[h] + 1, comp[h] - 1, comp[h] + W, comp[h] - W]) if (!seen[j] && m.t[j] === WATER) (seen[j] = 1), comp.push(j);
      if (comp.length <= 16 && comp.every((j) => m.biome[j] !== 3)) for (const j of comp) (m.t[j] = F), (m.mud[j] = 0);
    }
    flood();
  }
  for (let i = 0; i < N; i++) if (m.t[i] === CRATE || m.t[i] === BARREL) m.crates[i] = { hp: m.t[i] === CRATE ? CRATE_HP : 12 };
  m.reach = reach;
  m.spawnT = { x: sx, y: sy };
  m.spawn = { x: sx * T + T / 2, y: sy * T + T / 2 };
  m.center = m.spawn;
  m.itemSpots = [m.spawn];
  const open = (x, y) => x > 1 && y > 1 && x < W - 2 && y < H - 2 && reach[y * W + x] && m.t[y * W + x] === F && !m.road[y * W + x] && !m.mud[y * W + x]; // (nothing placed on a hazard patch)
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
  const seen2 = new Uint8Array(N), wingReach = new Uint8Array(N), wq = [];
  // (what a flier reaches: over water but not through rock — an islet walled in by rock gets no chest)
  for (let i = 0; i < N; i++) if (reach[i]) (wingReach[i] = 1), wq.push(i);
  for (let h = 0; h < wq.length; h++) for (const j of [wq[h] + 1, wq[h] - 1, wq[h] + W, wq[h] - W]) if (j >= 0 && j < N && !wingReach[j] && m.t[j] !== WALL && !BIOMES[m.biome[j]].locked) (wingReach[j] = 1), wq.push(j);
  for (let i0 = 0; i0 < N; i0++) {
    if (seen2[i0] || reach[i0] || m.t[i0] !== F || BIOMES[m.biome[i0]].locked || !wingReach[i0]) continue;
    const comp = [i0];
    seen2[i0] = 1;
    for (let h = 0; h < comp.length; h++) for (const j of [comp[h] + 1, comp[h] - 1, comp[h] + W, comp[h] - W]) if (!seen2[j] && m.t[j] !== WATER && !reach[j]) (seen2[j] = 1), comp.push(j);
    if (comp.length < 24 || m.chests.filter((q) => q.wing).length >= 6) continue;
    const c = comp.find((j) => m.t[j] === F && wingReach[j]) ?? comp[0];
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
  // 坐骑秘境 (W4): small walled pockets whose door only one mount opens — 裂纹岩 (fire from a mounted 火龙 breaks it)
  // or 电门 (only a rider on 灵狐 passes the charge); each hides a golden chest and a 采集点. The islets only a flier
  // reaches (the wing chests above) are 冰凰's.
  m.cracked = new Set();
  m.zap = new Set();
  m.pockets = [];
  for (const [b, kind] of [[0, "dragon"], [0, "fox"], [1, "dragon"], [1, "fox"], [2, "dragon"], [2, "fox"], [4, "fox"], [5, "dragon"]]) {
    const salt = b * 7 + (kind === "fox" ? 3 : 0);
    let best = null;
    for (let tries = 0; tries < 3000 && !best; tries++) {
      const x = 6 + Math.floor(hash(tries, salt, seed + 71) * (W - 12)), y = 6 + Math.floor(hash(salt, tries, seed + 72) * (H - 12));
      if (m.biome[y * W + x] !== b || tdist(x, y) < 30) continue;
      let ok = true;
      for (let dy = -5; dy <= 5 && ok; dy++) for (let dx = -5; dx <= 5 && ok; dx++) {
        const j = (y + dy) * W + x + dx;
        if (!reach[j] || m.road[j] || m.t[j] === WATER || m.biome[j] !== b) ok = false;
      }
      if (!ok || [...m.waypoints, ...m.bosses, ...m.pockets].some((o) => Math.hypot(o.x / T - x, o.y / T - y) < 16)) continue;
      if ([...m.chests, ...m.nodes].some((o) => Math.abs(o.x / T - x) < 7 && Math.abs(o.y / T - y) < 7)) continue;
      const side = [[0, 1], [1, 0], [-1, 0], [0, -1]].find(([dx, dy]) => open(x + dx * 7, y + dy * 7) && open(x + dx * 6, y + dy * 6));
      if (side) best = [x, y, side];
    }
    if (!best) continue;
    const [x, y, [ox, oy]] = best, door = [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const j = (y + dy) * W + x + dx;
      m.mud[j] = 0;
      delete m.crates[j];
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) { m.t[j] = F; continue; }
      const isDoor = ox ? dx === 4 * ox && Math.abs(dy) <= 1 : dy === 4 * oy && Math.abs(dx) <= 1;
      if (!isDoor) m.t[j] = WALL;
      else if (kind === "dragon") (m.t[j] = WALL), m.cracked.add(j), door.push(j);
      else (m.t[j] = F), m.zap.add(j), door.push(j);
    }
    for (let s2 = 5; s2 <= 6; s2++) for (let k = -1; k <= 1; k++) { // the way up to the door kept clear
      const j = (y + oy * s2 + (ox ? k : 0)) * W + x + ox * s2 + (oy ? k : 0);
      if (m.t[j] !== WATER) (m.t[j] = F), delete m.crates[j];
    }
    for (const sp of m.spawners) sp.list = sp.list.filter((e) => Math.abs(e.x / T - x) > 5.5 || Math.abs(e.y / T - y) > 5.5);
    m.chests.push({ id: (y - 1) * W + x, x: x * T + T / 2, y: (y - 1) * T + T / 2 + 4, gold: true, need: kind });
    m.nodes.push({ id: (y + 2) * W + x + 1, x: (x + 1) * T + T / 2, y: (y + 2) * T + T / 2 + 4, b });
    m.pockets.push({ tx: x, ty: y, x: x * T + T / 2, y: y * T + T / 2, kind, b, door, dx: ox, dy: oy });
  }
  for (const c of m.chests) if (c.wing) c.need = "phoenix";
  // the camp workshop (exchange materials) stands just north-east of the spawn
  const [wx2, wy2] = nudge(sx + 4, sy - 3, 0);
  m.shop = { x: wx2 * T + T / 2, y: wy2 * T + T / 2 };
  layoutHome(m, sx, sy); // 家园: the rock field west of the camp becomes the homestead (home.js)
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
  const thOf = (i) => THEMES[tileTheme(m, i)], bOf = (i) => (inHome(m, i) ? 99 : m.biome[i]);
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
    const b = bOf(i);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = gx + dx, ny = gy + dy;
      if (!land(nx, ny)) continue;
      const nb = bOf(ny * W + nx);
      if (nb === b || (dx && dy && (bOf(gy * W + nx) === nb || bOf(ny * W + gx) === nb))) continue; // (a corner only when neither side already blends)
      const th = thOf(ny * W + nx), X = x * T, Y = y * T;
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
/** behind the loading doors: draw the ground round where you start (the view and a chunk past every edge), so the first
 *  seconds in the world need no tile painting; onProgress(0..1) */
export async function warmWorldGround(m, me, onProgress) {
  const a0 = Math.max(0, Math.floor((me.x - VIEW_W / 2) / CPX) - 1), a1 = Math.min(m.W / CHUNK - 1, Math.floor((me.x + VIEW_W / 2) / CPX) + 1);
  const b0 = Math.max(0, Math.floor((me.y - VIEW_H / 2) / CPX) - 1), b1 = Math.min(m.H / CHUNK - 1, Math.floor((me.y + VIEW_H / 2) / CPX) + 1);
  const all = [];
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) all.push([a, b]);
  all.sort(([a, b], [c, d]) => Math.hypot(a - (a0 + a1) / 2, b - (b0 + b1) / 2) - Math.hypot(c - (a0 + a1) / 2, d - (b0 + b1) / 2));
  const list = all.slice(0, 20); // (the cache keeps 24)
  for (let k = 0; k < list.length; k++) {
    tileAtCache(m, ...list[k]);
    onProgress && onProgress((k + 1) / list.length);
    await new Promise((r) => setTimeout(r, 0));
  }
}
/** the world's own pictures (home buildings / NPCs, material icons): resolved once every one has loaded and decoded */
export function worldImagesReady() {
  return Promise.all([...Object.values(HOME_IMG), ...MAT_IMG].filter(Boolean).map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
}
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
    if (d && d.v === 1) return { opened: [], fog: "", gates: [], bossDay: {}, flag: null, mats: [0, 0, 0, 0, 0, 0, 0], nodeDay: {}, miles: [], ...d };
  } catch (e) {}
  return { v: 1, opened: [], fog: "", x: null, y: null, chests: 0, visits: 0, gates: [], bossDay: {}, flag: null, mats: [0, 0, 0, 0, 0, 0, 0], nodeDay: {}, miles: [] };
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
  const d = { v: 1, opened: [...ws.opened], fog: fogString(ws.fog), x: p && !p.downed && !ws.ride ? Math.round(p.x) : null, y: p && !p.downed && !ws.ride ? Math.round(p.y) : null, chests: ws.opened.size, visits: ws.visits, gates: [...ws.gates], bossDay: ws.bossDay, flag: ws.flag, mats: ws.mats, nodeDay: ws.nodeDay, miles: ws.miles,
    cracked: [...new Set([...ws.cracked, ...(g.map.brokenWalls || []).filter((i) => g.map.cracked.has(i))])], quests: ws.quests };
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
  if (!eggPainter) import("./petwh.js").then((M) => (eggPainter = M.drawEgg)); // (the loot's egg icons)
  for (const i of sv.cracked || []) if (m.cracked.has(i)) m.t[i] = F; // (裂纹岩 you have broken stays broken)
  g.map = m;
  g.ws = { chunks: new Map(), opened: new Set((sv.opened || []).filter((id) => m.chests.some((c) => c.id === id))) /* (chests moved by a world change drop out) */, fog: fogBytes(sv.fog), fogDirty: true, region: -1, saveT: 4, visits: (sv.visits || 0) + 1, gems: 0, chestsNow: 0,
    gates: new Set(sv.gates), bossDay: sv.bossDay || {}, flag: sv.flag, loot: {}, bossesNow: 0,
    mats: MATS.map((_, k) => sv.mats?.[k] || 0), nodeDay: sv.nodeDay || {}, miles: sv.miles || [], shopArmed: true,
    cracked: (sv.cracked || []).filter((i) => m.cracked.has(i)), home: homeTick(homeState()), arm: {},
    quests: sv.quests?.day === dayKey() ? sv.quests : questsFor(dayKey()) };
  // every visit starts at home, by the 派遣告示板 (the camp if that spot were ever blocked);
  // your flag and the 传送门 take you back out
  const H0 = m.home && { x: (m.home.board.x + m.home.quest.x) / 2, y: (m.home.board.y + m.home.quest.y) / 2 + 30 }, hi = H0 && tileIdx(m, H0.x, H0.y); // (between the board and the guild girl, clear of the NPCs)
  const sp = H0 && m.t[hi] === F ? H0 : m.spawn;
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
  if (!e.aggro && !e.returning && d < (e.worldBoss ? 280 : e.elite ? 240 : 200)) e.aggro = 1;
  // 仇恨范围 (not drawn): a resident chases only so far from its home; out of it (or with every player out of it) for
  // 2 s it gives up, walks straight home and heals — no chasing across the map or out to sea
  if (e.aggro) {
    const L = e.worldBoss ? 560 : e.elite ? 440 : 380, eh = Math.hypot(e.x - e.home.x, e.y - e.home.y);
    let ph = 1e9;
    for (const p of g.alivePlayers()) ph = Math.min(ph, Math.hypot(p.x - e.home.x, p.y - e.home.y));
    e.outT = eh > L || ph > L + 120 || d > (e.worldBoss ? 780 : 560) ? (e.outT || 0) + dt : 0;
    if (e.outT > 2) (e.aggro = 0), (e.outT = 0), (e.returning = true), (e.announced = false);
  }
  if (e.worldBoss && e.aggro) {
    g.map.center = e.arena; // (boss attacks that work round "the room's centre" use its arena)
    if (!e.announced) (e.announced = true), (g.banner = { text: e.def.name, sub: "区域首领 · " + (e.def.title || ""), t: 3, boss: true }), g.sound("boss");
  }
  if (e.aggro) return true;
  e.anim += dt;
  e.t += dt;
  if (e.returning) {
    const hx = e.home.x - e.x, hy = e.home.y - e.y, l = Math.hypot(hx, hy);
    if (l < 8) (e.returning = false), (e.hp = e.maxHp);
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
/** time left until the region bosses come back (local midnight), as 05:12:33 */
export function bossRespawnIn() {
  const n = new Date(), next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1), s = Math.max(0, Math.floor((next - n) / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, "0")).join(":");
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
export const MATS = [{ name: "草芯", col: "#8ad85a" }, { name: "霜晶", col: "#9ad8ff" }, { name: "熔核", col: "#ff8a3a" }, { name: "梦砂", col: "#c8a0ff" },
  { name: "遗晶", col: "#ffc24a" }, { name: "影菇", col: "#7ae0c8" }, { name: "云羽", col: "#e8f0ff" }];
// their item icons (PixelLab, one static set): the workshop, the map panel, the loot and the 采集点 all use these
export const matSrc = (k) => `assets/ui/mat${k}.png`;
const MAT_IMG = MATS.map((_, k) => (typeof Image === "undefined" ? null : Object.assign(new Image(), { src: matSrc(k) })));
export const LOOT_NAME = { gems: "晶石", egg_base: "宠物蛋", egg_ur: "UR 宠物蛋", egg_hur: "HUR 宠物蛋", ur: "淬灵露", hur: "流彩晶", stars: "星砂", pool: "宠物经验池", xp: "角色经验", mat0: "草芯", mat1: "霜晶", mat2: "熔核", mat3: "梦砂", mat4: "遗晶", mat5: "影菇", mat6: "云羽" };
// 营地工坊: materials into lasting rewards. cost: [草芯, 霜晶, 熔核, 梦砂]; once: a title, bought a single time
export const WORKSHOP = [
  { id: "pool", give: ["pool", 200], cost: [8, 0, 0, 0] },
  { id: "ur", give: ["ur", 1], cost: [6, 4, 0, 0] },
  { id: "stars", give: ["stars", 10], cost: [0, 0, 5, 0] },
  { id: "egg_ur", give: ["egg_ur", 1], cost: [0, 8, 8, 0] },
  { id: "hur", give: ["hur", 1], cost: [0, 0, 6, 10] },
  { id: "egg_hur", give: ["egg_hur", 1], cost: [0, 10, 10, 15] },
  { id: "title", give: ["title", 1], cost: [20, 20, 20, 20], once: "world_walker" },
  // the outer continents' materials (遗晶 / 影菇 / 云羽)
  { id: "pool2", give: ["pool", 600], cost: [0, 0, 0, 0, 8, 0, 0] },
  { id: "ur3", give: ["ur", 3], cost: [0, 0, 0, 0, 4, 6, 0] },
  { id: "hur3", give: ["hur", 3], cost: [0, 0, 0, 0, 0, 6, 10] },
  { id: "egg_hur2", give: ["egg_hur", 1], cost: [0, 0, 0, 0, 8, 8, 8] },
  { id: "title2", give: ["title", 1], cost: [0, 0, 0, 0, 20, 20, 20], once: "world_frontier" },
];
export function workshopBuy(g, offer) {
  const ws = g.ws;
  if (offer.once && titleOwned(offer.once)) return "已兑换";
  if (offer.cost.some((c, k) => ws.mats[k] < c)) return "材料不足";
  offer.cost.forEach((c, k) => (ws.mats[k] -= c));
  if (offer.once) grantTitle(offer.once), award(g, `称号「${TITLES[offer.once].name}」`, 1);
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
    // the loot is saved at once; on screen it bursts out of the boss like an eruption, lands round the arena and then
    // flies to you, each kind announcing itself as it arrives
    const mat = "mat" + g.map.bosses[e.worldBoss - 1].region, egg = Math.random() < 0.25 ? "egg_hur" : "egg_ur";
    const groups = [["gems", grant(g, "gems", 200), 8], ["xp", grant(g, "xp", 300), 3], ["ur", grant(g, "ur", 2), 2], [mat, grant(g, mat, 10), 5], [egg, grant(g, egg, 1), 1]];
    if (Math.random() < 0.35) groups.push(["hur", grant(g, "hur", 1), 1]);
    erupt(g, e.x, e.y, groups);
    quest(g, "boss");
    worldSaveNow(g);
    return;
  }
  // an elite: a skill card for this visit's build (the world's chests give lasting rewards instead)
  if (g.ws && e.chunk) quest(g, "kill", e.home ? g.map.biome[tileIdx(g.map, e.home.x, e.home.y)] : -1);
  if (e.elite && g.ws) {
    quest(g, "elite");
    const p = e.lastBy ? g.player(e.lastBy) : null, b = g.map.biome[tileIdx(g.map, e.x, e.y)];
    if (MATS[b]) g.text(e.x, e.y - 40, grant(g, "mat" + b, 2), MATS[b].col, 1.1, 1.6);
    g.after(0.4, () => g.offerCards(p || g.players[0], 3));
  }
  const st = g.ws?.chunks.get(e.chunk);
  if (!st) return;
  st.alive[e.slot] = false;
  if (st.alive.every((v) => !v)) st.clearedAt = g.time;
}
// ---------------------------------------------------------------- loot eruption (region bosses)
function erupt(g, x, y, groups) {
  const ws = g.ws, list = [];
  for (const [kind, label, n] of groups) {
    if (kind === "xp") { ws.dropTail = [...(ws.dropTail || []), label]; continue; } // (no item icon: said once the loot is in)
    for (let k = 0; k < n; k++) list.push({ kind, txt: k ? null : label });
  }
  for (let k = list.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [list[k], list[j]] = [list[j], list[k]]; }
  g.vfx("explosions/cartoon-pow", x, y - 30);
  g.sound("explode", 0.3), g.after(0.5, () => g.sound("ssr", 0.2));
  ws.drops = ws.drops || [];
  list.forEach((d, k) => g.after(0.15 + k * 0.06, () => {
    // a tight fountain round the kill spot (lands within ~30–75 px), high arcs so the trails read
    const a = Math.random() * Math.PI * 2, sp = 28 + Math.random() * 42, big = d.kind.startsWith("egg") || d.kind === "hur";
    ws.drops.push({ ...d, x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 3, z: 34, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75, vz: (big ? 600 : 470) + Math.random() * 140, t: 0, bounced: false, big, trail: [], col: dropCol(d.kind) });
    if (k % 3 === 0) g.sound("coin", 0.06);
  }));
}
function updateDrops(g, ws, me, dt) {
  const D = ws.drops;
  if (!D?.length) return;
  for (let k = D.length - 1; k >= 0; k--) {
    const d = D[k];
    d.t += dt;
    if (d.z > 0 || d.vz > 0) {
      d.trail.push([d.x, d.y - d.z]);
      if (d.trail.length > 9) d.trail.shift();
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.vz -= 1100 * dt;
      if (d.z <= 0) (d.z = 0), d.bounced ? ((d.vz = 0), (d.landT = d.t)) : ((d.vz = -d.vz * 0.32), (d.bounced = true), (d.vx *= 0.4), (d.vy *= 0.4));
      continue;
    }
    if (d.trail.length) d.trail.shift(); // (the trail fades out once it has landed)
    if (d.t < 2.4 || me.dead) continue; // lie there under its light pillar a moment, then home in on you
    d.homing = true;
    const dx = me.x - d.x, dy = me.y - 10 - d.y, l = Math.hypot(dx, dy), sp = Math.min(900, 220 + (d.t - 2.4) * 700);
    if (l < 16) {
      D.splice(k, 1);
      const say = (txt, big) => { // (one line after another, not stacked)
        const wait = Math.max(0, (ws.txtNext || 0) - g.time);
        ws.txtNext = g.time + wait + 0.6;
        g.after(wait, () => g.text(me.x, me.y - 50, txt, big ? "#ff9af0" : "#ffe36a", big ? 1.3 : 1.1, 2));
      };
      if (d.txt) say(d.txt, d.big);
      if (!D.length && ws.dropTail) ws.dropTail.forEach((t) => say(t)), (ws.dropTail = null);
      g.sound("pickup", 0.05);
      continue;
    }
    d.x += (dx / l) * sp * dt; d.y += (dy / l) * sp * dt;
  }
}
// the loot's look: 晶石 gems, 角色经验 stars, 淬灵露 drops, 流彩晶 a rainbow crystal, materials in their colour, eggs
const dropCol = (k) => (k === "gems" ? "#6ad0ff" : k === "xp" ? "#ffe36a" : k === "ur" ? "#7fd8ff" : k === "hur" || k === "egg_hur" ? "#ff9af0" : k === "egg_ur" ? "#8ab8ff" : MATS[+k[3]]?.col || "#ffffff");
// the flight's glowing trail, and once landed a light pillar over it (taller and brighter for eggs and 流彩晶)
function dropGlow(g, d, t) {
  g.save();
  g.globalCompositeOperation = "lighter";
  const tr = d.trail;
  for (let i = 1; i < tr.length; i++) {
    const f = i / tr.length;
    g.globalAlpha = f * 0.7;
    g.strokeStyle = d.col;
    g.lineWidth = (d.big ? 6 : 4) * f;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(tr[i - 1][0], tr[i - 1][1] - 12);
    g.lineTo(tr[i][0], tr[i][1] - 12);
    g.stroke();
  }
  if (d.landT !== undefined && !d.homing) {
    const age = d.t - d.landT, rise = Math.min(1, age / 0.25), H = (d.big ? 110 : 64) * rise, w = d.big ? 12 : 7, pulse = 0.75 + Math.sin(t * 7 + d.x) * 0.25;
    const gr = g.createLinearGradient(0, d.y - H, 0, d.y);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.6, d.col);
    gr.addColorStop(1, "#ffffff");
    g.globalAlpha = 0.55 * pulse;
    g.fillStyle = gr;
    g.fillRect(d.x - w / 2, d.y - H, w, H);
    g.globalAlpha = 0.9 * pulse;
    g.fillRect(d.x - w / 6, d.y - H * 0.85, w / 3, H * 0.85);
    g.globalAlpha = 0.45 * pulse;
    g.fillStyle = d.col;
    g.beginPath();
    g.ellipse(d.x, d.y + 2, (d.big ? 18 : 12) * rise, (d.big ? 6 : 4) * rise, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
// the loot drawn with the icons the rest of the game uses: 晶石 as the HUD gem, 淬灵露 / 流彩晶 as in 积攒兑换 (.st-ico),
// pet eggs from the warehouse's egg painter, materials as the workshop's colour chips; cached canvases
const ICONS = {};
let eggPainter = null;
function dropIcon(k) {
  if (ICONS[k]) return ICONS[k];
  const c = document.createElement("canvas"), g = c.getContext("2d"), INKC = "#1a1020";
  if (k.startsWith("egg")) {
    if (!eggPainter) return null;
    eggPainter(c, 0, k.slice(4));
  } else if (k === "gems") {
    c.width = c.height = 20;
    const gr = g.createLinearGradient(0, 0, 20, 20);
    gr.addColorStop(0, "#9affff"); gr.addColorStop(0.5, "#3ab0ff"); gr.addColorStop(1, "#2a5ad0");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(10, 0); g.lineTo(20, 7); g.lineTo(16, 20); g.lineTo(4, 20); g.lineTo(0, 7); g.closePath(); g.fill();
  } else if (k === "ur") {
    c.width = 26; c.height = 30;
    const gr = g.createRadialGradient(10.4, 10.5, 0, 10.4, 10.5, 22);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.12, "#ffffff"); gr.addColorStop(0.13, "#9ef0ff"); gr.addColorStop(0.4, "#9ef0ff"); gr.addColorStop(0.7, "#3aa0e0"); gr.addColorStop(1, "#3aa0e0");
    g.fillStyle = INKC; g.beginPath(); g.roundRect(0, 0, 26, 30, [8, 8, 12, 12]); g.fill();
    g.fillStyle = gr; g.beginPath(); g.roundRect(2, 2, 22, 26, [6, 6, 10, 10]); g.fill();
  } else if (k === "hur") {
    c.width = c.height = 36;
    g.translate(18, 18); g.rotate(Math.PI / 4); g.scale(0.82, 0.82); g.translate(-13, -15);
    const gr = g.createConicGradient(0, 13, 15);
    ["#ff6a6a", "#ffd84a", "#6ee08a", "#5aa8ff", "#c27bff", "#ff6a6a"].forEach((col, i) => gr.addColorStop(i / 5, col));
    g.fillStyle = INKC; g.beginPath(); g.roundRect(0, 0, 26, 30, [{ x: 13, y: 18 }, { x: 13, y: 18 }, 8, 8]); g.fill();
    g.fillStyle = gr; g.beginPath(); g.roundRect(2, 2, 22, 26, [{ x: 11, y: 16 }, { x: 11, y: 16 }, 6, 6]); g.fill();
  } else {
    const im = MAT_IMG[+k[3]];
    if (!im?.complete || !im.naturalWidth) return null;
    c.width = c.height = 24;
    g.imageSmoothingEnabled = false;
    g.drawImage(im, 0, 0, 24, 24);
  }
  return (ICONS[k] = c);
}
function dropSprite(g, d, t) {
  dropGlow(g, d, t);
  const ic = dropIcon(d.kind);
  if (!ic) return;
  const w = ic.width, h = ic.height, foot = d.kind === "hur" ? 6 : 1; // (流彩晶's canvas has a margin round the tilted gem)
  g.fillStyle = "rgba(10,8,20,0.32)"; // its shadow under it: shrinks while it is up in the air
  const sh = Math.max(0.35, 1 - d.z / 160);
  g.beginPath(); g.ellipse(d.x, d.y, w * 0.42 * sh, 4 * sh, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(ic, Math.round(d.x - w / 2), Math.round(d.y - d.z - h + foot));
  if (d.big && Math.sin(t * 6 + d.x) > 0.6) (g.fillStyle = "#ffffff"), g.fillRect(Math.round(d.x - 1), Math.round(d.y - d.z - h - 6), 2, 5), g.fillRect(Math.round(d.x - 3), Math.round(d.y - d.z - h - 4), 6, 1);
}
const RESPAWN = 150; // s until a cleared chunk refills (this visit)
export function worldUpdate(g, dt) {
  const m = g.map, ws = g.ws, me = g.players.find((q) => q.local) || g.players[0];
  if (!ws || !me) return;
  const alive = g.alivePlayers();
  ws.tick = (ws.tick || 0) - dt;
  if (ws.tick <= 0) (ws.tick = 0.25), residents(g, ws, m, alive);
  ferry(g, ws, m, me, dt);
  mounts(g, ws, m, dt);
  regionTick(g, ws, m, dt);
  // no monster ends a frame on the water, whatever moved it (a push from a crowd, a knockback, a blink): back to the
  // last dry spot it stood on (the movement step already stops steps and leaps at the shore)
  for (const e of g.enemies) {
    if (e.dead) continue;
    const i = tileIdx(m, e.x, e.y);
    if (m.t[i] === WATER) {
      const d = e.dry || e.home;
      if (d) (e.x = d.x), (e.y = d.y);
      if (e.lx !== undefined) (e.lx = e.ox = e.x), (e.ly = e.oy = e.y);
    } else e.dry = { x: e.x, y: e.y };
  }
  updateDrops(g, ws, me, dt);
  // 采集点: walk into one to gather it (back tomorrow)
  const today = dayKey();
  for (const n of m.nodes) {
    if (ws.nodeDay[n.id] === today || Math.abs(me.x - n.x) > 26 || Math.abs(me.y - n.y) > 26) continue;
    ws.nodeDay[n.id] = today;
    quest(g, "gather");
    const k = 2 + ((n.id * 7) % 2);
    g.text(n.x, n.y - 40, grant(g, "mat" + n.b, k), MATS[n.b].col, 1.1, 1.6);
    g.vfx("pickups/collect-burst", n.x, n.y - 8, { palette: ["#140e22", "#3a2a5a", MATS[n.b].col, "#ffffff"] });
    g.sound("pickup", 0.1);
  }
  // stations you walk up to and press attack at (the attack talks instead of shooting there, game.js): 营地工坊,
  // 派遣告示板, 家园管家, 每日委托, 迷途商人 — open again any time with another press, no need to step away
  ws.standAt = null;
  const stations = [["shop", m.shop, "worldShop", 20], ["board", m.home.board, "worldDispatch", 18], ["steward", m.home.steward, "worldBuild", 10], ["quest", m.home.quest, "worldQuest", 10]];
  if (ws.ev?.kind === "trader") stations.push(["trader", ws.ev, "worldTrader", 10]);
  let near = null, nd = 46;
  for (const [key, at, ui, dy] of stations) {
    const ds = Math.hypot(me.x - at.x, me.y - (at.y + dy));
    if (ds < nd) (nd = ds), (near = [key, ui]);
  }
  const atk = !!(me.input?.press ?? me.input?.atk);
  me.nearStation = near && !me.downed ? near[0] : null;
  if (me.nearStation) {
    ws.standAt = near[0];
    if (atk && !ws.talkLock) g.onUi(near[1]);
  }
  ws.talkLock = atk;
  ws.shopT = ws.standAt === "shop" ? 1 : 0;
  home(g, ws, m, me, dt);
  eventsUpdate(g, ws, m, me, dt, EH);
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
  const near = (o) => onView(game, o.x, o.y, 120);
  // a boss arena: a dark ring on the ground
  for (const B of m.bosses) if (near(B)) {
    g.strokeStyle = "rgba(80,10,40,0.35)";
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(B.x, B.y, 9 * T - 10, 7 * T - 10, 0, 0, Math.PI * 2);
    g.stroke();
  }
  if (ws.ride) boatSprite(g, me.x, me.y + 6, Math.sin(t * 3) * 1);
  else for (const f of m.ferries) {
    // the boat waits on the water just past the end of whichever pier you are nearer
    const P = Math.hypot(me.x - f.a.x, me.y - f.a.y) < Math.hypot(me.x - f.b.x, me.y - f.b.y) ? f.a : f.b;
    if (Math.abs(P.x - me.x) < 700 && Math.abs(P.y - me.y) < 480) boatSprite(g, P.x + P.ox * 60, P.y + P.oy * 52 + 8, Math.sin(t * 2) * 1.5);
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
// 家园 art (PixelLab, static): buildings on their plots once built, the board and the steward; an unbuilt plot is a
// staked-out patch of earth drawn in code
const HOME_IMG = Object.fromEntries(["steward", "quest", "hut", "store", "spring", "tower", "board", "trader", "meteor"].map((k) => [k, typeof Image === "undefined" ? null : Object.assign(new Image(), { src: `assets/home/${k}.png` })]));
// frames per strip (PixelLab animate-with-text-v3 idle loops), playback rate, and a still pause between plays
const ANIM = { steward: [8, 7], quest: [8, 7], trader: [8, 7], hut: [8, 5], store: [7, 5, 2.6], spring: [8, 7], tower: [8, 8], board: [8, 5, 1.5], meteor: [1, 1] };
function frameOf(k, t, seed = 0) {
  const [n, fps, hold = 0] = ANIM[k] || [1, 1];
  if (n < 2) return 0;
  const len = n / fps + hold, u = (t + seed) % len;
  return u >= n / fps ? 0 : Math.floor(u * fps) % n;
}
function img(g, k, x, y, t = 0, seed = 0) { // feet at (x, y) (the art carries its own ground)
  const im = HOME_IMG[k];
  if (!im?.complete || !im.naturalWidth) return;
  const n = (ANIM[k] || [1])[0], w = im.naturalWidth / n, h = im.naturalHeight;
  g.imageSmoothingEnabled = false;
  g.drawImage(im, frameOf(k, t, seed) * w, 0, w, h, Math.round(x - w / 2), Math.round(y - h), w, h);
}
// an NPC: her idle loop, a soft shadow at her feet
export function npcImg(g, k, x, y, t, seed = 0) {
  const im = HOME_IMG[k];
  if (!im?.complete || !im.naturalWidth) return;
  const w = im.naturalWidth / ANIM[k][0];
  g.fillStyle = "rgba(10,8,20,0.28)";
  g.beginPath(); g.ellipse(x, y - 2, w * 0.32, 4.5, 0, 0, Math.PI * 2); g.fill();
  img(g, k, x, y, t, seed);
}
function plotSprite(g, x, y) {
  g.fillStyle = "#1a1020"; g.fillRect(x - 42, y - 22, 84, 36);
  g.fillStyle = "#9a6a3a"; g.fillRect(x - 40, y - 20, 80, 32);
  g.fillStyle = "#86592e"; for (let k = 0; k < 4; k++) g.fillRect(x - 36, y - 16 + k * 8, 72, 2);
  for (const [a, b] of [[-40, -20], [38, -20], [-40, 10], [38, 10]]) { g.fillStyle = "#1a1020"; g.fillRect(x + a - 1, y + b - 12, 5, 16); g.fillStyle = "#e8c890"; g.fillRect(x + a, y + b - 11, 3, 14); }
  g.strokeStyle = "#f4f0e0"; g.lineWidth = 1; g.setLineDash([4, 3]); g.strokeRect(x - 38.5, y - 18.5, 77, 29); g.setLineDash([]);
}
function homeSprites(m, ws, out) {
  const H = ws.home, P = m.home.plots;
  pastureSprites(m, out, MAT_IMG);
  out.push({ y: m.home.board.y + 14, draw: (g, t) => img(g, "board", m.home.board.x, m.home.board.y + 16, t) });
  out.push({ y: m.home.steward.y + 10, draw: (g, t) => npcImg(g, "steward", m.home.steward.x, m.home.steward.y + 12, t, 0) });
  out.push({ y: m.home.quest.y + 10, draw: (g, t) => npcImg(g, "quest", m.home.quest.x, m.home.quest.y + 12, t, 1.7) });
  for (const k of ["hut", "store", "spring", "tower"]) {
    const o = P[k];
    if (H.lv[k] > 0) out.push({ y: o.y + (k === "spring" ? -26 : 18), draw: (g, t) => img(g, k, o.x, o.y + (k === "spring" ? 14 : 20), t, o.x * 0.01) }); // (the pool sits half a tile higher; its name stays on the row)
    else out.push({ y: o.y - 20, draw: (g) => plotSprite(g, o.x, o.y) });
  }
}
// 采集点: the material's own icon standing there (gently bobbing over its shadow), so what you see is what you get
function nodeSprite(g, x, y, b, t) {
  const im = MAT_IMG[b], bob = Math.round(Math.sin(t * 2.4 + x * 0.01) * 1.5);
  g.fillStyle = "rgba(10,8,20,0.32)";
  g.beginPath();
  g.ellipse(x, y + 1, 11, 4, 0, 0, Math.PI * 2);
  g.fill();
  if (!im?.complete || !im.naturalWidth) return;
  g.imageSmoothingEnabled = false;
  g.drawImage(im, Math.round(x - 14), Math.round(y - 27 + bob), 28, 28);
  if (Math.sin(t * 4 + x) > 0.85) (g.fillStyle = "#ffffff"), g.fillRect(Math.round(x + 7), Math.round(y - 30 + bob), 2, 5), g.fillRect(Math.round(x + 5), Math.round(y - 28 + bob), 6, 1);
}
// 裂纹岩: glowing cracks over a rock block (x, y = the block's top-left, lifted like walls)
function crackSprite(g, x, y, j) {
  g.fillStyle = "rgba(255,110,40,0.22)"; // (a warm, scorched tint over the block)
  g.fillRect(x, y, T, T + 14);
  const k = j % 3, seg = [[[6, 4], [12, 12], [9, 19], [15, 27], [13, 36]], [[24, 3], [19, 13], [23, 22], [17, 31], [20, 40]], [[16, 6], [11, 15], [18, 24], [10, 34]]][k];
  for (const [w, col] of [[4, "#1a1020"], [2, "#ff8a3a"], [1, "#ffe36a"]]) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    seg.forEach(([a, b], n) => (n ? g.lineTo(x + a, y + b) : g.moveTo(x + a, y + b)));
    g.stroke();
  }
}
// 电门: a crackling field filling the doorway tile, posts on the end tiles
function zapSprite(g, x, y, t, j, q) {
  const ends = q.door.indexOf(j), across = q.dx !== 0; // (a door in an east/west wall runs north–south)
  const r = (a, c, w, h, col) => ((g.fillStyle = col), g.fillRect(Math.round(x + a), Math.round(y + c), w, h));
  const fl = 0.5 + Math.sin(t * 17 + j) * 0.2;
  g.globalAlpha = 0.28 * fl + 0.12;
  r(across ? 6 : 0, across ? 0 : 4, across ? 20 : T, across ? T : 22, "#6ab8ff"); // the field
  g.globalAlpha = 1;
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = ["#1a2a6a", "#9ad8ff", "#fff36a"][k];
    g.lineWidth = [4, 2, 1][k];
    g.beginPath();
    for (let s = 0; s <= 8; s++) {
      const u = (s / 8) * T, v = 15 + Math.sin(t * 34 + s * 2.3 + j * 1.7) * 7 * (s % 2 ? 1 : -1) * fl;
      const [px, py] = across ? [x + v, y + u] : [x + u, y + v - 2];
      s ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
  }
  if (ends === 0 || ends === q.door.length - 1) {
    const px = across ? 12 : ends === 0 ? -2 : 26, py = across ? (ends === 0 ? -14 : 18) : -14;
    r(px, py, 8, 30, "#1a1020"); r(px + 1, py + 1, 6, 28, "#5a6a8a"); r(px + 1, py + 1, 6, 5, Math.sin(t * 9) > 0 ? "#fff36a" : "#9ad8ff");
  }
}
function shopSprite(g, x, y, t) {
  const r = (a, c, w, h, col) => ((g.fillStyle = col), g.fillRect(Math.round(x + a), Math.round(y + c), w, h));
  g.fillStyle = "rgba(10,8,20,0.35)";
  g.beginPath();
  g.ellipse(x, y + 22, 36, 10, 0, 0, Math.PI * 2);
  g.fill();
  r(-34, -2, 68, 26, "#1a1020"); r(-32, 0, 64, 22, "#9a5e2c"); r(-32, 0, 64, 3, "#c88a4a"); // counter
  g.imageSmoothingEnabled = false;
  // the materials on display: all seven across the counter, every other one set back a little (drawn first)
  for (const back of [1, 0]) MAT_IMG.forEach((im, k) => k % 2 === back && im?.complete && im.naturalWidth && g.drawImage(im, Math.round(x - 31 + k * 8.5), Math.round(y - 4 - back * 3), 12, 12));
  r(-32, -40, 4, 40, "#1a1020"); r(28, -40, 4, 40, "#1a1020"); r(-31, -40, 2, 40, "#c88a4a"); r(29, -40, 2, 40, "#c88a4a"); // posts
  for (let k = 0; k < 8; k++) r(-36 + k * 9, -48 + (k % 2), 9, 12, k % 2 ? "#ffe8c0" : "#ff6a8a"); // awning
  r(-36, -49, 72, 2, "#1a1020"); r(-36, -36, 72, 2, "#1a1020");
  r(-8, -30, 16, 14, "#1a1020"); r(-7, -29, 14, 12, "#ffd84a"); r(-3, -26, 6, 6, "#9a5e2c"); // a hammer sign
}
/** the world's standing things (传送门, your flag, 采集点, the workshop), y-sorted with the characters by the renderer */
export function worldSprites(game, me) {
  const m = game.map, ws = game.ws, out = [];
  if (!ws || !me) return out;
  const near = (o) => onView(game, o.x, o.y), today = dayKey();
  for (const d of ws.drops || []) out.push({ y: d.y + 2, draw: (g, t) => dropSprite(g, d, t) });
  for (const q of m.pockets) {
    if (!near(q)) continue;
    for (const j of q.door) {
      const x = (j % m.W) * T, y = Math.floor(j / m.W) * T;
      if (q.kind === "dragon" && m.t[j] === WALL) out.push({ y: y + T + 0.01, draw: (g) => crackSprite(g, x, y - 14, j) });
      else if (q.kind === "fox") out.push({ y: y + T - 1, draw: (g, t) => zapSprite(g, x, y, t, j, q) });
    }
  }
  for (const n of m.nodes) if (ws.nodeDay[n.id] !== today && near(n)) out.push({ y: n.y, draw: (g, t) => nodeSprite(g, n.x, n.y, n.b, t) });
  if (near(m.shop)) out.push({ y: m.shop.y + 22, draw: (g, t) => shopSprite(g, m.shop.x, m.shop.y, t) });
  { const [x0, y0, x1, y1] = m.home.rect; if (onView(game, (x0 + x1) * T / 2, (y0 + y1) * T / 2, Math.max(x1 - x0, y1 - y0) * T / 2 + 60)) homeSprites(m, ws, out); } // (the whole home, whenever any of it is on screen)
  if (ws.ev && near(ws.ev)) eventSprites(ws, out, { ...HOME_IMG, npc: npcImg });
  for (const w of m.waypoints) if (near(w)) out.push({ y: w.y + 6, draw: (g, t) => gateSprite(g, w.x, w.y, ws.gates.has(w.id), t) });
  if (ws.flag && near(ws.flag)) out.push({ y: ws.flag.y, draw: (g, t) => flagSprite(g, ws.flag.x, ws.flag.y, t) });
  return out;
}
/** labels over the piers (screen text drawn by the renderer's outlined text) */
export function worldLabels(R, g, game, me) {
  const m = game.map, ws = game.ws;
  if (!ws || !m.ferries || ws.ride) return;
  for (const w of m.waypoints) if (onView(game, w.x, w.y)) R.text(g, w.name, w.x, w.y - 64, ws.gates.has(w.id) ? "#9ef0ff" : "#c8c8dc", 11);
  if (!ws.drops?.length) for (const B of m.bosses) if (ws.bossDay[B.id] === dayKey() && onView(game, B.x, B.y)) { // (after its loot is picked up)
    R.text(g, `${ENEMIES[B.type].name} · 已击败`, B.x, B.y - 72, "#c8c0e0", 20);
    R.text(g, `${bossRespawnIn()} 后刷新`, B.x, B.y - 44, "#ffe36a", 22);
  }
  for (const q of m.pockets) {
    const j = q.door[1], dx = (j % m.W) * T + T / 2, dy = Math.floor(j / m.W) * T - (q.dy ? 26 : 50); // (over the doorway)
    if (Math.abs(me.x - dx) > 300 || Math.abs(me.y - dy) > 200 || (q.kind === "dragon" && m.t[j] !== WALL)) continue;
    if (q.kind === "fox" && foxRider(me)) continue;
    R.text(g, q.kind === "dragon" ? "裂纹岩 · 骑火龙击碎" : "电门 · 骑灵狐通过", dx, dy, q.kind === "dragon" ? "#ffb070" : "#ffe36a", 11);
  }
  if (flyingNow(me) && me.stam < STAMINA - 0.05) { // 冰凰's stamina, under the rider
    const w = 44, f = Math.max(0, me.stam / STAMINA), x = Math.round(me.x - w / 2), y = Math.round(me.y + 18);
    g.fillStyle = "#0c0814"; g.fillRect(x - 2, y - 2, w + 4, 8);
    g.fillStyle = "#26304a"; g.fillRect(x, y, w, 4);
    g.fillStyle = f < 0.3 ? "#ff7a5a" : "#7fe8ff"; g.fillRect(x, y, Math.round(w * f), 4);
  }
  if (onView(game, m.shop.x, m.shop.y)) R.text(g, ws.shopT > 0 ? talkHint() : "营地工坊", m.shop.x, m.shop.y - 60, ws.shopT > 0 ? "#9ef0ff" : "#ffe36a", 12);
  if (m.home && onView(game, m.home.board.x, m.home.board.y, 600)) { // 家园
    const H = ws.home, P = m.home.plots, lab = (txt, o, dy, col = "#ffe36a", sz = 12) => R.text(g, txt, o.x, o.y + dy, col, sz);
    lab(ws.standAt === "board" ? talkHint() : "派遣告示板", m.home.board, -78, ws.standAt === "board" ? "#9ef0ff" : "#ffe36a");
    lab(ws.standAt === "steward" ? talkHint() : "家园管家", m.home.steward, -72, ws.standAt === "steward" ? "#9ef0ff" : "#ffe36a");
    // building names on one line: the same height over every plot (built or not), the tower's over its roof
    for (const k of ["hut", "store", "spring", "tower"]) lab(H.lv[k] ? `${BUILD[k].name} Lv.${H.lv[k]}` : `空地 · ${BUILD[k].name}`, P[k], k === "tower" ? -118 : -96, H.lv[k] ? "#fff6c0" : "#c8c0e0", 12);
    lab(`宠物牧场 Lv.${H.lv.farm}`, { x: (m.home.pen.x0 + m.home.pen.x1) / 2, y: m.home.pen.y0 }, -30, "#fff6c0", 12);
    const Q = ws.quests, ready = Q && (Q.list.some((q) => q.prog >= q.n && !q.claimed) || (!Q.bonus && Q.list.every((q) => q.claimed)));
    lab(ws.standAt === "quest" ? talkHint() : ready ? "每日委托 · 可领取" : "每日委托", m.home.quest, -84, ws.standAt === "quest" ? "#9ef0ff" : ready ? "#7fff9a" : "#ffe36a");
  }
  const ev = ws.ev;
  if (ev && onView(game, ev.x, ev.y) && !(ev.kind === "meteor" && ev.open)) {
    const s = Math.max(0, Math.ceil(ev.until - game.time)), clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    if (ev.kind === "meteor") R.text(g, `陨星宝箱 · ${clock}`, ev.x, ev.y - 96, "#ffd84a", 13);
    else R.text(g, ws.standAt === "trader" ? talkHint() : `迷途商人 · ${clock}`, ev.x, ev.y - 90, ws.standAt === "trader" ? "#9ef0ff" : "#7fe8d8", 13);
  }
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
  quest(g, "chest");
  g.vfx("pickups/chest-open", c.x, c.y + 10, {});
  g.sound("pickup");
  for (let i = 0; i < (c.gold ? 10 : 5); i++) g.spawnCoin(c.x, c.y);
  // lasting rewards (no skill cards: that is what the dungeon's chests are for)
  const lines = c.gold
    ? [grant(g, "gems", 60), grant(g, "xp", 120), grant(g, ...roll([[0.35, "ur", 2], [0.3, "egg_ur", 1], [0.2, "hur", 1], [0.1, "stars", 10], [0.05, "egg_hur", 1]]))]
    : [grant(g, "gems", 20), grant(g, ...roll([[0.45, "pool", 60], [0.25, "stars", 3], [0.15, "ur", 1], [0.1, "egg_base", 1], [0.05, "egg_ur", 1]]))];
  const b = g.map.biome[tileIdx(g.map, c.x, c.y)];
  if (MATS[b]) lines.push(grant(g, "mat" + b, c.gold ? 5 : 2));
  showLoot(g, c.x, c.y, lines);
  worldSaveNow(g);
}
// ---------------------------------------------------------------- 每日委托 / 世界事件 (worldevents.js) hooks
/** a step on today's 委托: a short progress line, and a louder one when a task is done */
export function quest(g, kind, b = -1) {
  const ws = g.ws, me = g.players.find((q) => q.local) || g.players[0];
  if (!ws?.quests || ws.quests.day !== dayKey()) ws && (ws.quests = questsFor(dayKey()));
  const done = questBump(ws, kind, b);
  for (const q of ws.quests.list) if (q.fresh) {
    q.fresh = false;
    if (done.includes(q)) {
      g.text(me.x, me.y - 64, `委托完成 · ${questText(q, BIOMES)}`, "#ffd84a", 1.25, 2.4);
      g.sound("card", 0.2);
    } else if ((ws.qSay || 0) < g.time) (ws.qSay = g.time + 0.8), g.text(me.x, me.y - 60, `委托 ${q.prog}/${q.n}`, "#c8f0a0", 0.9, 1);
  }
}
const EH = {
  BIOMES,
  grant: (g, kind, n) => grant(g, kind, n),
  erupt: (g, x, y, groups) => erupt(g, x, y, groups),
  quest: (g, kind) => quest(g, kind),
  save: (g) => worldSaveNow(g),
  spend: (n) => { const m = load(); m.tokens -= n; save(); },
};
export function worldTrade(g, offer) {
  return tradeBuy(g, g.ws, offer, EH, () => load().tokens || 0);
}
/** claim a finished task (or the all-three bonus): the rewards go into the save */
export function claimQuest(g, k) {
  const ws = g.ws, Q = ws.quests;
  if (k === "bonus") {
    if (Q.bonus || !Q.list.every((q) => q.claimed)) return "还有委托没完成";
    Q.bonus = true;
    const lines = [Math.random() < 0.3 ? grant(g, "hur", 1) : grant(g, "egg_ur", 1)];
    worldSaveNow(g);
    return lines;
  }
  const q = Q.list[k];
  if (!q || q.claimed || q.prog < q.n) return "还没完成";
  q.claimed = true;
  const lines = [grant(g, "gems", q.gems), grant(g, "mat" + q.mat, q.matN)];
  worldSaveNow(g);
  return lines;
}
export { questText };
// ---------------------------------------------------------------- 家园: the pasture, the hot spring, the home banner
function home(g, ws, m, me, dt) {
  const H = ws.home;
  if (Math.abs(me.x - m.home.pen.x0) < 1200 && Math.abs(me.y - m.home.pen.y0) < 900) updatePasture(m, dt, H);
  // 温泉: step into the pool to heal (Lv2 adds a quick step); step out to soak again
  const sp = m.home.plots.spring, inPool = H.lv.spring > 0 && Math.abs(me.x - sp.x) < 40 && Math.abs(me.y - sp.y + 12) < 24;
  if (!inPool) ws.soaked = false;
  else if (!ws.soaked && !me.downed) {
    ws.soaked = true;
    me.hp = me.maxHp;
    me.shield = me.maxShield ?? me.shield;
    if (H.lv.spring > 1) me.buff.speed = Math.max(me.buff.speed || 0, 30);
    g.text(me.x, me.y - 50, H.lv.spring > 1 ? "温泉 · 回满 · 疾行" : "温泉 · 回满", "#9ef0ff", 1.1, 1.6);
    g.vfx("holy/heal-aoe", me.x, me.y);
    g.sound("heal");
  }
  // the region banner says 梦境家园 inside the home
  const [x0, y0, x1, y1] = m.home.rect, at = me.x / T >= x0 && me.x / T <= x1 + 6 && me.y / T >= y0 && me.y / T <= y1 + 1;
  if (at && !ws.atHome) g.banner = { text: "梦境家园", sub: "宠物牧场 · 派遣 · 建造", t: 2.2 };
  ws.atHome = at;
}
// on screen (the renderer's view, with margins for tall art); before the first frame, a generous box round the hero
const onView = (g, x, y, pad = 0) => { const v = g.view; return v ? x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad : true; };
// ---------------------------------------------------------------- W4: what each mount opens
// 冰凰's flight over water spends stamina (land refills it fast); at 30% a warning, at nothing the rider is washed
// back to the last shore. 电门 lets only a 灵狐 rider through; anyone else is thrown back. 裂纹岩 only cracks under a
// mounted 火龙's fire (game.damageWall; in the world plain rock no longer breaks).
export const STAMINA = 14; // seconds of flight over water: the islets need ~2 s; the narrowest strait to the isles (52 tiles) ~12 s
const foxRider = (p) => !!(p.mounted && p.pet?.id === "fox" && p.pet.stage === 3);
function zapTouch(m, p) {
  const r = p.r || 10;
  for (let ty = Math.floor((p.y - r) / T); ty <= Math.floor((p.y + r) / T); ty++) for (let tx = Math.floor((p.x - r) / T); tx <= Math.floor((p.x + r) / T); tx++) if (m.zap.has(ty * m.W + tx)) return true;
  return false;
}
function mounts(g, ws, m, dt) {
  for (const p of g.players) {
    if (p.dead) continue;
    const i = tileIdx(m, p.x, p.y), wet = m.t[i] === WATER;
    if (p.stam === undefined) p.stam = STAMINA;
    if (flyingNow(p) && wet) {
      p.stam -= dt;
      if (p.stam < STAMINA * 0.3 && (p.stamWarn || 0) < g.time) (p.stamWarn = g.time + 1.4), g.text(p.x, p.y - 46, p.stam > 0 ? "体力不足 · 快回陆地" : "", "#ff9a6a", 1, 1.2);
      if (p.stam <= 0 && p.lastLand) {
        Object.assign(p, { x: p.lastLand.x, y: p.lastLand.y, stam: STAMINA * 0.4, ivx: 0, ivy: 0 });
        Object.assign(p.pet, { x: p.x, y: p.y });
        g.vfx("spawn/poof", p.x, p.y, { palette: ["#0c1430", "#1e54ac", "#4fb4f0", "#9ef0ff", "#ffffff"] });
        g.text(p.x, p.y - 50, "体力耗尽 · 回到岸边", "#9ef0ff", 1.1, 1.8);
        g.sound("hurt", 0.2);
      }
    } else {
      p.stam = Math.min(STAMINA, p.stam + dt * (wet ? 0 : 3));
      if (!wet && !zapTouch(m, p) && m.reach[i] && !BIOMES[m.biome[i]].locked) p.lastLand = { x: p.x, y: p.y }; // (never a reserved continent's shore)
    }
    if (!m.zap.size) continue;
    if (zapTouch(m, p) && !foxRider(p) && !p.downed) {
      const back = p.zapSafe || p.lastLand;
      if (back) (p.x = back.x), (p.y = back.y);
      if ((p.zapT || 0) < g.time) {
        p.zapT = g.time + 0.8;
        g.text(p.x, p.y - 18, "被电门弹开", "#9ad8ff", 0.9, 1.1);
        g.vfx("lightning/zap-hit", p.x, p.y - 10);
        g.sound("shoot_thunder", 0.08);
      }
    } else if (!zapTouch(m, p)) p.zapSafe = { x: p.x, y: p.y };
  }
}
// exploration milestones: [%, reward, amount, title]
const MILES = [[10, "gems", 150], [25, "egg_ur", 1], [50, "hur", 1, "world_explorer"], [75, "egg_hur", 1], [100, "hur", 3, "world_cartographer"]];
// ---------------------------------------------------------------- travel: 回营地 / 旗帜 / 传送门
/** in combat = hurt in the last 3 seconds (anyone in the party); 3 s without taking damage is out of combat */
export const COMBAT_HOLD = 3;
export const inCombat = (g) => g.players.some((p) => !p.dead && p.hurtAt != null && g.time - p.hurtAt < COMBAT_HOLD);
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
    const t = m.t[i], [r, gg, b] = t !== WATER && inHome(m, i) ? [186, 226, 104] : BIOMES[m.biome[i]].mm;
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
  if (ws.ev && !(ws.ev.kind === "meteor" && ws.ev.open)) dot(ws.ev.x, ws.ev.y, now % 600 < 300 ? "#ffffff" : ws.ev.kind === "meteor" ? "#ffd84a" : "#5af0d0", 4); // (世界事件, blinking)
  // you: the same pin as on the world map
  const X = Math.round((me.x / T - tx) * k), Y = Math.round((me.y / T - ty) * k);
  g.fillStyle = "#0c0814";
  g.beginPath(); g.moveTo(X, Y + 1); g.lineTo(X - 7, Y - 11); g.arc(X, Y - 14, 8.5, Math.PI * 0.8, Math.PI * 2.2); g.closePath(); g.fill();
  g.fillStyle = "#ff4a6a";
  g.beginPath(); g.moveTo(X, Y - 2); g.lineTo(X - 5, Y - 11); g.arc(X, Y - 14, 6, Math.PI * 0.8, Math.PI * 2.2); g.closePath(); g.fill();
  g.fillStyle = "#ffffff"; g.beginPath(); g.arc(X, Y - 14, 2.6, 0, Math.PI * 2); g.fill();
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

// ---------------------------------------------------------------- region features (V6, the outer continents)
// 遗迹沙海: every 55 s a 13 s 沙暴 — a sand haze that hides the far screen, wind from the east that pushes you west and
// slows you; 流沙 patches slow you and swallow you a little if you stand in them (game.js).
// 幽影森林: 林间幽暗 — the forest is dark beyond a circle of light round you, fireflies drift; 瘴沼 patches poison.
// 云巅浮庭: 气流 lanes carry you along their arrows (game.js), and every 16 s a 2.5 s 阵风 shoves everyone one way.
const STORM_P = 55, STORM_ON = 42, GUST_P = 16, GUST_ON = 2.5;
/** a wind lane's direction (unit vector, one of eight) at a world point */
export function windAt(m, x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T), a = Math.round((vnoise(tx / 16, ty / 16, (m.seed || 0) + 91) * 2.2) * 8) * (Math.PI / 4);
  return [Math.cos(a), Math.sin(a)];
}
export const regionAt = (m, x, y) => m.biome[tileIdx(m, x, y)];
function regionTick(g, ws, m, dt) {
  const fx = (ws.rfx = ws.rfx || { storm: 0, gust: 0, gustA: 0, dark: 0, b: -1 });
  const st = g.time % STORM_P, storm = st > STORM_ON, gp = g.time % GUST_P, gust = gp < GUST_ON;
  if (gust && !fx.gustOn) fx.gustA = Math.random() * TAU_;
  fx.storm += ((storm ? 1 : 0) - fx.storm) * Math.min(1, dt * 1.5);
  fx.gust += ((gust ? 1 : 0) - fx.gust) * Math.min(1, dt * 4);
  for (const p of g.players) {
    if (p.dead) continue;
    const b = regionAt(m, p.x, p.y), fly = !!(p.mounted && p.pet?.id === "phoenix" && p.pet.stage === 3);
    p.push = null;
    p.regionSlow = 0;
    if (b === 4 && fx.storm > 0.05 && !fly) (p.push = [-40 * fx.storm, 8 * fx.storm]), (p.regionSlow = 1 - 0.12 * fx.storm);
    if (b === 6 && fx.gust > 0.05) p.push = [Math.cos(fx.gustA) * 85 * fx.gust, Math.sin(fx.gustA) * 85 * fx.gust];
    if (!p.local) continue;
    fx.dark += ((b === 5 ? 1 : 0) - fx.dark) * Math.min(1, dt * 1.2);
    fx.b = b;
    if (b === 4 && storm && !fx.stormOn) g.banner = { text: "沙暴来袭", sub: "视野受阻 · 逆风前行会减速", t: 2.2 };
    if (b === 6 && gust && !fx.gustOn) g.text(p.x, p.y - 60, "阵风！", "#e8f4ff", 1.2, 1);
  }
  fx.stormOn = storm;
  fx.gustOn = gust;
}
const TAU_ = Math.PI * 2;
let darkCv = null, hazeCv = null;
/** the region features on screen (screen space, over the world, under the bars and texts) */
export function drawRegionFx(g, game, me, cx, cy, t) {
  const fx = game.ws?.rfx;
  if (!fx || !me) return;
  const px = me.x - cx, py = me.y - 30 - cy;
  if (fx.dark > 0.02) {
    if (!darkCv) {
      darkCv = document.createElement("canvas");
      darkCv.width = darkCv.height = 1024;
      const d = darkCv.getContext("2d"), gr = d.createRadialGradient(512, 512, 90, 512, 512, 330);
      gr.addColorStop(0, "rgba(4,10,18,0)");
      gr.addColorStop(0.55, "rgba(4,10,18,0.42)");
      gr.addColorStop(1, "rgba(4,10,18,0.72)");
      d.fillStyle = gr;
      d.fillRect(0, 0, 1024, 1024);
    }
    g.globalAlpha = fx.dark;
    g.drawImage(darkCv, Math.round(px - 512), Math.round(py - 512));
    g.fillStyle = "rgba(4,10,18,0.72)";
    const L = px - 512, R = px + 512, U = py - 512, D = py + 512;
    if (L > 0) g.fillRect(0, 0, L, VIEW_H);
    if (R < VIEW_W) g.fillRect(R, 0, VIEW_W - R, VIEW_H);
    if (U > 0) g.fillRect(Math.max(0, L), 0, Math.min(VIEW_W, R) - Math.max(0, L), U);
    if (D < VIEW_H) g.fillRect(Math.max(0, L), D, Math.min(VIEW_W, R) - Math.max(0, L), VIEW_H - D);
    // fireflies drifting about the screen
    for (let i = 0; i < 16; i++) {
      const x = ((i * 137 + t * (8 + (i % 5) * 3) + Math.sin(t * 0.7 + i) * 30) % (VIEW_W + 40)) - 20, y = ((i * 89 + Math.sin(t * 0.5 + i * 2) * 40) % VIEW_H + VIEW_H) % VIEW_H;
      const on = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      g.globalAlpha = fx.dark * (0.35 + 0.65 * on);
      g.fillStyle = i % 3 ? "#9affd8" : "#e8ff9a";
      g.fillRect(Math.round(x), Math.round(y), 2, 2);
      g.globalAlpha = fx.dark * 0.18 * on;
      g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 6, 6);
    }
    g.globalAlpha = 1;
  }
  const inDes = fx.b === 4, k = inDes ? fx.storm : 0;
  if (k > 0.02) {
    if (!hazeCv) {
      hazeCv = document.createElement("canvas");
      hazeCv.width = VIEW_W;
      hazeCv.height = VIEW_H;
      const d = hazeCv.getContext("2d"), gr = d.createRadialGradient(VIEW_W / 2, VIEW_H / 2 - 30, 70, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.6);
      gr.addColorStop(0, "rgba(150,96,40,0.22)");
      gr.addColorStop(0.5, "rgba(130,82,34,0.55)");
      gr.addColorStop(1, "rgba(110,68,28,0.88)");
      d.fillStyle = gr;
      d.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    g.globalAlpha = k;
    g.drawImage(hazeCv, Math.round(px - VIEW_W / 2), Math.round(py + 30 - VIEW_H / 2) - 30);
    g.fillStyle = "rgba(110,68,28,0.88)";
    const ox = Math.round(px - VIEW_W / 2), oy = Math.round(py - VIEW_H / 2);
    if (ox > 0) g.fillRect(0, 0, ox, VIEW_H);
    if (ox < 0) g.fillRect(VIEW_W + ox, 0, -ox, VIEW_H);
    if (oy > 0) g.fillRect(0, 0, VIEW_W, oy);
    if (oy < 0) g.fillRect(0, VIEW_H + oy, VIEW_W, -oy);
    // streaks of blowing sand, east to west
    for (let i = 0; i < 90; i++) {
      const sp = 380 + (i % 7) * 60, x = VIEW_W - (((t * sp + i * 173) % (VIEW_W + 120)) - 60), y = (i * 53 + Math.sin(t + i) * 8) % VIEW_H;
      g.globalAlpha = k * (0.45 + (i % 4) * 0.13);
      g.fillStyle = i % 3 ? "#fff0c8" : "#6a4018";
      g.fillRect(Math.round(x), Math.round(y), 12 + (i % 5) * 5, i % 2 ? 2 : 1);
    }
    g.globalAlpha = 1;
  }
  const kg = fx.b === 6 ? fx.gust : 0;
  if (kg > 0.02) {
    const ax = Math.cos(fx.gustA), ay = Math.sin(fx.gustA);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const u = ((t * 1.6 + i * 0.37) % 1), bx = ((i * 211) % VIEW_W), by = ((i * 97) % VIEW_H), x = bx + ax * (u - 0.5) * 300, y = by + ay * (u - 0.5) * 300;
      g.globalAlpha = kg * Math.sin(u * Math.PI) * 0.7;
      g.beginPath();
      g.moveTo(Math.round(x), Math.round(y));
      g.lineTo(Math.round(x + ax * 22), Math.round(y + ay * 22));
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}
