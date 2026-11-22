// Enemy behaviours and the boss.
import { dist, angTo, TAU, R } from "./util.js";
const CHARS_SPEED = 110;
import { moveCircle, flowDir, los, tileAt, BUSH, WALL } from "./map.js";
import { T } from "./data.js";

function nearestPlayer(g, e) {
  let best = null, bd = 1e9, hidden = true;
  for (const p of g.players) {
    if (p.dead || p.downed) continue;
    let d = dist(e.x, e.y, p.x, p.y);
    // hidden in a bush unless close, or it just shot this enemy
    const h = !e.boss && tileAt(g.map, p.x, p.y) === BUSH && d > 90 && !(e.lastBy === p.id && e.flash > -1.5);
    if (h) d += 400;
    if (d < bd) (bd = d), (best = p), (hidden = h);
  }
  return [best, bd, hidden];
}
function shoot(g, e, a, o = {}) {
  const hh = o.h ?? e.r + 6;
  const b = g.mkBullet(null, { side: "e", x: e.x, y: e.y - hh, h: hh, a, spd: o.spd || 120, dmg: o.dmg || 1, kind: o.kind || "orb", r: o.r || 6, life: o.life || 3.5, elem: null });
  b.src = e; // who fired it (endless damage scaling)
  b.slow = o.slow;
  b.burn = o.burn;
  b.big = o.big;
  g.bullets.push(b);
  return b;
}

