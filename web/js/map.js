// Arena generation (Brawl Stars style symmetric maps), tile art, collision and enemy flow fields.
import { T } from "./data.js";
import { rng } from "./util.js";

export const F = 0, WALL = 1, WATER = 2, BUSH = 3, CRATE = 4, BARREL = 5;
export const SOLID = (t) => t === WALL || t === WATER || t === CRATE || t === BARREL;
export const BLOCKS_SHOT = (t) => t === WALL || t === CRATE || t === BARREL;
const LIFT = 14; // block height in px (3/4 view)

export const THEMES = [
  { // 数据草原
    name: "数据草原",
    g1: "#78c850", g2: "#6fbf48", gHi: "#8fd862", gLo: "#5aa83a", dirt: "#c8a26a", dirtLo: "#a8824e",
    top: "#e8c08a", topHi: "#fde3b0", front: "#b07a48", frontLo: "#8a5a34", ink: "#2a1a14",
    bush: "#3c9a3c", bushHi: "#5cc04e", bushLo: "#2a7a30", water: "#3fb4ea", waterHi: "#8fe0ff", waterLo: "#2a86c8", rim: "#e8d8a8",
    mud: "#7a5a3a", mudHi: "#9a7650",
  },
  { // 显存冰原 (used by the boss room for contrast)
    name: "幻觉神殿",
    g1: "#8a7ac8", g2: "#8070bd", gHi: "#a090dc", gLo: "#6a5aa8", dirt: "#c4a6e0", dirtLo: "#9a80c0",
    top: "#d8d0f0", topHi: "#f4f0ff", front: "#8a7ab8", frontLo: "#62529a", ink: "#1e1430",
    bush: "#c85aa8", bushHi: "#f08ad0", bushLo: "#9a3a84", water: "#40d0e0", waterHi: "#a0f4ff", waterLo: "#2a98b8", rim: "#e8d8a8",
    mud: "#5a4a7a", mudHi: "#7a6aa0",
  },
  { // 显存冰原: snow field; the patches are slippery ice
    name: "显存冰原",
    g1: "#dbe8f4", g2: "#d2e1ef", gHi: "#f4faff", gLo: "#b4c8de", dirt: "#a8bcd4", dirtLo: "#8aa0bc",
    top: "#e6eef8", topHi: "#ffffff", front: "#8aa4c4", frontLo: "#6a84a8", ink: "#1a2238",
    bush: "#5a8ab0", bushHi: "#8ab8dc", bushLo: "#3a648a", water: "#2a6ab8", waterHi: "#7ab8f0", waterLo: "#1a4a8a", rim: "#f4faff",
    mud: "#9ad8f4", mudHi: "#e4f8ff", mudDot: "#6ab4e0", flowers: ["#ffffff", "#bfe8ff", "#d8c8ff"],
  },
  { // 算力熔炉: scorched factory floor; the glowing cracks are lava
    name: "算力熔炉",
    g1: "#5a4a48", g2: "#544442", gHi: "#76625c", gLo: "#3e302e", dirt: "#7a5a4a", dirtLo: "#5a3e32",
    top: "#8a7a74", topHi: "#b0a098", front: "#4a3a3a", frontLo: "#32262a", ink: "#140c0c",
    bush: "#7a4a3a", bushHi: "#a86a4a", bushLo: "#4e2e24", water: "#5a1a08", waterHi: "#ff8a2a", waterLo: "#2a0a04", rim: "#3a2a28",
    mud: "#d8481c", mudHi: "#ffc23a", mudDot: "#8a1e0a", flowers: ["#ffb04a", "#ff6a2a", "#ffe08a"],
  },
];

