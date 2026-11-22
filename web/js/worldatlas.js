// 梦境大陆's world-map art (the atlas): the generated world painted at 4 px a tile in the style of the user's reference
// map — continents raised over a deep-blue sea on cliff faces, a bright cyan surf line round every coast, mountains,
// trees (pines on the ice, sakura on the isles, cacti in the sand, ember crystals in the forge), lakes and rivers with
// light rims, sandy roads and plank bridges. Built once (~100 ms) the first time the map opens, then reused.
import { WALL, WATER, BUSH } from "./map.js";

export const AS = 4; // atlas pixels per tile
const SEA = [30, 84, 172], WAVE = [52, 112, 204], SURF = [168, 240, 255], GLOW = [84, 190, 242], INK = [30, 24, 44];
// per biome: ground (two shades), cliff (face, foot), rock (shade, lit, cap), tree (body, lit, kind), water (body, rim), path
const PAL = [
  { g: [124, 200, 62], g2: [108, 186, 52], mud: [150, 118, 70], c: [156, 110, 72], cl: [108, 74, 52], rk: [120, 122, 142], rh: [176, 178, 196], cap: [236, 240, 250], tr: [38, 128, 52], th: [92, 182, 74], tk: "round", w: [60, 168, 240], wh: [160, 230, 255] },
  { g: [232, 242, 250], g2: [216, 230, 246], mud: [196, 214, 236], c: [148, 170, 214], cl: [104, 124, 178], rk: [112, 118, 168], rh: [168, 174, 214], cap: [255, 255, 255], tr: [38, 104, 118], th: [74, 150, 150], tk: "pine", w: [96, 196, 244], wh: [200, 242, 255] },
  { g: [120, 84, 72], g2: [106, 72, 62], mud: [90, 60, 52], c: [74, 50, 46], cl: [50, 34, 32], rk: [70, 60, 64], rh: [110, 98, 100], cap: [255, 140, 60], tr: [240, 110, 60], th: [255, 196, 110], tk: "ember", w: [255, 118, 30], wh: [255, 216, 84] },
  { g: [188, 158, 238], g2: [172, 142, 226], mud: [150, 124, 200], c: [122, 98, 172], cl: [88, 70, 132], rk: [112, 102, 144], rh: [164, 154, 196], cap: [236, 226, 255], tr: [255, 150, 206], th: [255, 214, 238], tk: "sakura", w: [80, 214, 242], wh: [196, 252, 255] },
  { g: [242, 202, 104], g2: [230, 188, 88], mud: [214, 168, 80], c: [192, 132, 72], cl: [148, 96, 52], rk: [180, 112, 72], rh: [216, 156, 104], cap: [244, 206, 150], tr: [70, 162, 64], th: [120, 204, 96], tk: "cactus", w: [72, 182, 232], wh: [180, 236, 255] },
  { g: [72, 152, 62], g2: [60, 136, 54], mud: [60, 110, 60], c: [112, 86, 62], cl: [80, 60, 44], rk: [104, 106, 118], rh: [150, 152, 162], cap: [190, 196, 204], tr: [30, 98, 46], th: [64, 134, 62], tk: "round", w: [96, 156, 186], wh: [150, 200, 220] },
  { g: [152, 222, 124], g2: [136, 208, 110], mud: [120, 190, 100], c: [150, 150, 190], cl: [110, 110, 152], rk: [158, 160, 182], rh: [206, 208, 224], cap: [255, 255, 255], tr: [56, 150, 70], th: [110, 200, 100], tk: "round", w: [120, 204, 255], wh: [210, 246, 255] },
];
const PATH = [234, 202, 140], PATH2 = [218, 184, 120], PLANK = [172, 110, 60], PLANK2 = [136, 82, 44];
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// smooth value noise (per tile) for the big light / dark patches of ground
const vnoise = (x, y) => {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
let cache = null, job = null;
/** { art, rim }: art is the painted world (W·4 square); rim holds only the surf line, drawn faintly over the fog */
export function worldAtlas(m) {
  if (cache) return cache;
  job = job || build(m);
  while (!job.next().done);
  return cache;
}
/** paint the atlas a few milliseconds at a time while the game idles (so the first map open is instant on phones) */
/** paint the atlas now, in slices that let the page breathe (the loading screen's progress bar); resolves when done */
export async function buildAtlas(m, onStep) {
  if (cache) return;
  job = job || build(m);
  let n = 0;
  for (;;) {
    const end = performance.now() + 24;
    while (performance.now() < end) if (job.next().done) return;
    onStep && onStep(++n);
    await new Promise((r) => setTimeout(r, 0));
  }
}
export function prebuildAtlas(m) {
  if (cache || job) return;
  job = build(m);
  const step = (dl) => {
    if (cache) return;
    const end = performance.now() + Math.min(8, dl?.timeRemaining?.() ?? 6);
    while (performance.now() < end) if (job.next().done) return;
    (window.requestIdleCallback || ((f) => setTimeout(f, 50)))(step, { timeout: 400 });
  };
  setTimeout(step, 1500);
}
function* build(m) {
  const W = m.W, A = W * AS, N = A * A, land = m.land;
  const data = new Uint8ClampedArray(N * 4);
  const put = (px, py, c) => {
    if (px < 0 || py < 0 || px >= A || py >= A) return;
    const o = (py * A + px) * 4;
    data[o] = c[0], data[o + 1] = c[1], data[o + 2] = c[2], data[o + 3] = 255;
  };
  // raised: 1 = the top of the land, 2 = a cliff face hanging under it (CLIFF px tall), else sea
  const CLIFF = 9, raised = new Uint8Array(N), depth = new Uint8Array(N), owner = new Uint16Array(N);
  for (let py = 0; py < A; py++) for (let px = 0; px < A; px++) {
    if (!px && !(py & 31)) yield;
    const j = py * A + px, tx = px >> 2, i = (py >> 2) * W + tx;
    if (land[i]) { raised[j] = 1; continue; }
    for (let k = 1; k <= CLIFF && py - k >= 0; k++) {
      const ii = ((py - k) >> 2) * W + tx;
      if (land[ii]) { raised[j] = 2; depth[j] = k; owner[j] = ii; break; }
    }
  }
  // distance (px, capped) from the raised land out over the sea, for the surf and its glow (a two-pass chamfer)
  const dist = new Uint8Array(N).fill(255);
  for (let j = 0; j < N; j++) if (raised[j]) dist[j] = 0;
  for (let py = 0; py < A; py++) for (let px = 0; px < A; px++) {
    if (!px && !(py & 63)) yield;
    const j = py * A + px;
    if (!dist[j]) continue;
    let v = dist[j];
    if (px > 0) v = Math.min(v, dist[j - 1] + 2);
    if (py > 0) v = Math.min(v, dist[j - A] + 2, px > 0 ? dist[j - A - 1] + 3 : 255, px < A - 1 ? dist[j - A + 1] + 3 : 255);
    dist[j] = Math.min(255, v);
  }
  for (let py = A - 1; py >= 0; py--) for (let px = A - 1; px >= 0; px--) {
    if (px === A - 1 && !(py & 63)) yield;
    const j = py * A + px;
    if (!dist[j]) continue;
    let v = dist[j];
    if (px < A - 1) v = Math.min(v, dist[j + 1] + 2);
    if (py < A - 1) v = Math.min(v, dist[j + A] + 2, px < A - 1 ? dist[j + A + 1] + 3 : 255, px > 0 ? dist[j + A - 1] + 3 : 255);
    dist[j] = Math.min(255, v);
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= W ? WATER : m.t[ty * W + tx]);
  const rimData = new Uint8ClampedArray(N * 4), patchT = new Uint8Array(W * W);
  for (let i = 0; i < W * W; i++) patchT[i] = vnoise((i % W) / 7, ((i / W) | 0) / 7) * 0.7 + vnoise((i % W) / 2.5, ((i / W) | 0) / 2.5) * 0.3 > 0.5 ? 1 : 0;
  for (let py = 0; py < A; py++) for (let px = 0; px < A; px++) {
    if (!px && !(py & 15)) yield;
    const j = py * A + px, tx = px >> 2, ty = py >> 2, i = ty * W + tx, lx = px & 3, ly = py & 3;
    let c;
    if (m.road[i] >= 2) {
      // a plank bridge or pier: boards across the way, dark rails on its two long sides
      const ew = m.bdir[i] === 1, along = ew ? px : py, side = ew ? ly : lx;
      c = side === 0 || side === 3 ? PLANK2 : along % 2 ? PLANK : mix(PLANK, PLANK2, 0.35);
    } else if (raised[j] === 2) {
      const P = PAL[m.biome[owner[j]]], foot = depth[j] >= CLIFF - 1 || (py + 1 < A && raised[j + A] !== 2 && !raised[j + A]);
      c = foot ? P.cl : depth[j] === 1 ? mix(P.c, [255, 255, 255], 0.12) : (px + (hash(tx, 7) * 5) | 0) % 5 === 0 ? mix(P.c, P.cl, 0.6) : P.c;
    } else if (!raised[j]) {
      const d = dist[j];
      if (d <= 2) c = SURF;
      else if (d <= 5) c = mix(SURF, GLOW, (d - 2) / 3);
      else if (d <= 12) c = mix(GLOW, SEA, (d - 5) / 7);
      else c = (py % 6 === 0 && hash(px >> 3, py) < 0.06) ? WAVE : SEA;
      if (d <= 4) rimData.set([200, 246, 255, d <= 2 ? 255 : 140], j * 4);
    } else {
      const b = m.biome[i], P = PAL[b], t = m.t[i];
      if (t === WATER) {
        const rim = (lx === 0 && tileAt(tx - 1, ty) !== WATER) || (lx === 3 && tileAt(tx + 1, ty) !== WATER) || (ly === 0 && tileAt(tx, ty - 1) !== WATER) || (ly === 3 && tileAt(tx, ty + 1) !== WATER);
        c = rim ? P.wh : (hash(px >> 1, py) < 0.04 ? P.wh : P.w);
      } else if (m.road[i]) c = hash(px, py) < 0.12 ? PATH2 : PATH;
      else if (t === WALL) c = mix(P.rk, P.g2, 0.35);
      else {
        const patch = patchT[i];
        c = m.mud[i] ? P.mud : patch ? P.g : P.g2;
        if (hash(px, py) < 0.03) c = mix(c, [255, 255, 255], 0.25);
        if (t === BUSH) c = mix(c, P.tr, 0.3);
      }
    }
    data[j * 4] = c[0], data[j * 4 + 1] = c[1], data[j * 4 + 2] = c[2], data[j * 4 + 3] = 255;
  }
  // sprites on top, row by row so the lower ones overlap: mountains on the rock, trees on the bushes
  const solid = (tx, ty, t) => tileAt(tx, ty) === t;
  for (let ty = 1; ty < W - 1; ty++) for (let tx = 1; tx < W - 1; tx++) {
    if (tx === 1 && !(ty & 15)) yield;
    const t = m.t[ty * W + tx];
    if (t !== WALL && t !== BUSH) continue;
    const P = PAL[m.biome[ty * W + tx]], h = hash(tx * 3, ty * 5);
    if (t === WALL) {
      if ((tx + ty * 2) % 3 || h > 0.75) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += solid(tx + dx, ty + dy, WALL);
      if (n < 6) continue;
      mountain(put, tx * AS + 2, ty * AS + 3, 7 + ((h * 8) | 0) % 3, P);
    } else {
      if (h > 0.5 || (tx + ty) % 2) continue;
      tree(put, tx * AS + 1 + ((h * 10) | 0) % 3, ty * AS + 3, P);
    }
  }
  const art = document.createElement("canvas"), rim = document.createElement("canvas");
  art.width = art.height = rim.width = rim.height = A;
  art.getContext("2d").putImageData(new ImageData(data, A, A), 0, 0);
  rim.getContext("2d").putImageData(new ImageData(rimData, A, A), 0, 0);
  cache = { art, rim };
  job = null;
}

// a mountain: h rows tall, its foot centred on (x, y); the left flank in shade, a snow (or ember) cap
function mountain(put, x, y, h, P) {
  for (let r = 0; r < h; r++) {
    const half = Math.round(((r + 1) * (h + 1)) / (2 * h) + r * 0.35), yy = y - h + 1 + r;
    for (let dx = -half - 1; dx <= half + 1; dx++) put(x + dx, yy, INK);
    for (let dx = -half; dx <= half; dx++) put(x + dx, yy, r < 3 ? (dx < 0 ? P.rh : P.cap) : dx < 0 ? P.rk : P.rh);
  }
  for (let dx = -1; dx <= 1; dx++) put(x + dx, y - h, INK);
}
// 7×7 trees: "k" ink outline, "o" lit, "#" body, "|" trunk
const SHAPES = {
  round: ["  kkk  ", " koo#k ", "ko####k", "k#####k", " k###k ", "  k|k  ", "   k   "],
  sakura: [" kk kk ", "koo#o#k", "k#o###k", "k#####k", " k###k ", "  k|k  ", "   k   "],
  pine: ["   k   ", "  kok  ", " ko#k  ", " k###k ", "ko####k", "kkk|kkk", "   k   "],
  cactus: ["   k   ", " kkok  ", "kok#kk ", "k#k#kok", " kk##k ", "   #k  ", "   k   "],
  ember: ["   k   ", "  kok  ", " ko#k  ", "kk#o#kk", "k#k#k#k", " k kkk ", "       "],
};
function tree(put, x, y, P) {
  const s = SHAPES[P.tk];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const ch = s[r][c];
    if (!ch || ch === " ") continue;
    put(x + c - 3, y - 6 + r, ch === "k" ? INK : ch === "|" ? [92, 60, 40] : ch === "o" ? P.th : P.tr);
  }
}
