import { fit, hex, lerp, rng, TAU } from "../../core/index.js";
import { Grid, shift, shadow } from "./_lib.js";

// 食梦兽 (每日梦境 / 无尽回廊 boss): a plump night-blue tapir that floats on a little cloud — star-speckled fur, a
// pale moon-cream saddle band, a curled trunk, sleepy crescent eyes, stubby legs tucked under; a nightcap with a pom
// droops over one ear. It bobs as it floats; the trunk sways and the stars in its fur twinkle.
export const meta = {
  name: "Dream tapir",
  desc: "A plump floating dream tapir: night-blue fur speckled with twinkling stars, a cream band round its middle, a curled trunk, sleepy crescent eyes, a droopy nightcap, riding a small cloud.",
  tags: ["critter", "boss", "tapir", "dream", "fly", "loop"],
  size: [112, 104],
  origin: [56, 96],
  duration: 2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#0a0820", "#1a1848", "#2a2a72", "#3e429a", "#5a66c4", "#8a9ae8", "#c8d4ff"],
    band: ["#5a4a6a", "#a894b0", "#e8dcf0", "#fff8ff"],
    cap: ["#3a0a3a", "#8a2a7a", "#d05ab0", "#ffb8e8"],
    cloud: ["#6a6aa8", "#b8b8e8", "#f0f0ff"],
    star: "#fff4b0",
    seed: 3,
  },
};

const D = meta.duration, G = new Grid(-52, -96, 104, 96);
const lift = (t) => -18 - 3 * Math.sin((t / D) * TAU);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), B = fit(o.band, 4), K = fit(o.cap, 4), W = fit(o.cloud, 3), ST = hex(o.star), g = G;
  const ph = (t / D) * TAU, Y = Math.round(lift(t)), sway = Math.sin(ph) * 1.5;
  g.clear();
  // the cloud it rides: three puffs, lit from above
  for (const [cx, cy, r] of [[-20, 2, 11], [2, 4, 13], [22, 2, 10], [-6, -2, 9], [12, -1, 9]]) {
    const yy = Y + 16 + cy + Math.round(Math.sin(ph + cx) * 0.8);
    g.ellipse(cx, yy, r, r * 0.62, (nx, ny) => (ny < -0.35 ? W[2] : ny < 0.3 ? W[1] : W[0]));
  }
  // body: a big soft oval, darker below, lit top-left; a cream saddle band round the middle
  const BX = -4, BY = Y - 18;
  g.ellipse(BX, BY, 30, 21, (nx, ny) => {
    const band = Math.abs(nx + 0.05) < 0.19 && ny < 0.62; // the saddle: over the back, not under the belly
    if (band) return ny < -0.4 ? B[3] : ny < 0.3 ? B[2] : B[1];
    const lit = -nx * 0.45 - ny * 0.75;
    return lit > 0.55 ? C[5] : lit > 0.15 ? C[4] : lit > -0.35 ? C[3] : C[2];
  });
  // stubby legs tucked onto the cloud
  for (const lx of [-22, -10, 6, 16]) g.shade(lx - 3, BY + 14, lx + 3, BY + 22, (x, y) => (Math.abs(x - lx) < 3 - (y > BY + 20 ? 0.8 : 0) ? (y > BY + 20 ? C[1] : C[3]) : 0));
  // the head on the right, with the trunk curling down and up at the tip
  const HX = 24, HY = BY - 6;
  g.ellipse(HX, HY, 15, 13, (nx, ny) => {
    const lit = -nx * 0.35 - ny * 0.8;
    return lit > 0.5 ? C[5] : lit > 0.1 ? C[4] : lit > -0.4 ? C[3] : C[2];
  });
  for (let i = 0; i <= 14; i++) {
    const q = i / 14, x = HX + 11 + q * 9 + Math.sin(q * 3 + ph) * 1.2 + sway * q, y = HY + 2 + q * 12 - Math.max(0, q - 0.7) * 22;
    const r = lerp(4.2, 2, q);
    g.ellipse(x, y, r, r, (nx, ny) => (ny < -0.3 ? C[5] : ny < 0.4 ? C[4] : C[3]));
  }
  // ear and a sleepy crescent eye (closed arc), a little pink cheek
  g.ellipse(HX - 9, HY - 11, 4.5, 5.5, (nx, ny) => (Math.hypot(nx, ny) < 0.5 ? K[3] : C[4]));
  for (let a = 0; a <= Math.PI; a += 0.2) g.set(HX + 5 + Math.cos(a) * 3.5, HY - 3 + Math.sin(a) * 2, C[0]), g.set(HX + 5 + Math.cos(a) * 3.5, HY - 2 + Math.sin(a) * 2, C[0]);
  g.set(HX + 6, HY + 3, K[2]); g.set(HX + 7, HY + 3, K[2]);
  // nightcap: a cream brim hugging the crown, then a pink-striped cone drooping back over the body, pom bouncing
  const tipX = HX - 26 + Math.sin(ph) * 2, tipY = HY + 2 + Math.cos(ph) * 2;
  for (let i = 0; i <= 26; i++) {
    const q = i / 26, x = lerp(HX - 1, tipX, q), y = lerp(HY - 15, tipY, q) - Math.sin(q * Math.PI) * 12, w = lerp(8, 1.5, q);
    for (let k = -w; k <= w; k += 0.5) g.set(x + k * 0.45, y + k * 0.55, Math.floor(q * 9) % 3 === 2 ? K[3] : k < 0 ? K[2] : K[1]);
  }
  for (let x = HX - 10; x <= HX + 8; x += 0.5) {
    const y = HY - 12 + ((x - HX + 1) / 9) ** 2 * 2.5;
    g.set(x, y, B[3]); g.set(x, y + 1, B[2]);
  }
  g.ellipse(tipX, tipY + 1, 3.4, 3.4, (nx, ny) => (nx + ny < -0.4 ? B[3] : B[2]));
  // stars in the fur: a fixed scatter on the body that twinkle in turn
  const R = rng(o.seed, 7, 11);
  for (let i = 0; i < 9; i++) {
    const sx = BX - 24 + R.next() * 44, sy = BY - 14 + R.next() * 22, on = Math.sin(ph * 2 + i * 1.7) > 0.2;
    if (Math.abs(sx - BX + 0.5) < 6) continue; // not on the band
    g.set(sx, sy, on ? ST : C[5]);
    if (on && i % 3 === 0) g.set(sx + 1, sy, ST), g.set(sx - 1, sy, ST), g.set(sx, sy + 1, ST), g.set(sx, sy - 1, ST);
  }
  g.outline(C[0]);
  g.draw(p);
  p.glow(BX, BY, 26, hex(o.palette[5]), 0.08 + 0.04 * Math.sin(ph));
}

export function drawBack(p, time, o) {
  const t = shift(time, D, o.seed);
  shadow(p, 0, -1, 30 + 2 * Math.sin((t / D) * TAU), 6, fit(o.palette, 7)[0], 0.45);
}
