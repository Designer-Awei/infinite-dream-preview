import { fit, hex, lerp, TAU } from "../../core/index.js";
import { Grid, shift, shadow } from "./_lib.js";

// 菌母 (幽影森林's region boss): a giant mushroom rooted in the forest floor — a broad violet cap that breathes (squash
// and stretch) dotted with glowing teal spots, gills under its rim, a pale thick stalk with a sleepy face (two glowing
// eyes, a mouth that opens on the out-breath), a ring of smaller mushrooms round its foot, and glowing spores drifting up.
export const meta = {
  name: "Myco mother",
  desc: "A giant mushroom boss: a breathing violet cap with glowing teal spots and gills, a pale stalk with glowing eyes and a mouth, a cluster of small mushrooms at its foot and glowing spores drifting upward.",
  tags: ["critter", "boss", "mushroom", "forest", "spores", "idle", "loop"],
  size: [136, 128],
  origin: [68, 116],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    cap: ["#12061e", "#2e1048", "#4e1e74", "#7230a0", "#9a52c8", "#c48ae8"],
    stalk: ["#2a2030", "#6a5a6a", "#a8949e", "#d8c8c8", "#f4ece4"],
    glow: ["#0e5a52", "#2ad8b8", "#a8fff0"],
    moss: ["#0e2418", "#1e4a2c", "#2e6e3c"],
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-62, -112, 124, 116);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.cap, 6), S = fit(o.stalk, 5), L = fit(o.glow, 3), M = fit(o.moss, 3), ph = (t / D) * TAU, g = G;
  const br = Math.sin(ph), sq = 1 + br * 0.05, pulse = 0.5 + 0.5 * Math.sin(ph * 2 + 1);
  shadow(p, 0, 0, 44, 10, hex("#000000"), 0.32);
  g.clear();
  // moss mound at the foot
  g.ellipse(0, -3, 40, 7, (nx, ny) => (ny < -0.3 ? M[2] : M[1]));
  // the stalk: a pale thick column, wider at the foot, a frilly ring under the cap
  const capY = -62 - br * 2.5;
  g.shade(-20, capY + 6, 20, -4, (x, y) => {
    const v = (y - capY - 6) / (-4 - capY - 6), half = lerp(12, 19, v * v) + Math.sin(y * 0.4) * 0.6;
    if (Math.abs(x) > half) return 0;
    const lit = -x / half * 0.7 + 0.15;
    return lit > 0.5 ? S[4] : lit > 0.1 ? S[3] : lit > -0.35 ? S[2] : S[1];
  });
  // the face on the stalk: two glowing eyes that half-close on the in-breath, a mouth that opens on the out-breath
  const fy = capY + 26, lid = br > 0.3 ? 1 : 2;
  for (const sd of [-1, 1]) {
    g.ellipse(sd * 6, fy, 3, lid, L[1]);
    g.set(sd * 6 - 1, fy - (lid > 1 ? 1 : 0), L[2]);
  }
  const mo = Math.max(0, -br) * 3;
  g.ellipse(0, fy + 9, 3.5, 1 + mo, S[0]);
  // the skirt ring under the cap
  g.shade(-17, capY + 8, 17, capY + 13, (x, y) => (Math.abs(x) > 17 - (y - capY - 8) * 0.8 ? 0 : (Math.floor(x + 40) % 3 === 0 ? S[2] : S[3])));
  // gills: the cap's underside, a dark band of radiating lines
  g.shade(-46, capY - 2, 46, capY + 8, (x, y) => {
    const v = (y - capY + 2) / 10, half = 46 * sq * (1 - v * 0.45);
    if (Math.abs(x) > half) return 0;
    return Math.floor((x / (v + 0.4)) + 60) % 3 === 0 ? C[0] : C[1];
  });
  // the cap: a broad dome, squashing wider and lower on the in-breath, lit from the upper left, glowing spots
  const rx = 50 * sq, ry = 30 / sq;
  g.shade(-rx, capY - ry, rx, capY + 2, (x, y) => {
    const nx = x / rx, ny = (y - capY) / ry;
    if (ny > 0.06 || nx * nx + ny * ny > 1) return 0;
    // wavy rim
    if (ny > -0.06 && Math.sin(nx * 18 + ph) > 0.5) return C[1];
    const lit = -nx * 0.45 - ny * 0.9;
    return lit > 0.85 ? C[5] : lit > 0.55 ? C[4] : lit > 0.25 ? C[3] : C[2];
  });
  // glowing spots on the cap, each pulsing a little out of step
  const spots = [[-28, -14, 5], [-6, -22, 6], [18, -16, 5], [34, -6, 3.5], [-40, -4, 3], [4, -8, 4], [-18, -4, 3], [24, -26, 3]];
  spots.forEach(([sx, sy, r], k) => {
    const on = 0.5 + 0.5 * Math.sin(ph * 2 + k * 1.3);
    g.ellipse(sx * sq, capY + sy / sq, r, r * 0.75, (nx, ny) => (nx * nx + ny * ny < 0.3 ? (on > 0.4 ? L[2] : L[1]) : L[1]));
  });
  // the little mushrooms round the foot
  for (const [mx, h, r, k] of [[-30, 12, 7, 0], [-21, 7, 5, 1], [26, 14, 8, 2], [35, 8, 5, 3], [16, 6, 4, 4]]) {
    const b = Math.sin(ph * 2 + k) * 0.6;
    g.shade(mx - 2, -2 - h, mx + 2, -2, (x) => (x < mx ? S[3] : S[2]));
    g.ellipse(mx, -2 - h + b, r, r * 0.6, (nx, ny) => (ny > 0.2 ? C[1] : -nx * 0.5 - ny * 0.8 > 0.4 ? C[4] : C[3]));
    g.set(mx - r * 0.3, -3 - h + b, L[1]);
  }
  g.outline(C[0]);
  g.draw(p);
  p.glow(0, capY - 10, 30, hex(o.glow[1]), 0.08 + 0.08 * pulse);
  p.glow(0, fy, 10, hex(o.glow[1]), 0.12);
  // spores: glowing motes drifting up off the cap, swaying, fading as they rise
  for (let i = 0; i < 14; i++) {
    const u = ((t / D) + i * 0.071) % 1, x0 = Math.sin(i * 2.7) * 40;
    const x = x0 + Math.sin(u * 6 + i) * 4, y = capY - 18 - u * 48;
    p.dot(Math.round(x), Math.round(y), i % 3 ? hex(o.glow[1]) : hex(o.glow[2]), (1 - u) * 0.9);
  }
}
