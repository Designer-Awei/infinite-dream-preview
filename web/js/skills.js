// The six girls' kits: normal attacks, small skills (K) and ultimates (L), plus fusion bullets.
import { CHARS, ELEM } from "./data.js";
import { dist, angTo, TAU } from "./util.js";
import { BLOCKS_SHOT, WALL, tileAt, moveCircle } from "./map.js";
import { mountedAttack, mountedUlt, overheadY } from "./pets.js";

const MUZZLE = 20; // bullets leave from chest height

function baseBullet(g, p, cid, a, o = {}) {
  const c = CHARS[cid], at = c.atk, s = p.st;
  return g.mkBullet(p, {
    x: p.x + Math.cos(a) * 10, y: p.y - MUZZLE + Math.sin(a) * 6, h: MUZZLE - Math.sin(a) * 6, a,
    spd: at.spd * s.bspd, dmg: at.dmg * (o.dmgK || 1), elem: o.elem || c.elem, kind: cid, r: at.size * s.size,
    life: ((at.range * s.range) / (at.spd * s.bspd)) * 1.25, pierce: (at.pierce || 0) + s.pierce + (o.pierce || 0), bounce: s.bounce,
    splash: at.splash || 0, splashDmg: at.splashDmg || 0, fusion: o.fusion, from: cid,
  });
}
const atkBullet = (...a) => Object.assign(baseBullet(...a), { atk: true });

/** one trigger of the normal attack */
export function fireAttack(g, p, a, target) {
  if (mountedAttack(g, p, a, target)) return;
  const c = CHARS[p.cid], s = p.st;
  p.atkCount++;
  let elem = c.elem;
  if (p.buff.infuse > 0 && p.infuseElem && p.atkCount % 2 === 0) elem = p.infuseElem;
  const n = 1 + s.multi, k = n > 1 ? 0.8 : 1;
  // GPT ult: piercing dragon beam (hitscan)
  if (p.cid === "gpt" && p.buff.ultOn > 0) {
    const len = c.atk.range * s.range * 1.1, x0 = p.x, y0 = p.y - MUZZLE;
    let x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    // full pierce: crates and barrels on the path all take the hit and the beam goes on; only a wall stops it
    const crossed = new Set();
    for (let d = 8; d < len; d += 4) {
      const x = x0 + Math.cos(a) * d, y = y0 + Math.sin(a) * d, t = tileAt(g.map, x, y);
      if (t === WALL) {
        x1 = x;
        y1 = y;
        break;
      }
      const ti = Math.floor(y / 32) * g.map.W + Math.floor(x / 32);
      if (BLOCKS_SHOT(t) && !crossed.has(ti)) {
        crossed.add(ti);
        if (g.host && g.map.crates[ti]) g.damageTile(ti, c.atk.dmg * 1.6 * k, p);
      }
    }
    g.line(x0, y0, x1, y1, "#e8dcff", 4, 0.12, "beam");
    for (const e of g.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (segDist(e.x, e.y - e.r, x0, y0, x1, y1) < e.r + 6) {
        let dmg = c.atk.dmg * 1.6 * k;
        if (e.marks.dragon > g.time) dmg += 6;
        if (g.host) g.hit(e, dmg, { p, elem });
      }
    }
    g.sound("shoot_dragon", 0.05);
    return;
  }
  for (let i = 0; i < n; i++) {
    const aa = a + (i - (n - 1) / 2) * 0.13;
    g.bullets.push(atkBullet(g, p, p.cid, aa, { dmgK: k, elem, pierce: p.cid === "grok" && p.buff.ultOn > 0 ? 1 : 0 }));
  }
  // Grok ult side shots
  if (p.cid === "grok" && p.buff.ultOn > 0) for (const d of p.core ? [-0.16, 0.16] : [-0.5, 0.5]) g.bullets.push(atkBullet(g, p, "grok", a + d, { dmgK: p.core ? 0.8 : 0.5 }));
  // SSR 模型集成: every 4th attack adds a 3-bullet spread
  if (p.kit && p.kit.eq && p.kit.eq.t_ensemble && p.atkCount % 4 === 0)
    for (const d of [-0.32, 0, 0.32]) g.bullets.push(atkBullet(g, p, p.cid, a + d, { dmgK: 0.4, elem }));
  // SSR 思维链: every 5th attack a lightning arc jumps between up to 4 enemies (60% damage each)
  if (g.host && p.kit && p.kit.eq && p.kit.eq.t_chain && p.atkCount % 5 === 0) {
    const hitSet = new Set();
    let fx = p.x, fy = p.y - MUZZLE, reach = 230;
    for (let j = 0; j < 4; j++) {
      let best = null, bd = reach;
      for (const e of g.enemies) {
        if (e.dead || e.spawnT > 0 || hitSet.has(e)) continue;
        const d = Math.hypot(e.x - fx, e.y - e.r - fy);
        if (d < bd) (bd = d), (best = e);
      }
      if (!best) break;
      hitSet.add(best);
      const tx = best.x, ty = best.y - best.r;
      g.line(fx, fy, tx, ty, "#bfe8ff", 2, 0.22, "zap");
      g.hit(best, c.atk.dmg * 0.6 * k, { p, elem: "thunder", noReact: true });
      (fx = tx), (fy = ty), (reach = 150);
    }
  }
  // fusion: every 3rd attack fires the other girls' bullets
  if (p.fusions.length && p.atkCount % 3 === 0)
    for (const fid of p.fusions) {
      const fa = target ? angTo(p.x, p.y - MUZZLE, target.x, target.y - (target.r || 12)) : a;
      g.bullets.push(atkBullet(g, p, fid, fa, { dmgK: 0.9, fusion: true, elem: CHARS[fid].elem }));
    }
  g.sound("shoot_" + c.elem, 0.05);
}