export function updateEnemy(g, e, dt) {
  e.anim += dt;
  e.flash -= dt;
  if (e.spawnT > 0) {
    e.spawnT -= dt;
    return;
  }
  // statuses
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.burnTick += dt;
    if (e.burnTick >= 0.5) (e.burnTick = 0), g.hit(e, e.burnDps * 0.5, { noReact: true, noCrit: true, p: g.player(e.lastBy) });
    if (e.dead) return;
  }
  e.slowT -= dt;
  e.vulnT -= dt;
  // 精英词缀
  if (e.affix === "regen" && g.host && g.time - (e.hitAt ?? -9) > 2 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * dt);
  if (e.affix === "frost" && g.host) for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < 72) q.buff.slow = Math.max(q.buff.slow || 0, 0.25);
  // knockback
  if (e.kbx || e.kby) {
    moveCircle(g.map, e, e.kbx * dt, e.kby * dt, e.def.fly, e.def.phase);
    e.kbx *= Math.pow(0.0005, dt);
    e.kby *= Math.pow(0.0005, dt);
    if (Math.abs(e.kbx) + Math.abs(e.kby) < 5) e.kbx = e.kby = 0;
  }
  if (e.freezeT > 0) return void (e.freezeT -= dt);
  if (e.stunT > 0) return void (e.stunT -= dt);
  const [p, d, hidden] = nearestPlayer(g, e);
  if (!p) return;
  if (hidden) {
    // lost sight: wander around slowly
    e.wanderT = (e.wanderT || 0) - dt;
    if (e.wanderT <= 0) (e.wanderT = 1 + Math.random()), (e.wanderA = Math.random() * TAU);
    moveCircle(g.map, e, Math.cos(e.wanderA) * e.def.spd * 0.35 * dt, Math.sin(e.wanderA) * e.def.spd * 0.35 * dt, e.def.fly, e.def.phase);
    e.st = e.st === "jump" ? e.st : "idle";
    if (e.st !== "jump") return;
  }
  const sp = e.def.spd * (e.slowT > 0 ? 1 - e.slowK : 1) * (e.elite ? 1.1 : 1);
  e.t += dt;
  e.cd -= dt;
  e.face = p.x < e.x ? -1 : 1;
  const walk = (k = 1) => {
    let dir;
    if (e.def.fly || e.def.phase || los(g.map, e.x, e.y, p.x, p.y)) {
      const a = angTo(e.x, e.y, p.x, p.y);
      dir = [Math.cos(a), Math.sin(a)];
    } else dir = flowDir(g.map, g.flow, e.x, e.y) || [0, 0];
    moveCircle(g.map, e, dir[0] * sp * k * dt, dir[1] * sp * k * dt, e.def.fly, e.def.phase);
    return dir;
  };
  const touch = () => {
    if (e.def.touch && d < e.r + p.r + 2 && g.hurt(p, e.def.touch, e)) {
      if (e.def.chill) p.buff.slow = 1.4; // 藤蔓蛇 / 霜冻爬虫 / 冰晶史莱姆
      if (e.def.burnTouch) p.buff.burn = 2.1; // 炎蝠
    }
  };
  switch (e.def.ai) {
    case "hop": {
      // rest, then a quick hop toward the player
      if (e.st !== "hop" && e.cd <= 0) (e.st = "hop"), (e.cd = 0.45);
      if (e.st === "hop") {
        walk(2.6);
        if (e.cd <= 0) (e.st = "idle"), (e.cd = 0.7 + Math.random() * 0.5);
      }
      touch();
      break;
    }
    case "flit": {
      const a = angTo(e.x, e.y, p.x, p.y) + Math.sin(e.t * 5 + e.wob) * 0.9;
      moveCircle(g.map, e, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt, true);
      touch();
      break;
    }
    case "shooter": {
      const want = 150;
      const a = angTo(e.x, e.y, p.x, p.y), side = Math.sin(e.t * 0.8 + e.wob) > 0 ? 1 : -1;
      let mx = Math.cos(a + side * 1.3), my = Math.sin(a + side * 1.3);
      if (d > want + 30) (mx = Math.cos(a)), (my = Math.sin(a));
      else if (d < want - 40) (mx = -Math.cos(a)), (my = -Math.sin(a));
      moveCircle(g.map, e, mx * sp * dt, my * sp * dt, true);
      if (e.cd <= 0.45 && e.st !== "wind" && d < 260) e.st = "wind";
      if (e.st === "wind" && e.cd <= 0) {
        e.st = "idle";
        e.cd = e.def.shot.cd * (0.85 + Math.random() * 0.3);
        if (los(g.map, e.x, e.y - 10, p.x, p.y - 16)) {
          const n = e.elite ? 3 : 1;
          const lead = 0.5 * (d / e.def.shot.spd), lx = p.x + (p.input.mx || 0) * CHARS_SPEED * lead, ly = p.y + (p.input.my || 0) * CHARS_SPEED * lead;
          for (let i = 0; i < n; i++) shoot(g, e, angTo(e.x, e.y - 16, lx, ly - 16) + (i - (n - 1) / 2) * 0.22, { spd: e.def.shot.spd, slow: e.def.shot.slow, kind: e.def.shot.slow ? "ghost" : undefined });
          g.sound("shoot_ink", 0.1);
        }
      }
      break;
    }
    case "leap": {
      if (e.st === "idle" && e.cd <= 0 && d < 260) {
        e.st = "aim";
        e.cd = 0.55;
        const a = angTo(e.x, e.y, p.x, p.y), L = Math.min(150, d);
        e.lx = e.x + Math.cos(a) * L;
        e.ly = e.y + Math.sin(a) * L;
        e.ox = e.x;
        e.oy = e.y;
      } else if (e.st === "aim" && e.cd <= 0) (e.st = "jump"), (e.cd = 0.5);
      else if (e.st === "jump") {
        const k = 1 - Math.max(0, e.cd) / 0.5;
        const nx = e.ox + (e.lx - e.ox) * k, ny = e.oy + (e.ly - e.oy) * k;
        moveCircle(g.map, e, nx - e.x, ny - e.y, true);
        e.z = Math.sin(k * Math.PI) * 26;
        if (e.cd <= 0) {
          e.st = "idle";
          e.z = 0;
          e.cd = 1.3 + Math.random() * 0.6;
          g.fx.spawn("spawn/poof", e.x, e.y + 4, { palette: ["#061a0a", "#1a4a20", "#3a8a3a", "#8ad06a", "#d0f0a0", "#ffffff"], speed2: 1.6 });
          for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < 26 + e.r) g.hurt(q, 1, e);
        }
      } else if (e.st === "idle") walk(0.5);
      break;
    }
    case "ghost": {
      walk(0.8);
      if (e.cd <= 0 && d < 240) {
        e.cd = e.def.shot.cd;
        const a = angTo(e.x, e.y - 14, p.x, p.y - 16);
        for (let i = -1; i <= 1; i++) shoot(g, e, a + i * e.def.shot.spread, { spd: e.def.shot.spd, slow: true, kind: "ghost" });
        if (e.elite) for (let i = 0; i < 6; i++) shoot(g, e, (i / 6) * TAU, { spd: 80, slow: true, kind: "ghost" });
      }
      touch();
      break;
    }
    case "caster": {
      if (d > 170) walk(1);
      else if (d < 110) moveCircle(g.map, e, -Math.cos(angTo(e.x, e.y, p.x, p.y)) * sp * dt, -Math.sin(angTo(e.x, e.y, p.x, p.y)) * sp * dt, true);
      if (e.cd <= 0.6 && e.st !== "wind") e.st = "wind";
      if (e.st === "wind" && e.cd <= 0) {
        e.st = "idle";
        e.cd = e.def.shot.cd;
        const n = e.elite ? 12 : 8, off = Math.random() * TAU;
        for (let i = 0; i < n; i++) shoot(g, e, off + (i / n) * TAU, { spd: e.def.shot.spd, burn: true, kind: "fire", h: 30 });
        if (e.elite) g.after(0.4, () => !e.dead && Array.from({ length: n }, (_, i) => shoot(g, e, off + ((i + 0.5) / n) * TAU, { spd: 90, burn: true, kind: "fire", h: 30 })));
        g.sound("shoot_dragon");
      }
      break;
    }
    case "pulse": {
      if (e.st !== "charge") walk(0.7);
      if (e.st !== "charge" && e.cd <= 0 && d < 120) (e.st = "charge"), (e.cd = 0.8);
      if (e.st === "charge" && e.cd <= 0) {
        e.st = "idle";
        e.cd = 2.6;
        const r = e.elite ? 80 : 60;
        g.vfx("lightning/zap-hit", e.x, e.y - 10, {});
        g.line(e.x - r, e.y, e.x + r, e.y, "#a0f0ff", 1, 0.15, "zap");
        for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < r) if (g.hurt(q, 1, e)) q.buff.slow = 1.5;
        g.sound("shoot_thunder");
      }
      break;
    }
    case "kamikaze": {
      if (e.st !== "boom") {
        walk(1.2);
        if (d < 30) (e.st = "boom"), (e.cd = 0.5);
      } else if (e.cd <= 0) {
        e.st = "boom2";
        g.explodeAt(e.x, e.y, 40, 1, 15, null);
        e.hp = 0;
        g.kill(e, null);
      }
      break;
    }
    case "snake": {
      const dir = walk(1);
      if (dir) {
        const perp = Math.sin(e.t * 9) * 0.6;
        moveCircle(g.map, e, -dir[1] * perp * sp * dt, dir[0] * perp * sp * dt, false);
      }
      touch();
      break;
    }
    // ---------------------------------------------------------- V3 新敌人
    case "spider": {
      // 爬网蜘蛛: scuttles in bursts at a slant, pauses; spits a web onto where you stand (it slows you while inside)
      e.burst = (e.burst ?? 0) - dt;
      if (e.burst <= 0) (e.run = !e.run), (e.burst = e.run ? 0.45 : 0.3), (e.side = Math.random() < 0.5 ? -1 : 1);
      if (e.st !== "spit" && e.run) {
        const a = angTo(e.x, e.y, p.x, p.y) + e.side * (d < 70 ? 1.6 : 0.7);
        moveCircle(g.map, e, Math.cos(a) * sp * 1.7 * dt, Math.sin(a) * sp * 1.7 * dt, false);
      }
      if (e.st !== "spit" && e.cd <= 0 && d < 230 && los(g.map, e.x, e.y, p.x, p.y)) (e.st = "spit"), (e.cd = 0.4), (e.tx = p.x), (e.ty = p.y);
      else if (e.st === "spit" && e.cd <= 0) {
        e.st = "idle";
        e.cd = 4 + Math.random();
        for (let i = 0; i < (e.elite ? 2 : 1); i++) {
          const tx = e.tx + (i ? (Math.random() - 0.5) * 80 : 0), ty = e.ty + (i ? (Math.random() - 0.5) * 50 : 0);
          g.line(e.x, e.y - 8, tx, ty, "#dfe8d8", 1, 0.25, "web");
          g.after(0.22, () => g.addZone({ kind: "web", x: tx, y: ty, r: 34, life: 5, side: "e", update: webSlow }));
        }
        g.sound("shoot_ink", 0.1);
      }
      touch();
      break;
    }
    case "shell": {
      // 冰壳守护进程: plods along the way it faces, turning slowly toward you (its front shell blocks — game.hit);
      // every few seconds it hunkers down and slams, throwing a ring of slowing ice shards
      const want = angTo(e.x, e.y, p.x, p.y), turn = (e.elite ? 2.2 : 1.5) * dt;
      e.dir ??= want;
      const diff = Math.atan2(Math.sin(want - e.dir), Math.cos(want - e.dir));
      e.dir += Math.max(-turn, Math.min(turn, diff));
      e.face = Math.cos(e.dir) >= 0 ? 1 : -1;
      if (e.st !== "slam" && d > 40) moveCircle(g.map, e, Math.cos(e.dir) * sp * dt, Math.sin(e.dir) * sp * dt, false);
      if (e.st !== "slam" && e.cd <= 0 && d < 170) (e.st = "slam"), (e.cd = 0.7);
      else if (e.st === "slam" && e.cd <= 0) {
        e.st = "idle";
        e.cd = 4.5 + Math.random();
        const n = e.elite ? 12 : 8, off = Math.random() * TAU;
        for (let i = 0; i < n; i++) shoot(g, e, off + (i / n) * TAU, { spd: 105, slow: true, kind: "ghost", h: 12 });
        g.vfx("ice/frost-nova", e.x, e.y, { layer: "back", speed2: 1.6 });
        g.shake = Math.max(g.shake, 3);
        g.sound("shoot_water", 0.1);
      }
      touch();
      break;
    }
    case "mortar": {
      // 熔岩迫击蜗牛: keeps 150~240 away; aims (its vent flares), then lobs magma: a warning circle where you'll be,
      // a blast 1 s later that leaves burning ground
      if (e.st !== "aim") {
        const a = angTo(e.x, e.y, p.x, p.y);
        if (d > 240) walk(1);
        else if (d < 150) moveCircle(g.map, e, -Math.cos(a) * sp * dt, -Math.sin(a) * sp * dt, false);
      }
      if (e.st !== "aim" && e.cd <= 0 && d < 330) (e.st = "aim"), (e.cd = 0.5);
      else if (e.st === "aim" && e.cd <= 0) {
        e.st = "idle";
        e.cd = 3.4 + Math.random() * 0.6;
        const lead = 0.7, tx = p.x + (p.input.mx || 0) * CHARS_SPEED * lead, ty = p.y + (p.input.my || 0) * CHARS_SPEED * lead;
        const spots = e.elite ? [0, 1, 2].map((i) => [tx + Math.cos(i * 2.1) * 36, ty + Math.sin(i * 2.1) * 24]) : [[tx, ty]];
        for (const [x, y] of spots) g.addZone({ kind: "mark", x, y, r: 28, life: 1, max: 1, side: "e", fx0: e.x, fy0: e.y - 30, onEnd: mortarBlast });
        g.sound("shoot_dragon", 0.1);
      }
      touch();
      break;
    }
    case "healer": {
      // 补丁无人机: never attacks. Hovers 150~210 away from you, close to the hurt monsters, and every 2.8 s
      // patches every monster near it (bosses excepted) for a quarter of its life
      const hurt = g.enemies.filter((o) => o !== e && !o.dead && !o.boss && o.spawnT <= 0 && o.hp < o.maxHp && o.def.ai !== "healer");
      let tx = e.x, ty = e.y;
      if (hurt.length) {
        const o = hurt.reduce((b, o) => (o.hp / o.maxHp < b.hp / b.maxHp ? o : b));
        tx = o.x; ty = o.y - 20;
      }
      const away = angTo(p.x, p.y, e.x, e.y), keep = d < 150 ? 1 : d > 210 ? -0.6 : 0;
      const mx = Math.cos(away) * keep + (tx - e.x) * 0.012, my = Math.sin(away) * keep + (ty - e.y) * 0.012, ml = Math.hypot(mx, my);
      if (ml > 0.05) moveCircle(g.map, e, (mx / Math.max(1, ml)) * sp * dt, (my / Math.max(1, ml)) * sp * dt, true);
      if (e.cd <= 0) {
        e.cd = 2.8;
        const near = hurt.filter((o) => dist(o.x, o.y, e.x, e.y) < 140);
        for (const o of near) {
          const add = o.maxHp * (e.elite ? 0.4 : 0.25);
          o.hp = Math.min(o.maxHp, o.hp + add);
          g.line(e.x, e.y - 30, o.x, o.y - o.r, "#5aff8a", 2, 0.35, "heal");
          g.text(o.x, o.y - o.r * 2 - 14, "+修复", "#7aff9a", 0.9, 0.7);
        }
        if (near.length) g.vfx("holy/heal", e.x, e.y - 30, { palette: ["#06200e", "#0e4a1e", "#1a8a3a", "#3ad06a", "#8affaa", "#d8ffe6", "#ffffff", "#ffffff"], speed2: 1.6 }), g.sound("heal", 0.3);
      }
      break;
    }
    case "nest": {
      // 巢穴 (精英巢穴 rooms): stands still and hatches its map's residents, at most 2 alive (elite 3) and the room
      // capped at 14 monsters; breaking it stops the brood
      e.face = 1;
      if (g.host && e.cd <= 0) {
        e.cd = e.elite ? 4.2 : 5.5;
        const kids = g.enemies.filter((o) => o.nestId === e.id && !o.dead).length, all = g.enemies.filter((o) => !o.dead).length;
        if (kids < (e.elite ? 3 : 2) && all < 14) {
          const k = e.def.brood[(Math.random() * e.def.brood.length) | 0], a = Math.random() * TAU;
          const c = g.spawnEnemy(k, e.x + Math.cos(a) * 30, e.y + 14 + Math.sin(a) * 12, false, 0.5);
          c.nestId = e.id;
          g.vfx("spawn/poof", e.x, e.y - 8, { palette: ["#0a0a0a", "#2a2a2a", "#5a5a5a", "#9a9a9a", "#d0d0d0", "#ffffff"], speed2: 1.4 });
        }
      }
      break;
    }
    case "boss_eye":
      bossEye(g, e, p, d, dt);
      break;
    case "boss_frost":
      bossFrost(g, e, p, d, dt);
      break;
    case "boss_core":
      bossCore(g, e, p, d, dt);
      break;
    case "boss_root":
      bossRoot(g, e, p, d, dt);
      break;
    case "boss_witch":
      bossWitch(g, e, p, d, dt);
      break;
    case "witch_clone":
      witchClone(g, e, p, d, dt);
      break;
    case "boss_worm":
      bossWorm(g, e, p, d, dt);
      break;
    case "boss_judge":
      bossJudge(g, e, p, d, dt);
      break;
    case "boss_baku":
      bossBaku(g, e, p, d, dt);
      break;
    case "dream_orb": {
      // 梦泡: circles its sleeping 食梦兽; gone with it
      const bk = g.enemies.find((q) => q.id === e.bakuId && !q.dead);
      if (!bk) {
        if (g.host) (e.hp = 0), (e.dead = true), (e.silent = true);
        break;
      }
      e.orbA = (e.orbA ?? 0) + dt * 0.9;
      e.x = bk.x + Math.cos(e.orbA) * 120;
      e.y = bk.y + Math.sin(e.orbA) * 66;
      e.face = 1;
      break;
    }
    case "storm_core":
      // 雷霆审判者's storm core: hangs still, arcs to its judge (the arc hurts), fires a slow volt shot now and then
      e.face = 1;
      if (g.host) {
        const judge = g.enemies.find((q) => q.id === e.coreId && !q.dead);
        if (!judge) e.hp = 0, e.dead = true, e.silent = true;
        else {
          e.shotT = (e.shotT ?? 2 + Math.random()) - dt;
          if (e.shotT <= 0) (e.shotT = 3.2), shoot(g, e, angTo(e.x, e.y - 20, p.x, p.y), { spd: 110, h: 20, r: 5, kind: "volt" });
          if ((e.beamT = (e.beamT || 0) - dt) <= 0) {
            e.beamT = 0.3;
            const x0 = e.x, y0 = e.y - 22, x1 = judge.x, y1 = judge.y - 50;
            g.line(x0, y0, x1, y1, "#8ad8ff", 3, 0.32, "zap");
            for (const q of g.alivePlayers()) if (segDist(q.x, q.y - 12, x0, y0, x1, y1) < 12) if (g.hurt(q, 1, { src: e, x: q.x, y: q.y })) q.buff.slow = 1;
          }
        }
      }
      break;
    case "pylon":
      // 过热核心's coolant pylon: stands still, beams cold light to its core, pulses a slowing shot now and then
      e.face = 1;
      if (g.host) {
        e.shotT = (e.shotT ?? 1.5) - dt;
        if (e.shotT <= 0) (e.shotT = 2.6), shoot(g, e, angTo(e.x, e.y, p.x, p.y), { spd: 120, h: 20, r: 5, slow: true, kind: "ghost" });
        const core = g.enemies.find((q) => q.id === e.coreId && !q.dead);
        if (!core) e.hp = 0, e.dead = true;
        else if ((e.beamT = (e.beamT || 0) - dt) <= 0) (e.beamT = 0.5), g.line(e.x, e.y - 14, core.x, core.y - 56, "#7fd0ff", 2, 0.5, "zap");
      }
      break;
  }
}

