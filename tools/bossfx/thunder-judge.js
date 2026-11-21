import { fit, hex, mix, clamp, lerp, ease, rng, TAU } from "../../core/index.js";
import { Grid, shift, shadow, lnoise } from "./_lib.js";

export const meta = {
  name: "Thunder judge",
  desc: "A floating storm arbiter boss: a faceless steel helm with a glowing T visor under a gold crest, a crackling halo, gold-trimmed cuirass and cape, a storm cloud for legs, a great gavel raised in one hand and ball lightning in the other.",
  tags: ["critter", "boss", "lightning", "storm", "judge", "float", "loop"],
  size: [136, 156],
  origin: [68, 144],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    steel: ["#0a0c18", "#1c2236", "#353f5a", "#56658a", "#8a9cbc", "#d0dcee"],
    gold: ["#241406", "#6a4410", "#b07c1c", "#e8be3c", "#fff0a0"],
    volt: ["#1a2470", "#3a64ff", "#78ccff", "#d8f4ff", "#ffffff"],
    cloud: ["#0c0c1a", "#1c1e34", "#323659", "#4e5482", "#7c84b0"],
    cape: ["#0c0820", "#20164a", "#352876", "#5442a4"],
    hover: 22,
    seed: 1,
  },
};

const D = meta.duration;
const BODY = new Grid(-48, -128, 96, 136), CAPE = new Grid(-34, -100, 68, 90);
const bob = (t, hover) => -hover - 3 * Math.sin((t / D) * TAU);

// a jagged arc between two points, re-rolled a few times per loop so it crackles
function arc(p, x0, y0, x1, y1, jag, col, core, t, k, a = 1) {
  const r = rng(Math.floor((t / D) * 18) * 131 + k * 17), n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 5));
  const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const u = i / n, j = i === n ? 0 : (r.next() - 0.5) * jag;
    const x = lerp(x0, x1, u) + (nx / nl) * j, y = lerp(y0, y1, u) + (ny / nl) * j;
    p.line(px, py, x, y, col, a);
    if (core) p.line(px + 1, py, x + 1, y, col, a), p.line(px, py, x, y, core, a), p.glow(x, y, 4, col, 0.25 * a);
    px = x; py = y;
  }
}

function cape(g, Cp, Gd, t, Y) {
  g.clear();
  const ph = (t / D) * TAU;
  // a heavy cape hangs from the shoulders behind the body, flaring and rippling at the hem
  g.shade(-32, Y - 50, 32, Y - 6, (x, y) => {
    const v = (y - (Y - 50)) / 44;
    const half = lerp(13, 27, v ** 0.9) + 2 * Math.sin(v * 6 - ph + x * 0.05) * v;
    const hem = 1 - 0.07 * (0.5 + 0.5 * Math.sin(x * 0.4 + ph * 2)) - 0.04 * Math.sin(x * 0.17 - ph);
    if (Math.abs(x) > half || v > hem || v < 0) return 0;
    if (v > hem - 0.05) return Gd[2]; // gold border on the hem
    const fold = Math.sin(x * 0.5 + v * 1.5 + Math.sin(ph) * 0.4);
    return fold > 0.6 ? Cp[3] : fold > -0.1 ? Cp[2] : fold > -0.7 ? Cp[1] : Cp[0];
  });
  g.outline(Cp[0]);
}