function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// --------------------------------------------------------------- generation
export function generateRoom(kind, seed, themeIdx = 0, gopt = {}) {
  const W = kind === "boss" ? 28 : kind === "shop" ? 22 : 30, H = kind === "boss" ? 18 : kind === "shop" ? 14 : 19;
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = rng(seed + attempt * 7919);
    const m = { W, H, kind, seed, theme: themeIdx, hazard: gopt.hazard || "mud", t: new Uint8Array(W * H), mud: new Uint8Array(W * H), spikes: [], crates: {}, poison: [], decals: [] };
    const set = (x, y, v) => {
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) m.t[y * W + x] = v;
    };
    for (let x = 0; x < W; x++) (m.t[x] = WALL), (m.t[(H - 1) * W + x] = WALL);
    for (let y = 0; y < H; y++) (m.t[y * W] = WALL), (m.t[y * W + W - 1] = WALL);
    const spawn = { x: 3, y: Math.floor(H / 2) };
    const center = { x: Math.floor(W / 2), y: Math.floor(H / 2) };
    const mirror = (x, y, v) => {
      set(x, y, v);
      set(W - 1 - x, y, v);
      set(x, H - 1 - y, v);
      set(W - 1 - x, H - 1 - y, v);
    };
    if (kind === "combat") {
      const n = r.int(5, 8);
      for (let i = 0; i < n; i++) {
        const x = r.int(2, Math.floor(W / 2) - 1), y = r.int(2, Math.floor(H / 2) - 1);
        // ice / lava maps scatter more of their hazard patches
        const k = r.pick(["hwall", "vwall", "L", "block", "bush", "bush", "water", "crates", "mud", ...(gopt.hazard === "ice" || gopt.hazard === "lava" ? ["mud", "mud"] : [])]);
        if (k === "hwall") for (let j = 0; j < r.int(2, 5); j++) mirror(x + j, y, WALL);
        else if (k === "vwall") for (let j = 0; j < r.int(2, 4); j++) mirror(x, y + j, WALL);
        else if (k === "L") {
          const a = r.int(2, 4), b = r.int(2, 3);
          for (let j = 0; j < a; j++) mirror(x + j, y, WALL);
          for (let j = 0; j < b; j++) mirror(x, y + j, WALL);
        } else if (k === "block") for (let j = 0; j < 2; j++) for (let q = 0; q < 2; q++) mirror(x + j, y + q, WALL);
        else if (k === "bush") {
          const w = r.int(2, 4), h = r.int(2, 3);
          for (let j = 0; j < w; j++) for (let q = 0; q < h; q++) if (r() > 0.15) mirror(x + j, y + q, BUSH);
        } else if (k === "water") {
          const w = r.int(2, 3), h = r.int(1, 2);
          for (let j = 0; j < w; j++) for (let q = 0; q < h; q++) mirror(x + j, y + q, WATER);
        } else if (k === "crates") {
          for (let j = 0; j < r.int(1, 3); j++) mirror(x + j, y, CRATE);
        } else if (k === "mud") {
          for (let j = -1; j < 2; j++) for (let q = -1; q < 2; q++) if (r() > 0.25) {
            const xs = [x + j, W - 1 - x - j], ys = [y + q, H - 1 - y - q];
            for (const a of xs) for (const b of ys) if (a > 0 && b > 0 && a < W - 1 && b < H - 1) m.mud[b * W + a] = 1;
          }
        }
      }
      // barrels and hazards
      const nb = r.int(1, 2);
      for (let i = 0; i < nb; i++) mirror(r.int(3, Math.floor(W / 2) - 2), r.int(2, H - 3), BARREL);
      if (r() < 0.7) {
        const sx = r.int(5, Math.floor(W / 2) - 2), sy = r.int(2, H - 3);
        m.spikes.push({ x: sx, y: sy }, { x: W - 1 - sx, y: H - 1 - sy });
      }
    } else if (kind === "boss") {
      for (const [x, y] of [[6, 4], [W - 7, 4], [6, H - 5], [W - 7, H - 5]]) for (let j = 0; j < 2; j++) for (let q = 0; q < 2; q++) set(x + j, y + q, WALL);
      for (const [x, y] of [[3, 2], [W - 5, 2], [3, H - 4], [W - 5, H - 4]]) for (let j = 0; j < 2; j++) for (let q = 0; q < 2; q++) set(x + j, y + q, BUSH);
      for (const [x, y] of [[W / 2 - 1, 2], [W / 2, H - 3]]) set(x | 0, y | 0, CRATE);
    } else if (kind === "shop") {
      for (let x = 3; x < W - 3; x += 4) set(x, 1 + 1, BUSH), set(x, H - 3, BUSH);
      for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) set(x, y, WALL);
    }
    // clear spawn & center
    const clear = (cx, cy, rr) => {
      for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
        m.t[y * W + x] = F;
        m.mud[y * W + x] = 0;
      }
    };
    clear(spawn.x, spawn.y, 2);
    clear(W - 1 - spawn.x, spawn.y, 1);
    clear(center.x, center.y, kind === "boss" || gopt.koth ? 3 : 2);
    m.spikes = m.spikes.filter((s) => m.t[s.y * W + s.x] === F);
    // connectivity
    const seen = flood(m, spawn.x, spawn.y);
    let open = 0, reached = 0;
    for (let i = 0; i < W * H; i++) if (!SOLID(m.t[i])) {
      open++;
      if (seen[i]) reached++;
    }
    if (reached < open && attempt < 29) continue;
    for (let i = 0; i < W * H; i++) if (!SOLID(m.t[i]) && !seen[i]) m.t[i] = WALL;
    for (let i = 0; i < W * H; i++) if (m.t[i] === CRATE || m.t[i] === BARREL) m.crates[i] = { hp: m.t[i] === CRATE ? 30 : 12 };
    // decals (flowers, pebbles, tufts)
    for (let i = 0; i < W * H * 0.18; i++) {
      const x = r.int(1, W - 2), y = r.int(1, H - 2);
      if (m.t[y * W + x] === F && !m.mud[y * W + x]) m.decals.push({ x: x * T + r.int(4, 28), y: y * T + r.int(4, 28), k: r.int(0, 4) });
    }
    m.spawn = { x: spawn.x * T + T / 2, y: spawn.y * T + T / 2 };
    m.center = { x: center.x * T + T / 2, y: center.y * T + T / 2 };
    m.pxW = W * T;
    m.pxH = H * T;
    // spawn spots for enemies: open tiles far from the player spawn
    m.spots = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (m.t[i] === F && !m.mud[i] && Math.abs(x - spawn.x) + Math.abs(y - spawn.y) > 9) m.spots.push({ x: x * T + T / 2, y: y * T + T / 2 });
    }
    m.itemSpots = [];
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (m.t[y * W + x] === F && !m.mud[y * W + x]) m.itemSpots.push({ x: x * T + T / 2, y: y * T + T / 2 });
    return m;
  }
}