// ----------------------------------------------------------------- the boss: 幻觉之眼
function bossEye(g, e, p, d, dt) {
  const frac = e.hp / e.maxHp;
  const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (e.phase !== phase) {
    e.phase = phase;
    if (phase > 1) {
      g.text(e.x, e.y - 90, phase === 2 ? "幻觉加深！" : "全知幻象！", "#ff6a8a", 1.6, 1.5);
      g.vfx("explosions/implosion", e.x, e.y - 40, {});
      g.sound("boss");
      spawnBossAdds(g, e, phase === 2 ? ["bat", "bat", "wisp", "wisp"] : ["ghost", "wisp", "wisp", "bat", "bat"]);
    }
  }
  const speedK = phase === 3 ? 1.35 : phase === 2 ? 1.15 : 1;
  // drift toward the room's center line, keep some distance
  const c = g.map.center;
  const tx = c.x + Math.sin(e.t * 0.4) * 140, ty = c.y + Math.cos(e.t * 0.55) * 50;
  if (e.st !== "dash") {
    const a = angTo(e.x, e.y, tx, ty), dd = dist(e.x, e.y, tx, ty);
    if (dd > 8) moveCircle(g.map, e, Math.cos(a) * 40 * dt, Math.sin(a) * 40 * dt, true);
  }
  e.face = p.x < e.x ? -1 : 1;
  const H = 46;
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 10) g.hurt(q, 1, e);
  if (e.st === "dash") {
    e.dt -= dt;
    if (e.dt > 0.6) return; // telegraph
    moveCircle(g.map, e, Math.cos(e.da) * 380 * dt, Math.sin(e.da) * 380 * dt, true);
    for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 12) g.hurt(q, 2, e);
    if (e.dt <= 0) (e.st = "idle"), (e.cd = 1);
    return;
  }
  if (e.st === "spiral") {
    e.dt -= dt;
    e.sp = (e.sp || 0) + dt;
    while (e.sp > 0.07 / speedK) {
      e.sp -= 0.07 / speedK;
      e.ang += 0.37;
      const arms = phase === 3 ? 4 : 2;
      for (let k = 0; k < arms; k++) shoot(g, e, e.ang + (k / arms) * TAU, { spd: 110, h: H, r: 6, big: true });
    }
    if (e.dt <= 0) (e.st = "idle"), (e.cd = 1.2);
    return;
  }
  if (e.cd > 0) return;
  // choose an attack
  const opts = ["burst", "aimed", "burst", "aimed"];
  if (phase >= 2) opts.push("spiral", "dash");
  if (phase >= 3) opts.push("spiral", "summon");
  if (phase >= 2) opts.push("gaze");
  let k = opts[(Math.random() * opts.length) | 0];
  if (e.forcePick) (k = e.forcePick), (e.forcePick = null); // tests
  g.sound("laser", 0.2);
  switch (k) {
    case "gaze": {
      // 凝视光束: a red line locks on, then a beam sweeps across the player's side of the room
      const q = g.alivePlayers()[0] || p, a0 = angTo(e.x, e.y - H, q.x, q.y), dir = Math.random() < 0.5 ? -1 : 1;
      g.addZone({ kind: "gazebeam", x: e.x, y: e.y - H, r: 460, life: 2.7, side: "e", a0: a0 - dir * 0.9, dir, update: (z) => {
        z.x = e.x; z.y = e.y - H;
        if (z.t < 0.7 || e.dead) return;
        const a = gazeAngle(z);
        for (const qq of g.alivePlayers()) {
          const dd = dist(qq.x, qq.y - 16, z.x, z.y), qa = angTo(z.x, z.y, qq.x, qq.y - 16);
          const diff = Math.abs(((qa - a + Math.PI * 3) % TAU) - Math.PI);
          if (dd < z.r && diff * dd < 10) g.hurt(qq, 1, { src: e, x: z.x, y: z.y });
        }
      } });
      g.text(e.x, e.y - 100, "凝视！", "#ff6a8a", 1.3, 0.9);
      e.cd = 3.4 / speedK;
      break;
    }
    case "burst": {
      const waves = phase === 1 ? 3 : 4, n = phase === 3 ? 22 : 16;
      for (let w = 0; w < waves; w++)
        g.after(w * 0.35, () => {
          if (e.dead) return;
          const off = w * 0.2 + Math.random();
          for (let i = 0; i < n; i++) shoot(g, e, off + (i / n) * TAU, { spd: 130 * speedK, h: H, r: 6, big: true });
        });
      e.cd = 2 / speedK;
      break;
    }
    case "aimed": {
      for (let w = 0; w < 4; w++)
        g.after(w * 0.22, () => {
          if (e.dead) return;
          const q = g.alivePlayers()[0] || p;
          const a = angTo(e.x, e.y - H, q.x, q.y - 16);
          for (let i = -2; i <= 2; i++) shoot(g, e, a + i * 0.16, { spd: 200 * speedK, h: H, r: 5 });
        });
      e.cd = 1.6 / speedK;
      break;
    }
    case "spiral":
      e.st = "spiral";
      e.dt = 2.6;
      e.ang = Math.random() * TAU;
      e.cd = 1;
      break;
    case "dash":
      e.st = "dash";
      e.dt = 1.4;
      e.da = angTo(e.x, e.y, p.x, p.y);
      g.line(e.x, e.y, e.x + Math.cos(e.da) * 500, e.y + Math.sin(e.da) * 500, "#ff4060", 18, 0.6, "warn");
      break;
    case "summon":
      spawnBossAdds(g, e, ["wisp", "wisp", "bat"]);
      e.cd = 2.5;
      break;
  }
}
export function spawnBossAdds(g, e, list) {
  if (g.enemies.length > 14) return;
  list.forEach((t, i) => {
    const a = (i / list.length) * TAU;
    g.spawnEnemy(t, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 50, false, 0.7);
  });
}

// ----------------------------------------------------------------- 显存冰原 boss: 冰封史莱姆王
// slow and heavy: leaps onto you (ice ring on landing), sprays slowing shards, calls in slimes; below 1/3 it hurries
function bossFrost(g, e, p, d, dt) {
  // 分裂: at half health the king bursts into two smaller kings, each with the health it had left
  if (g.host && !e.splitDone && !e.sizeK && e.hp <= e.maxHp * 0.5) {
    e.splitDone = true;
    e.sizeK = 0.72;
    e.r *= 0.72;
    g.vfx("ice/ice-shatter", e.x, e.y - 30, {});
    g.text(e.x, e.y - 90, "分裂！", "#a8e0ff", 1.6, 1.3);
    g.sound("boss");
    const twin = g.spawnEnemy("boss_frost", e.x + 50, e.y + 10, false, 0.2);
    twin.sizeK = 0.72; twin.r = e.r; twin.splitDone = true; twin.maxHp = e.maxHp; twin.hp = e.hp; twin.phase = e.phase;
    e.x -= 30;
  }
  const frac = e.hp / e.maxHp, phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (e.phase !== phase) {
    e.phase = phase;
    if (phase > 1) {
      g.text(e.x, e.y - 100, phase === 2 ? "缓存冻结！" : "绝对零度！", "#a8e0ff", 1.6, 1.5);
      g.vfx("ice/frost-nova", e.x, e.y, {});
      g.sound("boss");
      spawnBossAdds(g, e, phase === 2 ? ["slime_blue", "slime_blue", "bat_ice", "bat_ice"] : ["slime_blue", "slime_blue", "bat_ice", "bat_ice", "eye_ice"]);
    }
  }
  const k = phase === 3 ? 1.35 : phase === 2 ? 1.15 : 1;
  for (const q of g.alivePlayers()) if (!e.z && dist(q.x, q.y, e.x, e.y) < e.r + 12) g.hurt(q, 1, e);
  if (e.st === "leap") {
    e.dt -= dt;
    if (e.dt > 0.7) return; // crouch (the landing spot is already marked)
    const t = 1 - Math.max(0, e.dt) / 0.7;
    moveCircle(g.map, e, (e.ox + (e.lx - e.ox) * t) - e.x, (e.oy + (e.ly - e.oy) * t) - e.y, true);
    e.z = Math.sin(t * Math.PI) * 70;
    if (e.dt <= 0) {
      e.z = 0;
      e.st = "idle";
      e.cd = 1.3 / k;
      g.vfx("ice/frost-nova", e.x, e.y, {});
      g.sound("explode", 0.4);
      for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < 70) if (g.hurt(q, 2, e)) q.buff.slow = 2;
      const n = phase === 1 ? 14 : 20;
      for (let i = 0; i < n; i++) shoot(g, e, (i / n) * TAU, { spd: 120, h: 20, r: 6, slow: true, kind: "ghost" });
    }
    return;
  }
  if (e.cd > 0) {
    const a = angTo(e.x, e.y, p.x, p.y);
    moveCircle(g.map, e, Math.cos(a) * 22 * k * dt, Math.sin(a) * 22 * k * dt, false);
    return;
  }
  const opts = ["leap", "shards", "leap", "shards"];
  if (phase >= 2) opts.push("summon", "leap");
  const pick = opts[(Math.random() * opts.length) | 0];
  if (pick === "leap") {
    e.st = "leap";
    e.dt = 1.4;
    e.ox = e.x;
    e.oy = e.y;
    e.lx = p.x;
    e.ly = p.y;
    g.vfx("arcane/rune-circle", p.x, p.y, { life: 1.4, palette: ["#0a1a30", "#4a9ad8", "#a8e0ff", "#ffffff"] });
    g.text(p.x, p.y - 40, "！", "#a8e0ff", 1.4, 0.8);
  } else if (pick === "shards") {
    for (let w = 0; w < 3; w++)
      g.after(w * 0.3, () => {
        if (e.dead) return;
        const q = g.alivePlayers()[0] || p, a = angTo(e.x, e.y - 30, q.x, q.y - 16);
        for (let i = -3; i <= 3; i++) shoot(g, e, a + i * 0.13, { spd: 170 * k, h: 30, r: 5, slow: true, kind: "ghost" });
      });
    g.sound("shoot_water", 0.2);
    e.cd = 1.8 / k;
  } else {
    spawnBossAdds(g, e, ["slime_blue", "slime_blue", "bat_ice"]);
    e.cd = 2.2;
  }
}