function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

/** a player bullet touched an enemy */
export function onBulletHit(g, b, e, p) {
  const kind = b.kind, src = { p, elem: b.elem, noReact: b.noReact, x: b.x - b.vx * 0.05, y: b.y - b.vy * 0.05 };
  let dmg = b.dmg;
  if (b.wave) {
    // DeepSeek wave
    g.hit(e, dmg, src);
    e.slowT = 2;
    e.slowK = 0.4;
    g.knock(e, b.x - b.vx, b.y - b.vy, 260);
    return;
  }
  if (kind === "glm" && e.inkMark > g.time && e.inkCd < g.time) {
    dmg += 4;
    e.inkCd = g.time + 1;
    g.fx.spawn("impacts/hit-spark", e.x, e.y - e.r, { palette: ELEM.ink.ramp.slice(1) });
  }
  g.hit(e, dmg, src);
  if (e.dead && !e.boss) return;
  switch (kind) {
    case "deepseek": {
      // tide marks: 3 hits on the same target -> water burst
      if (e.tideBy !== p?.id) (e.tide = 0), (e.tideBy = p?.id);
      e.tide++;
      if (e.tide >= 3) {
        e.tide = 0;
        g.vfx("water/splash", e.x, e.y + 2, { palette: ELEM.water.ramp, opts: { stone: false }, speed2: 1.4 });
        for (const o of g.enemiesNear(e.x, e.y, 30)) g.hit(o, 7, { p, elem: "water", noReact: o === e });
      }
      break;
    }
    case "gpt":
      if (b.splash) {
        g.fx.spawn("impacts/hit-spark", b.x, b.y, { palette: ELEM.dragon.ramp.slice(1), light: 0.8 });
        for (const o of g.enemiesNear(b.x, b.y + e.r, b.splash)) if (o !== e) g.hit(o, b.splashDmg, { p, elem: "dragon", noCrit: true });
      }
      break;
    case "claude":
      if (b.fusion) break;
      e.sun = (e.sun || 0) + 1;
      if (e.sun >= 4) {
        e.sun = 0;
        g.vfx("holy/sunburst", e.x, e.y - e.r, { palette: ELEM.sun.ramp, life: 0.45 });
        for (const o of g.enemiesNear(e.x, e.y, 34)) g.hit(o, 10, { p, elem: "sun", noReact: true });
        if (p && p.sunCd < g.time) (p.sunCd = g.time + 2), (p.shield = Math.min(p.maxShield, p.shield + 1));
      }
      break;
    case "doubao":
      if (e.bubble > g.time) {
        e.bubble = 0;
        g.fx.spawn("pickups/collect-burst", e.x, e.y - e.r, { palette: ELEM.bubble.ramp });
        g.hit(e, CHARS.doubao.atk.pop, { p, elem: "bubble", noReact: true });
      } else e.bubble = g.time + 3;
      break;
    case "grok":
      break;
    case "sunbolt":
      break;
  }
}

