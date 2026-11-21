import { fit, hex, mix, clamp, lerp, ease, rng, TAU } from "../../core/index.js";
import { Grid, shift, shadow, lnoise } from "./_lib.js";

export const meta = {
  name: "Frost witch",
  desc: "A floating ice sorceress boss: a hooded robe that frays into mist, a crown of ice spikes, glowing eyes, and two hexagonal ice mirrors orbiting her.",
  tags: ["critter", "boss", "ice", "witch", "mage", "float", "loop"],
  size: [128, 136],
  origin: [64, 124],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#0a1020", "#1a2a52", "#2e4c8a", "#4f80c4", "#8cc0ec", "#d8f2ff"],
    robe: ["#0c0a1e", "#1e1a44", "#33307a", "#4c50a8", "#7884d4", "#b4bcf2"],
    glow: ["#0a3050", "#2a8ad0", "#6cd0ff", "#c8f4ff", "#ffffff"],
    hover: 26,
    seed: 1,
  },
};

const D = meta.duration;
const BODY = new Grid(-34, -110, 68, 104), MIR = new Grid(-14, -16, 28, 32);
const bob = (t, hover) => -hover - 3 * Math.sin((t / D) * TAU);

function figure(g, C, Rb, G, t, Y) {
  g.clear();
  const ph = (t / D) * TAU;
  // the robe: a long bell that narrows to a waist, its hem frays into wisps that trail and curl
  g.shade(-30, Y - 44, 30, Y + 26, (x, y) => {
    const v = (y - (Y - 44)) / 70; // 0 at the shoulders .. 1 at the hem
    if (v < 0 || v > 1) return 0;
    const half = lerp(9, 26, v ** 0.8) + 2.5 * Math.sin(v * 9 - ph * 2 + x * 0.1) * v;
    if (Math.abs(x) > half) return 0;
    // ragged hem: tongues of cloth reaching down
    const hem = 0.86 + 0.1 * Math.sin(x * 0.55 + ph) + 0.05 * Math.sin(x * 1.7 - ph * 2);
    if (v > hem) return 0;
    const fold = Math.sin(x * 0.45 + v * 2.2) > 0.55, lit = -x / half * 0.8 - v * 0.3;
    // the robe parts down the front over a dark ice gown patterned with diamonds
    const slit = v > 0.22 ? lerp(1, 8, (v - 0.22) / 0.78) : 0;
    if (Math.abs(x) < slit) {
      if (Math.abs(x) > slit - 1) return C[4];
      const dm = (Math.abs(x) + y * 0.9) % 6 < 1 || (Math.abs(x) - y * 0.9 + 600) % 6 < 1;
      return dm ? C[3] : C[1];
    }
    if (v > hem - 0.06) return C[5]; // frost-white trim on the hem
    if (v > hem - 0.1) return C[4];
    if (fold) return lit > 0.2 ? Rb[3] : Rb[1];
    return lit > 0.45 ? Rb[5] : lit > 0.05 ? Rb[4] : lit > -0.4 ? Rb[3] : Rb[2];
  });
  // a sash of ice crystals at the waist
  for (let x = -9; x <= 9; x += 3) g.set(x, Y - 26 + Math.abs(x) * 0.15, x < 0 ? C[5] : C[4]), g.set(x + 1, Y - 25 + Math.abs(x) * 0.15, C[3]);
  // the hood: a pointed cowl with a dark face, two glowing eyes that narrow now and then
  const HY = Y - 56;
  g.shade(-14, HY - 18, 14, HY + 14, (x, y) => {
    const v = (y - (HY - 18)) / 32, half = v < 0.35 ? lerp(2, 12, v / 0.35) : lerp(12, 10, (v - 0.35) / 0.65);
    if (v < 0 || v > 1 || Math.abs(x) > half) return 0;
    const fd = Math.hypot(x / 7.5, (y - HY - 3) / 7.5);
    if (fd < 1) return C[0];
    if (fd < 1.22) return fd < 1.1 ? C[5] : C[4]; // frost fur round the face
    const lit = -x / half;
    return lit > 0.4 ? Rb[5] : lit > -0.1 ? Rb[4] : lit > -0.6 ? Rb[3] : Rb[2];
  });
  const blink = Math.max(0, 1 - Math.abs(((t / D) % 1) - 0.62) / 0.03);
  for (const sx of [-3, 3]) {
    g.set(sx, HY + 2, G[4]);
    if (blink < 0.5) g.set(sx, HY + 1, G[3]), g.set(sx + Math.sign(sx), HY + 2, G[2]);
  }
  // the crown: a ring of ice spikes rising off the hood, tallest in the middle, lit on the left faces
  const spikes = [[-9, 7], [-5, 11], [0, 15], [5, 11], [9, 7]];
  for (const [sx, h] of spikes) {
    const base = HY - 12 + Math.abs(sx) * 0.3, tall = h + Math.sin(ph * 2 + sx) * 0.8;
    for (let yy = 0; yy < tall; yy += 0.5) {
      const w = 2.6 * (1 - yy / tall);
      for (let xx = -w; xx <= w; xx += 0.5) g.set(sx + xx, base - yy, xx < -0.3 ? C[5] : xx < 0.8 ? C[4] : C[3]);
    }
  }
  // ice pauldrons: a cluster of crystals on each shoulder
  for (const sd of [-1, 1]) for (const [dx, h] of [[0, 6], [3, 4], [-3, 3]]) {
    const bx = sd * (11 + dx * 0.6), by = Y - 42;
    for (let yy = 0; yy < h; yy += 0.5) {
      const w = 1.8 * (1 - yy / h);
      for (let xx = -w; xx <= w; xx += 0.5) g.set(bx + xx + sd * yy * 0.35, by - yy, xx < 0 ? C[5] : C[3]);
    }
  }
  // sleeves: arms out to the sides, hands open, frost gathering between the fingers
  for (const sd of [-1, 1]) {
    const lift = Math.sin(ph + sd) * 2;
    const pts = [[sd * 8, Y - 40], [sd * 17, Y - 34 + lift], [sd * 24, Y - 38 + lift * 1.5]];
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      for (let u = 0; u <= 1; u += 0.1) {
        const cx = lerp(x0, x1, u), cy = lerp(y0, y1, u), rr = lerp(4, 3, (k - 1 + u) / 2);
        g.shade(cx - rr, cy - rr, cx + rr, cy + rr, (x, y) => (Math.hypot(x - cx, y - cy) > rr ? 0 : y < cy - 1 ? Rb[4] : Rb[3]));
      }
    }
    g.ellipse(sd * 26, Y - 39 + lift * 1.5, 2, 2, C[5]);
  }
  // a gem at the throat clasping the robe
  g.ellipse(0, Y - 41, 2.4, 2.8, G[2]);
  g.set(-1, Y - 42, G[4]), g.set(0, Y - 42, G[3]);
  g.outline(C[0]);
  return { HY };
}