function flood(m, sx, sy) {
  const { W, H } = m, seen = new Uint8Array(W * H), q = [sy * W + sx];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop(), x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[j] || SOLID(m.t[j])) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

export const tileAt = (m, px, py) => {
  const x = Math.floor(px / T), y = Math.floor(py / T);
  if (x < 0 || y < 0 || x >= m.W || y >= m.H) return WALL;
  return m.t[y * m.W + x];
};
export const mudAt = (m, px, py) => {
  const x = Math.floor(px / T), y = Math.floor(py / T);
  return x >= 0 && y >= 0 && x < m.W && y < m.H && m.mud[y * m.W + x];
};

/** Move a circle (x,y,r) by dx,dy against solid tiles. flags: {fly, phase} */
export function moveCircle(m, e, dx, dy, fly = false, phase = false) {
  const solid = (t) => (phase ? false : fly ? t === WALL || t === CRATE || t === BARREL : SOLID(t));
  const r = e.r;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
  let hit = false;
  for (let s = 0; s < steps; s++) {
    e.x += dx / steps;
    hit = pushOut(m, e, r, solid) || hit;
    e.y += dy / steps;
    hit = pushOut(m, e, r, solid) || hit;
  }
  // keep inside the room
  e.x = Math.max(T + r, Math.min(m.pxW - T - r, e.x));
  e.y = Math.max(T + r, Math.min(m.pxH - T - r, e.y));
  return hit;
}
function pushOut(m, e, r, solid) {
  let hit = false;
  const x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r) / T), y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) continue;
    if (!solid(m.t[ty * m.W + tx])) continue;
    const cx = Math.max(tx * T, Math.min(e.x, tx * T + T)), cy = Math.max(ty * T, Math.min(e.y, ty * T + T));
    const ddx = e.x - cx, ddy = e.y - cy, d2 = ddx * ddx + ddy * ddy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2), k = (r - d) / d;
        e.x += ddx * k;
        e.y += ddy * k;
      } else {
        // center inside the tile: push along the shortest axis
        const l = e.x - tx * T, rr = tx * T + T - e.x, u = e.y - ty * T, dd = ty * T + T - e.y, mn = Math.min(l, rr, u, dd);
        if (mn === l) e.x = tx * T - r;
        else if (mn === rr) e.x = tx * T + T + r;
        else if (mn === u) e.y = ty * T - r;
        else e.y = ty * T + T + r;
      }
    }
  }
  return hit;
}

