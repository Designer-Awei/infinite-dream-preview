import { fit, hex, lerp, rng, TAU } from "../../core/index.js";
import { Grid, shift, shadow } from "./_lib.js";

// 风暴之灵 (云巅浮庭's region boss): a hooded storm spirit of churning cloud — a hood of lit cloud puffs round a dark
// face with two bright eyes, a body that tapers into a spinning funnel above a small dust whirl on the ground, two
// wind rings orbiting it, feathers circling, and lightning flickering inside the cloud.
export const meta = {
  name: "Tempest spirit",
  desc: "A floating storm spirit boss: a hood of churning lit cloud puffs round a dark face with two bright eyes, a body tapering into a spinning funnel over a dust whirl, wind rings orbiting, circling feathers and flickers of lightning inside.",
  tags: ["critter", "boss", "storm", "wind", "cloud", "float", "loop"],
  size: [136, 140],
  origin: [68, 128],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    cloud: ["#141a30", "#36406a", "#5a6a9a", "#8ea0cc", "#c8d6f0", "#ffffff"],
    eye: ["#1a5aa0", "#8ae8ff", "#ffffff"],
    volt: ["#5a6aff", "#c8e8ff"],
    feather: ["#9aa8d0", "#ffffff"],
    seed: 1,
  },
};

const D = meta.duration, G = new Grid(-62, -126, 124, 130);

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.cloud, 6), E = fit(o.eye, 3), ph = (t / D) * TAU, g = G;
  const hov = -Math.round(4 + Math.sin(ph) * 3);
  shadow(p, 0, 0, 22, 6, hex("#000000"), 0.25);
  // the wind rings behind the body (back halves)
  const ring = (cy, rx, ry, spin, a, front) => {
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * TAU + ph * spin, s = Math.sin(ang);
      if ((s > 0) !== front) continue;
      if ((i + Math.floor(ph * 3)) % 4 === 0) continue; // dashed streaks
      const x = Math.cos(ang) * rx, y = cy + s * ry;
      p.dot(Math.round(x), Math.round(y), hex(i % 3 ? o.cloud[4] : o.cloud[5]), a);
      p.dot(Math.round(x + Math.sign(Math.cos(ang + 1.6))), Math.round(y), hex(o.cloud[4]), a * 0.6);
    }
  };
  ring(-58 + hov, 50, 9, 1.0, 0.75, false);
  ring(-30 + hov, 36, 6, -1.5, 0.6, false);
  g.clear();
  // the funnel: puffs shrinking and spinning down to a point near the ground
  for (let k = 0; k < 9; k++) {
    const u = k / 8, a = ph * 3 + k * 0.9, r = lerp(16, 3.5, u);
    const x = Math.cos(a) * lerp(6, 2, u), y = lerp(-46, -10, u) + hov * (1 - u);
    g.ellipse(x, y, r, r * 0.8, (nx, ny) => {
      const l = -nx * 0.4 - ny * 0.8;
      return l > 0.45 ? C[4] : l > 0 ? C[3] : C[2];
    });
  }
  // the body / hood: a ring of big lit puffs round the head, churning
  const HY = -76 + hov, puffs = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + Math.sin(ph + i) * 0.08, rr = 12 + 2.5 * Math.sin(ph * 2 + i * 1.7);
    puffs.push([Math.cos(a) * 26, HY + Math.sin(a) * 22 + 4, rr]);
  }
  puffs.push([0, HY - 24, 14], [-16, HY - 18, 11], [16, HY - 18, 11], [0, HY + 22, 15]);
  puffs.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, rr] of puffs)
    g.shade(cx - rr, cy - rr, cx + rr, cy + rr, (x, y) => {
      const d = Math.hypot(x - cx, (y - cy) * 1.15) / rr;
      if (d > 1) return 0;
      const top = (cy - y) / rr - (x - cx) / rr * 0.35;
      return top > 0.5 ? C[5] : top > 0.1 ? C[4] : top > -0.4 ? C[3] : C[2];
    });
  // the face: a dark hollow in the hood with two bright eyes that narrow on a gust
  g.ellipse(0, HY + 2, 17, 15, (nx, ny) => (nx * nx + ny * ny > 0.82 ? C[1] : C[0]));
  const narrow = Math.sin(ph * 2) > 0.7 ? 1 : 2;
  for (const sd of [-1, 1]) {
    g.ellipse(sd * 7, HY + 1, 3.5, narrow, E[1]);
    g.set(sd * 7 - 1, HY + 1 - (narrow > 1 ? 1 : 0), E[2]);
  }
  // lightning inside the cloud: a jagged white line, on for a few frames each second
  const r = rng(Math.floor((t / D) * 6) * 97 + 5), on = r.next() < 0.55;
  if (on) {
    let x = -22 + r.next() * 44, y = HY - 22;
    for (let k = 0; k < 5; k++) {
      const nx2 = x + (r.next() - 0.5) * 10, ny2 = y + 5;
      g.line(x, y, nx2, ny2, C[5]);
      x = nx2; y = ny2;
      if (Math.abs(x) < 14 && y > HY - 12 && y < HY + 16) break; // (not across the face)
    }
  }
  g.outline(C[0]);
  g.draw(p);
  p.glow(0, HY + 1, 12, hex(o.eye[1]), 0.22);
  if (on) p.glow(0, HY - 14, 26, hex(o.volt[1]), 0.12);
  // front halves of the wind rings
  ring(-58 + hov, 50, 9, 1.0, 0.9, true);
  ring(-30 + hov, 36, 6, -1.5, 0.75, true);
  // feathers circling round it: small white quills, tilting as they go
  for (let i = 0; i < 4; i++) {
    const a = ph * 1.2 + (i / 4) * TAU, x = Math.cos(a) * 44, y = -70 + hov + Math.sin(a) * 14, front = Math.sin(a) > 0;
    const k = front ? 1 : 0.55, dx = Math.cos(a + 1.2), dy = Math.sin(a + 1.2) * 0.5;
    for (let s = -3; s <= 3; s++) p.dot(Math.round(x + dx * s), Math.round(y + dy * s), hex(s === -3 ? o.feather[0] : o.feather[1]), k);
    p.dot(Math.round(x + dx * 1 - dy), Math.round(y + dy * 1 + dx), hex(o.feather[0]), k);
  }
  // the dust whirl on the ground under the funnel tip
  for (let i = 0; i < 10; i++) {
    const a = ph * 4 + i * 0.63, rr = 5 + (i % 3) * 3;
    p.dot(Math.round(Math.cos(a) * rr), Math.round(-2 + Math.sin(a) * rr * 0.35), hex(o.cloud[4]), 0.7);
  }
}
