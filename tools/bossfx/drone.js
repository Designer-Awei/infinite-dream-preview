import { fit, hex, TAU } from "../../core/index.js";
import { Grid, shift, shadow } from "./_lib.js";

// 补丁无人机 (all maps): a small white medic drone — a rounded capsule body with a green cross panel that pulses,
// two rotor arms with spinning blades, a little lens eye, a repair claw dangling below; it bobs as it hovers.
export const meta = {
  name: "Patch drone",
  desc: "A small hovering white medic drone with a pulsing green cross on its body, two spinning rotors, a lens eye and a dangling repair claw, casting a shadow below.",
  tags: ["critter", "drone", "robot", "heal", "fly", "loop"],
  size: [52, 60],
  origin: [26, 54],
  duration: 1.2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#0a0e14", "#2a3442", "#5a6878", "#9aa8b6", "#d4dee6", "#ffffff"],
    glow: ["#1a6a2a", "#4aff7a", "#d0ffd8"],
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-22, -56, 44, 30);
const lift = (t) => -30 - 2.5 * Math.sin((t / D) * TAU);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 6), L = fit(o.glow, 3), ph = (t / D) * TAU, g = G;
  const Y = Math.round(lift(t)), pulse = 0.5 + 0.5 * Math.sin(ph * 2);
  g.clear();
  // the claw hanging below on a short cable
  const sw = Math.sin(ph + 1) * 1.5;
  g.line(0, Y + 6, sw, Y + 12, C[2]);
  g.set(sw - 1, Y + 13, C[3]); g.set(sw + 1, Y + 13, C[3]); g.set(sw - 1.5, Y + 14, C[2]); g.set(sw + 1.5, Y + 14, C[2]);
  // rotor arms and spinning blades (a blade is a line whose length foreshortens as it turns)
  for (const s of [-1, 1]) {
    g.line(s * 6, Y - 3, s * 13, Y - 6, C[2]);
    g.line(s * 6, Y - 2, s * 13, Y - 5, C[1]);
    g.set(s * 13, Y - 7, C[3]);
    const a = ph * 6 + (s > 0 ? 1 : 0), len = 7 * Math.abs(Math.cos(a)) + 1;
    g.line(s * 13 - len, Y - 8, s * 13 + len, Y - 8, C[4]);
    g.line(s * 13 - len * 0.6, Y - 9, s * 13 + len * 0.6, Y - 9, C[3]);
  }
  // body: a rounded capsule, lit top-left
  g.ellipse(0, Y, 8.5, 7, (nx, ny) => {
    const lit = -nx * 0.5 - ny * 0.8;
    return ny > 0.6 ? C[2] : lit > 0.5 ? C[5] : lit > 0 ? C[4] : C[3];
  });
  // the green cross panel and the lens eye
  for (let k = -2; k <= 2; k++) g.set(-2 + k, Y + 1, pulse > 0.45 ? L[1] : L[0]), g.set(-2, Y + 1 + k, pulse > 0.45 ? L[1] : L[0]);
  g.set(-2, Y + 1, L[2]);
  g.ellipse(4.5, Y - 1, 2.2, 2.2, () => C[1]);
  g.set(4, Y - 2, C[5]); g.set(5, Y - 1, hex("#5ad0ff"));
  g.outline(C[0]);
  g.draw(p);
  p.glow(-2, Y + 1, 6, hex(o.glow[1]), 0.22 * pulse);
}

export function drawBack(p, time, o) {
  const t = shift(time, D, o.seed);
  shadow(p, 0, -1, 9 + 1.2 * Math.sin((t / D) * TAU), 2.4, fit(o.palette, 6)[0], 0.45);
}