/** Line of sight between two points (walls/crates block, water doesn't). */
export function los(m, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 10);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (BLOCKS_SHOT(tileAt(m, ax + (bx - ax) * t, ay + (by - ay) * t))) return false;
  }
  return true;
}

/** BFS distance field from target positions (array of {x,y}) over walkable tiles. */
export function flowField(m, targets) {
  const { W, H } = m, D = new Int16Array(W * H).fill(-1), q = [];
  for (const p of targets) {
    const i = Math.floor(p.y / T) * W + Math.floor(p.x / T);
    if (i >= 0 && i < W * H && D[i] < 0) {
      D[i] = 0;
      q.push(i);
    }
  }
  let h = 0;
  while (h < q.length) {
    const i = q[h++], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || D[j] >= 0 || SOLID(m.t[j])) continue;
      D[j] = D[i] + 1;
      q.push(j);
    }
  }
  return D;
}
/** Direction to walk along a flow field from (x,y). */
export function flowDir(m, D, x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T), W = m.W;
  const here = D[ty * W + tx];
  let best = here < 0 ? 9999 : here, bx = 0, by = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= m.H) continue;
    const v = D[ny * W + nx];
    if (v < 0) continue;
    if (dx && dy && (D[ty * W + nx] < 0 || D[ny * W + tx] < 0)) continue; // no corner cutting
    if (v < best) {
      best = v;
      bx = dx;
      by = dy;
    }
  }
  if (!bx && !by) return null;
  // aim for the next tile's center
  const cx = (tx + bx) * T + T / 2, cy = (ty + by) * T + T / 2, l = Math.hypot(cx - x, cy - y) || 1;
  return [(cx - x) / l, (cy - y) / l];
}

// --------------------------------------------------------------- art
const cache = new Map();
function px(g, x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

/** Pre-render the floor layer of a room (ground, dirt paths, mud, water base, decals, spike plates). */
export function renderGround(m) {
  const th = THEMES[m.theme], c = cv(m.pxW, m.pxH), g = c.getContext("2d"), r = rng(m.seed ^ 0x5151);
  const W = m.W, H = m.H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x * T, Y = y * T;
    px(g, X, Y, T, T, (x + y) % 2 ? th.g1 : th.g2);
    // soft grass texture: little highlight & shadow strokes
    for (let k = 0; k < 4; k++) {
      const gx = X + r.int(2, 28), gy = Y + r.int(3, 28);
      px(g, gx, gy, 1, 2, th.gHi);
      px(g, gx + 1, gy + 1, 1, 1, th.gLo);
    }
  }
  // mud patches with rounded edges
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.mud[y * W + x]) {
    const X = x * T, Y = y * T;
    g.fillStyle = th.mud;
    g.beginPath();
    g.roundRect(X - 2, Y - 2, T + 4, T + 4, 9);
    g.fill();
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.mud[y * W + x]) {
    const X = x * T, Y = y * T;
    for (let k = 0; k < 5; k++) px(g, X + r.int(3, 26), Y + r.int(3, 27), r.int(2, 5), 2, th.mudHi);
    px(g, X + r.int(6, 20), Y + r.int(6, 20), 3, 3, th.mudDot || "#5a3e26");
  }
  // shadows cast by blocks onto the floor (to the bottom-right)
  g.fillStyle = "rgba(20,40,10,0.28)";
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = m.t[y * W + x];
    if (t === WALL || t === CRATE || t === BARREL) g.fillRect(x * T + 6, y * T + 6, T, T);
  }
  // water base (animated highlights drawn live)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.t[y * W + x] === WATER) {
    const X = x * T, Y = y * T;
    px(g, X, Y, T, T, th.water);
    const up = y > 0 && m.t[(y - 1) * W + x] === WATER, dn = m.t[(y + 1) * W + x] === WATER;
    const lf = m.t[y * W + x - 1] === WATER, rt = m.t[y * W + x + 1] === WATER;
    if (!up) px(g, X, Y, T, 6, th.waterLo), px(g, X, Y, T, 2, th.rim);
    if (!dn) px(g, X, Y + T - 3, T, 3, th.waterHi);
    if (!lf) px(g, X, Y, 3, T, th.rim);
    if (!rt) px(g, X + T - 3, Y, 3, T, th.rim);
  }
  // decals
  for (const d of m.decals) {
    if (d.k === 0) { // flower
      const col = r.pick(th.flowers || ["#ffffff", "#ffe066", "#ff8ac0"]);
      px(g, d.x - 1, d.y, 3, 1, col); px(g, d.x, d.y - 1, 1, 3, col); px(g, d.x, d.y, 1, 1, "#ffb030");
    } else if (d.k === 1) { // pebble
      px(g, d.x, d.y, 4, 3, "#c8c0b0"); px(g, d.x, d.y, 3, 1, "#f0ece0"); px(g, d.x + 1, d.y + 3, 3, 1, th.gLo);
    } else if (d.k === 2) { // tuft
      px(g, d.x, d.y, 1, 3, th.bushLo); px(g, d.x + 2, d.y - 1, 1, 4, th.bushLo); px(g, d.x + 4, d.y, 1, 3, th.bushLo);
      px(g, d.x + 2, d.y - 1, 1, 1, th.gHi);
    } else { // little dirt spot
      px(g, d.x, d.y, 5, 2, th.dirt); px(g, d.x + 1, d.y + 2, 3, 1, th.dirtLo);
    }
  }
  // spike plates
  for (const s of m.spikes) drawSpikePlate(g, s.x * T, s.y * T);
  return c;
}

