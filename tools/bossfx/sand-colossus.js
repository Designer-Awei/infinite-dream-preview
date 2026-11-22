import { fit, hex, lerp, TAU } from "../../core/index.js";
import { Grid, shift, shadow } from "./_lib.js";

// 遗迹巨像 (遗迹沙海's region boss): a hulking sandstone guardian of stacked, cracked blocks — a broad chest with an amber
// rune core that pulses, a small block head with two burning eye slits, heavy shoulder stones, stout pillar legs, and two
// great stone fists floating beside it that rise and fall out of step. Sand trickles from its joints.
export const meta = {
  name: "Sand colossus",
  desc: "A sandstone golem boss of stacked cracked blocks: a pulsing amber rune core in its chest, burning eye slits, shoulder stones, pillar legs, two floating stone fists bobbing out of step, sand trickling from its joints.",
  tags: ["critter", "boss", "golem", "stone", "desert", "idle", "loop"],
  size: [136, 132],
  origin: [68, 120],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    stone: ["#1e1008", "#4a2c14", "#7a5026", "#a8743a", "#d6a45a", "#f2d08a"],
    rune: ["#5a1a04", "#e8701a", "#ffc23a", "#fff4b0"],
    sand: ["#c89a50", "#f0d088"],
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-60, -118, 120, 122);

// a lit stone block: a rectangle with a bright top-left rim, a dark lower-right rim and one crack
function block(g, x0, y0, w, h, C, crack = 0) {
  g.shade(x0, y0, x0 + w - 1, y0 + h - 1, (x, y) => {
    const u = (x - x0) / w, v = (y - y0) / h;
    if ((u < 0.06 && v < 0.06) || (u > 0.94 && v > 0.94)) return 0; // chipped corners
    if (v < 0.14) return C[5];
    if (u < 0.08) return C[4];
    if (v > 0.86 || u > 0.92) return C[2];
    if (crack && Math.abs(u - 0.35 - v * 0.3 * crack) < 0.035 && v > 0.2 && v < 0.75) return C[1];
    return (Math.floor(x * 0.7 + y * 1.3) % 7 === 0) ? C[4] : C[3];
  });
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.stone, 6), R = fit(o.rune, 4), S = fit(o.sand, 2), ph = (t / D) * TAU, g = G;
  const breath = Math.round(Math.sin(ph) * 1.2), pulse = 0.5 + 0.5 * Math.sin(ph * 2);
  shadow(p, 0, 0, 40, 9, hex("#000000"), 0.32);
  g.clear();
  // legs: two squat pillars
  for (const sd of [-1, 1]) {
    block(g, sd * 14 - 9, -30, 18, 30, C, sd > 0 ? 1 : 0);
    block(g, sd * 14 - 11, -8, 22, 8, C); // the foot slab
  }
  // the hips: one wide block
  block(g, -26, -44 + breath, 52, 16, C, 1);
  // the torso: a wide chest of three courses of blocks, the rune core set in the middle
  const TY = -84 + breath;
  block(g, -34, TY + 22, 68, 18, C);
  block(g, -38, TY, 36, 24, C, 1);
  block(g, 2, TY, 36, 24, C, -1);
  // the rune core: a carved diamond socket with a glowing gem that pulses
  const cy = TY + 20;
  g.shade(-11, cy - 11, 11, cy + 11, (x, y) => {
    const d = Math.abs(x) + Math.abs(y - cy);
    if (d > 11) return 0;
    if (d > 9) return C[1];
    if (d > 6.5 - pulse) return R[1];
    return d < 2.5 ? R[3] : R[2];
  });
  // carved rune lines running out from the core across the chest, glowing with it
  for (const [x0, y0, x1, y1] of [[-12, cy, -30, cy - 6], [12, cy, 30, cy - 6], [0, cy + 11, 0, cy + 22], [-20, cy + 12, -28, cy + 24], [20, cy + 12, 28, cy + 24]])
    g.line(x0, y0, x1, y1, pulse > 0.55 ? R[2] : R[1]);
  // shoulders: big rounded stones, the near one a little lower
  for (const sd of [-1, 1]) {
    const sx = sd * 40, sy = TY + 4 + (sd > 0 ? 1 : 0);
    g.ellipse(sx, sy, 14, 11, (nx, ny) => {
      const lit = -nx * 0.5 - ny * 0.85;
      return lit > 0.55 ? C[5] : lit > 0.1 ? C[4] : lit > -0.4 ? C[3] : C[2];
    });
    g.line(sx - 6, sy - 2, sx + 2, sy + 5, C[1]);
  }
  // the head: a small block sunk between the shoulders, two eye slits burning
  const HY = TY - 22 + Math.round(Math.sin(ph + 0.6) * 0.8);
  block(g, -13, HY, 26, 22, C);
  g.shade(-13, HY - 4, 12, HY + 1, (x, y) => (Math.abs(x) < 13 - (HY + 1 - y) * 1.6 ? (y < HY - 2 ? C[5] : C[4]) : 0)); // a brow ridge
  for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) g.set(sd * 6 - 3 + k, HY + 9, pulse > 0.35 ? R[3] : R[2]), g.set(sd * 6 - 3 + k, HY + 10, R[1]);
  g.line(-4, HY + 16, 4, HY + 16, C[1]); // the mouth seam
  // the fists: hovering beside the body, each a lumpy block with knuckle ridges, rising and falling out of step
  for (const sd of [-1, 1]) {
    const lift = Math.sin(ph + (sd > 0 ? Math.PI : 0)), fx = sd * 54, fy = -40 + breath - lift * 6;
    // the arm stones trailing from the shoulder to the fist (floating, gaps between)
    for (let k = 1; k <= 2; k++) {
      const ax = lerp(sd * 40, fx, k / 3), ay = lerp(TY + 12, fy - 14, k / 3) + Math.sin(ph * 2 + k) * 1.2;
      g.ellipse(ax, ay, 6 - k * 0.6, 5 - k * 0.5, (nx, ny) => (-nx * 0.5 - ny * 0.8 > 0.3 ? C[4] : C[2]));
    }
    block(g, fx - 13, fy - 15, 26, 24, C, sd);
    for (let k = 0; k < 4; k++) g.line(fx - 10 + k * 6.5, fy - 15, fx - 10 + k * 6.5, fy - 10, C[2]); // knuckles
    g.line(fx - 12, fy - 10, fx + 12, fy - 10, C[1]);
  }
  g.outline(C[0]);
  g.draw(p);
  // the core's glow and the eyes' glow
  p.glow(0, cy, 14, hex(o.rune[2]), 0.18 + 0.2 * pulse);
  p.glow(0, HY + 9, 9, hex(o.rune[1]), 0.12 + 0.12 * pulse);
  // sand trickling from the shoulder and hip joints, falling and fading
  for (let i = 0; i < 10; i++) {
    const src = [[-28, TY + 14], [28, TY + 14], [-18, -30], [18, -30], [-46, -26], [46, -26]][i % 6];
    const u = ((t / D) * 2 + i * 0.37) % 1, x = src[0] + Math.sin(i * 3.1) * 2, y = src[1] + u * u * 26 + breath;
    p.dot(Math.round(x), Math.round(y), i % 2 ? hex(o.sand[1]) : hex(o.sand[0]), 1 - u);
  }
}
