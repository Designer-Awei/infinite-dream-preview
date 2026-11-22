// 梦境大陆 · 外围三大陆 (V6): the three outer continents' region bosses and the zones they leave about.
//   遗迹巨像 (遗迹沙海)   slow stone giant: fist slams with a shock ring, hurled boulders, quicksand pits, scorpions; a sand spiral at the end
//   菌母     (幽影森林)   slow waddling mushroom: spore rings, poison clouds on marked spots, root eruptions running at you, sprouts
//   风暴之灵 (云巅浮庭)   flier: wind gusts that blow you back, feather fans, wandering tornadoes, lightning on marked spots
// Zones: "warn" (a coloured ring filling in, then onEnd does the hit), "sandpit" (slows and drags you to its middle),
// "tornado" (wanders after the nearest player, hurts and flings on touch). render.js draws them.
import { dist, angTo, TAU } from "./util.js";
import { moveCircle } from "./map.js";
import { shoot, spawnBossAdds } from "./enemies.js";

/** start a skill pose (render.js plays the boss's cast strip once from now) */
const pose = (g, e, name = "cast") => ((e.pose = name), (e.poseAt = g.time));
const phaseOf = (e) => {
  const f = e.hp / e.maxHp;
  return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
};
function newPhase(g, e, lines, col, adds) {
  const ph = phaseOf(e);
  if (e.phase === ph) return ph;
  const first = e.phase == null;
  e.phase = ph;
  if (!first && g.host) {
    g.text(e.x, e.y - 130, lines[ph - 2], col, 1.6, 1.5);
    g.sound("boss");
    if (adds) spawnBossAdds(g, e, adds[ph - 2]);
  }
  return ph;
}
/** a warning ring on the ground that fills in over `life` s, then fires `hit` */
export function warn(g, x, y, r, life, col, hit) {
  return g.addZone({ kind: "warn", x, y, r, life, max: life, col, side: "e", onEnd: hit });
}
const hurtIn = (g, z, dmg, src, then) => {
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, z.x, z.y) < z.r + 6 && g.hurt(q, dmg, { src, x: z.x, y: z.y })) then && then(q);
};
export function sandPull(z, dt) {
  for (const q of z.g.alivePlayers()) {
    const d = dist(q.x, q.y, z.x, z.y);
    if (d > z.r || q.dashT > 0) continue;
    q.buff.slow = Math.max(q.buff.slow || 0, 0.25);
    if (d > 6) { const a = angTo(q.x, q.y, z.x, z.y); moveCircle(z.g.map, q, Math.cos(a) * 34 * dt, Math.sin(a) * 34 * dt, false); }
  }
}
export function sandpit(g, x, y, r, life) {
  return g.addZone({ kind: "sandpit", x, y, r, life, max: life, side: "e", update: sandPull });
}
function tornadoTick(z, dt) {
  const g = z.g;
  let best = null, bd = 1e9;
  for (const q of g.alivePlayers()) { const d = dist(q.x, q.y, z.x, z.y); if (d < bd) (bd = d), (best = q); }
  if (best) {
    const a = angTo(z.x, z.y, best.x, best.y) + Math.sin(z.t * 2 + z.id) * 0.7;
    z.x += Math.cos(a) * z.spd * dt;
    z.y += Math.sin(a) * z.spd * dt;
  }
  for (const q of g.alivePlayers()) {
    if (dist(q.x, q.y, z.x, z.y) > z.r + 8 || (q.flungT || 0) > g.time) continue;
    if (g.hurt(q, 1, { src: z, x: z.x, y: z.y })) {
      q.flungT = g.time + 0.9;
      const a = angTo(z.x, z.y, q.x, q.y);
      for (let k = 0; k < 6; k++) g.after(k * 0.04, () => moveCircle(g.map, q, Math.cos(a) * 14, Math.sin(a) * 14, false));
    }
  }
}