function drawSpikePlate(g, X, Y) {
  px(g, X + 2, Y + 2, T - 4, T - 4, "#5a5a6a");
  px(g, X + 3, Y + 3, T - 6, T - 6, "#8a8a9a");
  px(g, X + 3, Y + 3, T - 6, 1, "#b0b0c0");
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) px(g, X + 7 + i * 8, Y + 7 + j * 8, 3, 3, "#3a3a46");
}
export function drawSpikes(g, X, Y, up) {
  // up: 0..1 how far the spikes are out
  if (up <= 0) return;
  const h = Math.round(9 * up);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x = X + 8 + i * 8, y = Y + 9 + j * 8;
    g.fillStyle = "#2a2a34";
    g.fillRect(x - 1, y - h - 1, 3, h + 1);
    g.fillStyle = "#e8eef8";
    g.fillRect(x, y - h, 1, h);
    g.fillStyle = "#ffffff";
    g.fillRect(x, y - h - 1, 1, 1);
  }
}

/** A wall block sprite for a neighbor mask. Returns canvas T x (T+LIFT), drawn at (X, Y - LIFT). */
export function wallSprite(theme, mask) {
  const key = "w" + theme + "_" + mask;
  if (cache.has(key)) return cache.get(key);
  const th = THEMES[theme], c = cv(T, T + LIFT), g = c.getContext("2d");
  const L = mask & 1, Rr = mask & 2, U = mask & 4, D = mask & 8; // neighbors that are walls
  // top face
  px(g, 0, 0, T, T, th.top);
  // plank / stone texture on top
  for (let y = 4; y < T; y += 8) px(g, 0, y, T, 1, th.topHi);
  for (let y = 7; y < T; y += 8) px(g, 0, y, T, 1, shade(th.top, -0.08));
  // front face only when nothing below
  if (!D) {
    px(g, 0, T, T, LIFT, th.front);
    px(g, 0, T, T, 2, shade(th.front, 0.15));
    for (let x = 3; x < T; x += 8) px(g, x, T + 3, 2, LIFT - 5, th.frontLo);
    px(g, 0, T + LIFT - 2, T, 2, th.ink);
  } else {
    px(g, 0, T, T, LIFT, th.top);
    for (let y = T + 4; y < T + LIFT; y += 8) px(g, 0, y, T, 1, th.topHi);
  }
  // outlines on open sides
  g.fillStyle = th.ink;
  if (!U) g.fillRect(0, 0, T, 2);
  if (!L) g.fillRect(0, 0, 2, T + LIFT);
  if (!Rr) g.fillRect(T - 2, 0, 2, T + LIFT);
  // rim highlight
  if (!U) px(g, L ? 0 : 2, 2, T - (L ? 0 : 2) - (Rr ? 0 : 2), 2, th.topHi);
  cache.set(key, c);
  return c;
}
export function wallMask(m, x, y) {
  const W = m.W, at = (a, b) => a >= 0 && b >= 0 && a < W && b < m.H && m.t[b * W + a] === WALL;
  return (at(x - 1, y) ? 1 : 0) | (at(x + 1, y) ? 2 : 0) | (at(x, y - 1) ? 4 : 0) | (at(x, y + 1) ? 8 : 0);
}