// ----------------------------------------------------------------- 算力熔炉 boss: 过热核心
// floats around the furnace: burning rings, meteor strikes on marked spots, fire bats; below 1/3 a spinning flame spiral
function bossCore(g, e, p, d, dt) {
  // shielded while its coolant pylons stand; when the last one falls it overheats: stalls 3 s, takes +50%
  const pylons = g.enemies.filter((q) => q.type === "core_pylon" && !q.dead && q.coreId === e.id).length;
  e.guardT = pylons ? 1 : 0;
  if (e.hadPylons && !pylons) {
    e.overheat = 3;
    g.text(e.x, e.y - 110, "过热宕机！", "#ffd84a", 1.6, 1.4);
    g.vfx("explosions/plasma-explosion", e.x, e.y - 40, {});
  }
  e.hadPylons = pylons > 0;
  if (e.overheat > 0) {
    e.overheat -= dt;
    e.vulnT = Math.max(e.vulnT || 0, 0.2);
    e.flash = Math.max(e.flash || 0, Math.sin(e.t * 30) > 0 ? 0.05 : 0);
    return;
  }
  const frac = e.hp / e.maxHp, phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (e.phase !== phase) {
    e.phase = phase;
    if (phase > 1) {
      g.text(e.x, e.y - 110, phase === 2 ? "温度过载！" : "熔毁倒计时！", "#ff8a4a", 1.6, 1.5);
      g.vfx("explosions/plasma-explosion", e.x, e.y - 40, {});
      g.sound("boss");
      spawnBossAdds(g, e, phase === 2 ? ["bat_fire", "bat_fire", "wisp", "wisp"] : ["bat_fire", "bat_fire", "skull", "wisp", "wisp"]);
    }
  }
  const k = phase === 3 ? 1.35 : phase === 2 ? 1.15 : 1, H = 56;
  const c = g.map.center, tx = c.x + Math.cos(e.t * 0.35) * 150, ty = c.y + Math.sin(e.t * 0.5) * 60;
  const a0 = angTo(e.x, e.y, tx, ty);
  if (dist(e.x, e.y, tx, ty) > 8) moveCircle(g.map, e, Math.cos(a0) * 46 * dt, Math.sin(a0) * 46 * dt, true);
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 10) if (g.hurt(q, 1, e)) q.buff.burn = 2.1;
  if (e.st === "spiral") {
    e.dt -= dt;
    e.sp = (e.sp || 0) + dt;
    while (e.sp > 0.08) {
      e.sp -= 0.08;
      e.ang += 0.42;
      for (let i = 0; i < 3; i++) shoot(g, e, e.ang + (i / 3) * TAU, { spd: 115, h: H, r: 6, burn: true, kind: "fire", big: true });
    }
    if (e.dt <= 0) (e.st = "idle"), (e.cd = 1.2);
    return;
  }
  if (e.cd > 0) return;
  const opts = ["ring", "meteor", "ring", "meteor"];
  if (phase >= 2) opts.push("summon");
  if (phase >= 3) opts.push("spiral", "spiral");
  let pick = opts[(Math.random() * opts.length) | 0];
  // 冷却塔: entering phase 2 (and again in 3) it raises coolant pylons; while any stand it shrugs off damage
  if ((phase >= 2 && !e.pylons2) || (phase >= 3 && !e.pylons3)) {
    if (phase >= 3) e.pylons3 = true;
    e.pylons2 = true;
    pick = "pylons";
  }
  if (e.forcePick) (pick = e.forcePick), (e.forcePick = null);
  if (pick === "pylons") {
    const n = phase >= 3 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.4, x = c.x + Math.cos(a) * 170, y = c.y + Math.sin(a) * 95;
      const py = g.spawnEnemy("core_pylon", x, y, false, 0.5);
      py.coreId = e.id;
    }
    g.text(e.x, e.y - 120, "冷却塔启动！打掉它们！", "#7fd0ff", 1.4, 1.6);
    g.sound("boss", 0.5);
    e.cd = 1.2;
    return;
  }
  if (pick === "ring") {
    for (let w = 0; w < 3; w++)
      g.after(w * 0.4, () => {
        if (e.dead) return;
        const n = 18, off = w * 0.17;
        for (let i = 0; i < n; i++) shoot(g, e, off + (i / n) * TAU, { spd: 125 * k, h: H, r: 6, burn: true, kind: "fire" });
      });
    g.sound("shoot_dragon", 0.25);
    e.cd = 2 / k;
  } else if (pick === "meteor") {
    // marked spots around the players, then fireballs land on them
    const spots = [];
    for (const q of g.alivePlayers()) for (let i = 0; i < (phase === 1 ? 3 : 5); i++) spots.push([q.x + (Math.random() - 0.5) * 140, q.y + (Math.random() - 0.5) * 100]);
    for (const [x, y] of spots) g.vfx("arcane/rune-circle", x, y, { life: 1, palette: ["#1a0600", "#d8481c", "#ffa030", "#fff0a0"] });
    g.after(1, () => {
      for (const [x, y] of spots) {
        g.vfx("explosions/small-explosion", x, y, {});
        for (const q of g.alivePlayers()) if (dist(q.x, q.y, x, y) < 30) if (g.hurt(q, 1, {src:e,x,y,groundHazard:true})) q.buff.burn = 2.1;
      }
      g.sound("explode", 0.35);
    });
    e.cd = 2.2 / k;
  } else if (pick === "summon") {
    spawnBossAdds(g, e, ["bat_fire", "bat_fire", "wisp"]);
    e.cd = 2.4;
  } else {
    e.st = "spiral";
    e.dt = 2.4;
    e.ang = Math.random() * TAU;
    e.cd = 1;
  }
}