// ----------------------------------------------------------------- 遗迹巨像
export function bossColossus(g, e, p, d, dt) {
  const ph = newPhase(g, e, ["岩层苏醒！", "沙暴之心！"], "#ffc23a", [["scorpion", "scorpion", "bat_sand"], ["scorpion", "scorpion_king", "bat_sand"]]);
  const k = ph === 3 ? 1.3 : ph === 2 ? 1.12 : 1;
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 10) g.hurt(q, 1, e);
  if (e.st === "spiral") {
    // 沙暴之心: a slow sand spiral pouring out of the rune core
    e.spT -= dt;
    if ((e.spCd = (e.spCd || 0) - dt) <= 0) {
      e.spCd = 0.13;
      e.spA = (e.spA || 0) + 0.38;
      for (let i = 0; i < 3; i++) shoot(g, e, e.spA + (i / 3) * TAU, { spd: 115, h: 60, r: 6 });
    }
    if (e.spT <= 0) (e.st = "idle"), (e.cd = 1.6);
    return;
  }
  if (e.cd > 0) {
    // trudges after you
    if (d > e.r + 40 && !(e.pose && g.time - e.poseAt < 1.1)) { const a = angTo(e.x, e.y, p.x, p.y); moveCircle(g.map, e, Math.cos(a) * e.def.spd * k * dt, Math.sin(a) * e.def.spd * k * dt, false); }
    return;
  }
  if (!g.host) return;
  const opts = ["slam", "boulders", "slam", "pits"];
  if (ph >= 2) opts.push("boulders", "summon");
  if (ph >= 3) opts.push("spiral", "spiral");
  const pick = opts[(Math.random() * opts.length) | 0];
  if (pick !== "slam") pose(g, e);
  if (pick === "slam") {
    // both fists come down round it: a big ring, then a shock ring of sand outward (the slam pose's impact frame,
    // about 0.45 s in, lands when the ring fills)
    const R = 96;
    g.after(Math.max(0, 1.0 / k - 0.45), () => !e.dead && pose(g, e));
    warn(g, e.x, e.y, R, 1.0 / k, "#ffb03a", (z) => {
      g.vfx("explosions/dirt-explosion", z.x, z.y, {});
      g.shake = Math.max(g.shake, 6);
      g.sound("explode", 0.5);
      hurtIn(g, z, 2, e, (q) => (q.buff.slow = 1.2));
      const n = ph === 1 ? 14 : 20;
      for (let i = 0; i < n; i++) shoot(g, e, (i / n) * TAU + Math.random() * 0.1, { spd: 125, h: 14, r: 6 });
    });
    e.cd = 2.0 / k;
  } else if (pick === "boulders") {
    // hurled boulders: three (five) marked spots round you, each leaving a patch of quicksand
    const n = ph >= 2 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, rr = i ? 30 + Math.random() * 70 : 0;
      g.after(i * 0.12, () => warn(g, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.7, 30, 1.1, "#ff8a3a", (z) => {
        g.vfx("nature/earth-spike", z.x, z.y, {});
        g.sound("explode", 0.15);
        hurtIn(g, z, 1, e);
        if (Math.random() < 0.5) sandpit(g, z.x, z.y, 30, 4);
      }));
    }
    e.cd = 2.2 / k;
  } else if (pick === "pits") {
    // 流沙陷阱: quicksand opens under and round you
    g.text(e.x, e.y - 130, "流沙陷阱！", "#ffd070", 1.2, 1);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.random(), rr = i ? 70 : 0;
      sandpit(g, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.6, 44, 5.5);
    }
    e.cd = 1.8 / k;
  } else if (pick === "summon") {
    spawnBossAdds(g, e, ["scorpion", "scorpion"]);
    e.cd = 1.6;
  } else {
    e.st = "spiral";
    e.spT = 3.2;
    g.text(e.x, e.y - 130, "沙暴之心！", "#ffc23a", 1.2, 1);
  }
}

