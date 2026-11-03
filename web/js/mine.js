// 梦境矿场 · one dive: a side-view vertical slice (搜 search · 打 fight · 撤 extract).
// Dig down through 矿坑 / 洞穴 / 深海 / 遗迹, fill the bag, and get out: on the surface, at a lift, or with a beacon.
// Dying keeps 30% of the bag, running out of power keeps 50%.
import { RELICS, SHOP, MT, MW, MH, T, SOLID, HARD, ZONES, zoneAt, ORES, SHOVELS, MOBS, CHEST_STARS, DEPTH_STARS } from "./minedata.js";
import { CHARS, ELEM, VIEW_W, VIEW_H } from "./data.js";
import { A } from "./assets.js";
import { rng, clamp, TAU } from "./util.js";
import { sfx } from "./audio.js";

const SURF = 8; // air rows above ground
let MUTE = false;
/** demos (the ❓ guide) run real dives silently */
export const setMute = (v) => (MUTE = v);
const snd = (...a) => !MUTE && sfx(...a);
const G = 900; // gravity
const PW = 14, PH = 20; // player box
const Z = 1.3; // camera zoom (the mine reads better close up)
const vw = () => VIEW_W / Z, vh = () => VIEW_H / Z;

function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
/** smooth value noise in 0..1 (coherent rock layers instead of per-tile salt and pepper) */
function noise2(seed) {
  const h = (x, y) => {
    let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ------------------------------------------------------------------ tile art (procedural pixel art, cached)
const tileCache = new Map();
function tileArt(kind, zone, v, extra) {
  const key = kind + "|" + zone.id + "|" + v + "|" + (extra || "");
  if (tileCache.has(key)) return tileCache.get(key);
  const c = cv(MT, MT), g = c.getContext("2d"), r = rng(v * 7919 + kind.length * 131 + (extra || "").length * 17);
  const px = (x, y, w, h, col) => ((g.fillStyle = col), g.fillRect(x, y, w, h));
  const speck = (cols, n, s = 2) => {
    for (let i = 0; i < n; i++) px(r.int(1, MT - 3), r.int(1, MT - 3), r.int(1, s), r.int(1, s), r.pick(cols));
  };
  const base = (cols) => {
    px(0, 0, MT, MT, cols[0]);
    speck([cols[1], cols[2]], 14, 3);
    px(0, MT - 2, MT, 2, shade(cols[0], 0.82));
  };
  switch (kind) {
    case "dirt":
      base(zone.dirt);
      for (let i = 0; i < 4; i++) px(r.int(2, 20), r.int(2, 20), 2, 2, shade(zone.dirt[0], 0.7));
      break;
    case "root":
      base(zone.dirt);
      g.strokeStyle = "#e8d8a0";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(r.int(0, 24), 0);
      for (let y = 4; y <= 24; y += 5) g.lineTo(r.int(2, 22), y);
      g.stroke();
      break;
    case "stone":
      base(zone.stone);
      for (let i = 0; i < 3; i++) {
        const x = r.int(2, 16), y = r.int(2, 16);
        px(x, y, r.int(4, 7), r.int(3, 5), shade(zone.stone[0], 1.12));
        px(x, y + 3, r.int(4, 7), 1, shade(zone.stone[0], 0.75));
      }
      break;
    case "hard": {
      const s = zone.stone.map((h) => shade(h, 0.72));
      base(s);
      g.strokeStyle = shade(zone.stone[0], 0.45);
      g.lineWidth = 1;
      g.beginPath();
      const x0 = r.int(3, 20);
      g.moveTo(x0, 0);
      g.lineTo(x0 + r.int(-4, 4), 10);
      g.lineTo(x0 + r.int(-6, 6), 24);
      g.stroke();
      break;
    }
    case "granite":
      base(["#8a6a72", "#6e5258", "#b08890"]);
      speck(["#e8d0d8", "#3a2a30"], 18, 2);
      break;
    case "brick": {
      px(0, 0, MT, MT, "#8e7a5e");
      g.fillStyle = "#5a4a36";
      for (let y = 0; y < MT; y += 8) {
        g.fillRect(0, y + 7, MT, 1);
        const off = (y / 8) % 2 ? 6 : 0;
        for (let x = off; x < MT; x += 12) g.fillRect(x, y, 1, 7);
      }
      speck(["#a8946e", "#6e5c44"], 10, 2);
      if (v % 3 === 0) {
        g.fillStyle = "#5ad8ff";
        g.globalAlpha = 0.5;
        g.fillRect(9, 9, 6, 1);
        g.fillRect(11, 7, 2, 5);
        g.globalAlpha = 1;
      }
      break;
    }
    case "bedrock":
      px(0, 0, MT, MT, "#1e1a22");
      g.fillStyle = "#2c2632";
      for (let i = -MT; i < MT; i += 6) {
        g.beginPath();
        g.moveTo(i, MT);
        g.lineTo(i + MT, 0);
        g.lineTo(i + MT + 2, 0);
        g.lineTo(i + 2, MT);
        g.fill();
      }
      break;
    case "seal": {
      px(0, 0, MT, MT, "#2a1a4a");
      speck(["#3a2a6a", "#1a1030"], 10, 3);
      g.strokeStyle = "#b48cff";
      g.lineWidth = 1;
      g.strokeRect(4.5, 4.5, 15, 15);
      g.beginPath();
      g.moveTo(12, 6);
      g.lineTo(18, 12);
      g.lineTo(12, 18);
      g.lineTo(6, 12);
      g.closePath();
      g.stroke();
      break;
    }
    case "boulder": {
      // drawn on the cave background (it is a loose rock, not part of the wall)
      px(0, 0, MT, MT, zone.bg[1]);
      g.fillStyle = shade(zone.stone[0], 0.95);
      g.beginPath();
      g.ellipse(12, 13, 11, 10, 0, 0, TAU);
      g.fill();
      g.fillStyle = shade(zone.stone[0], 1.25);
      g.beginPath();
      g.ellipse(9, 9, 5, 4, 0, 0, TAU);
      g.fill();
      g.fillStyle = shade(zone.stone[0], 0.65);
      g.fillRect(4, 19, 16, 3);
      g.strokeStyle = "#1a1020";
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(12, 13, 11, 10, 0, 0, TAU);
      g.stroke();
      break;
    }
    case "gas":
      base(zone.stone);
      break;
    case "gasmark": // radar view of a gas pocket
      g.globalAlpha = 0.85;
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 ? "#9cff5a" : "#5ac83a";
        g.beginPath();
        g.arc(r.int(5, 19), r.int(5, 19), r.int(2, 3), 0, TAU);
        g.fill();
      }
      break;
    case "ore": {
      const o = ORES[extra];
      base(zone.stone);
      const spots = [[3, 4], [12, 3], [6, 12], [14, 13], [9, 8]];
      const n = 3 + (v % 3);
      for (let i = 0; i < n; i++) {
        const [bx, by] = spots[(i + v) % spots.length], x = bx + r.int(-1, 1), y = by + r.int(-1, 1), s = r.int(4, 6);
        px(x - 1, y, s + 2, s, "#1a1020");
        px(x, y - 1, s, s + 2, "#1a1020");
        px(x, y, s, s, o.col[0]);
        px(x, y, s - 1, 2, o.col[1]);
        px(x, y, 2, s - 1, o.col[1]);
        px(x + s - 2, y + 2, 2, s - 2, o.col[2]);
        px(x + 1, y + 1, 1, 1, "#ffffff");
      }
      break;
    }
    case "chest": {
      base(zone.dirt);
      const gold = extra === "star", relic = extra === "relic";
      px(4, 7, 16, 13, "#1a1020");
      px(5, 8, 14, 11, gold ? "#e0a020" : relic ? "#6a3cc0" : "#a8642e");
      px(5, 8, 14, 4, gold ? "#ffd84a" : relic ? "#a878ff" : "#c88048");
      px(5, 12, 14, 1, "#1a1020");
      px(11, 11, 3, 4, gold ? "#fff6c0" : relic ? "#7dffe8" : "#ffd84a");
      if (gold) speck(["#ffffff", "#ffe8a0"], 4, 1);
      if (relic) speck(["#ffffff", "#e0c8ff"], 4, 1);
      break;
    }
    case "bg": {
      px(0, 0, MT, MT, zone.bg[0]);
      speck([zone.bg[1], shade(zone.bg[0], 1.15)], 10, 3);
      break;
    }
  }
  tileCache.set(key, c);
  return c;
}

// ------------------------------------------------------------------ surface parallax layers (built once)
let SKY = null;
function skyLayers() {
  if (SKY) return SKY;
  const W = 480;
  const noise = (seed) => {
    const r = rng(seed), pts = Array.from({ length: 13 }, () => r());
    pts[12] = pts[0];
    return (x) => {
      const u = ((x / W) * 12) % 12, i = Math.floor(u), f = u - i, s = f * f * (3 - 2 * f);
      return pts[i] * (1 - s) + pts[i + 1] * s;
    };
  };
  const layer = (H, draw) => {
    const c = cv(W, H), g = c.getContext("2d");
    draw(g, H);
    return c;
  };
  const ridge = (g, H, n, lo, hi, col, edge) => {
    for (let x = 0; x < W; x++) {
      const y = Math.round(H - lo - (hi - lo) * n(x));
      g.fillStyle = edge;
      g.fillRect(x, y - 1, 1, 1);
      g.fillStyle = col;
      g.fillRect(x, y, 1, H - y);
    }
  };
  // distant mountains: jagged, with snow caps
  const far = layer(110, (g, H) => {
    const n1 = noise(11), n2 = noise(23);
    for (let x = 0; x < W; x++) {
      const y = Math.round(H - 30 - 70 * (0.7 * n1(x) + 0.3 * n2(x * 3)));
      g.fillStyle = "#8a86d0";
      g.fillRect(x, y, 1, H - y);
      g.fillStyle = "#a8a4e8";
      g.fillRect(x, y, 1, 2);
      if (y < H - 78) (g.fillStyle = "#f4f0ff"), g.fillRect(x, y, 1, Math.min(8, H - 78 - y + 3));
    }
    // light haze at the foot
    const hz = g.createLinearGradient(0, H - 40, 0, H);
    hz.addColorStop(0, "rgba(255,210,180,0)");
    hz.addColorStop(1, "rgba(255,210,180,.55)");
    g.fillStyle = hz;
    g.fillRect(0, H - 40, W, 40);
  });
  const hills = layer(70, (g, H) => {
    ridge(g, H, noise(37), 18, 58, "#5f8f96", "#7fb0b0");
    const hz = g.createLinearGradient(0, H - 26, 0, H);
    hz.addColorStop(0, "rgba(255,220,190,0)");
    hz.addColorStop(1, "rgba(255,220,190,.35)");
    g.fillStyle = hz;
    g.fillRect(0, H - 26, W, 26);
  });
  const pines = layer(64, (g, H) => {
    const n = noise(51), r = rng(77);
    ridge(g, H, n, 10, 30, "#4f8a52", "#6fb06a");
    for (let k = 0; k < 34; k++) {
      const x = Math.floor(r() * W), gy = Math.round(H - 10 - 20 * n(x)), th = 16 + Math.floor(r() * 18);
      for (let yy = 0; yy < th; yy++) {
        const w = Math.max(1, Math.round(((yy + 2) / th) * 7));
        for (const dx of [0, -W, W]) {
          g.fillStyle = yy === 0 ? "#6fb06a" : "#2f6a3e";
          g.fillRect(x - w + dx, gy - th + yy, w * 2 + 1, 1);
          g.fillStyle = "#4a8a50";
          g.fillRect(x - w + dx, gy - th + yy, 1, 1);
        }
      }
      for (const dx of [0, -W, W]) (g.fillStyle = "#3a2a1a"), g.fillRect(x - 1 + dx, gy - 2, 2, 4);
    }
  });
  const near = layer(34, (g, H) => {
    const n = noise(63), r = rng(91);
    ridge(g, H, n, 4, 14, "#3e7a3a", "#62a85a");
    for (let k = 0; k < 26; k++) {
      const x = Math.floor(r() * W), gy = Math.round(H - 4 - 10 * n(x)), rr = 5 + Math.floor(r() * 6);
      for (const dx of [0, -W, W]) {
        g.fillStyle = "#2e6a32";
        g.beginPath();
        g.arc(x + dx, gy, rr, Math.PI, 0);
        g.fill();
        g.fillStyle = "#4e9a48";
        g.fillRect(x + dx - Math.round(rr / 2), gy - rr + 1, 3, 2);
        if (r() < 0.3) (g.fillStyle = r() < 0.5 ? "#ffd84a" : "#ff8ac8"), g.fillRect(x + dx + 2, gy - rr + 3, 2, 2);
      }
    }
    // fence
    for (let x = 6; x < W; x += 40) {
      const gy = Math.round(H - 4 - 10 * n(x));
      g.fillStyle = "#1a1020";
      g.fillRect(x - 1, gy - 13, 4, 14);
      g.fillStyle = "#8a6038";
      g.fillRect(x, gy - 12, 2, 12);
      g.fillRect(x, gy - 9, 22, 2);
    }
  });
  const clouds = layer(70, (g) => {
    const r = rng(5);
    for (let k = 0; k < 6; k++) {
      const x = Math.floor(r() * W), y = 10 + Math.floor(r() * 44), w = 28 + Math.floor(r() * 34);
      for (const dx of [0, -W, W]) {
        g.fillStyle = "rgba(255,255,255,.85)";
        g.fillRect(x + dx, y, w, 6);
        g.fillRect(x + dx + 6, y - 5, w - 14, 5);
        g.fillRect(x + dx + 12, y - 9, w / 3, 4);
        g.fillStyle = "rgba(255,210,200,.7)";
        g.fillRect(x + dx + 2, y + 6, w - 4, 2);
      }
    }
  });
  return (SKY = { far, hills, pines, near, clouds });
}

// ------------------------------------------------------------------ underground back walls (parallax, one per zone)
const DEEP = {};
const DEEP_K = 0.4; // how fast the back wall moves relative to the rock
function deepLayer(z) {
  if (DEEP[z.id]) return DEEP[z.id];
  const W = 384, H = 384, c = cv(W, H), g = c.getContext("2d"), r = rng(z.id.length * 977 + z.from);
  const px = (x, y, w, h, col) => {
    g.fillStyle = col;
    for (const dx of [0, -W, W]) for (const dy of [0, -H, H]) g.fillRect(x + dx, y + dy, w, h);
  };
  const base = shade(z.bg[0], 0.72), alt = shade(z.bg[1], 0.62), hi = shade(z.bg[0], 0.95);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // soft rock blotches
  for (let k = 0; k < 90; k++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H), w = 6 + Math.floor(r() * 26), h = 3 + Math.floor(r() * 10);
    px(x, y, w, h, r() < 0.5 ? alt : shade(z.bg[0], 0.8));
    px(x, y, w, 1, hi);
  }
  if (z.id === "pit") {
    // strata and timber supports
    for (let y = 20; y < H; y += 48 + Math.floor(r() * 20)) px(0, y, W, 2, shade(z.bg[1], 0.5));
    for (let x = 30; x < W; x += 128) {
      px(x, 0, 6, H, "#2a1a10");
      px(x + 1, 0, 4, H, "#5a3a20");
      for (let y = 40; y < H; y += 96) {
        px(x - 34, y, 74, 6, "#2a1a10");
        px(x - 33, y + 1, 72, 4, "#6a4626");
        if (r() < 0.6) (px(x + 14, y + 6, 1, 8, "#2a1a10"), px(x + 11, y + 14, 7, 7, "#2a1a10"), px(x + 12, y + 15, 5, 5, "#ffc860"));
      }
    }
  } else if (z.id === "cave") {
    // stalactites, stalagmites, glowing mushrooms and crystals
    for (let k = 0; k < 18; k++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H), len = 10 + Math.floor(r() * 26), down = r() < 0.5;
      for (let i = 0; i < len; i++) {
        const w = Math.max(1, Math.round(((len - i) / len) * 6));
        px(x - w, down ? y + i : y - i, w * 2, 1, i % 5 === 0 ? hi : alt);
      }
    }
    for (let k = 0; k < 22; k++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H), cyan = r() < 0.5;
      px(x, y, 2, 4, "#3a3050");
      px(x - 2, y - 3, 6, 3, cyan ? "#5affd8" : "#c87aff");
      px(x - 1, y - 3, 2, 1, "#ffffff");
    }
  } else if (z.id === "sea") {
    // kelp, bubbles, light shafts, a far fish school
    for (let k = 0; k < 16; k++) {
      const x = Math.floor(r() * W), y0 = Math.floor(r() * H), len = 40 + Math.floor(r() * 60);
      for (let i = 0; i < len; i++) px(x + Math.round(Math.sin(i / 7 + k) * 3), y0 + i, 3, 1, i % 9 < 2 ? "#3a8a6a" : "#1e5a4a");
    }
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H);
      px(x, y, 2, 2, "rgba(200,248,255,.45)");
    }
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(r() * W);
      g.fillStyle = "rgba(160,230,255,.06)";
      for (let y = 0; y < H; y++) g.fillRect(x + y * 0.25, y, 22, 1);
    }
    for (let k = 0; k < 12; k++) {
      const x = 200 + Math.floor(r() * 60), y = 120 + Math.floor(r() * 40);
      px(x, y, 5, 2, "#0a2238");
      px(x + 5, y - 1, 2, 4, "#0a2238");
    }
  } else {
    // ruins: brick courses, pillars, arches and faint runes
    for (let y = 0; y < H; y += 12) for (let x = (y / 12) % 2 ? 0 : 12; x < W; x += 24) px(x, y, 1, 12, shade(z.bg[1], 0.45)), px(x, y, 24, 1, shade(z.bg[1], 0.45));
    for (let x = 48; x < W; x += 192) {
      px(x, 0, 18, H, shade(z.bg[0], 0.55));
      px(x + 2, 0, 3, H, hi);
      for (let y = 30; y < H; y += 128) {
        for (let a = 0; a <= 16; a++) {
          const t = (a / 16) * Math.PI, ax = x + 18 + Math.round((1 - Math.cos(t)) * 40), ay = y + 40 - Math.round(Math.sin(t) * 34);
          px(ax, ay, 4, 4, shade(z.bg[0], 0.5));
        }
        px(x + 50, y + 18, 6, 8, "rgba(90,216,255,.5)");
        px(x + 52, y + 20, 2, 4, "rgba(200,244,255,.7)");
      }
    }
  }
  return (DEEP[z.id] = c);
}

