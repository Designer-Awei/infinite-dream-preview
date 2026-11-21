import { fit, hex, mix, clamp, lerp, ease, rng, TAU } from "../../core/index.js";
import { Grid, shift, shadow } from "./_lib.js";

export const meta = {
  name: "Slot machine",
  desc: "A chunky one-armed bandit for the event room: a red cabinet with gold trim, a marquee ringed with chasing bulbs, three reels spinning and stopping on cherry / seven / star, a lever that is pulled once a loop, and a tray where coins jingle out.",
  tags: ["critter", "npc", "prop", "slot", "machine", "casino", "loop"],
  size: [96, 96],
  origin: [48, 88],
  duration: 2.5,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    body: ["#1a0a14", "#4a0e22", "#8a1a30", "#c8323e", "#ff6a5a"],
    gold: ["#2a1606", "#7a4e10", "#c08a1c", "#f0c43c", "#fff2a8"],
    glass: ["#0a0a18", "#1c2040", "#e8e4d8", "#ffffff"],
    seed: 1,
  },
};

const D = meta.duration;
const G = new Grid(-46, -86, 92, 92);
// 8×8 reel symbols: 0 cherry, 1 seven, 2 star, 3 heart, 4 skull (rows of palette keys)
const SYM = [
  ["....gg..", "...g.g..", "..g...g.", ".rr..rr.", "rRrr.rRr", "rrrr.rrr", ".rr...rr", "........"],
  ["yyyyyyy.", "YYYYYyy.", "....yy..", "...yy...", "..yy....", "..yy....", "..YY....", "........"],
  ["...y....", "...y....", "yyyYyyy.", ".yyYyy..", "..yyy...", ".yy.yy..", ".y...y..", "........"],
  [".rr.rr..", "rRrrrrr.", "rrrrrrr.", ".rrrrr..", "..rrr...", "...r....", "........", "........"],
  ["..www...", ".wwwww..", ".k.w.k..", ".wwwww..", "..w.w...", "..www...", "........", "........"],
];
const KEY = { g: "#3aa84a", r: "#d8283c", R: "#ff8a8a", y: "#f0c43c", Y: "#fff2a8", w: "#6a5a7a", k: "#1a1020" };

