import { fit, hex, lerp, TAU } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

// 冰壳守护进程 (显存冰原): an ice tortoise whose domed shell is a cluster of pale hexagonal ice plates with crystal
// spikes on top and a thick armoured brow over the head (it faces right: the brow is its blocking front).
export const meta = {
  name: "Ice shell tortoise",
  desc: "A stout tortoise with a domed shell of pale blue hexagonal ice plates and crystal spikes, a heavy armoured brow, glowing cyan eyes, stubby legs, breathing slowly.",
  tags: ["critter", "tortoise", "ice", "armor", "monster", "loop"],
  size: [76, 56],
  origin: [38, 50],
  duration: 1.6,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#081020", "#16284a", "#24447a", "#3e6eaa", "#78aedc", "#c4e6fa", "#f2fcff"],
    skin: ["#1a1a2e", "#34345a", "#585a8a", "#8a8eba"],
    glow: ["#2a8ad0", "#7ae0ff", "#e8ffff"],
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-30, -42, 60, 44);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), S = fit(o.skin, 4), L = fit(o.glow, 3), ph = (t / D) * TAU, g = G;
  const br = Math.sin(ph) * 0.8, hy = Math.round(Math.sin(ph + 0.6) * 1);
  g.clear();
  // stubby legs, the front pair a little forward
  for (const [lx, far] of [[-15, 1], [9, 1], [-12, 0], [12, 0]]) {
    const step = Math.round(Math.sin(ph + lx) * 0.6);
    g.shade(lx - 3.5, -8, lx + 3.5, 0, (x, y) => {
      if (Math.abs(x - lx) > 3 - (y > -1 ? 0.6 : 0)) return 0;
      if (y > -1.5) return far ? S[1] : S[2]; // toe ridge
      return far ? S[1] : x < lx ? S[3] : S[2];
    });
    if (!far) for (const dx of [-2, 0, 2]) g.set(lx + dx + step, -0.5, C[5]);
  }
  // head: poking out on the right under the brow, two glowing eyes, slow blink
  const HX = 22, HY = -10 + hy, blink = ((t / D) % 1) > 0.9;
  g.ellipse(HX, HY, 8, 6, (nx, ny) => (ny > 0.45 ? S[1] : nx * -0.4 + ny * -0.8 > 0.3 ? S[3] : S[2]));
  g.line(HX + 3, HY + 3, HX + 7, HY + 2, S[0]); // mouth
  if (!blink) for (const [ex, ey] of [[HX + 2, HY - 2], [HX + 5, HY - 1.5]]) g.set(ex, ey, L[1]), g.set(ex, ey - 1, L[2]);
  else for (const ex of [HX + 2, HX + 5]) g.set(ex, HY - 2, S[1]);
  
  // shell: a dome of hex plates; outer rim darker, a thick brow ridge on the right (front) edge
  const SY = -14 + br * 0.4;
  g.shade(-25, SY - 20, 22, SY + 8, (x, y) => {
    const nx = x / 23.5, ny = (y - SY) / (y < SY ? 19 : 8), d = nx * nx + ny * ny;
    if (d > 1) return 0;
    // the brow: an armoured lip over the front edge
    if (x > 13 && y > SY - 9 && y < SY + 3) return y < SY - 6 ? C[6] : x > 18 ? C[3] : C[4];
    if (ny > 0.55) return y > SY + 5 ? C[1] : C[2]; // rim
    // hex plates: nearest of a staggered lattice of plate centres; where two centres are about as near, a dark seam
    let d1 = 1e9, d2 = 1e9;
    for (let row = -4; row <= 2; row++) for (let col = -4; col <= 4; col++) {
      const cx = col * 8 + (row & 1) * 4, cy = SY + row * 6.5 + 2, dd = (x - cx) ** 2 + ((y - cy) * 1.15) ** 2;
      if (dd < d1) (d2 = d1), (d1 = dd); else if (dd < d2) d2 = dd;
    }
    if (Math.sqrt(d2) - Math.sqrt(d1) < 1.1) return C[2];
    const lit = -nx * 0.55 - ny * 0.75;
    return lit > 0.6 ? C[6] : lit > 0.25 ? C[5] : lit > -0.2 ? C[4] : C[3];
  });
  // crystal spikes along the crest
  for (const [sx, h] of [[-12, 6], [-4, 9], [4, 7], [11, 5]]) {
    const base = SY - 18 + Math.abs(sx) * 0.25;
    for (let yy = 0; yy < h; yy += 0.5) {
      const w = 1.8 * (1 - yy / h);
      for (let xx = -w; xx <= w; xx += 0.5) g.set(sx + xx, base - yy, xx < -0.2 ? C[6] : xx < 0.7 ? C[5] : C[4]);
    }
  }
  g.outline(C[0]);
  g.draw(p);
  p.glow(HX + 3, HY - 1, 4, hex(o.glow[1]), 0.18);
  p.glow(-4, SY - 24, 6, hex(o.glow[2]), 0.08 + 0.05 * Math.sin(ph * 2));
}
