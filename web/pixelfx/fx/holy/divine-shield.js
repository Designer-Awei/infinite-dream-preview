import { fit, sparkle, cycle, clamp, smooth, TAU, WHITE } from "../../core/index.js";
import { GOLD, oval, shapeOf } from "./_lib.js";

export const meta = {
  name: "Divine shield",
  desc: "A bubble of gold light round the character: a bright rim and a thin gold film, meridians turning like a slow globe, a sheen sweeping across and sparkles winking on it.",
  tags: ["holy", "shield", "bubble", "barrier", "buff", "character", "loop"],
  size: [88, 84],
  origin: [44, 68],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: GOLD, radius: 29, seed: 8 },
};

const BRACE = { turn: 0.7, crouch: 3, lean: 1, fx: 5, fy: -33, bx: 10, by: -20, ffx: 4, fbx: -2 };
export const act = {
  onBody: true,
  poses: [
    [0, BRACE],
    [0.6, { ...BRACE, crouch: 4 }],
    [1.2, { ...BRACE, fy: -35, crouch: 3 }],
    [1.8, { ...BRACE, crouch: 4 }],
    [2.4, BRACE],
  ],
};

// CY: the bubble's centre above the feet; o.cy lets the game raise it for taller characters (set per draw)
let CY = -22;
const TILT = 0.34, N = 4, FLOOR_SY = 0.26, COS_T = Math.cos(TILT), SIN_T = Math.sin(TILT);

// a point of the sphere (lat, lon) seen from a little above: screen x, y and depth z (> 0 faces us)
function onSphere(r, lat, lon) {
  const X = r * Math.cos(lat) * Math.sin(lon), Y = r * Math.sin(lat), Z = r * Math.cos(lat) * Math.cos(lon);
  return [X, CY - (Y * Math.cos(TILT) - Z * Math.sin(TILT)), Y * Math.sin(TILT) + Z * Math.cos(TILT)];
}

// the sheen: a diagonal band crossing the bubble once a loop, then a rest
const sheen = (t, T) => -1.7 + 3.4 * clamp(((t / T) % 1) / 0.55);

// lattice scratch: per screen-ish cell the nearest depth seen and whether the sheen is on it (reused every frame:
// perf, this ran a Map of fresh arrays per point per frame)
let LS = 0, LF = new Float32Array(0), LH = new Uint8Array(0), LX = new Float32Array(0), LY = new Float32Array(0), LK = new Int32Array(0), LM = new Int32Array(0), LGEN = 1;
function lattice(p, t, o, back) {
  const C = fit(o.palette, 8), r = o.radius, T = meta.duration, phi = (t / T) * (Math.PI / N), sw = sheen(t, T);
  const S = Math.ceil(r) * 2 + 6, n = S * S, x0 = -Math.ceil(r) - 3, y0 = Math.floor(CY) - Math.ceil(r) - 3;
  if (n > LS) (LS = n), (LF = new Float32Array(n)), (LH = new Uint8Array(n)), (LX = new Float32Array(n)), (LY = new Float32Array(n)), (LM = new Int32Array(n)), (LK = new Int32Array(n));
  const gen = ++LGEN;
  let cnt = 0;
  // gather the lines' pixels first, so each is drawn once
  const dot = (lat, lon) => {
    const cl = Math.cos(lat), X = r * cl * Math.sin(lon), Y = r * Math.sin(lat), Z = r * cl * Math.cos(lon);
    const x = X, y = CY - (Y * COS_T - Z * SIN_T), z = Y * SIN_T + Z * COS_T;
    if (z < 0 !== back) return;
    const cx = Math.floor(x) - x0, cy = Math.floor(y) - y0;
    if (cx < 0 || cy < 0 || cx >= S || cy >= S) return;
    const key = cy * S + cx, f = Math.abs(z) / r, q = (x - (y - CY)) / (r * 1.414), hot = Math.abs(q - sw) < 0.12 ? 1 : 0;
    if (LM[key] !== gen) {
      LM[key] = gen; LK[cnt++] = key; LF[key] = f; LH[key] = hot; LX[key] = x; LY[key] = y;
    } else {
      if (f < LF[key]) (LF[key] = f), (LX[key] = x), (LY[key] = y);
      if (hot) LH[key] = 1;
    }
  };
  // meridians, turning
  for (let k = 0; k < 2 * N; k++) {
    const lon = phi + (k * Math.PI) / N;
    for (let lat = -Math.PI / 2; lat <= Math.PI / 2; lat += 0.7 / r) dot(lat, lon);
  }
  // the equator
  for (let lon = 0; lon < TAU; lon += 0.7 / r) dot(0, lon);
  // behind: faint and broken. In front: bright where the surface turns away, a translucent wash of gold
  // where it faces us, so the character still shows through
  for (let i = 0; i < cnt; i++) {
    const key = LK[i], x = LX[key], y = LY[key], f = LF[key];
    if (back) p.blend(x, y, C[4], 0.32);
    else if (LH[key]) p.px(x, y, WHITE);
    else if (f < 0.4) p.px(x, y, C[6]);
    else p.blend(x, y, f < 0.7 ? C[6] : C[5], f < 0.7 ? 0.8 : 0.55);
  }
}