// ------------------------------------------------------------------ 遗迹守护者 sprite parts (shaded stone, built once)
let GOLEM = null;
function golemParts() {
  if (GOLEM) return GOLEM;
  const STONE = ["#3e372e", "#5e5648", "#7a705e", "#958a74", "#b4a88c"], INK = "#1a1020";
  const r = rng(4242);
  // inside(x, y) decides the silhouette; light comes from the top-left
  const part = (w, h, inside, opts = {}) => {
    const c = cv(w, h), g = c.getContext("2d"), m = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = inside(x, y) ? 1 : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!at(x, y)) continue;
        const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
        if (edge) {
          g.fillStyle = INK;
          g.fillRect(x, y, 1, 1);
          continue;
        }
        const lit = 1 - (x / w) * 0.55 - (y / h) * 0.65 + (r() - 0.5) * 0.35 + (!at(x, y - 2) ? 0.5 : 0) + (!at(x + 2, y) ? -0.35 : 0);
        g.fillStyle = STONE[clamp(Math.round(1 + lit * 2.2), 0, 4)];
        g.fillRect(x, y, 1, 1);
      }
    // cracks
    for (let k = 0; k < (opts.cracks || 0); k++) {
      let x = Math.floor(r() * w), y = Math.floor(r() * h);
      for (let i = 0; i < 6 + r() * 8; i++) {
        if (at(x, y) && at(x + 1, y) && at(x, y + 1)) (g.fillStyle = STONE[0]), g.fillRect(x, y, 1, 1);
        x += Math.round(r() * 2 - 1);
        y += 1;
      }
    }
    // moss on the top surfaces
    if (opts.moss)
      for (let x = 1; x < w - 1; x++)
        for (let y = 0; y < h; y++)
          if (at(x, y) && !at(x, y - 1)) {
            if (r() < 0.55) (g.fillStyle = r() < 0.5 ? "#4e8a3e" : "#6aae4e"), g.fillRect(x, y + 1, 1, 1 + Math.floor(r() * 2));
            break;
          }
    return c;
  };
  const rr = (x, y, x0, y0, x1, y1, k) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !(Math.min(x - x0, x1 - x) + Math.min(y - y0, y1 - y) < k);
  const body = part(46, 38, (x, y) => rr(x, y, 2 + Math.max(0, y - 26) * 0.5, 0, 43 - Math.max(0, y - 26) * 0.5, 37, 6), { cracks: 7, moss: true });
  const head = part(26, 20, (x, y) => rr(x, y, 0, 0, 25, 19, 5) && !(y > 15 && (x < 4 || x > 21)), { cracks: 2, moss: true });
  const fist = part(18, 16, (x, y) => rr(x, y, 0, 0, 17, 15, 4), { cracks: 2 });
  const leg = part(12, 14, (x, y) => rr(x, y, 0, 0, 11, 13, 2), { cracks: 1 });
  const shoulder = part(16, 12, (x, y) => rr(x, y, 0, 0, 15, 11, 4), { cracks: 1, moss: true });
  // knuckle lines on the fist, brow ridge on the head
  const fg = fist.getContext("2d");
  fg.fillStyle = STONE[0];
  for (const x of [5, 9, 13]) fg.fillRect(x, 2, 1, 5);
  const hg = head.getContext("2d");
  hg.fillStyle = STONE[0];
  hg.fillRect(3, 7, 20, 2);
  hg.fillStyle = INK;
  hg.fillRect(5, 9, 6, 4), hg.fillRect(15, 9, 6, 4); // eye sockets
  hg.fillRect(9, 15, 8, 2); // mouth slit
  // white copies for the hit flash (only the stone itself lights up, not a box around it)
  const white = (c) => {
    const w = cv(c.width, c.height), wg = w.getContext("2d");
    wg.drawImage(c, 0, 0);
    wg.globalCompositeOperation = "source-in";
    wg.fillStyle = "#ffffff";
    wg.fillRect(0, 0, w.width, w.height);
    return w;
  };
  return (GOLEM = { body, head, fist, leg, shoulder, W: { body: white(body), head: white(head), fist: white(fist), leg: white(leg), shoulder: white(shoulder) } });
}
/** one look for every rock: the one in the guardian's hand, the thrown one and the rain (s = half size) */
function drawRock(g, x, y, s) {
  x = Math.round(x);
  y = Math.round(y);
  g.fillStyle = "#1a1020";
  g.fillRect(x - s, y - s + 2, s * 2, s * 2 - 4);
  g.fillRect(x - s + 2, y - s, s * 2 - 4, s * 2);
  g.fillStyle = "#7a705e";
  g.fillRect(x - s + 1, y - s + 3, s * 2 - 2, s * 2 - 6);
  g.fillRect(x - s + 3, y - s + 1, s * 2 - 6, s * 2 - 2);
  g.fillStyle = "#958a74";
  g.fillRect(x - s + 2, y - s + 2, s * 2 - 6, s * 2 - 7);
  g.fillStyle = "#c8bca4";
  g.fillRect(x - s + 3, y - s + 2, Math.max(2, s - 2), 2);
  g.fillStyle = "#5e5648";
  g.fillRect(x + 1, y - 1, Math.max(1, s - 3), 1);
  g.fillRect(x + s - 3, y, 1, Math.max(1, s - 4));
}

// ------------------------------------------------------------------ the dive
export class Dive {
  /** o: { cid, shovel: "cu"|"ag"|"au", up: upgrades, fx, seed, talents, lite: {rows, time} } */
  constructor(o) {
    this.o = o;
    this.fx = o.fx;
    this.seed = o.seed ?? (Math.random() * 1e9) | 0;
    this.r = rng(this.seed);
    this.lite = o.lite || null;
    this.MW = MW;
    const up = o.up || {};
    this.up = up;
    this.drill = 1 + (up.drill || 0); // drill level 1..4
    this.power = 1 + 0.35 * (up.drill || 0);
    this.maxDepth = this.lite ? this.lite.rows : SHOVELS[o.shovel].depth;
    this.rows = this.lite ? this.lite.rows + 2 : MH;
    this.t = new Uint8Array(MW * this.rows);
    this.ore = {}; // index -> ore id
    this.chest = {}; // index -> "plain" | "star" | "relic"
    this.rel = {}; // relic id -> stacks
    this.choice = null; // relic ids on offer (the dive pauses until one is taken)
    this.revealed = new Uint8Array(MW * this.rows);
    this.mobs = [];
    this.bullets = [];
    this.bombs = [];
    this.falling = [];
    this.clouds = [];
    this.parts = [];
    this.texts = [];
    this.time = 0;
    this.bag = [];
    this.bagCap = 12 + 6 * (up.bag || 0);
    this.stars = 0;
    this.kills = 0;
    this.moles = 0;
    this.relicsOpened = 0;
    this.dug = 0;
    this.ended = null;
    this.extractT = 0;
    const c = CHARS[o.cid];
    const hp = 5 + 2 * (up.armor || 0);
    this.p = {
      x: (MW * MT) / 2, y: 0, vx: 0, vy: 0, face: 1, ground: false, hp, maxHp: hp,
      energy: 100 + 40 * (up.battery || 0), maxE: 100 + 40 * (up.battery || 0),
      o2: 20 + 10 * (up.tank || 0), maxO2: 20 + 10 * (up.tank || 0), inv: 0, hurtT: 0, atkCd: 0,
      bombs: 2, beacons: 1 + (up.beacon || 0), beaconT: 0, dig: null, deepest: 0, anim: 0, jet: false,
      atkDmg: c.atk.dmg * (1 + 0.04 * ((o.talents && o.talents.t_dmg) || 0)), elem: c.elem,
    };
    // pre-bought supplies
    for (const k of o.supply || []) {
      if (k === "bomb") this.p.bombs += 2;
      if (k === "cell") (this.p.maxE += 50), (this.p.energy += 50);
      if (k === "plate") (this.p.maxHp += 2), (this.p.hp += 2);
      if (k === "flare") this.p.beacons += 1;
    }
    this.shop = false; // merchant window open (the dive waits)
    this.bought = {};
    this.merchant = null;
    this.cam = { x: 0, y: -VIEW_H / 2 };
    this.gen();
  }

