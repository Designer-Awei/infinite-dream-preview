import { fit, hex, lerp, rng, TAU } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

// 熔岩迫击蜗牛 (算力熔炉): a rock-skinned snail carrying a volcanic cone for a shell — the cone's vent glows and
// puffs ember smoke, magma seams pulse in the slug body, eye stalks sway.
export const meta = {
  name: "Mortar snail",
  desc: "A dark basalt snail whose shell is a small volcano cone with a glowing vent puffing smoke and embers, glowing magma seams along its body, swaying eye stalks.",
  tags: ["critter", "snail", "lava", "fire", "monster", "loop"],
  size: [76, 68],
  origin: [38, 60],
  duration: 1.5,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#0e0808", "#221616", "#3a2624", "#563a34", "#7a5648", "#a8806a"],
    lava: ["#5a1004", "#c83a0a", "#ff8a1a", "#ffd060", "#fff4c0"],
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-32, -56, 64, 58);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 6), M = fit(o.lava, 5), ph = (t / D) * TAU, g = G;
  const heat = 0.5 + 0.5 * Math.sin(ph), creep = Math.sin(ph) * 0.8;
  g.clear();
  // the foot: a long low slug, head end on the right, magma seams flickering along it
  g.shade(-26, -9, 26, 0, (x, y) => {
    const u = (x + 26) / 52, top = -4 - 5 * Math.sin(Math.PI * Math.min(1, u * 1.1)) - (u > 0.66 ? (u - 0.66) * 26 : 0);
    if (y < top + creep * (u > 0.7 ? 1 : 0) || y > 0) return 0;
    if (Math.abs(y - (top + 2.5)) < 0.6 && Math.sin(x * 0.7 + ph * 2) > 0.2) return heat > 0.5 ? M[2] : M[1];
    return y > -1.5 ? C[1] : y < top + 1.5 ? C[4] : C[3];
  });
  // eye stalks with glowing tips
  // the head: a rounded bulb at the front with a mouth; eye stalks off its top with glowing tips
  g.ellipse(21, -9 + creep * 0.5, 6.5, 6, (nx, ny) => (ny > 0.5 ? C[2] : nx * -0.4 + ny * -0.8 > 0.3 ? C[5] : C[4]));
  g.line(23, -6, 27, -6.5, C[0]);
  for (const [sx, k] of [[19, 0], [23, 1]]) {
    const sw = Math.sin(ph + k * 1.4) * 1.4, ex = sx + 2 + sw, ey = -24 - k;
    g.line(sx, -14, ex, ey, C[4]);
    g.line(sx + 1, -14, ex + 1, ey, C[3]);
    g.ellipse(ex + 0.5, ey - 0.5, 1.6, 1.6, () => M[3]);
    g.set(ex, ey - 1, M[4]);
  }
  // the shell: a basalt volcano cone set on the back, cracked with glowing magma, a vent at the top
  const CX = -7, BY = -7, TOPY = -36, VW = 4;
  g.shade(CX - 19, TOPY, CX + 19, BY, (x, y) => {
    const v = (y - TOPY) / (BY - TOPY), half = lerp(VW, 18, Math.pow(v, 0.75));
    if (Math.abs(x - CX) > half) return 0;
    if (v < 0.07) return M[heat > 0.4 ? 3 : 2]; // the vent's glowing mouth
    const r = rng(o.seed, Math.round(x * 0.5), Math.round(y * 0.4));
    // jagged magma seams running down the cone
    const seam = Math.abs(Math.sin((x - CX) * 0.45 + y * 0.18)) < 0.09 + 0.05 * v;
    if (seam && v > 0.12) return heat > 0.6 ? M[3] : M[2];
    const lit = -(x - CX) / half * 0.8 - (1 - v) * 0.3 + (r.next() - 0.5) * 0.25;
    if (v > 0.9) return C[2];
    return lit > 0.5 ? C[5] : lit > 0.1 ? C[4] : lit > -0.35 ? C[3] : C[2];
  });
  g.outline(C[0]);
  g.draw(p);
  // vent glow, smoke puffs and embers rising
  p.glow(CX, TOPY + 1, 7 + 3 * heat, hex(o.lava[2]), 0.25 + 0.2 * heat);
  for (let i = 0; i < 4; i++) {
    const a = ((t / D + i / 4) % 1), sx = CX + Math.sin(a * 6 + i) * 3 * a, sy = TOPY - 2 - a * 14, r = 1.5 + a * 3;
    p.circle(sx, sy, r, mixDark(C[2], a), 0.55 * (1 - a));
  }
  for (let i = 0; i < 3; i++) {
    const a = ((t / D * 1.5 + i / 3) % 1);
    p.px(CX + Math.sin(i * 2.3 + a * 5) * 4 * a, TOPY - a * 18, a < 0.6 ? M[3] : M[2]);
  }
}
const mixDark = (c) => c;
