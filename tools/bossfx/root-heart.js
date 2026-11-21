import { fit, hex, mix, clamp, lerp, ease, rng, TAU } from "../../core/index.js";
import { Grid, shift, shadow, lnoise } from "./_lib.js";

export const meta = {
  name: "Root heart",
  desc: "A rooted boss tree-heart: roots claw the floor, a bark bulb glows through a beating seam, thorny vines writhe and an antler crown sways.",
  tags: ["critter", "boss", "plant", "root", "heart", "nature", "loop"],
  size: [144, 128],
  origin: [72, 112],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#120a08", "#26160e", "#422818", "#623e24", "#8a5e3a", "#b88a5c"],
    leaf: ["#08140a", "#12301a", "#1c4c24", "#2e7232", "#4f9e40", "#9ad86a"],
    core: ["#2a0a04", "#7a2a08", "#d8641a", "#ffb43a", "#fff0a0"],
    seed: 1,
  },
};

const D = meta.duration;
const ROOT = new Grid(-70, -24, 140, 34), BODY = new Grid(-30, -78, 60, 80), LEAF = new Grid(-64, -110, 128, 80), VINE = new Grid(-70, -100, 140, 100);
const beat = (t) => {
  // a double heartbeat each loop: lub-dub, then rest
  const u = (t / D) % 1;
  return Math.max(Math.exp(-((u - 0.1) ** 2) / 0.0012), 0.7 * Math.exp(-((u - 0.24) ** 2) / 0.0012));
};

function roots(g, C, t) {
  g.clear();
  const r = rng(7, 3);
  // eight roots fan out on the floor plane: thick at the bulb, tapering, their tips curling and flexing slowly
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2 + r.range(-0.15, 0.15), len = r.range(46, 64) * (Math.sin(a) > 0.8 ? 0.45 : 1), pts = [];
    for (let s = 0; s <= 1.0001; s += 0.08) {
      const flex = lnoise(t, D, 1, i * 1.7) * 3 * s * s, curl = Math.sin(s * 3 + i) * 4 * s;
      const x = Math.cos(a) * len * s + Math.cos(a + 1.57) * (curl + flex), y = (Math.sin(a) * len * s + Math.sin(a + 1.57) * (curl + flex)) * 0.32;
      pts.push([x, y - 2 + 2 * s - Math.sin(Math.min(1, s * 1.6) * Math.PI) * (i % 2 ? 5 : 2.5), lerp(6, 0.8, s ** 0.75)]);
    }
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0, r0] = pts[k - 1], [x1, y1] = pts[k];
      for (let u = 0; u <= 1; u += 0.2) {
        const x = lerp(x0, x1, u), y = lerp(y0, y1, u), rr = r0;
        g.shade(x - rr - 1, y - rr - 1, x + rr + 1, y + rr + 1, (px, py) => {
          const dx = px - x, dy = (py - y) * 1.4, d = Math.hypot(dx, dy);
          if (d > rr) return 0;
          return dy < -rr * 0.35 ? C[4] : dy < rr * 0.3 ? C[3] : C[2];
        });
      }
      // thorns along the upper edge of the thick part
      if (k % 3 === 1 && pts[k][2] > 2) g.set(x1 + 1, y1 - pts[k][2] - 1, C[5]), g.set(x1 + 1, y1 - pts[k][2] - 2, C[4]);
    }
  }
  g.outline(C[0]);
}