function symbol(g, s, x, y, clipT, clipB, cols) {
  const rows = SYM[s];
  for (let j = 0; j < 8; j++) {
    const yy = y + j;
    if (yy < clipT || yy > clipB) continue;
    for (let i = 0; i < 8; i++) {
      const ch = rows[j][i];
      if (ch !== ".") g.set(x + i, yy, cols[ch]);
    }
  }
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), B = fit(o.body, 5), Au = fit(o.gold, 5), Gl = fit(o.glass, 4), u = (t / D) % 1;
  const cols = Object.fromEntries(Object.entries(KEY).map(([k, v]) => [k, hex(v)]));
  const g = G;
  g.clear();
  // the lever: pulled down at u≈0.05, springs back; reels spin from the pull and stop one by one
  const pull = u < 0.06 ? u / 0.06 : u < 0.2 ? 1 - ease.outQuad((u - 0.06) / 0.14) : 0;
  // ---- base and legs
  g.shade(-24, -8, 24, -1, (x, y) => (Math.abs(x) > 24 - (y + 8) * 0.2 ? 0 : y < -6 ? Au[3] : y < -3 ? B[1] : B[0]));
  // ---- the cabinet: a tall box, rounded top shoulders, lit from the left
  g.shade(-22, -66, 22, -8, (x, y) => {
    const top = -66 + (Math.abs(x) > 16 ? (Math.abs(x) - 16) ** 2 / 4 : 0);
    if (y < top) return 0;
    if (Math.abs(x) > 20.5) return Au[x < 0 ? 3 : 2]; // gold edging
    const lit = -x / 22 + 0.15;
    return lit > 0.55 ? B[4] : lit > 0.15 ? B[3] : lit > -0.3 ? B[2] : B[1];
  });
  // ---- the marquee: a gold-framed sign on top with a big 7, bulbs chasing round it
  g.shade(-17, -82, 17, -64, (x, y) => {
    const d = Math.hypot(x / 17, (y + 70) / 13);
    if (y > -64 || d > 1) return 0;
    if (d > 0.84) return Au[d > 0.94 ? 1 : 3];
    return y < -74 ? B[3] : B[2];
  });
  symbol(g, 1, -4, -77, -99, 99, { ...cols, y: Au[4], Y: hex("#ffffff") });
  // ---- the reel window: dark frame, three cream reels
  g.shade(-17, -56, 17, -36, (x, y) => (Math.abs(x) > 16 || y > -37 ? Au[2] : y < -55 ? Au[3] : Gl[0]));
  const stopAt = [0.42, 0.55, 0.68], final = [0, 1, 2];
  for (let k = 0; k < 3; k++) {
    const x0 = -15 + k * 10.5, spinning = u > 0.04 && u < stopAt[k];
    g.shade(x0, -54, x0 + 9, -38, (x, y) => (x > x0 + 8.5 ? Gl[1] : Gl[2]));
    if (spinning) {
      // a blur of symbols scrolling down
      const off = ((u * 60 + k * 3.3) % 1) * 10;
      for (let s = -1; s < 3; s++) symbol(g, (Math.floor(u * 60 + k) + s + 5) % 5, x0 + 1, -54 + s * 10 + off, -54, -39, cols);
      for (let x = x0; x < x0 + 9; x++) if ((x + Math.floor(u * 90)) % 3 === 0) g.set(x, -46, Gl[3], 0.5);
    } else {
      // settled, with a little bounce right after it stops
      const since = u - stopAt[k], bump = since > 0 && since < 0.05 ? Math.round(2 * (1 - since / 0.05)) : 0;
      symbol(g, final[k], x0 + 1, -50 + bump, -54, -39, cols);
    }
  }
  // the payline across the reels
  for (let x = -16; x <= 16; x++) if (x % 2 === 0) g.set(x, -46, B[3]);
  // ---- buttons and a coin slot under the window
  for (const [bx, c] of [[-12, hex("#ff3a4a")], [-6, Au[3]], [0, hex("#5ab8ff")]]) g.ellipse(bx, -31, 2.4, 1.8, Gl[0]), g.ellipse(bx, -31.5, 1.8, 1.2, c);
  g.shade(8, -33, 15, -30, (x, y) => (y < -32 ? Au[3] : Gl[0]));
  // ---- the payout tray: a dark mouth with gold coins heaped in it
  g.shade(-14, -24, 14, -12, (x, y) => (Math.abs(x) > 14 - (y + 24) * 0.15 ? 0 : y < -22 ? Au[3] : y > -14 ? Au[2] : Gl[0]));
  for (const [cx, cy] of [[-8, -15], [-4, -14], [0, -15], [4, -14], [8, -15], [-6, -17], [2, -17], [6, -16]]) g.ellipse(cx, cy, 2, 1.3, Au[3]), g.set(cx - 1, cy - 1, Au[4]);
  // ---- the lever on the right: a gold rod with a red ball, pivoting down
  const la = -1.25 + pull * 1.6, lx = 23, ly = -40, rx = lx + Math.cos(la) * 20, ry = ly + Math.sin(la) * 20;
  g.ellipse(lx, ly, 3, 4, Au[2]);
  g.line(lx, ly, rx, ry, Au[3]);
  g.line(lx + 1, ly, rx + 1, ry, Au[2]);
  g.ellipse(rx, ry, 3.6, 3.6, (nx, ny) => (nx * nx + ny * ny > 0.75 ? B[2] : nx < -0.1 && ny < -0.1 ? B[4] : B[3]));
  g.outline(B[0]);
  g.draw(p);
  // ---- light: bulbs chasing round the marquee, the window glow, a win flash when the last reel lands
  for (let i = 0; i < 14; i++) {
    const a = Math.PI + (i / 13) * Math.PI, x = Math.cos(a) * 18, y = -70 + Math.sin(a) * 14, on = (i + Math.floor(u * 28)) % 3 === 0;
    p.px(x, y, on ? Au[4] : Au[1]);
    if (on) p.glow(x, y, 3, Au[3], 0.5);
  }
  const win = u > 0.68 && u < 0.95 ? 1 - (u - 0.68) / 0.27 : 0;
  p.glow(0, -46, 20, Au[3], 0.12 + 0.35 * win);
  p.glow(0, -73, 9, Au[3], 0.35 + 0.3 * Math.sin(u * TAU * 4));
  // coins hop out of the tray after the win and land back in it
  if (win > 0)
    for (let i = 0; i < 4; i++) {
      const w = clamp((u - 0.7 - i * 0.04) / 0.18);
      if (w <= 0 || w >= 1) continue;
      const x = -6 + i * 4 + (i - 1.5) * w * 6, y = -18 - Math.sin(w * Math.PI) * 14;
      p.px(x, y, Au[4]); p.px(x + 1, y, Au[3]); p.px(x, y + 1, Au[3]);
      p.glow(x, y, 3, Au[3], 0.4);
    }
}

export function drawBack(p, time, o) {
  shadow(p, 0, 0, 28, 4, hex("#100810"), 0.45);
}