// a hexagonal ice mirror: a dark faceted pane with a bright bevel and a sliding glint
function mirror(g, C, G, t, k) {
  g.clear();
  const R = 9, tilt = 0.6 + 0.4 * Math.abs(Math.cos(k));
  g.shade(-R - 1, -R - 1, R + 1, R + 1, (x, y) => {
    const xx = x / tilt, a = Math.atan2(y, xx), d = Math.hypot(xx, y), e = R * Math.cos(Math.PI / 6) / Math.cos(((a % (TAU / 6)) + TAU / 6) % (TAU / 6) - Math.PI / 6);
    if (d > e) return 0;
    if (d > e - 1.6) return y < 0 ? C[5] : C[3];
    const gl = Math.abs(((xx + y * 0.6) - lerp(-14, 14, ((t / D) * 2) % 1))) < 1.4;
    return gl ? C[5] : d < e * 0.45 ? C[2] : C[1];
  });
  g.outline(C[0]);
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 6), Rb = fit(o.robe, 6), G = fit(o.glow, 5), Y = bob(t, o.hover);
  const ph = (t / D) * TAU;
  // the mirrors orbit on a tilted ring: the one behind is drawn first and dimmer
  const ms = [0, Math.PI].map((a0) => {
    const a = ph + a0;
    return { x: Math.cos(a) * 36, y: Y - 40 + Math.sin(a) * 8, z: Math.sin(a), a };
  });
  for (const m of ms.filter((m) => m.z < 0)) (mirror(MIR, [C[0], C[0], C[1], C[2], C[3], C[4]], G, t, m.a), MIR.draw(p, 1, m.x, m.y));
  const { HY } = figure(BODY, C, Rb, G, t, Y);
  BODY.draw(p);
  for (const m of ms.filter((m) => m.z >= 0)) (mirror(MIR, C, G, t, m.a), MIR.draw(p, 1, m.x, m.y), p.glow(m.x, m.y, 12, G[2], 0.35));
  // light: the eyes, frost in the hands, a cold pool round her and on the floor
  p.glow(0, HY + 2, 6, G[3], 0.6);
  p.glow(0, Y - 41, 6, G[3], 0.45 + 0.2 * Math.sin(ph * 2));
  p.glow(-26, Y - 39, 7, G[3], 0.5);
  p.glow(26, Y - 39, 7, G[3], 0.5);
  p.glow(0, Y - 30, 40, G[1], 0.22);
  // snow motes swirl down round her and frost mist trails off the hem
  for (let i = 0; i < 12; i++) {
    const u = ((t / D) + i * 0.083) % 1, a = i * 2.4 + u * TAU * 0.6, rr = 20 + (i % 4) * 5;
    const x = Math.cos(a) * rr, y = Y - 70 + u * 80 + Math.sin(a) * 4;
    p.px(x, y, i % 3 ? C[4] : C[5]);
    if (i % 3 === 0) p.glow(x, y, 3, G[2], 0.3 * (1 - u));
  }
  // frost crystals flake off the ragged hem and fall
  for (let i = 0; i < 7; i++) {
    const u = ((t / D) * 2 + i / 7) % 1, x = (i - 3) * 6 + Math.sin(u * 5 + i) * 2, y = Y + 16 + u * 22;
    if (u > 0.8) continue;
    p.px(x, y, C[5]);
    p.glow(x, y, 3, G[2], 0.35 * (1 - u));
  }
}

export function drawBack(p, time, o) {
  if (o.noShadow) return; // the mirror clones cast no shadow: that is how the real one gives herself away
  const t = shift(time, D, o.seed), G = fit(o.glow, 5);
  shadow(p, 0, 0, 18, 3.5, hex("#0a0e1a"), 0.45);
  p.glow(0, -2, 34, G[1], 0.12 + 0.04 * Math.sin((t / D) * TAU));
}