function body(g, C, K, L, t) {
  g.clear();
  const b = beat(t), sw = 1 + 0.035 * b, breathe = Math.sin((t / D) * TAU) * 0.8;
  const RX = 20 * sw, RY = 25 * sw + breathe, CY = -29;
  // the bulb: a gnarled, fat trunk-pod that sits right on its roots, lit from the top-left; vertical bark grooves
  // that wander, a few dark knots, a root flare at the bottom
  const knots = [[-9, -40, 2.2], [10, -22, 1.8], [-12, -16, 1.5], [7, -46, 1.4]];
  g.shade(-RX - 4, CY - RY - 2, RX + 4, 0, (x, y) => {
    const v = (y - CY) / RY, flare = y > -10 ? (y + 10) * 0.45 : 0;
    const w = RX * (1 - 0.18 * v) * Math.sqrt(Math.max(0, 1 - Math.min(1, v) ** 2)) + flare;
    if (Math.abs(x) > w || v < -1 || y > -1) return 0;
    for (const [kx, ky, kr] of knots) {
      const d = Math.hypot(x - kx, (y - ky) * 0.8);
      if (d < kr) return d < kr * 0.5 ? C[0] : C[1];
      if (d < kr + 0.8) return C[4];
    }
    const gx = x + 2.2 * Math.sin(y * 0.23 + x * 0.05), groove = ((gx % 5) + 5) % 5 < 0.9;
    const lit = (-x / RX) * 0.9 - v * 0.5 - (Math.abs(x) > w - 1.5 ? 0.6 : 0);
    if (groove) return lit > 0.3 ? C[2] : C[1];
    return lit > 0.45 ? C[5] : lit > 0.05 ? C[4] : lit > -0.45 ? C[3] : C[2];
  });
  // moss creeps over the shoulders of the bulb
  g.shade(-RX, CY - RY - 1, RX, CY - RY * 0.35, (x, y) => {
    const v = (y - CY) / RY, w = RX * (1 - 0.18 * v) * Math.sqrt(Math.max(0, 1 - v * v));
    if (Math.abs(x) > w - 0.5) return 0;
    const edge = CY - RY * 0.55 + 3 * Math.sin(x * 0.7) + 2 * Math.sin(x * 1.9);
    if (y > edge) return 0;
    return y > edge - 1.2 ? L[2] : x < -2 ? L[4] : L[3];
  });
  // the seam: a split down the front where the heart glows through, opening a little on every beat
  const open = 1.4 + 2.4 * b;
  g.shade(-7, CY - 17, 7, CY + 15, (x, y) => {
    const v = (y - CY + 1) / 16, w = open * Math.sqrt(Math.max(0, 1 - v * v)) * (1 + 0.25 * Math.sin(v * 7));
    if (Math.abs(v) > 1 || Math.abs(x) > w + 1) return 0;
    if (Math.abs(x) > w) return C[0];
    const d = Math.abs(x) / Math.max(0.5, w);
    return d < 0.35 ? K[4] : d < 0.7 ? K[3] : K[2];
  });
  // glowing cracks branch out of the seam across the bark, brighter on the beat
  const r = rng(11, 5);
  for (let i = 0; i < 6; i++) {
    let x = (i % 2 ? 1 : -1) * 2, y = CY - 10 + i * 4, a = (i % 2 ? 0 : Math.PI) + r.range(-0.5, 0.5);
    for (let k = 0; k < 6; k++) {
      const nx = x + Math.cos(a) * 2.2, ny = y + Math.sin(a) * 1.6;
      g.line(x, y, nx, ny, k < 3 ? (b > 0.4 ? K[4] : K[3]) : K[2]);
      x = nx; y = ny; a += r.range(-0.6, 0.6);
    }
  }
  g.outline(C[0]);
  return { CY, RY, b };
}

// thorny vines writhe out of the bulb's sides: thick tubes tapering to a hooked tip, each on its own slow sway
function vines(g, C, L, t, CY, back) {
  g.clear();
  const list = back ? [[-1, -44, 0.3], [1, -48, 1.9]] : [[-1, -20, 1.1], [1, -24, 2.6]];
  for (const [sd, y0, ph] of list) {
    let prev = null;
    for (let s = 0; s <= 1.0001; s += 0.04) {
      const sway = Math.sin((t / D) * TAU + ph + s * 2.4) * 7 * s, lift = Math.sin((t / D) * TAU * 2 + ph) * 3 * s;
      const x = sd * (16 + s * 34) + sway * 0.4, y = y0 - Math.sin(s * Math.PI * 0.9) * 18 + sway + lift + s * s * 16;
      const rr = lerp(3.2, 0.7, s);
      if (prev) for (let u = 0; u <= 1; u += 0.34) {
        const cx = lerp(prev[0], x, u), cy = lerp(prev[1], y, u);
        g.shade(cx - rr - 1, cy - rr - 1, cx + rr + 1, cy + rr + 1, (px, py) => {
          const d = Math.hypot(px - cx, py - cy);
          if (d > rr) return 0;
          return py - cy < -rr * 0.3 ? L[back ? 3 : 4] : L[back ? 2 : 3];
        });
      }
      // thorns poke out on alternating sides
      if (prev && Math.round(s * 25) % 4 === 0 && s < 0.85) {
        const nx = -(y - prev[1]), ny = x - prev[0], l = Math.hypot(nx, ny) || 1, side = Math.round(s * 25) % 8 === 0 ? 1 : -1;
        g.line(x + (nx / l) * rr * side, y + (ny / l) * rr * side, x + (nx / l) * (rr + 2.5) * side, y + (ny / l) * (rr + 2.5) * side, C[5]);
      }
      prev = [x, y];
    }
  }
  g.outline(L[0]);
}