function figure(g, S, Gd, V, Cl, t, Y, lift) {
  g.clear();
  const ph = (t / D) * TAU;
  // ---- the storm cloud the judge stands on: lumpy, lit from above, churning
  const puffs = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + ph * 0.25, rr = 9 + 3 * Math.sin(i * 2.3 + ph);
    puffs.push([Math.cos(a) * 15, Y - 8 + Math.sin(a) * 5, rr]);
  }
  puffs.push([0, Y - 12, 12], [-8, Y - 4, 9], [8, Y - 4, 9]);
  puffs.sort((p, q) => p[1] - q[1]);
  for (const [cx, cy, rr] of puffs)
    g.shade(cx - rr, cy - rr, cx + rr, cy + rr, (x, y) => {
      const d = Math.hypot(x - cx, (y - cy) * 1.25) / rr;
      if (d > 1) return 0;
      const top = (cy - y) / rr - (x - cx) / rr * 0.3;
      return top > 0.45 ? Cl[4] : top > 0.05 ? Cl[3] : top > -0.45 ? Cl[2] : Cl[1];
    });
  // ---- the cuirass: a broad chest tapering to a belted waist, steel plates lit from the left
  g.shade(-16, Y - 52, 16, Y - 16, (x, y) => {
    const v = (y - (Y - 52)) / 36, half = v < 0.55 ? lerp(15, 10, v / 0.55) : lerp(10, 13, (v - 0.55) / 0.45);
    if (Math.abs(x) > half) return 0;
    if (v > 0.6 && v < 0.7) return Math.abs(x) < 2.5 ? Gd[4] : Gd[2]; // the belt and its buckle
    if (v >= 0.7) {
      // a skirt of plates (tassets), each with a lit edge
      const px = x + 13, band = Math.floor(px / 8.7), lx = px - band * 8.7;
      if (lx < 0.9) return S[0];
      if (v > 0.93) return Gd[2];
      return lx < 2.5 ? S[4] : band === 1 ? S[3] : S[2];
    }
    if (Math.abs(Math.abs(x) - half) < 1.2) return Gd[3]; // gold trim down the sides
    if (Math.abs(x) < 0.8 && v < 0.6) return S[1]; // the keel line
    const lit = -x / half * 0.8 + (0.3 - v);
    return lit > 0.55 ? S[5] : lit > 0.15 ? S[4] : lit > -0.35 ? S[3] : S[2];
  });
  // the sigil on the chest: a lightning bolt in a gold ring
  g.ellipse(0, Y - 40, 5.5, 5.5, Gd[2]);
  g.ellipse(0, Y - 40, 4.2, 4.2, S[1]);
  for (const [x, y] of [[1, -44], [0, -43], [0, -42], [-1, -41], [0, -41], [1, -40], [1, -39], [0, -38], [0, -37], [-1, -36]]) g.set(x, Y + y, V[3]);
  // ---- the pauldrons: big round gold-rimmed shoulder plates
  for (const sd of [-1, 1]) {
    const cx = sd * 16, cy = Y - 49;
    g.shade(cx - 8, cy - 7, cx + 8, cy + 6, (x, y) => {
      const d = Math.hypot((x - cx) / 8, (y - cy) / 6.5);
      if (d > 1 || y > cy + 4) return 0;
      if (d > 0.78 || y > cy + 2.8) return Gd[d > 0.9 ? 2 : 3];
      const lit = (cy - y) / 6 - (x - cx) / 10;
      return lit > 0.4 ? S[5] : lit > 0 ? S[4] : S[3];
    });
    g.set(cx - sd * 2, cy - 3, Gd[4]);
  }
  // ---- the helm: a faceless steel dome with a glowing T visor, a gold crest of blades rising off it
  const HY = Y - 62;
  g.shade(-8, HY - 9, 8, HY + 9, (x, y) => {
    const top = HY - 7 + (x * x) / 22; // a slightly domed crown
    if (y < top || Math.abs(x) > 7.5 - Math.max(0, y - HY - 4) * 0.6) return 0;
    if (Math.abs(Math.abs(x) - 7.5 + Math.max(0, y - HY - 4) * 0.6) < 1 && y < HY + 4) return Gd[2]; // gold cheek rims
    if (y > HY - 2 && y < HY + 2) return S[0]; // the visor band
    if (Math.abs(x) < 1.6 && y >= HY + 2 && y < HY + 7) return S[0]; // the breathing slot
    const lit = -x / 8 + (HY - y) / 10;
    return lit > 0.55 ? S[4] : lit > 0.1 ? S[3] : lit > -0.35 ? S[2] : S[1];
  });
  // the gorget joining helm and cuirass
  g.shade(-6, HY + 7, 6, HY + 11, (x, y) => (Math.abs(x) > 6 - (y - HY - 7) * 0.3 ? 0 : y < HY + 8 ? Gd[3] : Gd[2]));
  // the crest: a fan of gold blades, the middle one tallest
  for (const [sx, h, lean] of [[-6, 5, -0.5], [-3, 8, -0.25], [0, 11, 0], [3, 8, 0.25], [6, 5, 0.5]]) {
    const base = HY - 7 + Math.abs(sx) * 0.35, tall = h + Math.sin(ph * 2 + sx) * 0.5;
    for (let yy = 0; yy < tall; yy += 0.5) {
      const w = 1.7 * (1 - yy / tall) + 0.3;
      for (let xx = -w; xx <= w; xx += 0.5) g.set(sx + xx + lean * yy, base - yy, xx < -0.2 ? Gd[4] : xx < 0.7 ? Gd[3] : Gd[2]);
    }
  }
  // ---- the left arm (viewer's left): bent low, the open hand holding ball lightning
  const tube = (pts, r0, r1, cols) => {
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      for (let u = 0; u <= 1; u += 0.08) {
        const cx = lerp(x0, x1, u), cy = lerp(y0, y1, u), rr = lerp(r0, r1, (k - 1 + u) / (pts.length - 1));
        g.shade(cx - rr, cy - rr, cx + rr, cy + rr, (x, y) => {
          const d = Math.hypot(x - cx, y - cy);
          if (d > rr) return 0;
          return y < cy - rr * 0.3 && x < cx + rr * 0.3 ? cols[2] : d > rr - 1 ? cols[0] : cols[1];
        });
      }
    }
  };
  const sw = Math.sin(ph) * 1.5;
  const L = [[-16, Y - 46], [-24, Y - 37 + sw], [-27, Y - 30 + sw]];
  tube(L, 3.8, 3, [S[1], S[3], S[4]]);
  g.ellipse(-24, Y - 37 + sw, 3, 2.4, Gd[3]); // gold vambrace at the elbow
  g.ellipse(-27.5, Y - 29 + sw, 3, 2.4, S[4]);
  // ---- the right arm: raised high, gripping the gavel's haft
  const hx = 27, hy = Y - 56 - lift;
  const R = [[16, Y - 46], [26, Y - 43 - lift * 0.4], [hx, hy]];
  tube(R, 3.8, 3.2, [S[1], S[3], S[4]]);
  g.ellipse(26, Y - 43 - lift * 0.4, 3, 2.4, Gd[3]);
  // the gavel: a long gold-banded haft, a heavy steel head crossing it near the top
  const tilt = -0.18 + Math.sin(ph) * 0.05 - lift * 0.01;
  const top = [hx + Math.sin(tilt) * 30, hy - Math.cos(tilt) * 30], bot = [hx - Math.sin(tilt) * 9, hy + Math.cos(tilt) * 9];
  for (let u = 0; u <= 1; u += 0.02) {
    const x = lerp(bot[0], top[0], u), y = lerp(bot[1], top[1], u), band = Math.abs(u - 0.12) < 0.03 || Math.abs(u - 0.62) < 0.03;
    g.set(x - 1, y, band ? Gd[4] : Gd[1]);
    g.set(x, y, band ? Gd[3] : Gd[2]);
    g.set(x + 1, y, band ? Gd[2] : Gd[1]);
  }
  g.ellipse(hx, hy, 3.2, 3, S[4]); // the gauntlet over the haft
  const [tx, ty] = top, ca = Math.cos(tilt), sa = Math.sin(tilt);
  g.shade(tx - 16, ty - 16, tx + 16, ty + 16, (x, y) => {
    const lx = (x - tx) * ca + (y - ty) * sa, ly = -(x - tx) * sa + (y - ty) * ca; // gavel-local: lx along the head
    if (Math.abs(lx) > 12.5 || Math.abs(ly) > 6.5) return 0;
    if (Math.abs(lx) > 10.5) return Math.abs(ly) > 5.5 ? 0 : Gd[ly < 0 ? 4 : 2]; // gold striking faces
    if (Math.abs(Math.abs(lx) - 6) < 1) return Gd[3]; // bands round the head
    const lit = -ly / 6.5 - lx / 30;
    if (ly < -5.5) return S[4]; // lit top edge
    return lit > 0.35 ? S[3] : lit > -0.25 ? S[2] : S[1];
  });
  g.outline(S[0]);
  return { HY, top, orb: [-29, Y - 26 + sw] };
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), S = fit(o.steel, 6), Gd = fit(o.gold, 5), V = fit(o.volt, 5), Cl = fit(o.cloud, 5), Cp = fit(o.cape, 4);
  const Y = bob(t, o.hover), ph = (t / D) * TAU;
  // the gavel rises slowly through the loop and drops with a crack of light near the end
  const u = (t / D) % 1, lift = u < 0.8 ? ease.inOutSine(u / 0.8) * 5 : 5 * (1 - (u - 0.8) / 0.2) ** 2;
  const slam = u > 0.8 && u < 0.9 ? 1 - (u - 0.8) / 0.1 : 0;
  // the halo: a gold ring behind the helm, arcs crawling round it
  const HY0 = Y - 62, HR = 19;
  p.glow(0, HY0, 30, V[1], 0.22);
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * TAU, x = Math.cos(a) * HR, y = HY0 + Math.sin(a) * HR;
    p.px(x, y, i % 20 === 0 ? Gd[4] : Gd[3]);
    p.px(x * 0.95, HY0 + Math.sin(a) * HR * 0.95, Gd[2]);
    p.px(x * 1.05, HY0 + Math.sin(a) * HR * 1.05, Gd[1]);
  }
  for (let k = 0; k < 3; k++) {
    const a0 = ph * (1 + k * 0.3) + k * 2.1, a1 = a0 + 0.9;
    arc(p, Math.cos(a0) * HR, HY0 + Math.sin(a0) * HR, Math.cos(a1) * HR, HY0 + Math.sin(a1) * HR, 6, V[2], 0, t, k + 1);
  }
  CAPE.clear();
  cape(CAPE, Cp, Gd, t, Y);
  CAPE.draw(p);
  const { HY, top, orb } = figure(BODY, S, Gd, V, Cl, t, Y, lift);
  BODY.draw(p);
  // the visor burns electric blue
  const blink = Math.abs(((t / D) % 1) - 0.4) < 0.02;
  p.glow(0, HY, 5, V[2], 0.5);
  if (!blink) for (let x = -5; x <= 5; x++) p.px(x, HY, Math.abs(x) < 2 ? V[4] : V[3]), Math.abs(x) < 4 && p.px(x, HY - 1, V[2]);
  p.glow(0, Y - 40, 6, V[2], 0.45 + 0.25 * Math.sin(ph * 3));
  // ball lightning in the open hand: a bright core with arcs licking out of it
  const [ox, oy] = orb;
  p.glow(ox, oy, 11, V[1], 0.55);
  p.disc(ox, oy, 3.5, V[3]);
  p.disc(ox - 0.5, oy - 0.5, 1.8, V[4]);
  for (let k = 0; k < 3; k++) {
    const a = ph * 2 + k * 2.1;
    arc(p, ox, oy, ox + Math.cos(a) * 9, oy + Math.sin(a) * 7, 4, V[2], 0, t, 10 + k);
  }
  // the gavel crackles; when it drops, a fork of lightning leaps off it
  arc(p, top[0] - 11, top[1] - 1, top[0] + 11, top[1] + 2, 5, V[2], 0, t, 20, 0.8);
  p.glow(top[0], top[1], 12 + slam * 10, V[1], 0.35 + slam * 0.5);
  if (slam > 0) {
    arc(p, top[0], top[1] - 4, top[0] - 4, top[1] - 40, 10, V[2], V[4], t, 30, slam);
    arc(p, top[0] + 2, top[1], top[0] + 22, top[1] + 30, 10, V[2], V[4], t, 31, slam);
  }
  // lightning flickers inside the cloud and sparks drift up off the armour
  if (Math.floor((t / D) * 7) % 3 === 0) arc(p, -12, Y - 10, 10, Y - 2, 6, V[2], 0, t, 40, 0.8);
  p.glow(0, Y - 8, 26, V[0], 0.25);
  for (let i = 0; i < 10; i++) {
    const w = ((t / D) * 1.5 + i * 0.1) % 1, x = Math.sin(i * 7.3) * 22 + Math.sin(w * 6 + i) * 3, y = Y - 6 - w * 70;
    if (w > 0.85) continue;
    p.px(x, y, i % 3 ? V[2] : V[3]);
    if (i % 3 === 0) p.glow(x, y, 3, V[1], 0.4 * (1 - w));
  }
}

export function drawBack(p, time, o) {
  const t = shift(time, D, o.seed), V = fit(o.volt, 5);
  shadow(p, 0, 0, 22, 4, hex("#0a0c1a"), 0.45);
  p.glow(0, -2, 36, V[0], 0.14 + 0.05 * Math.sin((t / D) * TAU * 2));
}