// ----------------------------------------------------------------- 菌母
export function bossMyco(g, e, p, d, dt) {
  const ph = newPhase(g, e, ["孢子繁盛！", "菌潮！"], "#7ae0c8", [["mushroom_shadow", "mushroom_shadow", "moth"], ["mushroom_shadow", "mushroom_shadow", "moth", "moth"]]);
  const k = ph === 3 ? 1.3 : ph === 2 ? 1.12 : 1;
  e.face = p.x < e.x ? -1 : 1;
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 12) g.hurt(q, 1, e);
  if (e.cd > 0) {
    // waddles slowly after you between spells (not while a spell pose is playing)
    if (d > e.r + 70 && !(e.pose && g.time - e.poseAt < 1.1)) { const a = angTo(e.x, e.y, p.x, p.y); moveCircle(g.map, e, Math.cos(a) * e.def.spd * k * dt, Math.sin(a) * e.def.spd * k * dt, false); }
    return;
  }
  if (!g.host) return;
  const opts = ["spores", "clouds", "roots", "spores"];
  if (ph >= 2) opts.push("sprout", "roots");
  if (ph >= 3) opts.push("bloom", "bloom");
  const pick = opts[(Math.random() * opts.length) | 0];
  pose(g, e);
  if (pick === "spores") {
    // rings of slow spores, the second turned half a step
    const n = ph === 1 ? 14 : 18;
    for (let w = 0; w < (ph >= 2 ? 3 : 2); w++)
      g.after(w * 0.45, () => {
        if (e.dead) return;
        for (let i = 0; i < n; i++) shoot(g, e, ((i + w * 0.5) / n) * TAU, { spd: 92 * k, h: 70, r: 6, kind: "ghost", slow: true });
      });
    g.vfx("nature/spore-burst", e.x, e.y - 70, {});
    g.sound("shoot_water", 0.2);
    e.cd = 1.9 / k;
  } else if (pick === "clouds") {
    // 瘴气: poison clouds settle on marked spots round you
    const n = ph >= 2 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random(), rr = i ? 60 + Math.random() * 40 : 0;
      warn(g, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.6, 36, 1.0, "#6fd23a", (z) => {
        g.addZone({ kind: "poison", x: z.x, y: z.y, r: 36, life: 5, side: "neutral" });
        g.vfx("nature/spore-burst", z.x, z.y - 6, {});
      });
    }
    e.cd = 2.0 / k;
  } else if (pick === "roots") {
    // root eruptions running out at you, one after another along the line
    const a = angTo(e.x, e.y, p.x, p.y), lines = ph >= 2 ? [-0.35, 0, 0.35] : [0];
    for (const off of lines)
      for (let s = 1; s <= 8; s++) {
        const x = e.x + Math.cos(a + off) * (30 + s * 38), y = e.y + Math.sin(a + off) * (30 + s * 38);
        g.after(s * 0.09, () => warn(g, x, y, 22, 0.55, "#8ae080", (z) => {
          g.vfx("nature/earth-spike", z.x, z.y, {});
          hurtIn(g, z, 1, e, (q) => (q.buff.slow = 0.8));
        }));
      }
    g.sound("explode", 0.1);
    e.cd = 2.3 / k;
  } else if (pick === "sprout") {
    spawnBossAdds(g, e, ["mushroom_shadow", "mushroom_shadow"]);
    e.cd = 1.5;
  } else {
    // 菌潮: a spiral of spores and a poison ring round its foot
    g.text(e.x, e.y - 130, "菌潮！", "#7ae0c8", 1.2, 1);
    for (let i = 0; i < 26; i++) g.after(i * 0.08, () => !e.dead && shoot(g, e, i * 0.52, { spd: 120, h: 70, r: 6, kind: "ghost", slow: true }));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.addZone({ kind: "poison", x: e.x + Math.cos(a) * 70, y: e.y + Math.sin(a) * 44, r: 26, life: 4, side: "neutral" }); }
    e.cd = 2.8;
  }
}

