import { fit, hex, lerp, TAU } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

// 流沙蝎 (遗迹沙海): a sand-gold scorpion in three-quarter side view — a segmented, lit carapace, two raised pincers
// that snap open and shut, eight legs in a scuttling gait, and the tail curled high over its back, its stinger glowing
// and twitching before a strike. The same module, in another palette, is the region's boss.
export const meta = {
  name: "Sand scorpion",
  desc: "A sand-gold scorpion scuttling in place: segmented lit carapace, two pincers snapping, a tail curled high over its back with a glowing stinger that twitches.",
  tags: ["critter", "scorpion", "bug", "desert", "monster", "walk", "loop"],
  size: [80, 60],
  origin: [40, 52],
  duration: 1.0,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#1a0e06", "#3e2410", "#6e4418", "#a46a24", "#d89a3a", "#f4cc72"],
    sting: ["#5a1004", "#ff6a2a", "#fff0a0"],
    eye: ["#2a0404", "#ff3a2a"],
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-34, -46, 68, 50);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 6), S = fit(o.sting, 3), E = fit(o.eye, 2), ph = (t / D) * TAU;
  const bob = Math.round(Math.sin(ph * 2) * 0.5), g = G;
  g.clear();
  // legs: four on each side from under the carapace; the far ones darker, a tetrapod gait (feet lift on the swing)
  for (const far of [1, 0]) for (let i = 0; i < 4; i++) {
    const a = ph * 2 + i * Math.PI * 0.5 + far * Math.PI, s = Math.sin(a), lift = Math.max(0, -Math.cos(a)) * 2;
    const rx = -10 + i * 5 + (far ? 1 : 0), ry = -6 + bob - (far ? 1 : 0);
    const kx = rx - 3 + s * 1.2 + (far ? 1 : -1), ky = ry - 4;
    const fx = rx - 4 + s * 3 + (far ? 2 : -1), fy = (far ? -1 : 1) - lift;
    g.line(rx, ry, kx, ky, far ? C[1] : C[3]);
    g.line(kx, ky, fx, fy, far ? C[1] : C[2]);
    g.set(fx, fy, far ? C[0] : C[1]);
  }
  // tail: six beads rising from the rear and curling forward over the back; it cocks back, then flicks before the strike
  const cock = 0.5 + 0.5 * Math.sin(ph), flick = Math.max(0, Math.sin(ph * 2 - 1)) ** 4;
  const base = [[-17, -10], [-23, -17], [-23, -26], [-17, -32], [-9, -34], [-2, -31], [2, -25]];
  const pts = base.map(([x, y], k) => {
    const u = k / (base.length - 1), w = u * u;
    return [x - cock * 2 * w + flick * 3 * w, y + bob + cock * 1.5 * w - flick * 1 * w];
  });
  const N = pts.length - 1, lit = (nx, ny) => {
    const l = -nx * 0.55 - ny * 0.8;
    return l > 0.55 ? C[5] : l > 0.05 ? C[4] : l > -0.45 ? C[3] : C[2];
  };
  for (let s2 = 0; s2 <= N * 6; s2++) {
    const u = s2 / 6, k = Math.min(N - 1, Math.floor(u)), f = u - k, [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f, r = 4.2 - u * 0.5 - (f < 0.17 && k > 0 ? 0.6 : 0);
    g.ellipse(x, y, r, r * 0.92, (nx, ny) => (f < 0.17 && k > 0 && nx * nx + ny * ny > 0.5 ? C[1] : lit(nx, ny)));
  }
  // the stinger: a hot bulb with a hooked barb pointing down and forward
  const [sx, sy] = pts[pts.length - 1];
  g.ellipse(sx, sy, 2.6, 2.2, (nx, ny) => (nx + ny < -0.5 ? S[2] : nx + ny < 0.4 ? S[1] : S[0]));
  g.line(sx + 1.5, sy + 1.5, sx + 3.5, sy + 4.5, S[0]);
  g.set(sx + 3.5, sy + 5, S[1]);
  // carapace: a long low oval of plates, lit from the upper left, dark seams between the plates
  g.shade(-21, -17 + bob, 12, -1 + bob, (x, y) => {
    const nx = (x + 4.5) / 16, ny = (y - (-9 + bob)) / 7, d = nx * nx + ny * ny;
    if (d > 1) return 0;
    const seam = Math.round(x + 40) % 5 === 0 && ny > -0.75;
    const lit = -nx * 0.35 - ny * 0.9;
    if (seam) return C[1];
    return lit > 0.6 ? C[5] : lit > 0.2 ? C[4] : lit > -0.3 ? C[3] : C[2];
  });
  // head and pincers: two arms reaching forward, each claw snapping open and shut out of phase
  const hx = 12, hy = -9 + bob;
  g.ellipse(hx, hy, 4.5, 3.6, (nx, ny) => (nx * -0.4 + ny * -0.8 > 0.35 ? C[5] : ny > 0.5 ? C[2] : C[4]));
  g.set(hx + 2, hy - 2, E[1]); g.set(hx + 3.5, hy - 1.5, E[1]); g.set(hx + 2, hy - 3, E[0]);
  for (const [k, side] of [[0, -1], [1, 1]]) {
    const open = 0.5 + 0.5 * Math.sin(ph * 2 + k * Math.PI), ay = hy + side * 2.2 - 1;
    const ex = hx + 8, ey = ay - 3 + side * 1.5;
    g.tube([[hx + 2, ay], [hx + 5, ay - 2 + side], [ex, ey]], 1.3, (u, v) => (v > 0.6 ? C[k ? 2 : 1] : C[k ? 4 : 3]));
    // the claw: a fat lit palm and two thick fingers that part
    g.ellipse(ex + 2.5, ey, 3.8, 2.8, (nx, ny) => (nx * -0.4 + ny * -0.8 > 0.35 ? C[5] : ny > 0.45 ? C[2] : C[k ? 4 : 3]));
    g.tube([[ex + 5, ey - 1], [ex + 8, ey - 2 - open * 2], [ex + 9.5, ey - 1 - open * 2.5]], 1, k ? C[4] : C[3]);
    g.tube([[ex + 5, ey + 1.2], [ex + 8, ey + 1.5 + open * 1.5], [ex + 9, ey + 0.5 + open * 2]], 0.8, C[2]);
  }
  g.outline(C[0]);
  g.draw(p);
  p.glow(sx + 2, sy + 1, 5, hex(o.sting[1]), 0.18 + 0.25 * flick);
}
