import { fit, hex, TAU } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

// 梦泡 (食梦兽's sleep): a big translucent dream bubble with an iridescent rim and a small sleeping moon inside; it
// wobbles and the sheen slides round it.
export const meta = {
  name: "Dream bubble",
  desc: "A translucent floating dream bubble with an iridescent rim, a soft sheen sliding round it, and a tiny sleeping crescent moon inside.",
  tags: ["critter", "bubble", "dream", "fly", "loop"],
  size: [48, 56],
  origin: [24, 50],
  duration: 1.2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    rim: ["#ff8ad8", "#ffd84a", "#8affc8", "#7ab8ff", "#c88aff"],
    fill: "#b8a8ff",
    moon: ["#c89a2a", "#fff0a0"],
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-20, -52, 40, 44);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), ph = (t / D) * TAU, g = G, RIM = o.rim.map(hex), M = fit(o.moon, 2), F = hex(o.fill);
  const Y = -28 + Math.round(Math.sin(ph) * 1.5), wob = Math.sin(ph * 2) * 0.06, R = 15;
  g.clear();
  g.ellipse(0, Y, R * (1 + wob), R * (1 - wob), (nx, ny) => {
    const d = Math.hypot(nx, ny);
    if (d > 0.8) {
      // iridescent rim: hue by angle, sliding round
      const a = (Math.atan2(ny, nx) + ph) / TAU, k = ((a % 1) + 1) % 1;
      return RIM[Math.floor(k * RIM.length) % RIM.length];
    }
    return 0;
  });
  // the moon inside
  // a crescent: a disc with an offset disc cut out
  g.shade(-7, Y - 6, 5, Y + 7, (x, y) => (Math.hypot(x + 1, y - Y) < 5.5 && Math.hypot(x - 2.2, y - Y + 1.5) > 4.3 ? (x + y - Y < -2 ? M[1] : M[0]) : 0));
  g.draw(p);
  // the translucent fill and a sliding sheen
  p.circle(0, Y, R * 0.8, F, 0.18);
  const sa = ph * 0.5 - 2.3;
  p.circle(Math.cos(sa) * 7, Y + Math.sin(sa) * 7, 2.2, hex("#ffffff"), 0.85);
  p.glow(0, Y, R + 6, F, 0.12);
}