export function crateSprite(kind, dmg = 0) {
  const key = "c" + kind + (dmg > 0.5 ? "d" : "");
  if (cache.has(key)) return cache.get(key);
  const c = cv(T, T + 10), g = c.getContext("2d");
  if (kind === "crate") {
    px(g, 2, 2, 28, 34, "#2a1a10");
    px(g, 4, 4, 24, 14, "#e0a050"); // top
    px(g, 4, 4, 24, 2, "#ffd090");
    px(g, 4, 18, 24, 16, "#b8742e"); // front
    px(g, 4, 18, 24, 2, "#d08a40");
    px(g, 4, 25, 24, 2, "#8a5420");
    px(g, 6, 20, 2, 12, "#8a5420"); px(g, 24, 20, 2, 12, "#8a5420");
    px(g, 8, 8, 16, 2, "#b8742e"); px(g, 8, 12, 16, 2, "#b8742e");
    if (dmg > 0.5) { px(g, 12, 6, 2, 10, "#2a1a10"); px(g, 14, 20, 2, 8, "#2a1a10"); px(g, 18, 22, 4, 2, "#2a1a10"); }
  } else {
    // barrel: red with hazard band
    px(g, 6, 2, 20, 34, "#2a1010");
    px(g, 8, 4, 16, 8, "#ff6a4a"); px(g, 8, 4, 16, 2, "#ffb090"); px(g, 11, 6, 10, 4, "#c0402a");
    px(g, 8, 12, 16, 22, "#d8402a"); px(g, 8, 12, 4, 22, "#ff6a4a");
    px(g, 8, 18, 16, 6, "#ffd03a"); for (let i = 0; i < 4; i++) px(g, 9 + i * 4, 18, 2, 6, "#2a1a10");
    px(g, 8, 32, 16, 2, "#901a10");
  }
  cache.set(key, c);
  return c;
}

/** Bush tile: rounded leafy clump that rises above its tile. */
export function bushSprite(theme, variant) {
  const key = "b" + theme + "_" + variant;
  if (cache.has(key)) return cache.get(key);
  const th = THEMES[theme], c = cv(T + 8, T + 14), g = c.getContext("2d"), r = rng(variant * 977 + 13);
  const blobs = [];
  for (let i = 0; i < 6; i++) blobs.push([r.int(8, T), r.int(10, T + 4), r.int(7, 10)]);
  const disc = (x, y, rad, col) => {
    g.fillStyle = col;
    for (let yy = -rad; yy <= rad; yy++) {
      const w = Math.floor(Math.sqrt(rad * rad - yy * yy));
      g.fillRect(x - w, y + yy, w * 2, 1);
    }
  };
  for (const [x, y, rr] of blobs) disc(x, y, rr + 1, th.ink);
  for (const [x, y, rr] of blobs) disc(x, y, rr, th.bushLo);
  for (const [x, y, rr] of blobs) disc(x - 1, y - 2, rr - 2, th.bush);
  for (const [x, y, rr] of blobs) disc(x - 2, y - 4, Math.max(2, rr - 6), th.bushHi);
  for (let i = 0; i < 6; i++) px(g, r.int(4, T + 2), r.int(4, T), 2, 1, shade(th.bushHi, 0.25));
  cache.set(key, c);
  return c;
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k > 0) (r += (255 - r) * k), (g += (255 - g) * k), (b += (255 - b) * k);
  else (r *= 1 + k), (g *= 1 + k), (b *= 1 + k);
  return "#" + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}
export { LIFT };