  // ---------------------------------------------------------------- generation
  idx(c, r) {
    return r * MW + c;
  }
  get(c, r) {
    if (c < 0 || c >= MW || r >= this.rows) return T.BEDROCK;
    if (r < 0) return T.AIR;
    return this.t[r * MW + c];
  }
  set(c, r, v) {
    if (c < 0 || c >= MW || r < 0 || r >= this.rows) return;
    this.t[r * MW + c] = v;
  }
  gen() {
    const r = this.r, W = MW, H = this.rows, K = W / 26; // K: counts were tuned for a 26-wide shaft
    // base fill by depth: two octaves of smooth noise pick dirt / stone / hard rock in coherent blobs and layers
    const N1 = noise2(this.seed & 0xffff), N2 = noise2((this.seed >> 8) & 0xffff);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const z = zoneAt(y);
        let v = T.DIRT;
        const n = clamp(N1(x / 5, y / 3.2) * 0.75 + N2(x / 2, y / 2) * 0.25 + (r() - 0.5) * 0.08);
        if (z.id === "pit") v = y < 3 ? T.DIRT : n < 0.62 ? T.DIRT : T.STONE;
        else if (z.id === "cave") v = n < 0.35 ? T.DIRT : n < 0.88 ? T.STONE : T.HARD;
        else if (z.id === "sea") v = n < 0.25 ? T.DIRT : n < 0.8 ? T.STONE : T.HARD;
        else v = n < 0.15 ? T.DIRT : n < 0.55 ? T.STONE : n < 0.82 ? T.HARD : T.GRANITE;
        if (y < 2 && n < 0.15) v = T.ROOT;
        this.t[y * W + x] = v;
      }
    // caverns: random walks (more & bigger in the cave zone; filled with water in the sea zone)
    const carve = (x, y, len, wide, fill = T.AIR) => {
      for (let i = 0; i < len; i++) {
        for (let dy = 0; dy < wide; dy++) for (let dx = 0; dx < wide; dx++) {
          const cx = x + dx, cy = y + dy;
          if (cx > 0 && cx < W - 1 && cy > 2 && cy < H - 1) this.t[cy * W + cx] = fill;
        }
        x += r.int(-1, 1);
        y += r.chance(0.35) ? r.int(-1, 1) : 0;
        x = clamp(x, 1, W - 2 - wide);
      }
    };
    const span = (z) => [z.from, Math.min(z.to, H - 2)];
    for (const z of ZONES) {
      const [a, b] = span(z);
      if (a >= b) continue;
      const n = Math.round({ pit: 4, cave: 9, sea: 6, ruin: 3 }[z.id] * K);
      for (let i = 0; i < n; i++) carve(r.int(2, W - 6), r.int(Math.max(a, 4), b - 2), r.int(10, z.id === "cave" ? 30 : 18), z.id === "pit" ? 2 : r.int(2, 3), z.id === "sea" && r.chance(0.8) ? T.WATER : T.AIR);
    }
    // ruins: brick rooms with a chest and a guardian
    const [ra, rb] = span(ZONES[3]);
    if (ra < rb) {
      const rooms = Math.max(1, Math.round((Math.floor((rb - ra) / 8)) * K));
      for (let i = 0; i < rooms; i++) {
        const w = r.int(6, 9), h = r.int(4, 5), x0 = r.int(1, W - w - 1), y0 = r.int(ra + 1, rb - h - 1);
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.t[y * W + x] = y === y0 || y === y0 + h - 1 || x === x0 || x === x0 + w - 1 ? T.BRICK : T.AIR;
        const cx = x0 + (w >> 1), cy = y0 + h - 2;
        this.t[cy * W + cx] = T.CHEST;
        this.chest[cy * W + cx] = "plain";
        this.mobs.push(this.mkMob(r.chance(0.6) ? "skull" : "ghost", (x0 + 2) * MT, (y0 + 2) * MT));
      }
    }
    // ores: clustered veins
    for (let y = 2; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (this.t[i] === T.AIR || this.t[i] === T.WATER || this.t[i] === T.BRICK) continue;
        const z = zoneAt(y);
        const depthK = (y - z.from) / (z.to - z.from);
        if (r() < (0.06 + depthK * 0.025) * (this.lite && this.lite.rich ? 1.7 : 1)) {
          const ids = Object.keys(ORES).filter((k) => ORES[k].zones[z.id]);
          const id = r.weighted(ids, (k) => ORES[k].zones[z.id]);
          const n = r.int(2, 5);
          let cx = x, cy = y;
          for (let k = 0; k < n; k++) {
            const j = cy * W + cx;
            if (cy > 1 && cy < H - 1 && cx > 0 && cx < W - 1 && this.t[j] !== T.AIR && this.t[j] !== T.WATER && this.t[j] !== T.BRICK) {
              this.t[j] = T.ORE;
              this.ore[j] = id;
            }
            cx += r.int(-1, 1);
            cy += r.int(0, 1);
          }
        }
      }
    // hazards: gas pockets (cave & deeper), loose boulders over open space
    for (let y = 30; y < H - 2; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, t = this.t[i];
        if (t === T.STONE && r() < (y < 60 ? 0.02 : 0.012)) this.t[i] = T.GAS;
      }
    for (let y = 8; y < H - 2; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if ((this.t[i] === T.STONE || this.t[i] === T.DIRT) && this.t[(y + 1) * W + x] === T.AIR && r() < (y < 30 ? 0.12 : 0.3)) this.t[i] = T.BOULDER;
      }
    // chests
    for (const z of ZONES) {
      const [a, b] = span(z);
      if (a >= b) continue;
      const n = Math.round(({ pit: 3, cave: 4, sea: 4, ruin: 3 }[z.id] + (this.lite ? 2 : 0)) * K);
      for (let k = 0; k < n; k++) {
        const x = r.int(2, W - 3), y = r.int(Math.max(a, 5), b - 2), i = y * W + x;
        this.t[i] = T.CHEST;
        this.chest[i] = "plain";
      }
    }
    // gold shovel: a 星图 chest guaranteed in the ruins
    // ...inside a brick chamber guarded by the 遗迹守护者 (two gaps in the roof let you drop in)
    this.guardRoom = null;
    if (this.o.shovel === "au" && !this.lite) {
      const fy = r.int(112, H - 3), x0 = r.int(2, W - 21), x1 = x0 + 18, ty = fy - 9;
      for (let y = ty; y <= fy; y++)
        for (let x = x0; x <= x1; x++) {
          const edge = y === ty || y === fy || x === x0 || x === x1;
          this.t[y * W + x] = edge ? T.BRICK : T.AIR;
          delete this.chest[y * W + x];
          delete this.ore[y * W + x];
        }
      for (const gx of [x0 + 3, x1 - 4]) this.t[ty * W + gx] = this.t[ty * W + gx + 1] = T.AIR;
      const cx = x1 - 1, i = (fy - 1) * W + cx;
      this.t[i] = T.CHEST;
      this.chest[i] = "star";
      this.guardRoom = { x0, x1, ty, fy };
      const g = this.mkMob("golem", (x0 + 6) * MT, fy * MT - MOBS.golem.r - 1);
      g.hp = g.maxHp = MOBS.golem.hp;
      g.cd = 2;
      this.mobs.push(g);
    }
    // lifts (safe extraction) at the bottom of the first three zones
    this.lifts = [];
    for (const row of this.lite ? [] : [28, 58, 88]) {
      if (row >= H - 2) continue;
      // one lift in each half of the (wide) shaft
      for (const [lo, hi] of [[3, (W >> 1) - 6], [(W >> 1) + 2, W - 7]]) {
        const x0 = r.int(lo, hi);
        for (let y = row - 2; y <= row; y++) for (let x = x0; x < x0 + 4; x++) this.t[y * W + x] = T.AIR;
        for (let x = x0; x < x0 + 4; x++) this.t[(row + 1) * W + x] = T.BRICK;
        this.t[row * W + x0 + 2] = T.LIFT;
        this.lifts.push({ c: x0 + 2, r: row });
      }
    }
    // 地下商人: a lantern-lit pocket in the caves
    if (!this.lite && this.maxDepth > 44) {
      const y = r.int(36, Math.min(54, this.maxDepth - 4)), x0 = r.int(3, W - 9);
      for (let yy = y - 2; yy <= y; yy++) for (let x = x0; x < x0 + 6; x++) this.t[yy * W + x] = T.AIR;
      for (let x = x0; x < x0 + 6; x++) this.t[(y + 1) * W + x] = T.BRICK;
      this.merchant = { x: (x0 + 3) * MT, y: (y + 1) * MT, c0: x0, r: y };
      for (const k of Object.keys(this.chest)) if (this.t[k] !== T.CHEST) delete this.chest[k];
    }
    // 宝藏鼹鼠: one per dive (half the rifts), in a little pocket
    if (!this.lite || r.chance(0.5)) {
      let y = 10, x = 3;
      for (let k = 0; k < 20; k++) {
        y = this.lite ? r.int(10, H - 6) : r.int(10, Math.min(this.maxDepth - 3, 84));
        x = r.int(3, W - 5);
        const mc = this.merchant;
        if (![28, 58, 88].some((L) => y >= L - 4 && y <= L + 2) && !(mc && Math.abs(y - mc.r) < 5)) break;
      }
      for (let yy = y - 1; yy <= y; yy++) for (let xx = x; xx < x + 3; xx++) this.t[yy * W + xx] = T.AIR;
      if (!SOLID(this.t[(y + 1) * W + x + 1])) this.t[(y + 1) * W + x + 1] = T.DIRT;
      for (const k of Object.keys(this.chest)) if (this.t[k] !== T.CHEST) delete this.chest[k];
      const m = this.mkMob("mole", (x + 1) * MT + MT / 2, y * MT + MT / 2);
      m.life = 22;
      this.mobs.push(m);
    }
    // relic chests: one per zone reached (the rift gets one)
    for (const z of ZONES) {
      const [a, b] = span(z);
      if (a >= b || b - a < 6) continue;
      for (let tries = 0; tries < 20; tries++) {
        const x = r.int(2, W - 3), y = r.int(Math.max(a + 2, 6), b - 2), i = y * W + x;
        const gr = this.guardRoom, mc = this.merchant;
        if (this.t[i] === T.CHEST || this.t[i] === T.BEDROCK || this.t[i] === T.SEAL || this.t[i] === T.BRICK || this.t[i] === T.LIFT || [28, 58, 88].some((L) => y >= L - 3 && y <= L + 1)) continue;
        if (gr && x >= gr.x0 - 1 && x <= gr.x1 + 1 && y >= gr.ty - 1 && y <= gr.fy + 1) continue;
        if (mc && Math.abs(y - mc.r) <= 3 && x >= mc.c0 - 1 && x <= mc.c0 + 6) continue;
        this.t[i] = T.CHEST;
        this.chest[i] = "relic";
        break;
      }
      if (this.lite) break;
    }
    // monsters in open pockets
    for (let y = 6; y < H - 2; y++)
      for (let x = 2; x < W - 2; x++) {
        const t = this.t[y * W + x];
        if ((t !== T.AIR && t !== T.WATER) || r() > 0.012) continue;
        const z = zoneAt(y);
        const ids = Object.keys(MOBS).filter((k) => MOBS[k].zones[z.id] && (!!MOBS[k].swim === (t === T.WATER) || MOBS[k].fly && t === T.AIR));
        if (!ids.length) continue;
        this.mobs.push(this.mkMob(r.weighted(ids, (k) => MOBS[k].zones[z.id]), x * MT + MT / 2, y * MT + MT / 2));
      }
    // seals below what this shovel allows; bedrock walls and floor; a shaft start under the camp
    if (this.maxDepth < H - 2) for (let x = 0; x < W; x++) this.t[this.maxDepth * W + x] = T.SEAL;
    for (let y = 0; y < H; y++) (this.t[y * W] = T.BEDROCK), (this.t[y * W + W - 1] = T.BEDROCK);
    for (let x = 0; x < W; x++) this.t[(H - 1) * W + x] = T.BEDROCK;
    const mid = W >> 1;
    this.t[mid] = T.DIRT;
    this.t[W + mid] = T.DIRT;
  }
  mkMob(type, x, y) {
    const d = MOBS[type], hp = d.hp * (1 + this.zoneIdx(y / MT) * 0.35);
    return { type, d, x, y, vx: 0, vy: 0, hp, maxHp: hp, anim: Math.random() * 5, face: 1, cd: 1 + Math.random() * 2, flash: 0, awake: false, home: { x, y } };
  }
  zoneIdx(row) {
    return Math.max(0, ZONES.indexOf(zoneAt(row)));
  }

  // ---------------------------------------------------------------- helpers
  solidAt(px, py) {
    return SOLID(this.get(Math.floor(px / MT), Math.floor(py / MT)));
  }
  waterAt(px, py) {
    return this.get(Math.floor(px / MT), Math.floor(py / MT)) === T.WATER;
  }
  text(x, y, s, col = "#fff", size = 1) {
    this.texts.push({ x, y, s, col, size, t: 0.9 });
  }
  spawnFx(id, x, y, o = {}) {
    this.fx && this.fx.spawn(id, x, y, o);
  }
  bagValue() {
    return this.bag.reduce((a, id) => a + ORES[id].v, 0);
  }
  addStars(n, x, y) {
    if (!n) return;
    if (this.rel.compass) n = Math.ceil(n * 1.5);
    this.stars += n;
    this.text(x, y - 22, `+${n} 星砂`, "#ffd84a", n >= 10 ? 1.3 : 1);
    if (n >= 10) snd("ssr");
  }
  addLoot(id, x, y) {
    if (this.bag.length >= this.bagCap) {
      this.text(x, y - 10, "背包满了！", "#ff8a8a");
      snd("hit");
      return;
    }
    this.bag.push(id);
    if (ORES[id].s) this.addStars(ORES[id].s, x, y);
    if (this.rel.lucky && !this._lucky && id !== "coinbag" && this.r.chance(0.3 * this.rel.lucky)) {
      this._lucky = true;
      this.text(x, y - 24, "幸运！", "#7dffb0");
      this.addLoot(id, x, y - 8);
      this._lucky = false;
    }
    this.text(x, y - 10, "+" + ORES[id].name, ORES[id].col[1]);
    snd("coin", 0.05);
  }

  // ---------------------------------------------------------------- digging
  breakTile(c, r, byBomb = false) {
    const i = this.idx(c, r), t = this.get(c, r);
    if (!SOLID(t) || t === T.BEDROCK || t === T.SEAL) return false;
    const x = c * MT + MT / 2, y = r * MT + MT / 2, z = zoneAt(r);
    this.set(c, r, T.AIR);
    this.dug++;
    // debris
    const cols = t === T.DIRT || t === T.ROOT || t === T.CHEST ? z.dirt : t === T.BRICK ? ["#8e7a5e", "#5a4a36"] : t === T.ORE ? [ORES[this.ore[i]].col[0], z.stone[0]] : z.stone;
    for (let k = 0; k < 8; k++) this.parts.push({ x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 140, t: 0.5 + Math.random() * 0.4, col: cols[k % cols.length], s: 2 + (k % 2) });
    if (t === T.ORE) {
      this.addLoot(this.ore[i], x, y);
      delete this.ore[i];
    } else if (t === T.CHEST) this.openChest(i, x, y);
    else if (t === T.GAS) {
      this.clouds.push({ x, y, r: 46, t: 5 });
      this.spawnFx("nature/poison-cloud", x, y + 10, { life: 5 });
      this.text(x, y - 16, "瓦斯泄漏！", "#9cff5a", 1.2);
      snd("explode", 0.2);
    }
    // anything resting on this tile may start to fall
    this.checkFall(c, r - 1);
    if (!byBomb) snd("hit", 0.04);
    return true;
  }
  openChest(i, x, y) {
    const kind = this.chest[i] || "plain";
    delete this.chest[i];
    const r = this.r, row = Math.floor(i / MW), z = zoneAt(row);
    this.spawnFx("pickups/chest-open", x, y + 8, {});
    snd("pickup");
    if (kind === "relic") {
      this.relicsOpened++;
      const pool = Object.keys(RELICS).filter((k) => (this.rel[k] || 0) < RELICS[k].max);
      const ids = r.shuffle(pool).slice(0, 3);
      if (ids.length) {
        this.choice = ids;
        this.spawnFx("pickups/loot-beam", x, y + 8, { life: 1.5 });
        this.text(x, y - 18, "梦境遗物！", "#d8a8ff", 1.3);
        return;
      }
    }
    const ids = Object.keys(ORES).filter((k) => ORES[k].zones[z.id]);
    const n = kind === "star" ? 4 : r.int(2, 4);
    for (let k = 0; k < n; k++) this.addLoot(r.weighted(ids, (q) => ORES[q].zones[z.id] * (ORES[q].v + 2)), x, y - k * 8);
    if (r.chance(0.5)) this.addLoot("coinbag", x, y);
    const [a, b] = CHEST_STARS[kind === "star" ? "star" : z.id];
    this.addStars(r.int(a, b), x, y);
    if (kind === "star") this.spawnFx("pickups/loot-beam", x, y + 8, { life: 2 });
  }
  /** take one relic from the current offer */
  takeRelic(id) {
    if (!this.choice || !this.choice.includes(id)) return;
    this.choice = null;
    this.rel[id] = (this.rel[id] || 0) + 1;
    const p = this.p;
    if (id === "cell") (p.maxE += 40), (p.energy = p.maxE);
    if (id === "pocket") this.bagCap += 6;
    if (id === "heart") (p.maxHp += 1), (p.hp = p.maxHp);
    if (id === "tnt") p.bombs += 3;
    if (id === "beacon") p.beacons += 1;
    this.text(p.x, p.y - PH - 16, RELICS[id].name, RELICS[id].curse ? "#ff9ad0" : "#d8a8ff", 1.2);
    this.spawnFx("spawn/respawn-beam", p.x, p.y, { life: 0.8 });
    snd("card");
  }
  /** merchant offers with their current prices */
  shopOffers() {
    return Object.entries(SHOP).map(([k, s]) => ({ k, ...s, price: Math.round(s.base * (1 + 0.5 * (this.bought[k] || 0))), left: s.max - (this.bought[k] || 0) }));
  }
  /** pay with ore from the bag, cheapest first; returns false if the bag isn't worth enough */
  pay(price) {
    if (this.bagValue() < price) return false;
    const order = this.bag.map((id, i) => [ORES[id].v, i]).sort((a, b) => a[0] - b[0]);
    let paid = 0;
    const drop = new Set();
    for (const [v, i] of order) {
      if (paid >= price) break;
      paid += v;
      drop.add(i);
    }
    this.bag = this.bag.filter((_, i) => !drop.has(i));
    return true;
  }
  buy(k) {
    const o = this.shopOffers().find((x) => x.k === k), p = this.p;
    if (!o || o.left <= 0 || !this.pay(o.price)) return false;
    this.bought[k] = (this.bought[k] || 0) + 1;
    if (k === "heal") p.hp = p.maxHp;
    if (k === "cell") p.energy = p.maxE;
    if (k === "bomb") p.bombs += 2;
    if (k === "relic") {
      const pool = Object.keys(RELICS).filter((id) => (this.rel[id] || 0) < RELICS[id].max);
      this.shop = false;
      this.choice = this.r.shuffle(pool).slice(0, 3);
    }
    snd("coin");
    return true;
  }
  checkFall(c, r) {
    if (this.get(c, r) !== T.BOULDER || this.get(c, r + 1) !== T.AIR) return;
    this.set(c, r, T.AIR);
    this.falling.push({ c, x: c * MT + MT / 2, y: r * MT + MT / 2, vy: 0, wait: 0.55 });
    this.text(c * MT + 12, r * MT - 4, "落石！", "#ffb070");
    this.checkFall(c, r - 1);
  }

  // ---------------------------------------------------------------- update
  /** inp: { mx, my, atk, bomb, beacon } */
  update(dt, inp) {
    if (this.ended || this.choice || this.shop) return;
    this.time += dt;
    const p = this.p;
    p.anim += dt;
    p.inv -= dt;
    p.hurtT -= dt;
    p.atkCd -= dt;
    // lite (in-run rift) dives are timed
    if (this.lite) {
      this.lite.left = (this.lite.left ?? this.lite.time) - dt;
      if (this.lite.power) p.energy = p.maxE; // the rift gives unlimited power
      if (this.lite.left <= 0) return this.finish("timeup");
    }
    const cx = Math.floor(p.x / MT), headRow = Math.floor((p.y - PH + 2) / MT);
    const inWater = this.waterAt(p.x, p.y - PH / 2);
    const headWet = this.waterAt(p.x, p.y - PH + 3);
    // ---- movement
    const mx = Math.abs(inp.mx) > 0.25 ? Math.sign(inp.mx) : 0, up = inp.my < -0.55, down = inp.my > 0.55;
    if (mx) p.face = mx;
    const spd = inWater ? 62 : 96;
    p.vx += (mx * spd - p.vx) * Math.min(1, dt * (p.ground ? 14 : 6));
    p.jet = false;
    if (inWater) {
      p.vy += 240 * dt;
      if (up) p.vy -= 520 * dt;
      p.vy = clamp(p.vy, -95, 90);
    } else {
      p.vy += G * dt;
      if (up && p.energy > 0 && !(p.dig && p.dig.dir === "up")) {
        p.vy -= 1500 * dt;
        p.jet = true;
        p.energy = Math.max(0, p.energy - 3.2 * dt * (this.rel.feather ? 0.5 : 1));
        if (Math.random() < 0.7) this.parts.push({ x: p.x - p.face * 4 + (Math.random() - 0.5) * 4, y: p.y - 4, vx: (Math.random() - 0.5) * 30, vy: 80 + Math.random() * 60, t: 0.25, col: Math.random() < 0.5 ? "#ffd84a" : "#ff7a2a", s: 2, glow: true });
      }
      p.vy = clamp(p.vy, -170, 420);
    }
    this.moveP(p.vx * dt, 0);
    p.ground = false;
    this.moveP(0, p.vy * dt);
    // ---- oxygen
    if (headWet) {
      p.o2 -= dt * (this.rel.gill ? 0.4 : 1);
      if (p.o2 <= 0) {
        p.o2 = 0;
        p.drownT = (p.drownT || 0) + dt;
        if (p.drownT > 1.4) (p.drownT = 0), this.hurt(1, "缺氧！");
      }
      if (Math.random() < dt * 3) this.parts.push({ x: p.x + p.face * 4, y: p.y - PH, vx: 0, vy: -30, t: 0.8, col: "#c8f8ff", s: 2, bubble: true });
    } else p.o2 = Math.min(p.maxO2, p.o2 + dt * 6);
    // ---- digging (push into a wall, down while standing, up against a ceiling)
    let tgt = null;
    if (down && p.ground) tgt = { c: cx, r: Math.floor((p.y + 2) / MT), dir: "down" };
    else if (mx && this.solidAt(p.x + mx * (PW / 2 + 2), p.y - PH / 2)) tgt = { c: Math.floor((p.x + mx * (PW / 2 + 2)) / MT), r: Math.floor((p.y - PH / 2) / MT), dir: "side" };
    else if (up && this.solidAt(p.x, p.y - PH - 2) && (p.ground || inWater || p.energy <= 0)) tgt = { c: cx, r: Math.floor((p.y - PH - 2) / MT), dir: "up" };
    if (tgt && this.get(tgt.c, tgt.r) !== T.LIFT) {
      const t = this.get(tgt.c, tgt.r), hd = HARD[t];
      if (!hd) {
        if ((t === T.SEAL || t === T.BEDROCK) && (p.warnT || 0) < this.time) {
          p.warnT = this.time + 1.2;
          this.text(p.x, p.y - 30, t === T.SEAL ? `封印岩：需要${this.maxDepth < 90 ? "银铲" : "金铲"}才能更深` : "基岩挖不动", "#c8b0ff");
        }
        p.dig = null;
      } else if (t === T.CHEST && this.chest[this.idx(tgt.c, tgt.r)] === "star" && this.mobs.some((m) => m.d.boss)) {
        if ((p.warnT || 0) < this.time) (p.warnT = this.time + 1.2), this.text(p.x, p.y - 30, "星图宝箱被守护者封印着", "#ffb070");
        p.dig = null;
      } else if (hd.need > this.drill) {
        if ((p.warnT || 0) < this.time) (p.warnT = this.time + 1.2), this.text(p.x, p.y - 30, `钻头等级不足（需要 Lv${hd.need - 1}）`, "#ffb070");
        p.dig = null;
      } else if (p.energy <= 0) {
        p.dig = null;
      } else {
        if (!p.dig || p.dig.c !== tgt.c || p.dig.r !== tgt.r) p.dig = { ...tgt, k: 0 };
        p.dig.k += (dt * this.power * (1 + 0.4 * (this.rel.drill || 0))) / hd.h;
        if (tgt.dir === "down") p.x += (tgt.c * MT + MT / 2 - p.x) * Math.min(1, dt * 10);
        if (Math.random() < dt * 14) this.parts.push({ x: tgt.c * MT + MT / 2 + (Math.random() - 0.5) * 18, y: tgt.r * MT + (tgt.dir === "down" ? 2 : MT / 2), vx: (Math.random() - 0.5) * 90, vy: -60 - Math.random() * 60, t: 0.35, col: "#e8dcc0", s: 1 });
        if (p.dig.k >= 1) {
          p.energy = Math.max(0, p.energy - hd.e);
          this.breakTile(tgt.c, tgt.r);
          p.dig = null;
        }
      }
    } else p.dig = null;
    p.deepest = Math.max(p.deepest, Math.floor(p.y / MT));
    // ---- attack: nearest monster in range, else straight ahead
    if (inp.atk && p.atkCd <= 0) {
      let best = null, bd = 150 * 150;
      for (const m of this.mobs) {
        const d = (m.x - p.x) ** 2 + (m.y - (p.y - PH / 2)) ** 2;
        if (d < bd) (bd = d), (best = m);
      }
      const ox = p.x, oy = p.y - PH / 2 - 2;
      const a = best ? Math.atan2(best.y - oy, best.x - ox) : p.face > 0 ? 0 : Math.PI;
      if (best) p.face = Math.cos(a) >= 0 ? 1 : -1;
      this.bullets.push({ x: ox, y: oy, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, t: 0.6, dmg: p.atkDmg * (1 + 0.6 * (this.rel.blade || 0)), col: ELEM[p.elem].glow });
      p.atkCd = 0.28;
      snd("shoot_" + p.elem, 0.06);
    }
    // ---- bomb (K): breaks a 3x3 area after a fuse
    if (inp.bomb) {
      if (p.bombs > 0) {
        p.bombs--;
        this.bombs.push({ x: p.x, y: p.y - PH / 2, vx: p.face * 60, vy: -80, t: 1.3 });
        snd("click");
      } else this.text(p.x, p.y - 30, "没有炸药了", "#ff8a8a");
    }
    // ---- beacon (L): channel 1.5s then extract anywhere
    if (inp.beacon && !p.beaconT) {
      if (p.beacons > 0) {
        p.beacons--;
        p.beaconT = 1.5;
        this.spawnFx("spawn/respawn-beam", p.x, p.y, { life: 1.6 });
        snd("portal");
        this.text(p.x, p.y - 34, "撤离信标启动…", "#7dffb0", 1.1);
      } else this.text(p.x, p.y - 30, "没有撤离信标了", "#ff8a8a");
    }
    if (p.beaconT > 0) {
      p.beaconT -= dt;
      if (p.beaconT <= 0) return this.finish("extract");
    }
    // ---- safe extraction: back on the surface, or standing in a lift
    const onSurface = p.ground && p.y <= 1 && p.deepest >= 3;
    const lift = this.lifts.find((l) => Math.abs(p.x - (l.c * MT + MT / 2)) < 18 && Math.abs(p.y - (l.r + 1) * MT) < 6);
    const idle = !mx && !up && !down && !inp.atk;
    this.extractHint = (onSurface || lift) && !idle;
    if ((onSurface || lift) && idle) {
      this.extractT += dt;
      if (this.extractT >= 1.2) return this.finish("extract");
    } else this.extractT = 0;
    this.atLift = !!lift;
    // ---- merchant: stand still next to them to trade
    const mc = this.merchant;
    if (mc) {
      const near = Math.abs(p.x - mc.x) < 34 && Math.abs(p.y - mc.y) < 8;
      if (!near) mc.away = true;
      this.nearShop = near && mc.away;
      if (this.nearShop && idle) {
        mc.t = (mc.t || 0) + dt;
        if (mc.t > 0.6) (mc.t = 0), (mc.away = false), (this.shop = true), snd("click");
      } else mc.t = 0;
    }
    // ---- power out: emergency recall
    if (p.energy <= 0 && !p.dig) {
      p.outT = (p.outT || 0) + dt;
      if (p.outT > 2.5) return this.finish("power");
    } else p.outT = 0;
    // ---- world
    this.updateMobs(dt);
    this.updateBullets(dt);
    this.updateBombs(dt);
    this.updateFalling(dt);
    for (const c of this.clouds) {
      c.t -= dt;
      if (c.t > 0 && Math.hypot(p.x - c.x, p.y - PH / 2 - c.y) < c.r) {
        c.tick = (c.tick || 0) + dt;
        if (c.tick > 1) (c.tick = 0), this.hurt(1, "中毒");
      }
    }
    this.clouds = this.clouds.filter((c) => c.t > 0);
    for (const q of this.parts) {
      q.t -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (!q.bubble) q.vy += 500 * dt;
    }
    this.parts = this.parts.filter((q) => q.t > 0);
    for (const t of this.texts) (t.t -= dt), (t.y -= 26 * dt);
    this.texts = this.texts.filter((t) => t.t > 0);
    // reveal tiles near the player (for the minimap / radar)
    const rr = 3 + (this.up.radar || 0) * 2;
    for (let y = headRow - rr; y <= headRow + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) if (x >= 0 && y >= 0 && x < MW && y < this.rows) this.revealed[y * MW + x] = 1;
    // camera
    const VW = vw(), VH = vh(), tx = p.x - VW / 2, bossOn = this.mobs.some((m) => m.d.boss && m.awake), ty = p.y - VH * (bossOn ? 0.74 : 0.45);
    const worldW = MW * MT;
    // the bedrock columns at both edges stay just off screen, so the view is always filled
    this.cam.x = worldW - 2 * MT <= VW ? (worldW - VW) / 2 : clamp(this.cam.x + (tx - this.cam.x) * Math.min(1, dt * 6), MT, worldW - VW - MT);
    this.cam.y += (clamp(ty, -SURF * MT + 20, this.rows * MT - VH) - this.cam.y) * Math.min(1, dt * 6);
  }
  moveP(dx, dy) {
    const p = this.p;
    const coll = (x, y) => {
      const x0 = x - PW / 2, x1 = x + PW / 2 - 0.01, y0 = y - PH, y1 = y - 0.01;
      for (let r = Math.floor(y0 / MT); r <= Math.floor(y1 / MT); r++) for (let c = Math.floor(x0 / MT); c <= Math.floor(x1 / MT); c++) if (SOLID(this.get(c, r))) return true;
      // falling boulders are solid too
      return false;
    };
    if (dx) {
      if (!coll(p.x + dx, p.y)) p.x += dx;
      else {
        // step up 1 small ledge? no: Motherload-style, you dig or fly
        p.vx = 0;
      }
    }
    if (dy) {
      if (!coll(p.x, p.y + dy)) p.y += dy;
      else {
        if (dy > 0) {
          p.ground = true;
          p.y = Math.floor((p.y + dy) / MT) * MT;
          if (p.vy > 390) this.hurt(1, "摔伤"); // falls of up to 3 tiles are free (4+ hurts)
        } else p.y = Math.ceil((p.y + dy - PH) / MT) * MT + PH;
        p.vy = 0;
      }
    }
  }
  hurt(n, why) {
    const p = this.p;
    if (p.inv > 0 || this.ended) return;
    if (this.rel.rock && (why === "落石" || why === "中毒" || why === "炸伤")) {
      p.inv = 0.5;
      this.text(p.x, p.y - PH - 12, "坚岩之肤", "#c8d8ff");
      return;
    }
    if (this.rel.greed) n += 1;
    // 最终减伤 (梦境工坊): -1 per level; the guardian's hits and drowning still cost at least 1
    const dr = this.up.dr || 0;
    if (dr) {
      n = Math.max(why === "缺氧" || this.bossHit ? 1 : 0, n - dr);
      if (n <= 0) {
        p.inv = 0.5;
        this.text(p.x, p.y - PH - 12, "减伤", "#c8d8ff");
        return;
      }
    }
    p.hp -= n;
    p.inv = 0.9;
    p.hurtT = 0.3;
    this.shake = 6;
    this.text(p.x, p.y - PH - 12, why ? `-${n} ${why}` : "-" + n, "#ff6a6a", 1.1);
    snd("hurt");
    if (p.hp <= 0) {
      p.hp = 0;
      this.finish("dead");
    }
  }
  updateMobs(dt) {
    const p = this.p, py = p.y - PH / 2;
    for (const m of this.mobs) {
      m.anim += dt;
      m.flash -= dt;
      const dx = p.x - m.x, dy = py - m.y, d = Math.hypot(dx, dy);
      if (!m.awake && d < 6 * MT) m.awake = true;
      const d0 = m.d;
      if (d0.flee) {
        this.moleAI(m, dt, dx, d);
        continue;
      }
      if (d0.boss) {
        this.golemAI(m, dt, dx, dy, d);
        continue;
      }
      if (m.awake && d0.fly) {
        const inWater = this.waterAt(m.x, m.y);
        const sp = d0.swim && !inWater ? 10 : d0.spd;
        const ax = (dx / (d || 1)) * sp, ay = (dy / (d || 1)) * sp + Math.sin(m.anim * 3) * 14;
        m.vx += (ax - m.vx) * Math.min(1, dt * 3);
        m.vy += (ay - m.vy) * Math.min(1, dt * 3);
        if (d0.swim && !inWater) m.vy += 60 * dt; // jellyfish sink out of water
        const nx = m.x + m.vx * dt, ny = m.y + m.vy * dt;
        if (d0.phase || !this.solidAt(nx, m.y)) m.x = nx;
        else m.vx *= -0.5;
        if (d0.phase || !this.solidAt(m.x, ny)) m.y = ny;
        else m.vy *= -0.5;
        if (d0.swim && !this.waterAt(m.x, m.y) && this.waterAt(m.x, m.y + MT)) m.vy = Math.max(m.vy, 20);
      } else if (m.awake) {
        // walkers: gravity, shuffle toward the player, hop now and then
        m.vy += G * dt;
        m.vx = Math.sign(dx) * d0.spd * (Math.abs(dx) > 6 ? 1 : 0);
        m.cd -= dt;
        const grounded = this.solidAt(m.x, m.y + m.d.r + 1);
        if (grounded && m.cd <= 0 && d < 5 * MT) (m.vy = -260), (m.cd = 1.4 + Math.random());
        const nx = m.x + m.vx * dt;
        if (!this.solidAt(nx + Math.sign(m.vx) * m.d.r, m.y)) m.x = nx;
        const ny = m.y + m.vy * dt;
        if (!this.solidAt(m.x, ny + m.d.r)) m.y = ny;
        else m.vy = 0;
      }
      if (dx) m.face = dx > 0 ? 1 : -1;
      // ranged
      if (m.awake && d0.shoot) {
        m.cd -= dt;
        if (m.cd <= 0 && d < 8 * MT) {
          m.cd = d0.shoot;
          const a = Math.atan2(dy, dx);
          this.bullets.push({ x: m.x, y: m.y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, t: 2.4, dmg: 1, enemy: true, col: "#ff6a8a" });
        }
      }
      if (d < m.d.r + 10) this.hurt(m.d.dmg);
    }
  }
  /** 遗迹守护者: wakes when you enter its chamber. Fist slam (shockwave along the floor) up close, rock throw at range;
   *  below half health it enrages (red runes, faster) and adds a rock rain with warning marks on the floor. */
  golemAI(m, dt, dx, dy, d) {
    const p = this.p, gr = this.guardRoom;
    const inRoom = gr && p.x > gr.x0 * MT && p.x < (gr.x1 + 1) * MT && p.y > gr.ty * MT && p.y <= (gr.fy + 0.5) * MT;
    if (!m.awake && inRoom) {
      m.awake = true;
      m.intro = 1.4;
      this.text(m.x, m.y - 130, "遗迹守护者 苏醒了！", "#ff8a6a", 1.5);
      this.shake = 10;
      snd("explode", 0.3);
    }
    m.vy += G * dt;
    m.anim += dt;
    if (m.awake && !m.rage && m.hp < m.maxHp / 2) {
      m.rage = true;
      m.act = null;
      m.cd = 0.8;
      this.text(m.x, m.y - 130, "守护者 狂暴了！", "#ff4a4a", 1.4);
      this.shake = 12;
      snd("explode", 0.4);
      for (let k = 0; k < 14; k++) this.parts.push({ x: m.x + (Math.random() - 0.5) * 40, y: m.y - 20 - Math.random() * 30, vx: (Math.random() - 0.5) * 200, vy: -100 - Math.random() * 120, t: 0.8, col: Math.random() < 0.5 ? "#958a74" : "#5e5648", s: 3 });
    }
    // falling rocks from the rain
    for (const f of m.rain || []) {
      f.t -= dt;
      if (f.t <= 0 && !f.done) {
        f.done = true;
        this.bullets.push({ x: f.x, y: (gr.ty + 1) * MT, vx: 0, vy: 60, g: 600, t: 2, dmg: 1, enemy: true, rock: true, col: "#b8a890" });
      }
    }
    if (m.rain) m.rain = m.rain.filter((f) => !f.done);
    if (m.awake) {
      if (m.intro > 0) m.intro -= dt;
      else {
        const fast = m.rage ? 1.45 : 1;
        m.cd -= dt * fast;
        if (m.act) {
          m.act.t -= dt * fast;
          if (m.act.t <= 0) {
            const k = m.act.k;
            if (k === "slam") {
              this.shake = 12;
              snd("explode", 0.45);
              for (const side of [-1, 1]) {
                const fx = m.x + side * 68;
                this.spawnFx("explosions/dirt-explosion", fx, m.y + m.d.r, { life: 1.4 });
                for (let k2 = 0; k2 < 10; k2++) this.parts.push({ x: fx + (Math.random() - 0.5) * 16, y: m.y + m.d.r - 2, vx: side * (40 + Math.random() * 160), vy: -60 - Math.random() * 90, t: 0.55, col: Math.random() < 0.5 ? "#b8a890" : "#7a705e", s: 2 });
              }
              m.wave = { t: 0, x: m.x };
            } else if (k === "throw") {
              const t = 0.85, ox = m.x + m.face * 96, oy = m.y - 110, vx = (p.x - ox) / t, vy = (p.y - PH / 2 - oy) / t - 0.5 * 420 * t;
              this.bullets.push({ x: ox, y: oy, vx, vy, g: 420, t: 2, dmg: 1, enemy: true, rock: true, big: true, col: "#b8a890" });
              snd("click");
            } else if (k === "rain") {
              m.rain = [];
              for (let i = 0; i < 5; i++) m.rain.push({ x: clamp(p.x + (i - 2) * 30 + (Math.random() - 0.5) * 16, (gr.x0 + 1.5) * MT, (gr.x1 - 0.5) * MT), t: 0.9 + i * 0.12 });
              this.text(m.x, m.y - 130, "落石雨！", "#ffb070", 1.1);
            }
            m.act = null;
            m.cd = (m.rage ? 1.1 : 1.7) + Math.random() * 0.7;
          }
        } else if (m.cd <= 0) {
          const near = Math.abs(dx) < 3.4 * MT;
          const k = m.rage && Math.random() < 0.35 ? "rain" : near ? "slam" : "throw";
          m.act = { k, t: k === "slam" ? 0.75 : k === "rain" ? 0.6 : 0.5, T: k === "slam" ? 0.75 : k === "rain" ? 0.6 : 0.5 };
          if (k === "slam") this.text(m.x, m.y - 130, "！", "#ff6a6a", 1.5);
        } else {
          const nx = m.x + Math.sign(dx) * m.d.spd * fast * dt;
          if (Math.abs(dx) > 14 && !this.solidAt(nx + Math.sign(dx) * m.d.r, m.y)) m.x = nx;
        }
      }
      m.face = dx > 0 ? 1 : -1;
      if (Math.abs(p.x - m.x) < 26 && p.y > m.y - 70 && p.y < m.y + m.d.r + 4) (this.bossHit = true), this.hurt(1), (this.bossHit = false);
    }
    // shockwave rolls out along the floor both ways
    if (m.wave) {
      m.wave.t += dt;
      const reach = m.wave.t * 260;
      if (p.ground && Math.abs(p.y - (m.y + m.d.r)) < MT && Math.abs(Math.abs(p.x - m.wave.x) - reach) < 14) (this.bossHit = true), this.hurt(2, "震地"), (this.bossHit = false);
      if (Math.random() < 0.8) for (const side of [-1, 1]) this.parts.push({ x: m.wave.x + side * reach, y: m.y + m.d.r - 3, vx: 0, vy: -70, t: 0.3, col: m.rage ? "#ff7a4a" : "#d8ccb8", s: 3 });
      if (reach > 9 * MT) m.wave = null;
    }
    const ny = m.y + m.vy * dt;
    if (!this.solidAt(m.x, ny + m.d.r)) m.y = ny;
    else m.vy = 0;
  }
  /** 宝藏鼹鼠: wakes up when you get close, runs away digging through soft ground, and burrows off when its time is up */
  moleAI(m, dt, dx, d) {
    if (!m.awake && d < 7 * MT) {
      m.awake = true;
      this.text(m.x, m.y - 20, "宝藏鼹鼠！快抓住它", "#ffd84a", 1.1);
      snd("pickup", 0.1);
    }
    if (Math.random() < dt * 4) this.parts.push({ x: m.x + (Math.random() - 0.5) * 14, y: m.y - 6, vx: 0, vy: -20, t: 0.5, col: "#ffe36a", s: 1, glow: true });
    m.vy += G * dt;
    if (m.awake) {
      m.life -= dt;
      if (m.life <= 0) {
        this.mobs.splice(this.mobs.indexOf(m), 1);
        this.spawnFx("spawn/poof", m.x, m.y + 6, {});
        this.text(m.x, m.y - 14, "鼹鼠钻走了…", "#c8b0ff");
        return;
      }
      m.turnT = (m.turnT || 0) - dt;
      if (m.turnT <= 0) m.dir = d < 9 * MT ? -Math.sign(dx || 1) : m.dir || 1;
      const spd = m.d.spd * (d < 4 * MT ? 1.15 : 0.8);
      const ahead = m.x + m.dir * (m.d.r + 2), c = Math.floor(ahead / MT), rr = Math.floor(m.y / MT);
      const t = this.get(c, rr);
      if (c <= 0 || c >= MW - 1 || t === T.BEDROCK || t === T.SEAL) (m.dir = -m.dir), (m.turnT = 1.2);
      else if (SOLID(t)) {
        const hd = HARD[t];
        if (hd && hd.need <= 1 && t !== T.CHEST && t !== T.ORE) {
          m.digK = (m.digK || 0) + dt * 2.2;
          if (Math.random() < dt * 10) this.parts.push({ x: ahead, y: m.y, vx: -m.dir * 60, vy: -60, t: 0.3, col: "#c8a070", s: 2 });
          if (m.digK >= 1) {
            m.digK = 0;
            this.set(c, rr, T.AIR);
            this.checkFall(c, rr - 1);
          }
        } else (m.dir = -m.dir), (m.turnT = 1.2);
      } else m.x += m.dir * spd * dt;
      m.face = m.dir;
    }
    const ny = m.y + m.vy * dt;
    if (!this.solidAt(m.x, ny + m.d.r)) m.y = ny;
    else m.vy = 0;
    m.anim += m.awake ? dt * 2 : 0;
  }
  updateBullets(dt) {
    for (const b of this.bullets) {
      b.t -= dt;
      if (b.g) b.vy += b.g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (this.solidAt(b.x, b.y)) {
        b.t = 0;
        this.parts.push({ x: b.x, y: b.y, vx: 0, vy: -20, t: 0.15, col: b.col, s: 3, glow: true });
        continue;
      }
      if (b.enemy) {
        if (Math.hypot(b.x - this.p.x, b.y - (this.p.y - PH / 2)) < (b.rock ? (b.big ? 16 : 13) : 10)) (b.t = 0), (this.bossHit = !!b.rock), this.hurt(b.dmg), (this.bossHit = false);
        continue;
      }
      for (const m of this.mobs) {
        if (Math.hypot(b.x - m.x, b.y - m.y) < m.d.r + 4) {
          b.t = 0;
          this.hitMob(m, b.dmg);
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.t > 0);
  }
  hitMob(m, dmg) {
    m.hp -= dmg;
    m.flash = 0.1;
    m.awake = true;
    this.text(m.x, m.y - 12, Math.round(dmg), "#fff", 0.8);
    snd("hit", 0.03);
    if (m.hp <= 0) {
      this.mobs.splice(this.mobs.indexOf(m), 1);
      this.kills++;
      this.spawnFx("spawn/poof", m.x, m.y + 6, {});
      snd("kill", 0.05);
      // monsters carry a little loot
      const z = zoneAt(Math.floor(m.y / MT)), ids = Object.keys(ORES).filter((k) => ORES[k].zones[z.id]);
      if (m.d.boss) {
        this.text(m.x, m.y - 40, "遗迹守护者 倒下了！", "#ffd84a", 1.5);
        this.spawnFx("explosions/dirt-explosion", m.x, m.y + 10, { life: 2 });
        this.spawnFx("pickups/loot-beam", m.x, m.y + 10, { life: 2 });
        this.shake = 12;
        snd("ssr");
        this.addLoot("rune", m.x, m.y);
        this.addLoot("gear", m.x, m.y - 8);
        this.addStars(8, m.x, m.y);
        this.bossDown = true;
        const pool = Object.keys(RELICS).filter((k) => (this.rel[k] || 0) < RELICS[k].max);
        if (pool.length) this.choice = this.r.shuffle(pool).slice(0, 3);
        return;
      }
      if (m.d.flee) {
        this.moles++;
        this.text(m.x, m.y - 26, "抓到宝藏鼹鼠！", "#ffd84a", 1.3);
        this.spawnFx("pickups/loot-beam", m.x, m.y + 8, { life: 1.5 });
        const n = this.r.int(4, 6);
        for (let k = 0; k < n; k++) this.addLoot(this.r.weighted(ids, (q) => ORES[q].zones[z.id] * ORES[q].v * ORES[q].v), m.x, m.y - k * 6);
        this.addStars(this.r.int(2, 5), m.x, m.y);
        return;
      }
      if (this.r.chance(0.6)) this.addLoot(this.r.weighted(ids, (q) => ORES[q].zones[z.id]), m.x, m.y);
    }
  }
  updateBombs(dt) {
    for (const b of this.bombs) {
      b.t -= dt;
      b.vy += G * dt;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if (!this.solidAt(nx, b.y)) b.x = nx;
      else b.vx = 0;
      if (!this.solidAt(b.x, ny + 4)) b.y = ny;
      else (b.vy = 0), (b.vx *= 0.8);
      if (b.t <= 0) {
        const c0 = Math.floor(b.x / MT), r0 = Math.floor(b.y / MT);
        const br = this.rel.tnt ? 2 : 1;
        for (let r = r0 - br; r <= r0 + br; r++) for (let c = c0 - br; c <= c0 + br; c++) this.breakTile(c, r, true);
        for (const m of [...this.mobs]) if (Math.hypot(m.x - b.x, m.y - b.y) < 44 * br) this.hitMob(m, 40);
        if (Math.hypot(this.p.x - b.x, this.p.y - PH / 2 - b.y) < 34) this.hurt(2, "炸伤");
        this.spawnFx("explosions/dirt-explosion", b.x, b.y + 10, { life: 2 });
        this.shake = 10;
        snd("explode");
      }
    }
    this.bombs = this.bombs.filter((b) => b.t > 0);
  }
  updateFalling(dt) {
    const p = this.p;
    for (const f of this.falling) {
      if (f.wait > 0) {
        f.wait -= dt;
        continue;
      }
      f.vy = Math.min(380, f.vy + G * dt);
      const ny = f.y + f.vy * dt;
      // hit the player
      if (Math.abs(p.x - f.x) < MT / 2 + PW / 2 - 2 && ny + MT / 2 > p.y - PH && f.y - MT / 2 < p.y) {
        this.hurt(2, "落石");
        f.done = true;
        this.spawnFx("explosions/dirt-explosion", f.x, f.y + 12, { life: 1.6 });
        continue;
      }
      const below = Math.floor((ny + MT / 2) / MT);
      if (SOLID(this.get(f.c, below))) {
        f.done = true;
        const r = below - 1;
        if (this.get(f.c, r) === T.AIR) this.set(f.c, r, T.BOULDER);
        this.shake = 5;
        snd("hit");
        for (let k = 0; k < 6; k++) this.parts.push({ x: f.x + (Math.random() - 0.5) * 20, y: r * MT + MT, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, t: 0.5, col: "#b8a890", s: 2 });
      } else f.y = ny;
    }
    this.falling = this.falling.filter((f) => !f.done);
  }

  /** end of the dive: how much of the bag comes out */
  finish(how) {
    if (this.ended) return;
    const keep = how === "extract" ? 1 : how === "timeup" ? 1 : how === "power" ? 0.5 : 0.3;
    const r = this.r;
    const bag = r.shuffle([...this.bag]);
    const kept = bag.slice(0, Math.round(bag.length * keep));
    const dz = DEPTH_STARS[zoneAt(Math.max(0, this.p.deepest - 1)).id] || 0;
    const stars = Math.floor((this.stars + dz) * keep);
    this.ended = { how, keep, kept, lost: bag.length - kept.length, stars, starsFound: this.stars, depth: this.p.deepest, kills: this.kills, dug: this.dug, value: Math.round(kept.reduce((a, id) => a + ORES[id].v, 0) * (this.rel.greed ? 1.3 : 1)), relics: { ...this.rel }, moles: this.moles, relicsOpened: this.relicsOpened, mats: kept.reduce((a, id) => a + ORES[id].m, 0) };
    snd(how === "dead" ? "lose" : "clear");
    this.onEnd && this.onEnd(this.ended);
  }

  // ---------------------------------------------------------------- render
  draw(g, rs0) {
    const p = this.p, rs = rs0 * Z, VIEW_W = vw(), VIEW_H = vh();
    const sh = this.shake > 0 ? (this.shake -= 0.6, (Math.random() - 0.5) * this.shake) : 0;
    const cx = Math.round(this.cam.x + sh), cy = Math.round(this.cam.y + sh * 0.6);
    g.setTransform(rs, 0, 0, rs, 0, 0);
    g.imageSmoothingEnabled = false;
    // sky / background
    const z0 = zoneAt(Math.max(0, Math.floor((cy + VIEW_H / 2) / MT)));
    g.fillStyle = z0.bg[1];
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    if (cy < 0) this.drawSky(g, cx, cy);
    // back walls: each zone's layer, clipped to the rows that zone covers on screen
    for (const z of ZONES) {
      const y0 = z.from * MT - cy, y1 = Math.min(z.to, this.rows) * MT - cy;
      if (y1 <= 0 || y0 >= VIEW_H) continue;
      const img = deepLayer(z), top = Math.max(0, y0), bot = Math.min(VIEW_H, y1);
      const ox = ((Math.round(cx * DEEP_K) % img.width) + img.width) % img.width;
      // the wall moves at DEEP_K of the camera's speed: anchor = zone top + (camera into zone) * (1 - k)
      let sy = Math.round(y0 + (cy - z.from * MT) * (1 - DEEP_K));
      sy -= Math.ceil((sy - top) / img.height) * img.height;
      g.save();
      g.beginPath();
      g.rect(0, top, VIEW_W, bot - top);
      g.clip();
      for (let x = -ox; x < VIEW_W; x += img.width) for (let y = sy; y < bot; y += img.height) g.drawImage(img, x, y);
      g.restore();
    }
    g.translate(-cx, -cy);
    const c0 = Math.max(0, Math.floor(cx / MT) - 1), c1 = Math.min(MW - 1, Math.floor((cx + VIEW_W) / MT) + 1);
    const r0 = Math.max(0, Math.floor(cy / MT) - 1), r1 = Math.min(this.rows - 1, Math.floor((cy + VIEW_H) / MT) + 1);
    const radar = this.up.radar || 0;
    // outside the shaft walls
    if (cx < 0) (g.fillStyle = "#1e1a22"), g.fillRect(cx, Math.max(0, cy), -cx, VIEW_H);
    if (cx + VIEW_W > MW * MT) (g.fillStyle = "#1e1a22"), g.fillRect(MW * MT, Math.max(0, cy), cx + VIEW_W - MW * MT, VIEW_H);
    for (let r = r0; r <= r1; r++) {
      const z = zoneAt(r);
      for (let c = c0; c <= c1; c++) {
        const i = r * MW + c, t = this.t[i], X = c * MT, Y = r * MT, v = (c * 7 + r * 13) % 4;
        if (t === T.BOULDER) g.drawImage(tileArt("bg", z, v), X, Y);
        switch (t) {
          case T.DIRT: g.drawImage(tileArt("dirt", z, v), X, Y); break;
          case T.ROOT: g.drawImage(tileArt("root", z, v), X, Y); break;
          case T.STONE: g.drawImage(tileArt("stone", z, v), X, Y); break;
          case T.GAS: g.drawImage(tileArt("gas", z, v), X, Y); if (radar >= 1) (g.globalAlpha = 0.55 + 0.25 * Math.sin(this.time * 4)), g.drawImage(tileArt("gasmark", z, v), X, Y), (g.globalAlpha = 1); break;
          case T.HARD: g.drawImage(tileArt("hard", z, v), X, Y); break;
          case T.GRANITE: g.drawImage(tileArt("granite", z, v), X, Y); break;
          case T.BRICK: g.drawImage(tileArt("brick", z, v), X, Y); break;
          case T.BEDROCK: g.drawImage(tileArt("bedrock", z, 0), X, Y); break;
          case T.SEAL: g.drawImage(tileArt("seal", z, 0), X, Y); g.globalAlpha = 0.25 + 0.2 * Math.sin(this.time * 3 + c); g.fillStyle = "#b48cff"; g.fillRect(X, Y, MT, MT); g.globalAlpha = 1; break;
          case T.BOULDER: g.drawImage(tileArt("boulder", z, v), X, Y); break;
          case T.ORE: g.drawImage(tileArt("ore", z, v, this.ore[i]), X, Y); break;
          case T.CHEST: g.drawImage(tileArt("chest", z, v, this.chest[i]), X, Y); break;
        }
        // edges: a lit lip on top of solid ground, a dark lip under ceilings
        if (SOLID(t) && t !== T.BOULDER && t !== T.BEDROCK) {
          if (!SOLID(this.get(c, r - 1))) (g.fillStyle = "rgba(255,240,210,.35)"), g.fillRect(X, Y, MT, 2), (g.fillStyle = "#1a1020"), g.fillRect(X, Y - 1, MT, 1);
          if (!SOLID(this.get(c, r + 1))) (g.fillStyle = "rgba(0,0,0,.35)"), g.fillRect(X, Y + MT - 3, MT, 3);
          if (!SOLID(this.get(c - 1, r))) (g.fillStyle = "rgba(0,0,0,.25)"), g.fillRect(X, Y, 2, MT);
          if (!SOLID(this.get(c + 1, r))) (g.fillStyle = "rgba(0,0,0,.25)"), g.fillRect(X + MT - 2, Y, 2, MT);
        }
        if (radar >= 2 && t === T.ORE && !this.revealed[i]) {
          g.strokeStyle = ORES[this.ore[i]].col[0];
          g.globalAlpha = 0.5;
          g.strokeRect(X + 3.5, Y + 3.5, MT - 7, MT - 7);
          g.globalAlpha = 1;
        }
      }
    }
    // water
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        if (this.t[r * MW + c] !== T.WATER) continue;
        const X = c * MT, Y = r * MT;
        g.fillStyle = "rgba(40,140,220,.42)";
        g.fillRect(X, Y, MT, MT);
        if (this.get(c, r - 1) === T.AIR) {
          g.fillStyle = "#a8e8ff";
          g.fillRect(X, Y + Math.round(Math.sin(this.time * 3 + c) * 1.5), MT, 2);
        }
      }
    // lifts
    for (const l of this.lifts) {
      const X = l.c * MT, Y = l.r * MT;
      if (Y < cy - MT * 3 || Y > cy + VIEW_H + MT) continue;
      g.fillStyle = "#3a3a4a";
      g.fillRect(X - 8, Y - MT - 8, MT + 16, 4);
      g.fillStyle = "#7dffb0";
      g.globalAlpha = 0.25 + 0.15 * Math.sin(this.time * 4);
      g.fillRect(X - 6, Y - MT - 4, MT + 12, MT * 2 + 4);
      g.globalAlpha = 1;
      g.strokeStyle = "#c8c8d8";
      g.lineWidth = 2;
      for (let k = 0; k < 4; k++) (g.beginPath(), g.moveTo(X - 6 + k * 12, Y - MT - 4), g.lineTo(X - 6 + k * 12, Y + MT), g.stroke());
      this.label(g, "撤离电梯", X + MT / 2, Y - MT - 12, "#7dffb0");
    }
    // dig cracks
    if (p.dig) {
      const X = p.dig.c * MT, Y = p.dig.r * MT, k = clamp(p.dig.k);
      g.strokeStyle = "#1a1020";
      g.lineWidth = 1.5;
      g.beginPath();
      const n = 1 + Math.floor(k * 4);
      for (let j = 0; j < n; j++) {
        const a = j * 1.9;
        g.moveTo(X + 12, Y + 12);
        g.lineTo(X + 12 + Math.cos(a) * 10 * k, Y + 12 + Math.sin(a) * 10 * k);
      }
      g.stroke();
    }
    // gas clouds (tint, the pixelfx cloud does the rest)
    for (const c of this.clouds) {
      g.fillStyle = `rgba(120,230,80,${0.12 * Math.min(1, c.t)})`;
      g.beginPath();
      g.arc(c.x, c.y, c.r, 0, TAU);
      g.fill();
    }
    // falling rocks
    for (const f of this.falling) {
      const z = zoneAt(Math.floor(f.y / MT)), wob = f.wait > 0 ? Math.round(Math.sin(this.time * 60) * 1.5) : 0;
      g.drawImage(tileArt("boulder", z, 0), 0, 2, MT, MT - 4, f.x - MT / 2 + wob, f.y - MT / 2 + 2, MT, MT - 4);
    }
    if (this.merchant) this.drawMerchant(g);
    if (this.guardRoom) this.drawGuardRoom(g);
    // monsters
    for (const m of this.mobs) {
      if (m.y < cy - 40 || m.y > cy + VIEW_H + 40) continue;
      if (m.d.draw === "mole") {
        this.drawMole(g, m);
        continue;
      }
      if (m.d.draw === "golem") {
        this.drawGolem(g, m);
        continue;
      }
      const s = A.critters[m.d.sprite];
      if (!s) continue;
      const fr = Math.floor(m.anim * s.fps) % s.n, sc = m.d.sc;
      g.save();
      g.translate(Math.round(m.x), Math.round(m.y + m.d.r * 0.6));
      if (m.face < 0) g.scale(-1, 1);
      g.drawImage(s.img, fr * s.w, 0, s.w, s.h, -s.ox * sc, -s.oy * sc, s.w * sc, s.h * sc);
      if (m.flash > 0) (g.globalCompositeOperation = "lighter"), (g.globalAlpha = 0.7), g.drawImage(s.img, fr * s.w, 0, s.w, s.h, -s.ox * sc, -s.oy * sc, s.w * sc, s.h * sc);
      g.restore();
      if (m.hp < m.maxHp) {
        const w = 16;
        g.fillStyle = "#14101c";
        g.fillRect(m.x - w / 2 - 1, m.y - m.d.r - 12, w + 2, 4);
        g.fillStyle = "#ff4a5a";
        g.fillRect(m.x - w / 2, m.y - m.d.r - 11, w * clamp(m.hp / m.maxHp), 2);
      }
    }
    // bombs
    for (const b of this.bombs) {
      g.fillStyle = "#1a1020";
      g.beginPath();
      g.arc(b.x, b.y, 5, 0, TAU);
      g.fill();
      g.fillStyle = Math.floor(b.t * 8) % 2 ? "#ff5a3a" : "#ffd84a";
      g.fillRect(b.x + 2, b.y - 8, 2, 3);
    }
    // player
    this.drawPlayer(g);
    // bullets
    for (const b of this.bullets) {
      if (b.rock) {
        drawRock(g, b.x, b.y, b.big ? 10 : 7);
        continue;
      }
      g.fillStyle = b.col;
      g.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 4, 4);
      g.fillStyle = "#fff";
      g.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2);
    }
    // particles
    for (const q of this.parts) {
      g.globalAlpha = Math.min(1, q.t * 3);
      g.fillStyle = q.col;
      g.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
    }
    g.globalAlpha = 1;
    // pixelfx
    if (this.fx) {
      // the fx frame starts at the camera corner; at zoom it simply covers more than the view
      g.setTransform(rs, 0, 0, rs, 0, 0);
      this.fx.begin(cx, cy);
      this.fx.drawBack(g);
      this.fx.drawFront(g);
      g.translate(-cx, -cy);
    }
    // darkness: deeper is darker; the girl, lit ores, lifts and blasts are light sources
    this.drawDark(g, cx, cy, rs);
    g.setTransform(rs, 0, 0, rs, 0, 0);
    g.translate(-cx, -cy);
    for (const t of this.texts) this.label(g, t.s, t.x, t.y, t.col, 10 * t.size, Math.min(1, t.t * 2));
    // extraction ring
    if (this.extractHint && this.extractT <= 0) this.label(g, "站着别动 1 秒即可撤离", p.x, p.y - PH - 18, "#7dffb0", 9);
    if (this.extractT > 0) {
      g.strokeStyle = "#7dffb0";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(p.x, p.y - PH - 14, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (this.extractT / 1.2));
      g.stroke();
      this.label(g, "撤离中", p.x, p.y - PH - 28, "#7dffb0");
    }
    g.setTransform(rs, 0, 0, rs, 0, 0);
    this.drawPointers(g, cx, cy);
  }
  drawSky(g, cx, cy) {
    const h = -cy, VIEW_W = vw(), t = this.time;
    const L = skyLayers();
    g.save();
    g.beginPath();
    g.rect(0, 0, VIEW_W, h);
    g.clip();
    // sky
    const top = h - SURF * MT - 40;
    const sky = g.createLinearGradient(0, top, 0, h);
    sky.addColorStop(0, "#3c58c8");
    sky.addColorStop(0.55, "#8aa4f0");
    sky.addColorStop(0.85, "#ffc8a0");
    sky.addColorStop(1, "#ffe0b0");
    g.fillStyle = sky;
    g.fillRect(0, 0, VIEW_W, h);
    // a layer's ground line follows the real horizon at a fraction of the camera's vertical movement
    const h0 = SURF * MT * 0.62, base = (f) => Math.round(h0 + (h - h0) * f);
    const tile = (img, f, y, drift = 0) => {
      const w = img.width, ox = Math.round(((cx * f + drift) % w) + w) % w;
      for (let x = -ox; x < VIEW_W; x += w) g.drawImage(img, x, y);
    };
    // sun with a soft glow
    const sx = VIEW_W * 0.78 - cx * 0.03, sy = Math.max(26, base(0.05) - 86);
    const glow = g.createRadialGradient(sx, sy, 4, sx, sy, 60);
    glow.addColorStop(0, "rgba(255,240,190,.9)");
    glow.addColorStop(1, "rgba(255,220,160,0)");
    g.fillStyle = glow;
    g.fillRect(sx - 60, sy - 60, 120, 120);
    g.fillStyle = "#fff4c8";
    g.fillRect(sx - 9, sy - 12, 18, 24);
    g.fillRect(sx - 12, sy - 9, 24, 18);
    // clouds drift on their own
    tile(L.clouds, 0.04, base(0.04) - 150, t * 6);
    tile(L.far, 0.07, base(0.07) - L.far.height);
    tile(L.hills, 0.22, base(0.22) - L.hills.height);
    // birds
    for (let k = 0; k < 3; k++) {
      const bx = ((t * (14 + k * 3) + k * 210 - cx * 0.3) % (VIEW_W + 80) + VIEW_W + 80) % (VIEW_W + 80) - 40, by = base(0.3) - 90 - k * 14 + Math.sin(t * 2 + k) * 4;
      const wing = Math.sin(t * 9 + k * 2) > 0 ? -2 : 1;
      g.fillStyle = "#2a2440";
      g.fillRect(bx - 4, by + wing, 3, 1);
      g.fillRect(bx - 1, by, 2, 1);
      g.fillRect(bx + 1, by + wing, 3, 1);
    }
    tile(L.pines, 0.42, base(0.42) - L.pines.height);
    tile(L.near, 0.68, base(0.68) - L.near.height);
    g.restore();
    // the camp on the real ground (moves with the world)
    const camp = (MW * MT) / 2 - cx;
    // headframe over the shaft, the wheel turns while you dig
    g.fillStyle = "#1a1020";
    g.fillRect(camp - 34, h - 74, 5, 74);
    g.fillRect(camp + 29, h - 74, 5, 74);
    g.fillStyle = "#6a4a2e";
    g.fillRect(camp - 33, h - 73, 3, 73);
    g.fillRect(camp + 30, h - 73, 3, 73);
    for (let y = h - 66; y < h - 4; y += 16) {
      g.fillStyle = "#1a1020";
      g.fillRect(camp - 30, y, 60, 3);
      g.fillStyle = "#8a6038";
      g.fillRect(camp - 30, y, 60, 2);
    }
    g.fillStyle = "#1a1020";
    g.fillRect(camp - 38, h - 80, 76, 7);
    g.fillStyle = "#a8743e";
    g.fillRect(camp - 37, h - 79, 74, 4);
    const ang = this.dug * 0.35 + t * 0.4, wx = camp, wy = h - 88;
    g.fillStyle = "#1a1020";
    g.beginPath();
    g.arc(wx, wy, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c8c0d8";
    g.beginPath();
    g.arc(wx, wy, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1a1020";
    g.beginPath();
    g.arc(wx, wy, 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#c8c0d8";
    g.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const a = ang + (k * Math.PI) / 2;
      g.beginPath();
      g.moveTo(wx, wy);
      g.lineTo(wx + Math.cos(a) * 7, wy + Math.sin(a) * 7);
      g.stroke();
    }
    g.fillStyle = "#1a1020";
    g.fillRect(wx - 1, wy, 2, h - wy);
    // tent
    g.fillStyle = "#1a1020";
    g.beginPath();
    g.moveTo(camp - 112, h);
    g.lineTo(camp - 86, h - 34);
    g.lineTo(camp - 60, h);
    g.fill();
    g.fillStyle = "#d8683a";
    g.beginPath();
    g.moveTo(camp - 108, h);
    g.lineTo(camp - 86, h - 30);
    g.lineTo(camp - 64, h);
    g.fill();
    g.fillStyle = "#7a2a1a";
    g.beginPath();
    g.moveTo(camp - 90, h);
    g.lineTo(camp - 86, h - 14);
    g.lineTo(camp - 82, h);
    g.fill();
    // campfire with smoke
    const fx = camp - 52;
    g.fillStyle = "#5a3a1a";
    g.fillRect(fx - 6, h - 3, 12, 3);
    const fl = 4 + Math.round(Math.sin(t * 14) * 1.5);
    g.fillStyle = "#ff7a2a";
    g.fillRect(fx - 3, h - 3 - fl, 6, fl);
    g.fillStyle = "#ffe36a";
    g.fillRect(fx - 1, h - 2 - fl + 2, 2, fl - 2);
    for (let k = 0; k < 4; k++) {
      const q = (t * 0.5 + k / 4) % 1;
      g.globalAlpha = 0.45 * (1 - q);
      g.fillStyle = "#e8e0f0";
      const r = 2 + q * 5;
      g.fillRect(fx + Math.sin(t + k) * 4 * q - r / 2, h - 10 - q * 46 - r / 2, r, r);
    }
    g.globalAlpha = 1;
    // mine cart on rails
    const mc = camp + 46;
    g.fillStyle = "#3a3040";
    g.fillRect(mc - 4, h - 2, 46, 2);
    g.fillStyle = "#1a1020";
    g.fillRect(mc, h - 16, 26, 12);
    g.fillStyle = "#7a6a8a";
    g.fillRect(mc + 1, h - 15, 24, 10);
    g.fillStyle = "#c08a50";
    g.fillRect(mc + 3, h - 19, 6, 4);
    g.fillStyle = "#e0e0f0";
    g.fillRect(mc + 10, h - 20, 5, 5);
    g.fillStyle = "#ffd84a";
    g.fillRect(mc + 16, h - 18, 5, 3);
    g.fillStyle = "#1a1020";
    g.fillRect(mc + 3, h - 5, 5, 5);
    g.fillRect(mc + 18, h - 5, 5, 5);
    // sign
    g.fillStyle = "#3a2a1a";
    g.fillRect(camp + 92, h - 30, 3, 30);
    g.fillStyle = "#1a1020";
    g.fillRect(camp + 70, h - 42, 48, 16);
    g.fillStyle = "#6a4426";
    g.fillRect(camp + 71, h - 41, 46, 14);
    this.label(g, "梦境矿场", camp + 94, h - 31, "#ffe36a", 10);
  }
  /** edge arrows for things off to the side at about this depth: lifts, the merchant, the guardian chamber */
  drawPointers(g, cx, cy) {
    const VW = vw(), VH = vh(), t = this.time, list = [];
    for (const l of this.lifts) list.push([l.c * MT + MT / 2, l.r * MT, "电梯", "#7dffb0"]);
    if (this.merchant) list.push([this.merchant.x, this.merchant.y - 20, "商人", "#e0c8ff"]);
    const boss = this.mobs.find((m) => m.d.boss);
    if (boss) list.push([boss.x, boss.y, "守护者", "#ff8a6a"]);
    for (const [x, y, name, col] of list) {
      const sx = x - cx, sy = y - cy;
      if (sy < -MT * 2 || sy > VH + MT * 2 || (sx > 0 && sx < VW)) continue;
      const left = sx <= 0, ex = left ? 10 : VW - 10, ey = clamp(sy, 40, VH - 50), bob = Math.sin(t * 5) * 2 * (left ? -1 : 1);
      g.fillStyle = "#1a1020";
      g.beginPath();
      g.moveTo(ex + bob + (left ? -7 : 7), ey);
      g.lineTo(ex + bob + (left ? 5 : -5), ey - 8);
      g.lineTo(ex + bob + (left ? 5 : -5), ey + 8);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(ex + bob + (left ? -4 : 4), ey);
      g.lineTo(ex + bob + (left ? 3 : -3), ey - 5);
      g.lineTo(ex + bob + (left ? 3 : -3), ey + 5);
      g.fill();
      const dist = Math.round(Math.abs(left ? sx : sx - VW) / MT);
      this.label(g, `${name} ${dist}格`, ex + (left ? 26 : -26), ey + 14, col, 8);
    }
  }
  drawGolem(g, m) {
    const P = golemParts(), x = Math.round(m.x), foot = Math.round(m.y + m.d.r), f = m.face || 1, t = this.time;
    const act = m.act, ph = act ? 1 - act.t / act.T : 0, S = 2;
    g.save();
    g.translate(x, foot);
    g.scale(S, S);
    g.translate(-x, -foot);
    const breath = m.awake ? Math.round(Math.sin(m.anim * 3) * 1.5) : 0;
    const rune = m.rage ? "#ff4a3a" : "#5ad8ff", runeHi = m.rage ? "#ffd0a0" : "#d8f8ff";
    const glow = 0.6 + 0.4 * Math.sin(t * (m.rage ? 9 : 4));
    // floor shadow
    g.fillStyle = "rgba(0,0,0,.35)";
    g.fillRect(x - 30, foot - 2, 60, 3);
    // legs
    const fl = m.flash > 0 ? 0.75 : 0;
    // draw a part, and its white copy on top while flashing from a hit
    const part = (k, px, py) => {
      g.drawImage(P[k], px, py);
      if (fl) (g.globalAlpha = fl), g.drawImage(P.W[k], px, py), (g.globalAlpha = 1);
    };
    part("leg", x - 17, foot - 14);
    part("leg", x + 5, foot - 14);
    // body (squash while winding up a slam)
    const squash = act && act.k === "slam" ? Math.round(ph * 4) : 0;
    const by = foot - 12 - 38 + breath + squash;
    g.save();
    g.translate(x, 0);
    g.scale(f, 1);
    part("body", -23, by);
    // rune lines and the core
    g.globalAlpha = glow;
    g.fillStyle = rune;
    g.fillRect(-14, by + 10, 8, 2), g.fillRect(-14, by + 10, 2, 12), g.fillRect(8, by + 14, 8, 2), g.fillRect(14, by + 14, 2, 10);
    g.fillRect(-8, by + 28, 16, 2);
    g.globalAlpha = 1;
    const cs = 5 + Math.round(glow * 2);
    g.fillStyle = "#1a1020";
    g.fillRect(-cs - 1, by + 16 - cs - 1, cs * 2 + 2, cs * 2 + 2);
    g.fillStyle = rune;
    g.fillRect(-cs, by + 16 - cs, cs * 2, cs * 2);
    g.fillStyle = runeHi;
    g.fillRect(-2, by + 14, 3, 3);
    // shoulders and head
    part("shoulder", -30, by - 4);
    part("shoulder", 14, by - 4);
    const hy = by - 16 + Math.round(Math.sin(m.anim * 3 + 1) * 1);
    part("head", -13, hy);
    const eyeOn = m.awake || Math.sin(t * 1.5) > 0.6;
    if (eyeOn) {
      g.fillStyle = rune;
      g.fillRect(-7, hy + 10, 4, 2), g.fillRect(3, hy + 10, 4, 2);
      g.globalAlpha = 0.35 * glow;
      g.fillRect(-9, hy + 8, 8, 6), g.fillRect(1, hy + 8, 8, 6);
      g.globalAlpha = 1;
    }
    g.restore();
    // floating fists: idle bob; raised high while winding a slam, then down on the floor; the throwing fist pulls back
    for (const side of [-1, 1]) {
      let fx = x + side * 34, fy = by + 10 + Math.round(Math.sin(m.anim * 3 + (side > 0 ? 0 : 1.6)) * 3);
      if (act && act.k === "slam") (fx = x + side * (34 - ph * 6)), (fy = by - 26 * Math.min(1, ph * 1.4));
      if (m.wave && m.wave.t < 0.25) fy = foot - 16;
      if (act && act.k === "throw" && side === f) (fx = x + side * (34 + ph * 8)), (fy = by - 12 * ph);
      if (act && act.k === "rain") fy = by - 30 - Math.sin(ph * Math.PI) * 6;
      part("fist", Math.round(fx - 9), Math.round(fy));
      if (m.rage) (g.globalAlpha = 0.5 * glow), (g.fillStyle = rune), g.fillRect(Math.round(fx - 7), Math.round(fy + 12), 14, 2), (g.globalAlpha = 1);
    }
    g.restore();
    // the rock it is about to throw: same size and look as the thrown one (drawn at world scale)
    if (act && act.k === "throw") {
      const hx = x + f * (40 + ph * 8), hy2 = by - 22 * ph;
      drawRock(g, x + (hx - x) * S, foot + (hy2 - foot) * S, 10);
    }
    // rock rain warnings
    for (const r of m.rain || []) {
      const a = 0.4 + 0.4 * Math.sin(t * 20);
      g.fillStyle = `rgba(255,80,60,${a})`;
      g.fillRect(r.x - 8, foot - 2, 16, 2);
      g.fillRect(r.x - 1, foot - 10, 2, 6);
    }
    if (!m.awake) this.label(g, "遗迹守护者", x, foot - 150, "#ffb070", 10);
  }
  /** torches on the chamber walls and a rune line along its floor */
  drawGuardRoom(g) {
    const gr = this.guardRoom, t = this.time, boss = this.mobs.find((m) => m.d.boss), rage = boss && boss.rage;
    const col = rage ? "#ff4a3a" : "#5ad8ff";
    g.globalAlpha = boss ? 0.5 + 0.3 * Math.sin(t * 3) : 0.25;
    g.fillStyle = col;
    g.fillRect((gr.x0 + 1) * MT, gr.fy * MT - 2, (gr.x1 - gr.x0 - 1) * MT, 2);
    for (let c = gr.x0 + 2; c < gr.x1; c += 3) g.fillRect(c * MT + 8, gr.fy * MT - 5, 8, 2);
    g.globalAlpha = 1;
    for (const c of [gr.x0 + 1, gr.x1 - 1]) {
      const tx = c * MT + MT / 2, ty = (gr.fy - 4) * MT;
      g.fillStyle = "#1a1020";
      g.fillRect(tx - 3, ty, 6, 10);
      g.fillStyle = "#6a4a2e";
      g.fillRect(tx - 2, ty + 1, 4, 8);
      const fl = 5 + Math.round(Math.sin(t * 13 + c) * 2);
      g.fillStyle = "#ff7a2a";
      g.fillRect(tx - 3, ty - fl, 6, fl);
      g.fillStyle = "#ffe36a";
      g.fillRect(tx - 1, ty - fl + 2, 2, fl - 2);
    }
  }
  drawMole(g, m) {
    const x = Math.round(m.x), y = Math.round(m.y + m.d.r), f = m.face || 1, step = m.awake ? Math.round(Math.sin(m.anim * 18)) : 0;
    const R = (dx, dy, w, h, c) => ((g.fillStyle = c), g.fillRect(f > 0 ? x + dx : x - dx - w, y + dy, w, h));
    R(-9, -12, 15, 11, "#1a1020"); // outline
    R(-8, -11, 13, 9, "#7a5034"); // body
    R(-8, -11, 13, 3, "#9a6a44");
    R(2, -8, 6, 5, "#1a1020"); // snout
    R(3, -7, 4, 3, "#c88a64");
    R(7, -7, 2, 2, "#ff8ab0"); // nose
    R(1, -10, 2, 2, "#1a1020"); // eye
    R(-6, -15, 9, 4, "#1a1020"); // helmet
    R(-5, -14, 7, 3, "#ffc83a");
    R(1, -14, 2, 2, "#fff6c0"); // lamp
    R(-14, -14, 7, 9, "#1a1020"); // sack
    R(-13, -13, 5, 7, "#c8a060");
    R(-12, -12, 2, 2, "#ffe36a");
    R(-6 + step, -2, 3, 2, "#1a1020"); // feet
    R(1 - step, -2, 3, 2, "#1a1020");
    if (m.flash > 0) (g.globalAlpha = 0.6), R(-9, -15, 18, 15, "#ffffff"), (g.globalAlpha = 1);
    if (m.awake) {
      const w = 16;
      g.fillStyle = "#14101c";
      g.fillRect(m.x - w / 2 - 1, m.y - m.d.r - 16, w + 2, 4);
      g.fillStyle = "#ffd84a";
      g.fillRect(m.x - w / 2, m.y - m.d.r - 15, w * clamp(m.life / 22), 2);
    }
  }
  drawMerchant(g) {
    const mc = this.merchant, x = Math.round(mc.x), y = mc.y, t = this.time;
    const R = (dx, dy, w, h, c) => ((g.fillStyle = c), g.fillRect(x + dx, y + dy, w, h));
    g.save();
    g.translate(x, y);
    g.scale(1.4, 1.4);
    g.translate(-x, -y);
    // rug and wares
    R(-30, -3, 60, 3, "#7a2a4a");
    R(-30, -3, 60, 1, "#c8508a");
    R(-26, -9, 6, 6, "#1a1020"), R(-25, -8, 4, 4, "#ff6a8a");
    R(-18, -8, 6, 5, "#1a1020"), R(-17, -7, 4, 3, "#7dd8ff");
    R(14, -10, 8, 7, "#1a1020"), R(15, -9, 6, 5, "#c8a060");
    // hooded figure
    R(-7, -26, 14, 23, "#1a1020");
    R(-6, -25, 12, 22, "#5a3a9a");
    R(-6, -25, 12, 4, "#7a5ac8");
    R(-4, -20, 8, 6, "#1a1020");
    const blink = Math.sin(t * 1.3) > 0.95;
    if (!blink) R(-3, -18, 2, 1, "#ffe36a"), R(1, -18, 2, 1, "#ffe36a");
    // lantern on a staff
    R(8, -34, 2, 31, "#3a2a1a");
    R(6, -38, 6, 6, "#1a1020");
    R(7, -37, 4, 4, Math.sin(t * 8) > 0 ? "#ffe36a" : "#ffc83a");
    g.restore();
    this.label(g, "地下商人", x, y - 62, "#e0c8ff", 9);
    if (this.nearShop) this.label(g, "站定交易", x, y - 74, "#7dffb0", 9, 0.6 + 0.4 * Math.sin(t * 6));
  }
  drawPlayer(g) {
    const p = this.p, set = A.girls[this.o.cid];
    if (!set) return;
    const img = p.face > 0 ? set.views.side : set.views.sideL;
    const H = 32, k = H / set.foot, W = set.w * k;
    const blink = p.inv > 0 && Math.floor(this.time * 20) % 2 === 0;
    const walking = Math.abs(p.vx) > 10 && p.ground;
    const bob = walking ? -Math.abs(Math.sin(p.anim * 12)) * 1.5 : p.jet ? Math.sin(p.anim * 30) * 0.5 : 0;
    const digShake = p.dig ? Math.sin(this.time * 70) * 1 : 0;
    g.save();
    g.globalAlpha = blink ? 0.45 : 1;
    // the drill in front of her
    const dx = p.dig ? (p.dig.dir === "side" ? p.face * 10 : 0) : p.face * 9, dy = p.dig && p.dig.dir === "down" ? 2 : p.dig && p.dig.dir === "up" ? -PH - 2 : -PH / 2;
    g.fillStyle = "#c8c8d8";
    g.save();
    g.translate(p.x + dx + digShake, p.y + dy);
    g.rotate(p.dig && p.dig.dir === "down" ? Math.PI / 2 : p.dig && p.dig.dir === "up" ? -Math.PI / 2 : p.face > 0 ? 0 : Math.PI);
    g.fillStyle = "#5a5a6a";
    g.fillRect(-4, -3, 6, 6);
    g.fillStyle = "#e8e8f0";
    g.beginPath();
    g.moveTo(2, -4);
    g.lineTo(10 + (p.dig ? Math.sin(this.time * 80) : 0), 0);
    g.lineTo(2, 4);
    g.fill();
    g.restore();
    g.drawImage(img, Math.round(p.x - W / 2 + digShake), Math.round(p.y - set.h * k + (set.h - set.foot) * k + bob), W, set.h * k);
    if (p.hurtT > 0) (g.globalCompositeOperation = "lighter"), (g.globalAlpha = 0.6), g.drawImage(set.white[p.face > 0 ? "side" : "sideL"], Math.round(p.x - W / 2), Math.round(p.y - set.h * k + (set.h - set.foot) * k + bob), W, set.h * k);
    g.restore();
    // jetpack flame
    if (p.jet) {
      g.fillStyle = "#ffd84a";
      g.fillRect(Math.round(p.x - p.face * 6) - 1, Math.round(p.y - 6), 3, 4 + Math.round(Math.random() * 3));
    }
  }
  drawDark(g, cx, cy, rs) {
    const VIEW_W = vw(), VIEW_H = vh();
    const depth = cy / MT + VIEW_H / MT / 2;
    const k = clamp((depth - 2) / 40, 0, 0.94);
    if (k <= 0.02) return;
    if (!this.dark || this.dark.width !== Math.ceil(VIEW_W)) this.dark = cv(Math.ceil(VIEW_W), Math.ceil(VIEW_H));
    const d = this.dark.getContext("2d");
    d.globalCompositeOperation = "source-over";
    d.clearRect(0, 0, VIEW_W, VIEW_H);
    d.fillStyle = zoneAt(Math.floor(depth)).fog;
    d.globalAlpha = k;
    d.fillRect(0, 0, VIEW_W, VIEW_H);
    d.globalAlpha = 1;
    d.globalCompositeOperation = "destination-out";
    const hole = (x, y, r, a = 1) => {
      const gr = d.createRadialGradient(x - cx, y - cy, r * 0.25, x - cx, y - cy, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = gr;
      d.fillRect(x - cx - r, y - cy - r, r * 2, r * 2);
    };
    const p = this.p, z = zoneAt(Math.floor(p.y / MT));
    hole(p.x, p.y - PH / 2, (z.light + (this.up.radar || 0) + 2 * (this.rel.lamp || 0)) * MT * (0.95 + 0.05 * Math.sin(this.time * 6)));
    for (const m of this.mobs) if (m.d.flee) hole(m.x, m.y, MT * 1.8, 0.7);
    else if (m.d.boss) hole(m.x, m.y - 30, MT * 4.5, 0.8);
    if (this.guardRoom) for (const c of [this.guardRoom.x0 + 1, this.guardRoom.x1 - 1]) hole(c * MT + MT / 2, (this.guardRoom.fy - 4) * MT - 4, MT * 3, 0.85 + 0.1 * Math.sin(this.time * 13 + c));
    if (this.merchant) hole(this.merchant.x + 13, this.merchant.y - 49, MT * 3.4, 0.9);
    // glowing ores, lifts, explosions
    const r0 = Math.floor(cy / MT), r1 = r0 + Math.ceil(VIEW_H / MT) + 1, c0 = Math.max(0, Math.floor(cx / MT)), c1 = Math.min(MW - 1, c0 + Math.ceil(VIEW_W / MT) + 1);
    for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++)
      for (let c = c0; c <= c1; c++) {
        const i = r * MW + c;
        if (this.t[i] === T.ORE && ORES[this.ore[i]].light) hole(c * MT + 12, r * MT + 12, MT * 2.2, 0.8);
        if (this.t[i] === T.SEAL) hole(c * MT + 12, r * MT + 12, MT * 1.2, 0.5);
        if (this.t[i] === T.CHEST && this.chest[i] === "relic") hole(c * MT + 12, r * MT + 12, MT * 1.6, 0.55 + 0.2 * Math.sin(this.time * 4));
      }
    for (const l of this.lifts) hole(l.c * MT + 12, l.r * MT, MT * 3, 0.85);
    for (const b of this.bombs) hole(b.x, b.y, 40, 0.6);
    for (const b of this.bullets) hole(b.x, b.y, 18, 0.5);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.dark, 0, 0, VIEW_W * rs, VIEW_H * rs);
  }
  label(g, s, x, y, col = "#fff", size = 10, a = 1) {
    g.save();
    g.globalAlpha = a;
    g.font = `${size}px Cubic, "PingFang SC", sans-serif`;
    g.textAlign = "center";
    g.lineWidth = 3;
    g.strokeStyle = "#1a1020";
    g.strokeText(s, Math.round(x), Math.round(y));
    g.fillStyle = col;
    g.fillText(s, Math.round(x), Math.round(y));
    g.restore();
  }
}