/** small skill (K). power < 1 when cast through a skill-link card */
export function castSkill(g, p, cid, a, target, pw = 1) {
  const tx = target ? target.x : p.x + Math.cos(a) * 140, ty = target ? target.y : p.y + Math.sin(a) * 140;
  if (target) a = angTo(p.x, p.y, target.x, target.y);
  const pal = ELEM[CHARS[cid].elem].ramp;
  switch (cid) {
    case "deepseek": {
      const b = g.mkBullet(p, { x: p.x, y: p.y - 14, h: 14, a, spd: 270, dmg: 10 * pw, elem: "water", kind: "wave", r: 24, life: 0.75, pierce: 99 });
      b.wave = true;
      g.bullets.push(b);
      g.vfx("water/splash", p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 10, { palette: pal, opts: { stone: false }, speed2: 1.8 });
      const sh = pw < 1 ? 1 : 2;
      for (const q of g.alivePlayers()) if (dist(q.x, q.y, p.x, p.y) < 110) {
        q.shield = Math.min(q.maxShield, q.shield + sh);
        g.vfx("holy/divine-shield", q.x, q.y, { palette: pal, follow: q, life: 1 });
      }
      break;
    }
    case "gpt": {
      // 龙跃突刺: she leaps forward along the aim (≈115 px, invulnerable), every foe on the path takes a thrust
      // and a 灼印; non-boss foes are caught on the spearhead and dragged along to the landing spot (bosses are
      // flung aside), where the dragon flame bursts on the whole pile.
      p.dashDx = Math.cos(a);
      p.dashDy = Math.sin(a);
      p.dashT = 0.22;
      p.lastDash = g.time;
      p.invuln = Math.max(p.invuln, 0.34);
      p.face = a;
      const hit = new Set(), held = [];
      // the spot held foes are pulled to: just ahead of the spearhead, a little fanned out so they don't stack
      const tip = (i) => {
        const sp = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 7;
        return { x: p.x + Math.cos(a) * 18 - Math.sin(a) * sp, y: p.y + Math.sin(a) * 12 + Math.cos(a) * sp };
      };
      let landed = false;
      const pull = (dt, k) => !landed && held.forEach((e, i) => {
        if (e.dead) return;
        const t = tip(i);
        e.kbx = e.kby = 0;
        e.stunT = Math.max(e.stunT || 0, 0.35);
        moveCircle(g.map, e, (t.x - e.x) * k, (t.y - e.y) * k, !!e.def.fly);
      });
      g.addZone({
        kind: "lance", x: p.x, y: p.y, r: 0, life: 0.3, side: "p", owner: p.id,
        update: (z, dt) => {
          for (const e of g.enemies) {
            if (e.dead || e.spawnT > 0 || hit.has(e) || dist(p.x, p.y - 10, e.x, e.y - e.r) > e.r + 24) continue;
            hit.add(e);
            g.hit(e, 9 * pw, { p, elem: "dragon" });
            g.fx.spawn("impacts/hit-spark", e.x, e.y - e.r, { angle: a + Math.PI, palette: pal.slice(1, 8), light: 0.8, opts: { height: 0 } });
            if (!e.boss) held.push(e);
            else {
              // bosses can't be carried: flung to the side of her path
              const side = Math.sign(Math.cos(a) * (e.y - p.y) - Math.sin(a) * (e.x - p.x)) || 1;
              g.knock(e, e.x + Math.sin(a) * side * 20, e.y - Math.cos(a) * side * 20, 240);
            }
          }
          pull(dt, Math.min(1, dt * 30));
          if (g.pvp) for (const o of g.players) if (o !== p && !o.downed && !hit.has(o) && dist(p.x, p.y, o.x, o.y) < 30) (hit.add(o), g.hit(o, 9 * pw, { p }));
        },
      });
      g.after(0.24, () => {
        if (p.dead || p.downed) return;
        pull(0, 1); // the pile lands with her, then is let go
        landed = true;
        const bx = p.x + Math.cos(a) * 16, by = p.y - 8 + Math.sin(a) * 12;
        g.vfx("explosions/plasma-explosion", bx, by, { palette: pal, life: 0.4 });
        g.line(bx, by, bx, by, ELEM.dragon.glow, 30, 0.3, "spark");
        for (const o of g.enemiesNear(bx, by, 54)) g.hit(o, 12 * pw, { p, elem: "dragon" });
        if (g.pvp) for (const o of g.players) if (o !== p && !o.downed && dist(bx, by, o.x, o.y) < 54) g.hit(o, 12 * pw, { p });
        g.hitTilesIn(bx, by, 54, 14 * pw, p);
        g.shake = Math.max(g.shake || 0, 4);
        g.sound("shoot_dragon", 0.05);
      });
      break;
    }
    case "grok": {
      let dx = p.input.mx, dy = p.input.my;
      if (Math.hypot(dx, dy) < 0.1) (dx = Math.cos(a)), (dy = Math.sin(a));
      const l = Math.hypot(dx, dy);
      p.dashDx = dx / l;
      p.dashDy = dy / l;
      p.dashT = 0.2;
      p.invuln = Math.max(p.invuln, 0.3);
      g.after(0.12, () => {
        const tg = p.target;
        const aa = tg ? angTo(p.x, p.y - 18, tg.x, tg.y - 10) : a;
        for (let i = 0; i < 5; i++) {
          const b = g.mkBullet(p, { x: p.x, y: p.y - 18, h: 18, a: aa + (i - 2) * 0.2, spd: 330, dmg: 5 * pw, elem: "thunder", kind: "grokb", r: 4, life: 0.9, bounce: 3 });
          g.bullets.push(b);
        }
        g.sound("shoot_thunder");
      });
      g.vfx("lightning/zap-hit", p.x, p.y - 16, { palette: pal });
      break;
    }
    case "claude": {
      for (const q of g.alivePlayers()) if (dist(q.x, q.y, p.x, p.y) < 120) {
        q.barrier = 5;
        g.vfx("holy/divine-shield", q.x, q.y, { palette: pal, follow: q, life: 5 });
      }
      if (pw < 1) p.barrier = Math.min(p.barrier, 3);
      break;
    }
    case "doubao": {
      const x0 = p.x, y0 = p.y - 16, d = Math.min(170, dist(p.x, p.y, tx, ty));
      const ex = p.x + Math.cos(a) * d, ey = p.y + Math.sin(a) * d;
      const b = g.mkBullet(p, { x: x0, y: y0, a, spd: 0, dmg: 10 * pw, elem: "bubble", kind: "lob", r: 8, life: 2 });
      b.arcTo = { x0, y0, x: ex, y: ey, dur: 0.5 };
      b.onLand = (bb) => {
        g.vfx("water/splash", bb.x, bb.y, { palette: ELEM.bubble.ramp, opts: { stone: false }, speed2: 1.5 });
        g.sound("shoot_bubble");
        for (const e of g.enemiesNear(bb.x, bb.y, 42)) g.hit(e, 10 * pw, { p, elem: "bubble" });
        if (p.orbs < 3) {
          p.orbs++;
          g.pickups.push({ id: g.players.length * 0 + Math.random() * 1e9 | 0, kind: "orb", owner: p.id, x: bb.x, y: bb.y, vx: 0, vy: 0, z: 0, vz: 80, t: 0, life: 12 });
        }
      };
      g.bullets.push(b);
      break;
    }
    case "glm": {
      const d = Math.min(190, dist(p.x, p.y, tx, ty)), cx = p.x + Math.cos(a) * d, cy = p.y + Math.sin(a) * d;
      p.buff.inkHaste = 2;
      const fh = g.vfx("arcane/rune-circle", cx, cy + 6, { palette: pal, layer: "back", life: 3 });
      g.addZone({
        kind: "inkcircle", x: cx, y: cy, r: 54, life: 3, side: "p", owner: p.id,
        update: (z, dt) => {
          z.tick += dt;
          for (const e of g.enemiesNear(z.x, z.y, z.r)) if (!e.boss) (e.slowT = 0.3), (e.slowK = 0.5);
          if (z.tick < 0.5) return;
          z.tick = 0;
          for (const e of g.enemiesNear(z.x, z.y, z.r)) {
            g.hit(e, 3 * pw, { p, elem: "ink", noCrit: true });
            e.inkMark = g.time + 4;
          }
        },
      });
      break;
    }
  }
}