// ----------------------------------------------------------------- 风暴之灵
export function bossTempest(g, e, p, d, dt) {
  const ph = newPhase(g, e, ["狂风骤起！", "雷暴降临！"], "#bfe8ff", [["skylark", "skylark", "wisp_cloud"], ["skylark", "skylark", "wisp_cloud", "wisp_cloud"]]);
  const k = ph === 3 ? 1.3 : ph === 2 ? 1.12 : 1, c = g.map.center || e;
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 10) g.hurt(q, 1, e);
  // drifts a loop round its arena (not while it gusts)
  if (e.st !== "gust") {
    const tx = c.x + Math.sin(e.t * 0.45) * 150, ty = c.y - 20 + Math.cos(e.t * 0.6) * 60, a0 = angTo(e.x, e.y, tx, ty);
    if (dist(e.x, e.y, tx, ty) > 6) moveCircle(g.map, e, Math.cos(a0) * e.def.spd * k * dt, Math.sin(a0) * e.def.spd * k * dt, true);
    e.face = p.x < e.x ? -1 : 1;
  }
  if (e.st === "gust") {
    // the gust itself: everyone in front is blown away from it
    e.gT -= dt;
    for (const q of g.alivePlayers()) {
      const a = angTo(e.x, e.y, q.x, q.y), off = Math.abs(((a - e.gA + Math.PI * 3) % TAU) - Math.PI);
      if (off < 0.6 && dist(q.x, q.y, e.x, e.y) < 300 && !(q.dashT > 0)) moveCircle(g.map, q, Math.cos(e.gA) * 260 * dt, Math.sin(e.gA) * 260 * dt, false);
    }
    if (e.gT <= 0) (e.st = "idle"), (e.cd = 1.2 / k);
    return;
  }
  if (e.cd > 0 || !g.host) return;
  const opts = ["gust", "feathers", "feathers", "tornado"];
  if (ph >= 2) opts.push("volt", "tornado");
  if (ph >= 3) opts.push("volt", "volt");
  const pick = opts[(Math.random() * opts.length) | 0];
  pose(g, e);
  if (pick === "gust") {
    const a = angTo(e.x, e.y, p.x, p.y);
    g.addZone({ kind: "cone", x: e.x, y: e.y, r: 300, life: 0.7, side: "e", a0: a, half: 0.6, col: "#bfe8ff", onEnd: () => {
      if (e.dead) return;
      e.st = "gust";
      e.gT = 0.75;
      e.gA = a;
      for (let i = -3; i <= 3; i++) shoot(g, e, a + i * 0.12, { spd: 200, h: 40, r: 5, kind: "ghost" });
      g.sound("dash", 0.3);
    } });
    e.cd = 9;
  } else if (pick === "feathers") {
    for (let w = 0; w < 3; w++)
      g.after(w * 0.32, () => {
        if (e.dead) return;
        const q = g.alivePlayers()[0] || p, a = angTo(e.x, e.y - 40, q.x, q.y - 16), n = ph >= 2 ? 7 : 5;
        for (let i = 0; i < n; i++) shoot(g, e, a + (i - (n - 1) / 2) * 0.16, { spd: 175 * k, h: 50, r: 5, kind: "ghost" });
      });
    g.sound("shoot_ink", 0.2);
    e.cd = 1.7 / k;
  } else if (pick === "tornado") {
    const n = ph >= 2 ? 3 : 2, live = g.zones.filter((z) => z.kind === "tornado").length;
    for (let i = 0; i < Math.min(n, 4 - live); i++) {
      const a = (i / n) * TAU + Math.random();
      g.addZone({ kind: "tornado", x: e.x + Math.cos(a) * 60, y: e.y + Math.sin(a) * 40, r: 18, life: 6.5, max: 6.5, spd: 62 * k, side: "e", update: tornadoTick });
    }
    g.text(e.x, e.y - 130, "龙卷！", "#bfe8ff", 1.1, 0.9);
    e.cd = 2.2 / k;
  } else {
    // 雷暴: lightning strikes on spots marked round every player
    for (const q of g.alivePlayers())
      for (let i = 0; i < (ph >= 3 ? 4 : 3); i++) {
        const a = Math.random() * TAU, rr = i ? 40 + Math.random() * 60 : 0;
        g.after(i * 0.18, () => warn(g, q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr * 0.6, 28, 0.9, "#8ad0ff", (z) => {
          g.vfx("lightning/lightning-strike", z.x, z.y, {});
          g.sound("explode", 0.12);
          hurtIn(g, z, 1, e);
        }));
      }
    e.cd = 2.2 / k;
  }
}