// ----------------------------------------------------------------- 数据草原 boss: 根须之心
// rooted in place (never moves or flinches). Root spikes rip along marked lines toward each player; spore pods are
// lobbed out and sprout into spore nodes; from phase 2 a thorn cage closes in round a player; from phase 3 two
// thorny vines sweep round it. On every phase change it shuts itself in bark for 2.5 s (takes 20% damage) and calls
// in vine snakes.
function bossRoot(g, e, p, d, dt) {
  const frac = e.hp / e.maxHp, phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  e.face = 1;
  e.guardT = Math.max(0, (e.guardT || 0) - dt);
  if (e.phase !== phase) {
    const first = e.phase == null;
    e.phase = phase;
    if (!first) {
      g.text(e.x, e.y - 120, phase === 2 ? "根须护体！" : "千根齐发！", "#a6f05a", 1.6, 1.5);
      g.vfx("nature/root-snare", e.x, e.y, { opts: { size: 1.4 } });
      g.sound("boss");
      e.guardT = 2.5;
      spawnBossAdds(g, e, phase === 2 ? ["snake_vine", "snake_vine", "mushroom"] : ["snake_vine", "snake_vine", "mushroom", "mushroom"]);
    }
  }
  const k = phase === 3 ? 1.3 : phase === 2 ? 1.12 : 1;
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 14) g.hurt(q, 1, e);
  if (e.cd > 0 || !g.host) return;
  const opts = ["roots", "spores", "roots"];
  if (phase >= 2) opts.push("cage", "roots");
  if (phase >= 3) opts.push("sweep", "cage");
  // never the same special twice in a row
  let pick = opts[(Math.random() * opts.length) | 0];
  if (pick === e.lastPick && pick !== "roots") pick = "roots";
  if (e.forcePick) (pick = e.forcePick), (e.forcePick = null); // tests
  e.lastPick = pick;
  if (pick === "roots") {
    // a crack runs from the heart toward each player (and, later, fans out to the sides); spikes erupt along it
    const lines = [];
    for (const q of g.alivePlayers()) {
      const a = angTo(e.x, e.y, q.x, q.y);
      lines.push(a);
      if (phase >= 2) lines.push(a + 0.55, a - 0.55);
    }
    for (const a of lines) {
      const len = 360;
      g.line(e.x, e.y, e.x + Math.cos(a) * len, e.y + Math.sin(a) * len, "#a6f05a", 16, 0.75, "warn");
      for (let s = 40, i = 0; s <= len; s += 26, i++) {
        const x = e.x + Math.cos(a) * s, y = e.y + Math.sin(a) * s;
        if (tileAt(g.map, x, y) === WALL) break;
        g.after(0.75 + i * 0.045, () => {
          if (e.dead) return;
          g.vfx("nature/earth-spike", x, y + 6, { opts: { size: 0.7 } });
          for (const q of g.alivePlayers()) if (dist(q.x, q.y, x, y) < 20) g.hurt(q, 1, { src: e, x, y, groundHazard: true });
        });
      }
    }
    g.sound("explode", 0.2);
    e.cd = 2.1 / k;
  } else if (pick === "spores") {
    // pods arc out and land round the players; each sprouts a spore node (left alone, they pile up)
    const n = phase === 1 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const q = g.alivePlayers()[i % Math.max(1, g.alivePlayers().length)] || p;
      const tx = q.x + (Math.random() - 0.5) * 160, ty = q.y + (Math.random() - 0.5) * 110;
      const b = g.mkBullet(null, { side: "e", x: e.x, y: e.y - 50, h: 0, a: 0, spd: 0, dmg: 1, kind: "orb", r: 6, life: 3, elem: null, big: true,
        arcTo: { x0: e.x, y0: e.y - 50, x: tx, y: ty, dur: 0.9 + i * 0.12 }, onLand: (bb) => {
          g.vfx("nature/spore-burst", bb.x, bb.y, {});
          for (const qq of g.alivePlayers()) if (dist(qq.x, qq.y, bb.x, bb.y) < 26) g.hurt(qq, 1, { src: e, x: bb.x, y: bb.y, groundHazard: true });
          if (g.enemies.length < 9 && Math.random() < 0.5 && tileAt(g.map, bb.x, bb.y) !== WALL) g.spawnEnemy("mushroom", bb.x, bb.y, false, 0.6); // some pods sprout
        } });
      b.src = e;
      g.bullets.push(b);
      g.vfx("arcane/rune-circle", tx, ty, { life: 0.9 + i * 0.12, palette: ["#0a1a08", "#2f6a1e", "#6fd23a", "#d8ffa0"] });
    }
    g.sound("shoot_water", 0.25);
    e.cd = 2.4 / k;
  } else if (pick === "cage") {
    // thorns ring a player and close in; dodge out through the ring before it shuts
    const q = g.alivePlayers()[(Math.random() * g.alivePlayers().length) | 0] || p;
    const dur = 1.8;
    g.addZone({ kind: "thorncage", x: q.x, y: q.y, r: 92, life: dur + 0.5, side: "e", update: (z) => {
      z.r = z.t < dur ? 92 - (92 - 18) * Math.min(1, z.t / dur) ** 1.6 : 18;
      if (z.t < 0.45) return; // the ring appears, then starts to bite
      z.hitT = (z.hitT || 0) - 1 / 60;
      for (const qq of g.alivePlayers()) {
        const dd = dist(qq.x, qq.y, z.x, z.y);
        if (Math.abs(dd - z.r) < 9 || (z.t >= dur && dd < z.r + 6)) if (g.hurt(qq, 1, { src: e, x: z.x, y: z.y, groundHazard: true })) qq.buff.slow = 1.2;
      }
    } });
    g.text(q.x, q.y - 54, "荆棘囚笼！", "#a6f05a", 1.2, 0.9);
    g.sound("boss", 0.4);
    e.cd = 2.6 / k;
  } else if (pick === "sweep") {
    // two thorny vines sweep a full turn round the heart; jump them with a dodge or stay out of reach
    g.addZone({ kind: "vinesweep", x: e.x, y: e.y - 20, r: 170, life: 3.6, side: "e", update: (z) => {
      if (z.t < 0.6) return; // wind-up: the vines rise
      const a = vineAngle(z);
      for (const qq of g.alivePlayers()) {
        const dd = dist(qq.x, qq.y, z.x, z.y);
        if (dd > z.r || dd < 20) continue;
        const qa = angTo(z.x, z.y, qq.x, qq.y);
        for (const arm of [a, a + Math.PI]) {
          const diff = Math.abs(((qa - arm + Math.PI * 3) % TAU) - Math.PI);
          if (diff * dd < 12) g.hurt(qq, 1, { src: e, x: z.x, y: z.y });
        }
      }
    } });
    g.text(e.x, e.y - 120, "藤鞭横扫！", "#a6f05a", 1.3, 1);
    e.cd = 4.2 / k;
  }
}
/** where the 藤鞭横扫 vines point at zone time z.t (same on host and clients) */
export const vineAngle = (z) => (z.id % 7) * 0.9 + Math.max(0, z.t - 0.6) * 2.1;

// ----------------------------------------------------------------- 显存冰原 boss: 霜镜女巫
// floats about the room. Mirror trick: she blinks out and reappears among ice copies of herself (one hit shatters a
// copy; only the real one, the one with a shadow, takes damage from the fight). Ice lances fly down marked lines;
// a frost ring spreads out from her (dodge through it); from phase 3, icicles drop on marked spots.
function bossWitch(g, e, p, d, dt) {
  const frac = e.hp / e.maxHp, phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  const c = g.map.center;
  if (e.phase !== phase) {
    const first = e.phase == null;
    e.phase = phase;
    if (!first) {
      g.text(e.x, e.y - 110, phase === 2 ? "镜中之镜！" : "永冻之夜！", "#a8e0ff", 1.6, 1.5);
      g.vfx("ice/frost-nova", e.x, e.y, {});
      g.sound("boss");
      spawnBossAdds(g, e, phase === 2 ? ["frostling", "frostling"] : ["frostling", "frostling", "eye_ice"]);
      e.cd = 0.4;
      e.forcePick = "mirror";
    }
  }
  const k = phase === 3 ? 1.3 : phase === 2 ? 1.12 : 1;
  // drift toward her chosen spot, swaying
  if (e.tx == null) (e.tx = c.x), (e.ty = c.y - 40);
  const sx = e.tx + Math.sin(e.t * 0.9) * 26, sy = e.ty + Math.cos(e.t * 1.3) * 12;
  if (dist(e.x, e.y, sx, sy) > 4) {
    const a = angTo(e.x, e.y, sx, sy);
    moveCircle(g.map, e, Math.cos(a) * d.spd * dt, Math.sin(a) * d.spd * dt, true);
  }
  e.face = p.x < e.x ? -1 : 1;
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 10) if (g.hurt(q, 1, e)) q.buff.slow = 1.5;
  if (e.cd > 0 || !g.host) return;
  const opts = ["lances", "ring", "lances", "mirror"];
  if (phase >= 2) opts.push("mirror", "ring");
  if (phase >= 3) opts.push("icicles", "icicles");
  let pick = opts[(Math.random() * opts.length) | 0];
  if (pick === e.lastPick && pick !== "lances") pick = "lances";
  if (e.forcePick) (pick = e.forcePick), (e.forcePick = null);
  e.lastPick = pick;
  if (pick === "mirror") {
    // blink out; she and her copies reappear spread round the room
    const n = phase === 1 ? 2 : 3, spots = [];
    const a0 = Math.random() * TAU;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / (n + 1)) * TAU;
      spots.push([c.x + Math.cos(a) * 150, c.y - 20 + Math.sin(a) * 80]);
    }
    for (const q of g.enemies) if (q.type === "witch_clone") q.hp = 0, q.dead = true;
    g.vfx("arcane/blink-out", e.x, e.y - 40, { palette: ["#0a1020", "#2e4c8a", "#8cc0ec", "#ffffff"] });
    const real = (Math.random() * spots.length) | 0;
    spots.forEach(([x, y], i) => {
      g.vfx("arcane/blink-in", x, y - 40, { palette: ["#0a1020", "#2e4c8a", "#8cc0ec", "#ffffff"] });
      if (i === real) {
        e.x = e.tx = x;
        e.y = e.ty = y;
      } else if (g.enemies.length < 18) {
        const cl = g.spawnEnemy("witch_clone", x, y, false, 0.05);
        cl.tx = x; cl.ty = y; cl.life = 9; cl.face = e.face;
      }
    });
    g.text(c.x, c.y - 90, "哪个是真身？", "#a8e0ff", 1.3, 1.2);
    g.sound("portal", 0.5);
    e.cd = 1.6 / k;
  } else if (pick === "lances") {
    // three marked lines toward a player, then fast ice lances down them
    const q = g.alivePlayers()[(Math.random() * g.alivePlayers().length) | 0] || p;
    const base = angTo(e.x, e.y - 40, q.x, q.y - 16), n = phase === 1 ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.22;
      g.line(e.x, e.y - 40, e.x + Math.cos(a) * 420, e.y - 40 + Math.sin(a) * 420, "#a8e0ff", 8, 0.6, "warn");
      g.after(0.6, () => {
        if (e.dead) return;
        const b = shoot(g, e, a, { spd: 380, h: 40, r: 5, slow: true, kind: "ghost" });
        b.life = 1.4;
      });
    }
    g.sound("shoot_water", 0.3);
    e.cd = 1.7 / k;
  } else if (pick === "ring") {
    // a frost ring spreads from her; standing on its edge chills and hurts (dodge through it)
    g.addZone({ kind: "frostring", x: e.x, y: e.y, r: 8, life: 1.6, side: "e", update: (z) => {
      z.r = 8 + 230 * Math.min(1, z.t / 1.5);
      for (const q of g.alivePlayers()) if (Math.abs(dist(q.x, q.y, z.x, z.y) - z.r) < 10) if (g.hurt(q, 1, { src: e, x: z.x, y: z.y })) q.buff.slow = 1.8;
    } });
    g.vfx("ice/frost-nova", e.x, e.y, { opts: { reach: 50 } });
    g.sound("shoot_water", 0.3);
    e.cd = 1.9 / k;
  } else if (pick === "icicles") {
    const spots = [];
    for (const q of g.alivePlayers()) for (let i = 0; i < 5; i++) spots.push([q.x + (Math.random() - 0.5) * 150, q.y + (Math.random() - 0.5) * 100]);
    spots.push(...g.alivePlayers().map((q) => [q.x, q.y]));
    for (const [x, y] of spots) g.vfx("arcane/rune-circle", x, y, { life: 1, palette: ["#0a1a30", "#4a9ad8", "#a8e0ff", "#ffffff"] });
    g.after(0.85, () => {
      for (const [x, y] of spots) {
        g.vfx("ice/icicle-fall", x, y, {});
        g.after(0.15, () => {
          for (const q of g.alivePlayers()) if (dist(q.x, q.y, x, y) < 24) if (g.hurt(q, 1, { src: e, x, y, groundHazard: true })) q.buff.slow = 1.5;
        });
      }
      g.sound("explode", 0.3);
    });
    e.cd = 2.2 / k;
  }
}
// a mirror copy: hangs where it appeared, flings a slow shard now and then, melts away after a while
function witchClone(g, e, p, d, dt) {
  e.life = (e.life ?? 9) - dt;
  e.face = p.x < e.x ? -1 : 1;
  if (e.tx != null) moveCircle(g.map, e, (e.tx + Math.sin(e.t * 0.9 + e.id) * 20 - e.x) * dt, (e.ty + Math.cos(e.t * 1.3) * 10 - e.y) * dt, true);
  if (e.life <= 0) {
    g.vfx("spawn/poof", e.x, e.y - 30, {});
    e.hp = 0;
    e.dead = true;
    e.silent = true;
    return;
  }
  if (!g.host) return;
  e.shotT = (e.shotT ?? 1 + Math.random()) - dt;
  if (e.shotT <= 0) {
    e.shotT = 2.4;
    shoot(g, e, angTo(e.x, e.y - 40, p.x, p.y - 16), { spd: 150, h: 40, r: 5, slow: true, kind: "ghost" });
  }
}