// the crown: three twisted bark branches curling up and out like antlers, a tuft of leaves at each tip and
// a couple along the way, the tufts shivering in the breeze
function leaves(g, C, L, t, top) {
  g.clear();
  const br = [[-1, 0.0, 30, 0.9], [1, 1.3, 32, 0.95], [0, 2.4, 24, 0.35]];
  const tufts = [];
  for (const [sd, ph, len, spread] of br) {
    let prev = null;
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const sway = Math.sin((t / D) * TAU + ph) * 2 * s * s;
      const x = sd * spread * (s * len * 0.75 + Math.sin(s * 4) * 3) + (sd === 0 ? Math.sin(s * 5) * 3 : 0) + sway;
      const y = top + 3 - s * len + s * s * sd * sd * 8;
      const rr = lerp(4.6, 1.3, s);
      if (prev) for (let u = 0; u <= 1; u += 0.34) {
        const cx = lerp(prev[0], x, u), cy = lerp(prev[1], y, u);
        g.shade(cx - rr - 1, cy - rr - 1, cx + rr + 1, cy + rr + 1, (px, py) => {
          const d = Math.hypot(px - cx, py - cy);
          if (d > rr) return 0;
          return px - cx < -rr * 0.3 ? C[4] : px - cx < rr * 0.4 ? C[3] : C[2];
        });
      }
      if (Math.abs(s - 0.55) < 0.026 && sd !== 0) tufts.push([x, y, 0.7, ph]);
      prev = [x, y];
    }
    tufts.push([prev[0], prev[1], 1, ph]);
  }
  // leaf tufts: little clusters of pointed leaves, lit on top
  for (const [x, y, k, ph] of tufts) {
    for (let n = 0; n < 5; n++) {
      const a = -Math.PI / 2 + (n - 2) * 0.62 + Math.sin((t / D) * TAU * 2 + ph + n) * 0.08, len = (6 + (n % 2) * 2) * k + 2;
      for (let u = 0; u <= len; u += 0.5) {
        const w = 2.2 * k * Math.sin((Math.PI * u) / len), cx = x + Math.cos(a) * u, cy = y + Math.sin(a) * u;
        for (let v = -w; v <= w; v += 0.5) {
          const px = cx - Math.sin(a) * v, py = cy + Math.cos(a) * v;
          g.set(px, py, Math.abs(v) < 0.5 ? L[4] : v < 0 ? L[3] : L[2]);
        }
      }
    }
  }
  g.outline(C[0]);
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 6), L = fit(o.leaf, 6), K = fit(o.core, 5);
  const { CY, RY, b } = body(BODY, C, K, L, t);
  vines(VINE, C, L, t, CY, true);
  VINE.draw(p);
  leaves(LEAF, C, L, t, CY - RY);
  LEAF.draw(p);
  roots(ROOT, C, t);
  ROOT.draw(p);
  BODY.draw(p);
  vines(VINE, C, L, t, CY, false);
  VINE.draw(p);
  // the heart's light: a hot slit, a warm pool on the bark and the floor, swelling on each beat
  p.glow(0, CY, 10, K[4], 0.35 + 0.45 * b);
  p.glow(0, CY, 34, K[2], 0.18 + 0.22 * b);
  p.glow(0, -4, 40, K[2], 0.08 + 0.1 * b);
  // spores drift up from the leaves and wink out
  for (let i = 0; i < 9; i++) {
    const ph = ((t / D) + i * 0.137) % 1, x = Math.sin(i * 2.3) * 30 + Math.sin(ph * TAU + i) * 4, y = CY - RY - 4 - ph * 44;
    if (ph > 0.85) continue;
    p.px(x, y, ph < 0.5 ? K[4] : L[5]);
    p.glow(x, y, 4, L[4], 0.4 * (1 - ph));
  }
}

export function drawBack(p, time, o) {
  const t = shift(time, D, o.seed), K = fit(o.core, 5);
  shadow(p, 0, 0, 40, 7, hex("#0d0a08"), 0.45);
  p.glow(0, 0, 44, K[2], 0.08 + 0.1 * beat(t));
}