/** ultimate (L) */
export function castUlt(g, p, a, target) {
  if (mountedUlt(g, p, a, target)) return;
  const pal = ELEM[CHARS[p.cid].elem].ramp;
  const tx = target ? target.x : p.x + Math.cos(a) * 130, ty = target ? target.y : p.y + Math.sin(a) * 130;
  g.text(p.x, overheadY(p), CHARS[p.cid].ult.name, ELEM[CHARS[p.cid].elem].glow, 1.5, 1.2);
  switch (p.cid) {
    case "deepseek": {
      const d = Math.min(200, dist(p.x, p.y, tx, ty)), aa = angTo(p.x, p.y, tx, ty), cx = p.x + Math.cos(aa) * d, cy = p.y + Math.sin(aa) * d;
      g.addZone({ kind: "whale", x: cx, y: cy, r: 66, life: 0.55, side: "p" });
      g.after(0.55, () => {
        g.vfx("water/splash", cx, cy + 4, { palette: pal, opts: { stone: false } });
        g.shake = Math.max(g.shake, 10);
        g.sound("explode");
        for (const e of g.enemiesNear(cx, cy, 66)) (g.hit(e, 30, { p, elem: "water" })), g.knock(e, cx, cy, 260);
        if (g.pvp) for (const o of g.players) if (o !== p && dist(o.x, o.y, cx, cy) < 66) g.hit(o, 30, { p });
        const radius = p.core ? 90 : 72, life = p.core ? 8 : 5;
        const fh = g.vfx("water/whirlpool", cx, cy, { palette: pal, layer: "back", radius, life });
        g.addZone({
          kind: "tide", x: cx, y: cy, r: radius, life, fxh: fh, side: "p", owner: p.id, sh: 0,
          update: (z, dt) => {
            z.tick += dt;
            z.sh += dt;
            if (z.tick >= 0.5) {
              z.tick = 0;
              for (const e of g.enemiesNear(z.x, z.y, z.r)) g.hit(e, 4, { p, elem: "water", noCrit: true });
            }
            if (z.sh >= 1) {
              z.sh = 0;
              for (const q of g.alivePlayers()) if (dist(q.x, q.y, z.x, z.y) < z.r && q.shield < q.maxShield) q.shield++;
            }
          },
        });
      });
      break;
    }
    case "gpt": {
      p.buff.ultOn = p.core ? 9 : 6;
      p.shield = Math.min(p.maxShield + 2, p.shield + 3);
      g.vfx("explosions/plasma-explosion", p.x, p.y - 16, { palette: ELEM.dragon.ramp.slice(1) });
      g.vfx("holy/divine-shield", p.x, p.y, { palette: pal, follow: p, life: 6 });
      for (const e of g.enemiesNear(p.x, p.y, p.core ? 130 : 90)) (g.hit(e, 10, { p, elem: "dragon" })), g.knock(e, p.x, p.y, 320);
      g.hitTilesIn(p.x, p.y, p.core ? 130 : 90, 30, p);
      break;
    }
    case "grok": {
      p.buff.ultOn = 6;
      g.vfx("lightning/thunderclap", p.x, p.y, { palette: pal });
      
      for (const e of g.enemiesNear(p.x, p.y, 80)) g.hit(e, 8, { p, elem: "thunder" });
      break;
    }
    case "claude": {
      const cx = p.x, cy = p.y;
      for (const e of g.enemiesNear(cx, cy, 100)) g.hit(e, 20, { p, elem: "sun" });
      const domain=g.addZone({
        kind: "domain", x: cx, y: cy, r: 104, life: 6, side: "p", owner: p.id,
        update: (z, dt) => {
          if (p.core) {
            const ne = g.nearestEnemy(z.x, z.y, 400);
            if (ne) {
              const an = angTo(z.x, z.y, ne.x, ne.y), d = dist(z.x, z.y, ne.x, ne.y);
              if (d > 8) (z.x += Math.cos(an) * Math.min(d, 70 * dt)), (z.y += Math.sin(an) * Math.min(d, 70 * dt));
            }
          }
          z.tick += dt;
          if (z.tick < 0.6) return;
          z.tick = 0;
          const es = g.enemiesNear(z.x, z.y, z.r);
          if (!es.length) return;
          const e = es[(Math.random() * es.length) | 0];
          g.line(e.x, e.y - 140, e.x, e.y - 10, "#ffe0a0", 5, 0.2, "beam");
          g.fx.spawn("impacts/hit-spark", e.x, e.y - 10, { palette: ELEM.sun.ramp.slice(1), angle: -Math.PI / 2 });
          g.hit(e, 8, { p, elem: "sun" });
          e.sun = (e.sun || 0) + 1;
        },
        onEnd: (z) => {
          for (const e of g.enemiesNear(z.x, z.y, z.r + 30)) if (e.sun > 0) {
            g.fx.spawn("holy/sunburst", e.x, e.y - e.r, { palette: ELEM.sun.ramp, life: 0.5 });
            g.hit(e, 6 * e.sun, { p, elem: "sun", noReact: true });
            e.sun = 0;
          }
        },
      });
      g.vfx("holy/holy-pillar",cx,cy,{palette:pal,speed2:1.5,follow:domain,life:6});
      g.vfx("arcane/rune-circle",cx,cy+6,{palette:pal,layer:"back",life:6,follow:domain,dy:6});
      break;
    }
    case "doubao": {
      const st = g.addZone({
        kind: "station", x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24, r: 84, life: 7, side: "p", owner: p.id, shot: 0, heal: 0,
        update: (z, dt) => {
          z.shot += dt;
          z.heal += dt;
          if (z.shot >= (p.core ? 0.35 : 0.5)) {
            z.shot = 0;
            const tg = p.target && dist(p.target.x, p.target.y, z.x, z.y) < 220 ? p.target : g.nearestEnemy(z.x, z.y, 220);
            if (tg) {
              const b = g.mkBullet(p, { x: z.x, y: z.y - 26, h: 26, a: angTo(z.x, z.y - 26, tg.x, tg.y - tg.r), spd: 260, dmg: 3.6, elem: "bubble", kind: "doubao", r: 5, life: 1.2 });
              g.bullets.push(b);
            }
          }
          if (z.heal >= (p.core ? 1 : 1.4)) {
            z.heal = 0;
            g.fx.spawn("holy/heal-aoe", z.x, z.y, { palette: ELEM.bubble.ramp, opts: { reach: 84 }, layer: "back", speed2: 1.4 });
            for (const q of g.alivePlayers()) if (dist(q.x, q.y, z.x, z.y) < z.r && q.hp < q.maxHp) (q.hp++), g.text(q.x, q.y - 62, "+1", "#ff9ac0");
          }
        },
      });
      g.vfx("water/bubbles", st.x, st.y + 4, { palette: ELEM.bubble.ramp, life: 7 });
      g.vfx("arcane/magic-circle-cast", st.x, st.y + 4, { palette: ELEM.bubble.ramp, speed2: 2 });
      break;
    }
    case "glm": {
      const d = Math.min(200, dist(p.x, p.y, tx, ty)), aa = angTo(p.x, p.y, tx, ty), cx = p.x + Math.cos(aa) * d, cy = p.y + Math.sin(aa) * d;
      g.vfx("arcane/magic-circle-cast", cx, cy, { palette: pal, speed2: 1.3 });
      g.vfx("shadow/black-hole", cx, cy - 10, { palette: pal, life: 3.5 });
      for (const e of g.enemiesNear(cx, cy, 104)) (g.hit(e, 20, { p, elem: "ink" })), (e.inkMark = g.time + 6);
      g.addZone({
        kind: "tome", x: cx, y: cy, r: 104, life: p.core ? 5 : 3.5, side: "p", owner: p.id,
        update: (z, dt) => {
          for (const e of g.enemiesNear(z.x, z.y, z.r + 20)) if (!e.boss) {
            const an = angTo(e.x, e.y, z.x, z.y);
            e.kbx += Math.cos(an) * 150 * dt * (p.core ? 6 : 4);
            e.kby += Math.sin(an) * 150 * dt * (p.core ? 6 : 4);
          }
          z.tick += dt;
          if (z.tick < 0.4) return;
          z.tick = 0;
          const es = g.enemiesNear(z.x, z.y, z.r);
          for (let i = 0; i < Math.min(3, es.length); i++) {
            const e = es[(Math.random() * es.length) | 0];
            g.line(z.x + (Math.random() - 0.5) * 120, z.y - 60, e.x, e.y - 10, "#b8b0ff", 2, 0.15, "beam");
            g.hit(e, 5, { p, elem: "ink", noCrit: true });
            e.inkMark = g.time + 4;
          }
        },
        onEnd: (z) => {
          g.vfx("shadow/dark-explosion", z.x, z.y + 10, { palette: pal, speed2: 1.6 });
          g.shake = Math.max(g.shake, 8);
          for (const e of g.enemiesNear(z.x, z.y, z.r + 20)) if (e.inkMark > g.time) (g.hit(e, 12, { p, elem: "ink", noReact: true })), (e.inkMark = 0);
        },
      });
      break;
    }
  }
}
