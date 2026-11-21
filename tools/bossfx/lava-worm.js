import { fit, hex, mix, clamp, lerp, ease, rng, TAU } from "../../core/index.js";
import { Grid, shift, shadow, lnoise } from "./_lib.js";

export const meta = {
  name: "Lava worm",
  desc: "A boss worm rearing out of a molten pool: basalt-plated segments with glowing seams, a head whose four mandibles flex open on a white-hot throat.",
  tags: ["critter", "boss", "worm", "lava", "fire", "monster", "loop"],
  size: [136, 140],
  origin: [68, 124],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#0a0606", "#1c1210", "#2e201c", "#45302a", "#634638", "#86644e"],
    lava: ["#3a0a02", "#8a1e04", "#d8480c", "#ff9a1e", "#ffe070", "#fffbe0"],
    seed: 1,
  },
};

const D = meta.duration, BODY = new Grid(-60, -128, 120, 132), POOL = new Grid(-44, -12, 88, 22);

// the spine: from the pool up to the head, swaying; returns points [x, y, radius]
function spine(t) {
  const ph = (t / D) * TAU, pts = [];
  for (let s = 0; s <= 1.0001; s += 0.02) {
    const sway = Math.sin(ph - s * 2.2) * 9 * s, rear = Math.sin(s * Math.PI * 0.85);
    const x = sway + Math.sin(s * 2.4) * 10 - 6 * s, y = -4 - s * 92 - rear * 6 + Math.sin(ph * 2 - s * 3) * 2 * s;
    pts.push([x, y, lerp(20, 13, s ** 0.8)]);
  }
  return pts;
}

function worm(g, C, L, t) {
  g.clear();
  const pts = spine(t), ph = (t / D) * TAU, N = pts.length - 1;
  // one continuous armoured body: every pixel finds its nearest point on the spine; plates every 1/8 of the length
  // with a glowing seam between, lit from the top-left, a dark rim
  const top = pts[N];
  g.shade(-60, top[1] - 10, 60, 4, (px, py) => {
    let best = 1e9, bi = 0;
    for (let i = 0; i < N - 4; i++) {
      const d = (px - pts[i][0]) ** 2 + ((py - pts[i][1]) * 1.25) ** 2;
      if (d < best) (best = d), (bi = i);
    }
    const [x, y, r] = pts[bi], d = Math.sqrt(best) / r;
    if (d > 1 || py > 2) return 0;
    const s = bi / N, seg = (s * 9) % 1, dx = (px - x) / r;
    if (seg < 0.1) return d < 0.8 ? L[(Math.sin(ph * 3 + s * 20) > 0 ? 4 : 3)] : L[2];
    if (d > 0.9) return C[1];
    const lit = -dx * 0.8 + (0.5 - seg) * 0.7 - Math.abs(seg - 0.55) * 0.9 + 0.25;
    return lit > 0.6 ? C[5] : lit > 0.2 ? C[4] : lit > -0.3 ? C[3] : C[2];
  });
  // ridge spikes along the back of each plate
  for (let k = 1; k < 9; k++) {
    const [x, y, r] = pts[Math.floor((k / 9 + 0.05) * N)];
    for (let q = 0; q < 4; q++) g.set(x - r - 0.5 - q * 0.8, y - q * 0.4, q < 2 ? C[4] : C[5]);
  }
  // the head: a round maw turned toward us, ringed with hooked teeth around a white-hot throat
  const [hx, hy] = pts[N], open = 0.5 + 0.5 * Math.sin(ph * 2 - 0.6), R = 19, RY = R * 0.8;
  g.shade(hx - R - 2, hy - RY - 2, hx + R + 2, hy + RY + 2, (px, py) => {
    const dx = (px - hx) / R, dy = (py - hy) / RY, d = Math.hypot(dx, dy);
    if (d > 1) return 0;
    const mouth = 0.55 + 0.12 * open;
    if (d < mouth) {
      const m = d / mouth;
      return m < 0.22 ? L[5] : m < 0.5 ? L[4] : m < 0.8 ? L[3] : L[1];
    }
    if (d < mouth + 0.07) return C[0];
    const lit = -dx * 0.7 - dy * 0.7;
    const plate = Math.floor(((Math.atan2(dy, dx) + Math.PI) / TAU) * 10) % 2;
    return lit > 0.5 ? C[5] : lit > 0.05 ? (plate ? C[4] : C[3]) : plate ? C[3] : C[2];
  });
  // teeth: twelve hooks on the inner lip pointing in, flexing with the bite
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU + 0.13, mouth = 0.55 + 0.12 * open;
    const x0 = hx + Math.cos(a) * R * mouth, y0 = hy + Math.sin(a) * RY * mouth, len = 4 + (k % 2) * 2 - open * 1.5;
    for (let u = 0; u <= 1; u += 0.2) {
      const x = lerp(x0, hx + Math.cos(a) * R * (mouth - len / R), u), y = lerp(y0, hy + Math.sin(a) * RY * (mouth - len / R), u);
      g.set(x, y, u < 0.5 ? C[5] : hex("#f0e6d0"));
    }
  }
  // two ember eyes on the brow
  for (const sx of [-9, 9]) g.set(hx + sx, hy - RY + 3, L[4]), g.set(hx + sx, hy - RY + 4, L[3]);
  g.outline(C[0]);
  return { hx, hy, open };
}