// ----------------------------------------------------------------- 算力熔炉 boss: 熔岩巨蠕
// rears out of a lava pool and spits molten globs; then dives (can't be hit), tunnels toward a player leaving a
// burning trail, a ring marks where it will burst out, and it erupts there. From phase 2 a fire ring as it surfaces;
// from phase 3 it dives twice in a row.
function bossWorm(g, e, p, d, dt) {
  const frac = e.hp / e.maxHp, phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  e.face = 1;
  if (e.phase !== phase) {
    const first = e.phase == null;
    e.phase = phase;
    if (!first) {
      g.text(e.x, e.y - 130, phase === 2 ? "地心沸腾！" : "熔岩奔涌！", "#ff8a4a", 1.6, 1.5);
      g.sound("boss");
      spawnBossAdds(g, e, phase === 2 ? ["salamander", "bat_fire"] : ["salamander", "salamander", "bat_fire"]);
    }
  }
  const k = phase === 3 ? 1.3 : phase === 2 ? 1.12 : 1;
  if (e.st === "tunnel") {
    // underground: no hits either way; head for the mark, leave a burning trail
    e.dt -= dt;
    const a = angTo(e.x, e.y, e.lx, e.ly), dd = dist(e.x, e.y, e.lx, e.ly);
    if (dd > 4) moveCircle(g.map, e, Math.cos(a) * Math.min(dd, 260 * dt), Math.sin(a) * Math.min(dd, 260 * dt), true);
    e.trailT = (e.trailT || 0) - dt;
    if (g.host && e.trailT <= 0) (e.trailT = 0.18), g.addZone({ kind: "poison", fire: true, x: e.x, y: e.y, r: 16, life: phase >= 3 ? 4 : 2.6, side: "neutral" });
    if (e.dt <= 0) erupt(g, e, phase);
    return;
  }
  if (e.st === "mark") {
    e.dt -= dt;
    if (e.dt <= 0) (e.st = "tunnel"), (e.dt = 0.7);
    return;
  }
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 14) if (g.hurt(q, 1, e)) q.buff.burn = 2.1;
  if (e.cd > 0 || !g.host) return;
  const opts = ["spit", "dive", "spit", "dive"];
  if (phase >= 2) opts.push("spray");
  let pick = opts[(Math.random() * opts.length) | 0];
  if (e.forcePick) (pick = e.forcePick), (e.forcePick = null);
  if (pick === "dive") dive(g, e, p, phase);
  else if (pick === "spit") {
    // molten globs lobbed at and around the players; each leaves a burning puddle
    const n = phase === 1 ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const q = g.alivePlayers()[i % Math.max(1, g.alivePlayers().length)] || p;
      const tx = q.x + (i ? (Math.random() - 0.5) * 150 : 0), ty = q.y + (i ? (Math.random() - 0.5) * 100 : 0);
      const b = g.mkBullet(null, { side: "e", x: e.x, y: e.y - 96, h: 0, a: 0, spd: 0, dmg: 1, kind: "fire", r: 7, life: 3, elem: null, big: true,
        arcTo: { x0: e.x, y0: e.y - 96, x: tx, y: ty, dur: 0.8 + i * 0.1 }, onLand: (bb) => {
          g.vfx("explosions/small-explosion", bb.x, bb.y, { opts: { size: 0.5 } });
          for (const qq of g.alivePlayers()) if (dist(qq.x, qq.y, bb.x, bb.y) < 24) if (g.hurt(qq, 1, { src: e, x: bb.x, y: bb.y, groundHazard: true })) qq.buff.burn = 2.1;
          g.addZone({ kind: "poison", fire: true, x: bb.x, y: bb.y, r: 18, life: 3, side: "neutral" });
        } });
      b.src = e;
      g.bullets.push(b);
      g.vfx("arcane/rune-circle", tx, ty, { life: 0.8 + i * 0.1, palette: ["#1a0600", "#d8481c", "#ffa030", "#fff0a0"] });
    }
    g.sound("shoot_dragon", 0.3);
    e.cd = 1.8 / k;
  } else {
    // a sweeping spray of fire from the maw
    const base = angTo(e.x, e.y - 90, p.x, p.y - 16);
    for (let w = 0; w < 10; w++) g.after(w * 0.08, () => {
      if (e.dead || e.st) return;
      const a = base - 0.8 + (w / 9) * 1.6;
      shoot(g, e, a, { spd: 190, h: 90, r: 6, burn: true, kind: "fire" });
      shoot(g, e, a + 0.08, { spd: 160, h: 90, r: 5, burn: true, kind: "fire" });
    });
    g.sound("shoot_dragon", 0.3);
    e.cd = 1.9 / k;
  }
}
function dive(g, e, p, phase) {
  // sink into the floor, mark a player's spot, tunnel there
  const q = g.alivePlayers()[(Math.random() * g.alivePlayers().length) | 0] || p;
  e.st = "mark";
  e.hidden = true;
  e.dt = 0.35;
  e.lx = q.x;
  e.ly = q.y;
  e.dives = (e.dives || 0) + 1;
  g.vfx("explosions/dirt-explosion", e.x, e.y, { palette: ["#1a0600", "#5a1a06", "#d8481c", "#ffa030"] });
  g.sound("explode", 0.3);
  g.vfx("arcane/rune-circle", q.x, q.y, { life: 1.15, palette: ["#1a0600", "#d8481c", "#ffa030", "#fff0a0"] });
  g.text(q.x, q.y - 46, "！", "#ff8a4a", 1.4, 0.8);
  e.cd = 99;
}
function erupt(g, e, phase) {
  e.st = null;
  e.hidden = false;
  g.vfx("explosions/big-explosion", e.x, e.y, { opts: { size: 0.7 } });
  g.shake = Math.max(g.shake, 10);
  g.sound("explode", 0.6);
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < 52) if (g.hurt(q, 2, { src: e, x: e.x, y: e.y, groundHazard: true })) q.buff.burn = 2.1;
  if (phase >= 2) for (let i = 0; i < 16; i++) shoot(g, e, (i / 16) * TAU, { spd: 130, h: 20, r: 6, burn: true, kind: "fire" });
  // phase 3: straight back under for a second strike
  if (phase >= 3 && e.dives % 2 === 1) {
    e.cd = 0.5;
    e.forcePick = "dive";
  } else e.cd = 1.6;
}

/** 幻觉之眼's 凝视光束 angle at zone time z.t (z.a0 / z.dir travel with the zone; clients read the same) */
export const gazeAngle = (z) => (z.a0 ?? 0) + (z.dir ?? 1) * Math.min(1.8, Math.max(0, z.t - 0.7) * 0.95);