function film(p, t, o, back) {
  const C = fit(o.palette, 8), r = o.radius, sw = sheen(t, meta.duration);
  const ir2 = 1 / (r * r), iq = 1 / (r * 1.414), a0 = back ? 0.07 : 0.03, hk = back ? 0.06 : 0.2;
  p.each(-r - 1, CY - r - 1, r + 1, CY + r + 1, (x, y, sx, sy) => {
    const yy = y - CY, d2 = (x * x + yy * yy) * ir2;
    if (d2 >= 1) return;
    const q = (x - yy) * iq, hot = Math.max(0, 1 - Math.abs(q - sw) / 0.22);
    const a = a0 + 0.26 * d2 * d2 * d2 + hk * hot;
    p.blendPx(sx, sy, hot > 0.5 && !back ? C[6] : C[5], a);
  });
}

export function drawBack(p, t, o) {
  CY = o.cy ?? -22;
  const C = fit(o.palette, 8), r = o.radius, rf = Math.sqrt(r * r - CY * CY);
  film(p, t, o, true);
  lattice(p, t, o, true);
  // where it meets the floor: the far half of a bright seal
  oval(p, 0, 0, rf, rf * FLOOR_SY, C[5], 0.8, (g) => Math.sin(g) < 0);
  p.glow(0, CY, r * 1.1, C[4], 0.14);
}

export function draw(p, t, o) {
  CY = o.cy ?? -22;
  const C = fit(o.palette, 8), r = o.radius, T = meta.duration, rf = Math.sqrt(r * r - CY * CY), A = o.actor;
  // the bubble lights the character from all round
  if (A) for (const [x, y] of shapeOf(A).out) p.light(x, y, C[5], 0.3);
  film(p, t, o, false);
  lattice(p, t, o, false);
  // the rim: bright where the light sits (top left) and where the sheen crosses it
  const sw = sheen(t, T);
  for (let j = 0, n = Math.ceil(r * TAU * 1.4); j < n; j++) {
    const g = (j / n) * TAU, x = Math.cos(g) * r, y = CY + Math.sin(g) * r, q = (x - (y - CY)) / (r * 1.414);
    const lit = Math.cos(g + 2.36), hot = Math.abs(q - sw) < 0.15;
    p.dot(x, y, hot || lit > 0.75 ? WHITE : lit > -0.2 ? C[6] : C[5], 1);
    p.dot(Math.cos(g) * (r - 1), CY + Math.sin(g) * (r - 1), C[4], 0.35 + 0.3 * lit);
  }
  p.glowRing(0, CY, r, 6, C[4], 0.32);
  // where the meridians cross the equator, and at the pole they all turn round, the lattice catches the light
  const phi = (t / T) * (Math.PI / N);
  for (let k = 0; k < 2 * N; k++) {
    const [x, y, z] = onSphere(r, 0, phi + (k * Math.PI) / N);
    if (z < r * 0.15) continue;
    p.px(x, y, WHITE);
    if (z > r * 0.45) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.blend(x + dx, y + dy, C[6], 0.7);
    p.glow(x, y, 4, C[5], 0.3);
  }
  const [px0, py0] = onSphere(r, Math.PI / 2, 0);
  sparkle(p, px0, py0, 2 + Math.round(1.5 + 1.5 * Math.sin((t / T) * TAU * 2)), WHITE, C[6], 0.45);
  // two glints chase each other round the rim
  for (const off of [0, Math.PI]) {
    const g = (t / T) * TAU + off + 0.8;
    sparkle(p, Math.cos(g) * r, CY + Math.sin(g) * r, 2, WHITE, C[6], 0.4);
  }
  // a bubble's shine: a bright curl up on the left, a dot under it, a faint one low on the right
  for (let g = 3.55; g < 4.2; g += 0.04) p.px(Math.cos(g) * r * 0.74, CY + Math.sin(g) * r * 0.74, g > 3.7 && g < 4.05 ? WHITE : C[6]);
  p.px(Math.cos(3.4) * r * 0.62, CY + Math.sin(3.4) * r * 0.62, WHITE);
  for (let g = 0.45; g < 0.8; g += 0.05) p.dot(Math.cos(g) * r * 0.8, CY + Math.sin(g) * r * 0.8, C[5], 0.6);
  // the near half of the floor seal and a pool of light
  oval(p, 0, 0, rf, rf * FLOOR_SY, (g) => (Math.sin(g) > 0.6 ? WHITE : C[6]), 1, (g) => Math.sin(g) >= 0);
  for (let i = -2; i <= 2; i++) p.glow(i * rf * 0.5, 0, 12, C[4], 0.18);
  // sparkles winking on its skin as it turns, motes rising inside
  cycle(t, T, 9, o.seed, (g) => g.range(0.35, 0.6), (age, life, R) => {
    const [x, y, z] = onSphere(r, R.range(-1.2, 1.3), R.range(0, TAU) + phi), k = Math.sin((age / life) * Math.PI);
    if (z < 0) return;
    sparkle(p, x, y, 1 + 2.5 * k * R.range(0.6, 1), WHITE, C[6], 0.45 * k);
  });
  cycle(t, T, 12, o.seed + 1, (g) => g.range(1.2, 2.2), (age, life, R) => {
    const x0 = R.range(-0.7, 0.7) * r, u = age / life, x = x0 + Math.sin(u * 6 + R.range(0, 6)) * 2, y = CY + r * 0.75 - u * r * 1.4;
    if (Math.hypot(x, y - CY) > r - 2) return;
    p.dot(x, y, u < 0.5 ? C[6] : C[5], Math.sin(u * Math.PI));
    p.light(x, y, C[5], 0.4 * Math.sin(u * Math.PI));
  });
}