function pool(g, C, L, t) {
  g.clear();
  const ph = (t / D) * TAU;
  // a molten pool, crusted at the rim, bright where the worm breaks the surface
  g.shade(-44, -12, 44, 10, (x, y) => {
    const d = Math.hypot(x / 40, (y + 1) / 9);
    if (d > 1) return 0;
    if (d > 0.84) return d > 0.93 ? C[1] : C[2];
    const flow = Math.sin(x * 0.3 + ph * 2 + Math.sin(y * 0.8)) + Math.sin(x * 0.11 - ph);
    return d < 0.3 ? L[5] : flow > 1.2 ? L[5] : flow > 0.2 ? L[4] : d < 0.6 ? L[3] : L[2];
  });
  // crust islands drift on it
  for (let i = 0; i < 5; i++) {
    const x = ((i * 17 + (t / D) * 12) % 60) - 30, y = Math.sin(i * 2) * 3;
    if (Math.hypot(x, y * 3) < 12) continue;
    g.ellipse(x, y, 3, 1.4, C[2]);
  }
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 6), L = fit(o.lava, 6), ph = (t / D) * TAU;
  pool(POOL, C, L, t);
  POOL.draw(p);
  const { hx, hy, open } = worm(BODY, C, L, t);
  BODY.draw(p);
  // heat: the throat, the pool, the glowing seams
  p.glow(hx, hy, 8 + open * 3, L[4], 0.22 + 0.18 * open);
  p.glow(0, -2, 46, L[2], 0.3);
  p.glow(0, -2, 18, L[4], 0.3);
  // bubbles pop on the pool, embers rise off it and off the worm
  for (let i = 0; i < 4; i++) {
    const u = ((t / D) * 1.5 + i * 0.27) % 1, x = Math.sin(i * 3.3) * 26, y = Math.sin(i * 1.7) * 4 - 1;
    if (Math.hypot(x / 28, y / 6) > 1) continue;
    const r = u < 0.8 ? 1 + u * 2.4 : 0;
    if (r) p.ring ? p.circle(x, y - r * 0.5, r, L[4]) : null;
    if (u > 0.8) p.px(x, y - 3, L[5]);
  }
  for (let i = 0; i < 10; i++) {
    const u = ((t / D) + i * 0.1) % 1, x = Math.sin(i * 2.7) * 30 + Math.sin(u * 6 + i) * 4, y = -4 - u * 90;
    p.px(x, y, u < 0.5 ? L[5] : L[3]);
    p.glow(x, y, 3, L[3], 0.4 * (1 - u));
  }
}

export function drawBack(p, time, o) {
  const L = fit(o.lava, 6);
  p.glow(0, 0, 56, L[1], 0.25);
}
