import { fit, hex, mix, lerp, TAU } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

// 爬网蜘蛛 (数据草原): a data-crawler spider scuttling on eight legs — a round dark abdomen traced with glowing
// circuit lines, a small head with a cluster of red eyes, legs in a walking cycle (alternating tetrapod gait).
export const meta = {
  name: "Crawler spider",
  desc: "A small dark spider with glowing cyan circuit lines on its abdomen and red eyes, scuttling in place on eight jointed legs.",
  tags: ["critter", "spider", "bug", "monster", "walk", "loop"],
  size: [64, 48],
  origin: [32, 42],
  duration: 0.8,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#080c10", "#141e26", "#22343e", "#335058", "#4f7a7c", "#86b8ae"],
    glow: ["#1a5a50", "#3adcb8", "#b8fff0"],
    eye: ["#5a0a14", "#ff3a4a", "#ffd0d0"],
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-26, -30, 52, 32);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 6), L = fit(o.glow, 3), E = fit(o.eye, 3), ph = (t / D) * TAU;
  const bob = Math.round(Math.sin(ph * 2) * 0.6), g = G;
  g.clear();
  // legs: four pairs from the head's sides; far legs (darker) first. Feet sweep back and forth, lifted on the swing
  const foot = [-15, -8, 5, 12], knee = [-11, -6, 3, 9];
  for (const far of [1, 0]) for (let i = 0; i < 4; i++) {
    const s = Math.sin(ph + i * Math.PI * 0.5 + far * Math.PI), lift = Math.max(0, -Math.cos(ph + i * Math.PI * 0.5 + far * Math.PI)) * 2.5;
    const rx = lerp(-1, 5, i / 3) + (far ? 1 : 0), ry = -9 + bob - (far ? 1 : 0);
    const kx = knee[i] + s * 1.5 + (far ? 1 : 0), ky = -15 + bob - (far ? 1 : 0) + Math.abs(i - 1.5) * 0.8;
    const fx = foot[i] + s * 2.5 + (far ? 2 : 0), fy = (far ? -2 : 0) - lift;
    const col = far ? C[2] : C[4], tip = far ? C[1] : C[3];
    g.line(rx, ry, kx, ky, col);
    g.line(rx, ry + 1, kx, ky + 1, far ? C[1] : C[3]);
    g.line(kx, ky, fx, fy, col);
    g.set(fx, fy, tip);
  }
  // abdomen: a big round bulb behind, lit top-left, glowing circuit traces that pulse
  const pulse = 0.5 + 0.5 * Math.sin(ph * 2);
  g.shade(-18, -24 + bob, 2, -4 + bob, (x, y) => {
    const nx = (x + 8) / 10, ny = (y - (-14 + bob)) / 8.5, d = nx * nx + ny * ny;
    if (d > 1) return 0;
    const ix = Math.round(x + 8), iy = Math.round(y - (-14 + bob));
    // circuit: a spine, two branches with nodes
    const tr = (ix === 0 && iy > -6 && iy < 5) || (iy === -2 && Math.abs(ix) > 1 && Math.abs(ix) < 6) || (iy === 2 && ix > 1 && ix < 7);
    if (tr) return pulse > 0.5 ? L[1] : L[0];
    if ((ix === -5 && iy === -2) || (ix === 6 && iy === 2)) return L[2];
    const lit = -nx * 0.6 - ny * 0.8;
    return lit > 0.55 ? C[5] : lit > 0.15 ? C[4] : lit > -0.35 ? C[3] : C[2];
  });
  // head: a smaller bulb in front with fangs and an eye cluster
  g.ellipse(5.5, -10 + bob, 5.5, 4.3, (nx, ny) => (nx * -0.5 + ny * -0.8 > 0.4 ? C[4] : ny > 0.5 ? C[2] : C[3]));
  for (const [ex, ey, big] of [[8, -12, 1], [10, -11, 1], [6.5, -13, 0], [9.5, -13.5, 0]]) {
    g.set(ex, ey + bob, big ? E[1] : E[0]);
    if (big) g.set(ex, ey - 1 + bob, E[2]);
  }
  g.set(10, -7 + bob, C[5]); g.set(9, -6 + bob, C[4]); g.set(11, -6.5 + bob, C[4]);
  g.outline(C[0]);
  g.draw(p);
  // a faint glow off the circuit
  p.glow(-8, -14 + bob, 7, hex(o.glow[1]), 0.12 * pulse);
}