// ----------------------------------------------------------------- 无尽回廊 boss: 雷霆审判者
// floats round the hall. 网格落雷: the floor splits into a 6×4 grid, marked cells are struck 1.3 s later (stand in a
// safe cell); 连锁闪电: strikes walk from a player's spot in a chain; 雷光突进: a marked line, then it blinks along it
// in a bolt; 雷弹: a fan of volt shots. On reaching phase 2 and 3 it raises storm cores: while any stands it takes 20%
// damage, arcs run from every core to it (crossing one hurts) and 终审 charges; break them all in 12 s or the whole
// hall is struck for 2. Breaking the last core stuns it for 3 s (takes +50%).
// 爬网蜘蛛's web: you are slowed while you stand in it
function webSlow(z) {
  for (const q of z.g.alivePlayers()) if (dist(q.x, q.y, z.x, z.y) < z.r) q.buff.slow = Math.max(q.buff.slow || 0, 0.2);
}
// 熔岩迫击蜗牛's shell lands: a blast on the warning circle and a burning patch left behind
function mortarBlast(z) {
  const g = z.g;
  g.vfx("explosions/small-explosion", z.x, z.y, { palette: ["#1a0600", "#5a1a04", "#c83a0a", "#ff8a1a", "#ffd060", "#fff4c0", "#ffffff", "#ffffff"] });
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, z.x, z.y) < z.r + 6) if (g.hurt(q, 1, { src: z, x: z.x, y: z.y })) q.buff.burn = Math.max(q.buff.burn || 0, 1.2);
  g.addZone({ kind: "poison", fire: true, x: z.x, y: z.y, r: 22, life: 3, side: "neutral" });
  g.shake = Math.max(g.shake, 2);
  g.sound("explode", 0.1);
}
const segDist = (px, py, x0, y0, x1, y1) => {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L));
  return Math.hypot(px - x0 - dx * u, py - y0 - dy * u);
};
/** the 6×4 cells of a 网格落雷 (same on host and clients): mode 0 random (≥3 safe), 1 checker, 2 stripes; +10 inverts */
export function verdictCells(map, seed, mode) {
  const cols = 6, rows = 4, cw = ((map.W - 2) * T) / cols, ch = ((map.H - 2) * T) / rows, out = [], m = mode % 10;
  let s = (seed >>> 0) || 1;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const hit = m === 1 ? (i + j + seed) % 2 === 0 : m === 2 ? (i + seed) % 2 === 0 : rnd() > 0.3;
    out.push({ x: T + i * cw, y: T + j * ch, w: cw, h: ch, hit });
  }
  if (m === 0) for (let k = 0; out.filter((c) => !c.hit).length < 3 && k < 40; k++) out[(seed * 7 + k * 5) % out.length].hit = false;
  if (mode >= 10) for (const c of out) c.hit = !c.hit;
  return out;
}
// 食梦兽 (第 8 位首领 · 每日梦境 / 无尽回廊): floats round the hall. 梦泡弹 slow dream bubbles that burst into rings;
// 吞梦吐息 (signature): it inhales and drags everyone toward it for 1.6 s, then breathes a wide cone of dream mist —
// dash out sideways; 梦游冲撞 a marked charge that leaves slowing mist. At 66% and 33% it falls asleep inside four
// 梦泡 (guarded, healing 2%/s): pop them all within 10 s and it wakes stunned and vulnerable, otherwise 噩梦侵袭
// hits everyone and it wakes refreshed.
function bossBaku(g, e, p, d, dt) {
  const c = g.map.center, orbs = g.enemies.filter((q) => q.type === "dream_orb" && !q.dead && q.bakuId === e.id).length;
  if (e.sleepT > 0) {
    e.sleepT -= dt;
    e.guardT = orbs ? 1 : 0;
    e.st = "sleep";
    if (orbs && g.host) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * dt);
    if ((e.zzT = (e.zzT || 0) - dt) <= 0) (e.zzT = 1.1), g.text(e.x + 30, e.y - 110, "Zzz", "#c8d4ff", 1.1, 1);
    if (!g.host) return;
    if (!orbs) {
      // woken by the popping: stunned, takes more damage
      e.sleepT = 0;
      e.st = "idle";
      e.dazeT = 3;
      g.text(e.x, e.y - 120, "惊醒！", "#ffe060", 1.6, 1.4);
      g.vfx("holy/sunburst", e.x, e.y - 40, { palette: ["#0a0820", "#2a2a72", "#5a66c4", "#8a9ae8", "#c8d4ff", "#ffffff", "#ffffff", "#ffffff"] });
      g.sound("boss", 0.4);
    } else if (e.sleepT <= 0) {
      // 噩梦侵袭: the dream breaks over everyone; the bubbles vanish into it
      e.st = "idle";
      g.text(c.x, c.y - 120, "噩梦侵袭！", "#ff8ad8", 2, 1.6);
      for (const q of g.alivePlayers()) {
        g.vfx("shadow/dark-explosion", q.x, q.y - 10, {});
        g.hurt(q, 2, { src: e, x: q.x, y: q.y, groundHazard: true });
      }
      for (const q of g.enemies) if (q.type === "dream_orb" && q.bakuId === e.id) (q.hp = 0), (q.dead = true), (q.silent = true);
      g.sound("explode", 0.6);
      e.cd = 1.2;
    }
    return;
  }
  e.guardT = 0;
  if (e.dazeT > 0) {
    e.dazeT -= dt;
    e.vulnT = Math.max(e.vulnT || 0, 0.2);
    return;
  }
  const frac = e.hp / e.maxHp, phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (e.phase !== phase) {
    const first = e.phase == null;
    e.phase = phase;
    if (!first && g.host) {
      // falls asleep inside its dream bubbles
      e.sleepT = 10;
      const n = phase >= 3 ? 5 : 4;
      for (let i = 0; i < n; i++) {
        const q = g.spawnEnemy("dream_orb", e.x, e.y, false, 0.4);
        q.bakuId = e.id;
        q.orbA = (i / n) * TAU;
      }
      g.text(e.x, e.y - 120, "睡着了！快戳破梦泡", "#e0e8ff", 1.5, 2);
      g.sound("boss", 0.5);
      return;
    }
  }
  const k = phase === 3 ? 1.3 : phase === 2 ? 1.12 : 1, H = 46;
  // float a slow loop round the hall (not while inhaling or charging)
  if (e.st !== "inhale" && e.st !== "dash") {
    const tx = c.x + Math.sin(e.t * 0.35) * 160, ty = c.y - 30 + Math.cos(e.t * 0.5) * 50, a0 = angTo(e.x, e.y, tx, ty);
    if (dist(e.x, e.y, tx, ty) > 6) moveCircle(g.map, e, Math.cos(a0) * d.spd * dt, Math.sin(a0) * d.spd * dt, true);
    e.face = p.x < e.x ? -1 : 1;
  }
  // 吞梦: the pull, while inhaling
  if (e.st === "inhale") {
    e.face = p.x < e.x ? -1 : 1;
    for (const q of g.alivePlayers()) {
      const a = angTo(q.x, q.y, e.x, e.y), dd = dist(q.x, q.y, e.x, e.y);
      if (dd > e.r + 30) moveCircle(g.map, q, Math.cos(a) * 78 * k * dt, Math.sin(a) * 78 * k * dt, false);
    }
  }
  // 梦游冲撞: the dash itself
  if (e.st === "dash") {
    moveCircle(g.map, e, e.cvx * dt, e.cvy * dt, true);
    if ((e.trailT = (e.trailT || 0) - dt) <= 0) (e.trailT = 0.12), g.addZone({ kind: "mist", x: e.x, y: e.y, r: 26, life: 3.5, side: "e", update: mistSlow });
    for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 12) if (g.hurt(q, 1, { src: e, x: e.x, y: e.y })) q.buff.slow = 1;
  }
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 8) g.hurt(q, 1, e);
  if (e.cd > 0 || !g.host) return;
  const opts = ["bubbles", "breath", "bubbles", "charge"];
  if (phase >= 2) opts.push("breath", "charge");
  if (phase >= 3) opts.push("breath");
  let pick = opts[(Math.random() * opts.length) | 0];
  if (pick === e.lastPick && pick !== "bubbles") pick = "bubbles";
  if (e.forcePick) (pick = e.forcePick), (e.forcePick = null); // tests
  e.lastPick = pick;
  if (pick === "bubbles") {
    // slow dream bubbles at each player; each bursts into a ring of 6 small shots after 2 s
    const n = phase === 1 ? 3 : 5;
    for (const q of g.alivePlayers()) {
      const base = angTo(e.x, e.y - H, q.x, q.y - 12);
      for (let i = 0; i < n; i++) {
        const b = shoot(g, e, base + (i - (n - 1) / 2) * 0.32, { spd: 62 * k, h: H, r: 10, kind: "dream", life: 2.1 });
        g.after(2.0, () => {
          if (!g.bullets.includes(b)) return;
          b.life = 0;
          for (let j = 0; j < 6; j++) {
            const nb = g.mkBullet(null, { side: "e", x: b.x, y: b.y, h: b.h, a: (j / 6) * TAU + i, spd: 105 * k, dmg: 1, kind: "dream", r: 4, life: 2.2, elem: null });
            nb.src = e;
            g.bullets.push(nb);
          }
        });
      }
    }
    g.sound("shoot_water", 0.3);
    e.cd = 2.1 / k;
  } else if (pick === "breath") {
    // 吞梦吐息: 1.6 s inhale (everyone is dragged in), a 0.5 s marked cone, then the breath
    e.st = "inhale";
    g.text(e.x, e.y - 120, "深呼吸……", "#c8d4ff", 1.3, 1.4);
    g.vfx("arcane/portal", e.x, e.y - 30, { life: 1.6, palette: ["#0a0820", "#2a2a72", "#5a66c4", "#8a9ae8", "#c8d4ff", "#ffffff"] });
    g.sound("portal", 0.4);
    g.after(1.6, () => {
      if (e.dead || e.sleepT > 0) return void (e.st = "idle");
      const q = g.alivePlayers()[0] || p, a = angTo(e.x, e.y, q.x, q.y), half = phase >= 3 ? 0.62 : 0.5, R = 300;
      g.addZone({ kind: "cone", x: e.x, y: e.y, r: R, life: 0.55, side: "e", a0: a, half, onEnd: (z) => {
        if (e.dead) return;
        g.vfx("shadow/dark-explosion", e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 60, { palette: ["#0a0820", "#2a1a5a", "#6a3ab0", "#b07aff", "#e8c8ff", "#ffffff", "#ffffff", "#ffffff"] });
        for (const o of g.alivePlayers()) {
          const da = Math.abs(Math.atan2(Math.sin(angTo(z.x, z.y, o.x, o.y) - a), Math.cos(angTo(z.x, z.y, o.x, o.y) - a)));
          if (da < half && dist(o.x, o.y, z.x, z.y) < R) if (g.hurt(o, 2, { src: e, x: o.x, y: o.y })) o.buff.slow = 1.5;
        }
        g.sound("explode", 0.5);
        e.st = "idle";
      } });
    });
    e.cd = 3.6 / k;
  } else if (pick === "charge") {
    // 梦游冲撞: a marked line through a player, a 0.7 s wind-up, then the dash leaving mist behind
    const q = g.alivePlayers()[(Math.random() * g.alivePlayers().length) | 0] || p, a = angTo(e.x, e.y, q.x, q.y), L = Math.min(420, dist(e.x, e.y, q.x, q.y) + 140);
    g.line(e.x, e.y, e.x + Math.cos(a) * L, e.y + Math.sin(a) * L, "#c8a8ff", 12, 0.7, "warn");
    e.st = "dash-wind";
    g.after(0.7, () => {
      if (e.dead || e.sleepT > 0) return void (e.st = "idle");
      e.st = "dash";
      e.cvx = Math.cos(a) * 420 * k;
      e.cvy = Math.sin(a) * 420 * k;
      g.after(L / (420 * k), () => (e.st === "dash" ? (e.st = "idle") : 0));
      g.sound("shoot_dragon", 0.3);
    });
    e.cd = 2.6 / k;
  }
}
// 食梦兽's mist: slows anyone standing in it
function mistSlow(z) {
  for (const q of z.g.alivePlayers()) if (dist(q.x, q.y, z.x, z.y) < z.r) q.buff.slow = Math.max(q.buff.slow || 0, 0.25);
}
function bossJudge(g, e, p, d, dt) {
  const c = g.map.center, cores = g.enemies.filter((q) => q.type === "judge_core" && !q.dead && q.coreId === e.id).length;
  e.guardT = cores ? 1 : 0;
  if (e.hadCores && !cores && !e.verdictFired) {
    e.overheat = 3;
    g.text(e.x, e.y - 120, "审判中断！", "#ffe060", 1.6, 1.4);
    g.vfx("lightning/thunderclap", e.x, e.y - 40, {});
  }
  e.hadCores = cores > 0;
  if (cores) {
    e.charge = (e.charge || 0) + dt;
    const pct = Math.floor((e.charge / 12) * 4);
    if (pct !== e.chargeShown && pct > 0 && pct < 4) (e.chargeShown = pct), g.text(e.x, e.y - 130, `终审充能 ${pct * 25}%`, "#8ad8ff", 1.2, 1);
    if (e.charge >= 12 && g.host) {
      // 雷霆终审: the whole hall is struck; the cores burn out
      e.verdictFired = true;
      g.text(c.x, c.y - 120, "雷霆终审！", "#ffe060", 2, 1.6);
      g.vfx("lightning/thunderclap", e.x, e.y - 40, {});
      for (const q of g.alivePlayers()) {
        g.line(q.x, q.y - 300, q.x, q.y, "#d8f4ff", 4, 0.4, "bolt", null, 0.08);
        g.vfx("lightning/zap-hit", q.x, q.y - 10, {});
        g.hurt(q, 2, { src: e, x: q.x, y: q.y, groundHazard: true });
      }
      for (const q of g.enemies) if (q.type === "judge_core" && q.coreId === e.id) (q.hp = 0), (q.dead = true), (q.silent = true);
      g.sound("explode", 0.6);
      e.charge = 0;
    }
  } else (e.charge = 0), (e.chargeShown = 0), (e.verdictFired = false);
  if (e.overheat > 0) {
    e.overheat -= dt;
    e.vulnT = Math.max(e.vulnT || 0, 0.2);
    e.flash = Math.max(e.flash || 0, Math.sin(e.t * 30) > 0 ? 0.05 : 0);
    return;
  }
  const frac = e.hp / e.maxHp, phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (e.phase !== phase) {
    const first = e.phase == null;
    e.phase = phase;
    if (!first) {
      g.text(e.x, e.y - 120, phase === 2 ? "法庭肃静！" : "终审判决！", "#ffe060", 1.6, 1.5);
      g.vfx("lightning/thunderclap", e.x, e.y - 40, {});
      g.sound("boss");
      e.forcePick = "cores";
      e.cd = 0.3;
    }
  }
  const k = phase === 3 ? 1.3 : phase === 2 ? 1.12 : 1, H = 50;
  // drift round the hall on a slow figure-eight
  if (e.st !== "blink") {
    const tx = c.x + Math.sin(e.t * 0.4) * 170, ty = c.y - 20 + Math.sin(e.t * 0.8) * 60, a0 = angTo(e.x, e.y, tx, ty);
    if (dist(e.x, e.y, tx, ty) > 6) moveCircle(g.map, e, Math.cos(a0) * d.spd * dt, Math.sin(a0) * d.spd * dt, true);
  }
  e.face = p.x < e.x ? -1 : 1;
  for (const q of g.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < e.r + 10) if (g.hurt(q, 1, e)) q.buff.slow = 1;
  if (e.cd > 0 || !g.host) return;
  const opts = ["verdict", "volley", "chain", "verdict", "blink"];
  if (phase >= 2) opts.push("chain", "blink");
  if (phase >= 3) opts.push("verdict2", "verdict2");
  let pick = opts[(Math.random() * opts.length) | 0];
  if (pick === e.lastPick && pick !== "volley") pick = "volley";
  if (e.forcePick) (pick = e.forcePick), (e.forcePick = null);
  e.lastPick = pick;
  const verdict = (seed, mode) => {
    g.addZone({ kind: "verdict", x: c.x, y: c.y, r: 0, life: 1.75, side: "e", a0: seed, dir: mode, update: (z) => {
      if (z.struck || z.t < 1.3) return;
      z.struck = true;
      const cells = verdictCells(g.map, seed, mode);
      let n = 0;
      for (const cl of cells) if (cl.hit) {
        const x = cl.x + cl.w / 2, y = cl.y + cl.h / 2;
        g.line(x + (Math.random() - 0.5) * 30, y - 320, x, y, "#c8f0ff", 3, 0.3, "bolt", null, 0.06);
        if (n++ % 3 === 0) g.vfx("lightning/zap-hit", x, y, {});
        for (const q of g.alivePlayers()) if (q.x > cl.x && q.x < cl.x + cl.w && q.y > cl.y && q.y < cl.y + cl.h) if (g.hurt(q, 1, { src: e, x, y, groundHazard: true })) q.buff.slow = 1.2;
      }
      g.sound("explode", 0.45);
    } });
  };
  if (pick === "cores") {
    const n = phase >= 3 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.6, x = c.x + Math.cos(a) * 190, y = c.y + Math.sin(a) * 105;
      const q = g.spawnEnemy("judge_core", x, y, false, 0.5);
      q.coreId = e.id;
    }
    e.charge = 0;
    g.text(e.x, e.y - 100, "雷暴核心！12 秒内打掉它们！", "#8ad8ff", 1.4, 1.8);
    g.sound("boss", 0.5);
    e.cd = 1.4;
  } else if (pick === "verdict" || pick === "verdict2") {
    const seed = 1 + ((Math.random() * 9000) | 0), mode = phase === 1 ? 0 : [0, 1, 2][(Math.random() * 3) | 0];
    verdict(seed, mode);
    if (pick === "verdict2") g.after(1.45, () => !e.dead && verdict(seed, mode + 10)); // then the other half
    g.text(e.x, e.y - 120, pick === "verdict2" ? "反转判决！" : "落雷审判！", "#ffe060", 1.2, 1);
    g.vfx("lightning/charge-up", e.x, e.y - 40, {});
    g.sound("portal", 0.4);
    e.cd = (pick === "verdict2" ? 3.4 : 2.3) / k;
  } else if (pick === "volley") {
    const n = phase === 1 ? 5 : 7, base = angTo(e.x, e.y - H, p.x, p.y - 12);
    for (let w = 0; w < (phase >= 3 ? 2 : 1); w++)
      g.after(w * 0.35, () => {
        if (e.dead) return;
        for (let i = 0; i < n; i++) shoot(g, e, base + (i - (n - 1) / 2) * 0.17 + w * 0.085, { spd: 175 * k, h: H, r: 5, kind: "volt" });
      });
    g.sound("shoot_water", 0.3);
    e.cd = 1.5 / k;
  } else if (pick === "chain") {
    // strikes walk from a player's spot: each lands 0.28 s after the last, a short hop on
    for (const q of g.alivePlayers()) {
      let x = q.x, y = q.y, a = Math.random() * TAU;
      const hops = phase === 1 ? 4 : 6;
      for (let i = 0; i < hops; i++) {
        const sx = x, sy = y;
        g.vfx("arcane/rune-circle", sx, sy, { life: 0.7 + i * 0.28, palette: ["#0a1030", "#3a64ff", "#8ad8ff", "#ffffff"] });
        g.after(0.7 + i * 0.28, () => {
          g.line(sx, sy - 300, sx, sy, "#d8f4ff", 3, 0.28, "bolt", null, 0.05);
          for (const o of g.alivePlayers()) if (dist(o.x, o.y, sx, sy) < 26) if (g.hurt(o, 1, { src: e, x: sx, y: sy, groundHazard: true })) o.buff.slow = 1;
          g.sound("shoot_water", 0.15);
        });
        a += (Math.random() - 0.5) * 1.6;
        x = Math.max(T * 2, Math.min((g.map.W - 2) * T, x + Math.cos(a) * 48));
        y = Math.max(T * 2, Math.min((g.map.H - 2) * T, y + Math.sin(a) * 40));
      }
    }
    e.cd = 2.2 / k;
  } else if (pick === "blink") {
    // a marked line through a player; it blinks to the far end in a bolt, hurting anyone on the line
    const times = phase >= 3 ? 2 : 1;
    for (let w = 0; w < times; w++)
      g.after(w * 1.1, () => {
        if (e.dead) return;
        const q = g.alivePlayers()[(Math.random() * g.alivePlayers().length) | 0] || p, a = angTo(e.x, e.y, q.x, q.y);
        let ex = Math.max(T * 3, Math.min((g.map.W - 3) * T, q.x + Math.cos(a) * 90)), ey = Math.max(T * 3, Math.min((g.map.H - 3) * T, q.y + Math.sin(a) * 90));
        // never end inside a pillar: pull back along the line until the spot is clear
        for (let i = 0; i < 12 && tileAt(g.map, ex, ey) === WALL; i++) (ex += (e.x - ex) * 0.15), (ey += (e.y - ey) * 0.15);
        const x0 = e.x, y0 = e.y;
        g.line(x0, y0, ex, ey, "#ffe060", 10, 0.65, "warn");
        e.st = "blink";
        g.after(0.65, () => {
          if (e.dead) return;
          g.vfx("arcane/blink-out", e.x, e.y - 40, { palette: ["#0a1030", "#3a64ff", "#8ad8ff", "#ffffff"] });
          e.x = ex;
          e.y = ey;
          g.line(x0, y0 - 30, ex, ey - 30, "#c8f0ff", 4, 0.35, "bolt", null, 0.08);
          g.vfx("arcane/blink-in", ex, ey - 40, { palette: ["#0a1030", "#3a64ff", "#8ad8ff", "#ffffff"] });
          for (const o of g.alivePlayers()) if (segDist(o.x, o.y, x0, y0, ex, ey) < 22) if (g.hurt(o, 1, { src: e, x: o.x, y: o.y })) o.buff.slow = 1;
          g.sound("explode", 0.3);
          e.st = "idle";
        });
      });
    e.cd = (times === 2 ? 3 : 1.9) / k;
  }
}
