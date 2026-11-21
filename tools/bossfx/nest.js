import { fit, hex, lerp, rng, TAU } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

// 巢穴 (精英巢穴 rooms): a lumpy mound with a dark mouth in front, clusters of glowing egg sacs on its flanks and
// strands across it; the eggs and the mouth pulse like a heartbeat. Recoloured per map (moss / ice / basalt).
export const meta = {
  name: "Monster nest",
  desc: "A lumpy organic mound with a dark glowing mouth, clusters of translucent glowing egg sacs and strands draped over it, pulsing slowly like a heartbeat.",
  tags: ["critter", "nest", "hive", "monster", "structure", "loop"],
  size: [84, 72],
  origin: [42, 64],
  duration: 1.6,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#0a0e08", "#1a2614", "#2a3e20", "#3e5a2c", "#5a7e3c", "#86a854"],
    glow: ["#3a5a10", "#a8e83a", "#f0ffb8"],
    strand: "#c8d8b0",
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-34, -50, 68, 52);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 6), L = fit(o.glow, 3), ST = hex(o.strand), g = G;
  // heartbeat: two quick pulses then a rest
  const u = (t / D) % 1, beat = Math.max(Math.exp(-((u - 0.1) ** 2) / 0.003), 0.7 * Math.exp(-((u - 0.28) ** 2) / 0.003));
  const swell = beat * 1.2;
  g.clear();
  // the mound: three overlapping lumps, lit top-left, mottled
  const lumps = [[-14, -14, 15, 13], [12, -13, 14, 12], [0, -22, 18 + swell, 20 + swell]];
  g.shade(-32, -46, 32, 0, (x, y) => {
    let best = -1;
    for (const [cx, cy, rx, ry] of lumps) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
      if (d <= 1 && y <= 0) best = Math.max(best, -nx * 0.55 - ny * 0.7 + (1 - d) * 0.2);
    }
    if (best === -1) return 0;
    const r = rng(o.seed, Math.round(x / 3), Math.round(y / 3)).next();
    if (y > -3) return C[1];
    const lit = best + (r - 0.5) * 0.3;
    return lit > 0.75 ? C[5] : lit > 0.35 ? C[4] : lit > -0.05 ? C[3] : C[2];
  });
  // the mouth: a dark oval opening low in front, glowing deep inside on the beat
  g.ellipse(0, -10, 8, 6.5, (nx, ny) => {
    const d = Math.hypot(nx, ny);
    return d < 0.45 ? (beat > 0.3 ? L[2] : L[1]) : d < 0.7 ? (beat > 0.3 ? L[1] : L[0]) : C[0];
  });
  // egg sacs: translucent glowing ovals in clusters, swelling on the beat
  for (const [ex, ey, er] of [[-20, -18, 3.4], [-16, -24, 2.8], [-23, -12, 2.5], [18, -19, 3.2], [22, -13, 2.6], [14, -26, 2.4], [-4, -34, 2.6], [5, -36, 2.2]]) {
    const R = er + beat * 0.6;
    g.ellipse(ex, ey, R, R * 1.15, (nx, ny) => (nx * -0.5 + ny * -0.7 > 0.45 ? L[2] : Math.hypot(nx, ny) > 0.75 ? L[0] : L[1]));
  }
  // strands draped across the mound
  for (const [x0, y0, x1, y1, sag] of [[-26, -10, -6, -30, 4], [8, -32, 26, -8, 4], [-12, -38, 12, -38, 3]]) {
    for (let k = 0; k <= 16; k++) {
      const q = k / 16, x = lerp(x0, x1, q), y = lerp(y0, y1, q) + Math.sin(Math.PI * q) * sag;
      if (k % 2 === 0) g.set(x, y, ST, 0.85);
    }
  }
  g.outline(C[0]);
  g.draw(p);
  p.glow(0, -10, 10 + 4 * beat, hex(o.glow[1]), 0.18 + 0.25 * beat);
}
