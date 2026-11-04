// The simulation: players, enemies, bullets, zones, pickups, rooms. The host (or solo) runs it; clients mirror it.
import { T, BAL, CHARS, CHAR_ORDER, ELEM, ELEM_KEYS, REACTIONS, reactionKey, ENEMIES, RUN, ITEMS, ITEM_WEIGHTS, CARDS, fusionCards, RARITY, REWARD, MAPS, endlessRoom, PVP_MODES } from "./data.js";
import { clamp, dist, dist2, angTo, R, rng, nid, TAU } from "./util.js";
import { generateRoom, renderGround, tileAt, mudAt, moveCircle, los, flowField, flowDir, WALL, WATER, BUSH, CRATE, BARREL, BLOCKS_SHOT } from "./map.js";
import { sfx } from "./audio.js";
import { castSkill, castUlt, fireAttack, onBulletHit } from "./skills.js";
import { updateEnemy, spawnBossAdds } from "./enemies.js";

export const RIFT_CHANCE = 0.25;
export class Game {
  constructor({ mode = "solo", pvp = false, seed = (Math.random() * 1e9) | 0, fx, opt = {} }) {
    this.mode = mode; // solo | host | client
    this.pvp = pvp;
    // mode options: map (chapter) for PVE, endless corridor, PVP rule set
    this.opt = { map: MAPS[opt.map] ? opt.map : "grass", endless: !!opt.endless, pvpMode: PVP_MODES[opt.pvpMode] ? opt.pvpMode : "brawl" };
    this.endless = !pvp && this.opt.endless;
    this.mapDef = MAPS[this.opt.map];
    this.pvpRule = PVP_MODES[this.opt.pvpMode];
    this.seed = seed;
    this.fx = fx;
    this.players = [];
    this.enemies = [];
    this.bullets = [];
    this.zones = [];
    this.pickups = [];
    this.floaters = [];
    this.lines = []; // short-lived lightning/beam lines
    this.timers = [];
    this.events = []; // for the network: fx/sfx/text the clients replay
    this.roomIdx = -1;
    this.phase = "init";
    this.time = 0;
    this.shake = 0;
    this.runStats = { kills: 0, elites: 0, reactions: 0, rooms: 0, boss: false, dmg: 0, coins: 0 };
    this.flowT = 0;
    this.banner = null;
    this.cardOffers = {}; // pid -> [cards]
    this.onUi = () => {};
    this.pvpScore = {};
  }
  get host() {
    return this.mode !== "client";
  }

  // ------------------------------------------------------------ players
  addPlayer({ id, cid, name, local, kit }) {
    const c = CHARS[cid];
    // every player is built from their own meta progression (sent by their client), not the host's save
    kit = kit && kit.tal ? kit : { tal: {}, eq: {}, cards: [] };
    const talent = (k) => +kit.tal[k] || 0;
    const p = {
      id, cid, name, local, kind: "player",
      x: 0, y: 0, r: 12, vx: 0, vy: 0, face: 0, moving: false, animT: Math.random() * 3,
      hp: c.hp + talent("t_hp"), maxHp: c.hp + talent("t_hp"), core: kit.core ? 1 : 0, shield: c.shield + talent("t_shield2"), maxShield: c.shield + talent("t_shield2"),
      atkCd: 0, atkCount: 0, rampT: 0, idleFire: 1, skillCd: 0, ult: 0.3 * talent("t_ult"), dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0,
      invuln: 0, hurtT: 0, lastHit: 99, shieldT: 0, recoil: 0, castT: 0,
      st: { dmg: 1 + 0.04 * talent("t_dmg"), rate: 1 + 0.02 * talent("t_rate"), crit: 0.05 + 0.03 * talent("t_crit"), multi: 0, pierce: 0, bounce: 0, speed: 1 + 0.03 * talent("t_speed"), range: 1 + 0.03 * talent("t_range"), bspd: 1, size: 1, cd: 1 - 0.04 * talent("t_cd"), ultG: 1, vamp: 0, coin: 1 + 0.12 * talent("t_coin"), shieldRegen: 1 + 0.1 * talent("t_shield"), mag: 1 + 0.15 * talent("t_magnet"), elite: 1 + 0.05 * talent("t_elite"), replay: 0.1 * talent("t_replay") },
      cards: {}, fusions: [], links: [],
      buff: {}, // name -> seconds left
      coins: 15 * talent("t_start_coin"), cubes: 0,
      downed: false, reviveT: 0, dead: false, revives: kit.eq.t_revive ? 1 : 0, kit, fwCd: 0,
      target: null, input: { mx: 0, my: 0, atk: false, aim: null, skill: false, ult: false, dash: false, castAim: {} },
      dodgeCrit: 0, sunCd: 0, barrier: 0, breathT: 0, orbs: 0, kills: 0, pvpAcc: 0, respawnT: 0,
    };
    this.players.push(p);
    return p;
  }
  player(id) {
    return this.players.find((p) => p.id === id);
  }
  alivePlayers() {
    return this.players.filter((p) => !p.downed && !p.dead);
  }

  // ------------------------------------------------------------ rooms
  startRun() {
    this.roomIdx = -1;
    this.nextRoom();
  }
  /** host: apply every player's equipped SSR talents at the start of a run / match */
  applyLoadouts() {
    for (const p of this.players) {
      const eq = p.kit.eq;
      if (eq.t_overclock) {
        p.st.ultG *= 1.3;
        p.ult = Math.max(p.ult, 0.5);
      }
      if (eq.u_echo) applyCard(this, p, "echo");
      if (eq.u_second_ult) applyCard(this, p, "second_ult");
      if (eq.u_links) applyCard(this, p, "fs_" + R.pick(CHAR_ORDER.filter((id) => id !== p.cid)));
      if (eq.t_startcard) {
        const n = Math.min(2, +eq.t_startcard || 1);
        if (this.pvp) {
          // PVP: no time to pick, so they're dealt at random from the basic combat cards
          const pool = CARDS.filter((c) => !c.locked && c.id !== "coin_up");
          for (let i = 0; i < n; i++) applyCard(this, p, R.pick(pool).id);
        } else p.startCards = n;
      }
    }
    if (!this.pvp) for (const p of this.players) if (p.startCards > 0) (p.startCards--, this.offerCards(p, 3, "SR"));
    this.onUi("hud");
  }
  nextRoom() {
    this.roomIdx++;
    const def = this.pvp ? { kind: "combat", waves: [], items: 6 } : this.roomDef(this.roomIdx);
    if (!def) return this.victory();
    this.loadRoom(this.roomIdx, def);
    if (this.host) this.emit({ t: "room", idx: this.roomIdx, seed: this.seed });
  }
  roomDef(i) {
    if (this.endless) {
      const d = endlessRoom(i, this.seed), md = this.roomMap(i);
      return d && d.kind === "boss" && md.boss ? { ...d, boss: md.boss } : d;
    }
    return this.mapRoom(RUN[i]);
  }
  /** the map (chapter) swaps some enemies for its own residents */
  mapRoom(def) {
    const md = this.mapDef;
    if (def && def.kind === "boss" && md.boss) return { ...def, boss: md.boss };
    if (!def || !def.waves || !md.swap) return def;
    const rr = rng(this.seed + 4242 + (def.waves.length || 0));
    const sw = md.swap, el = md.elites || [];
    return { ...def, waves: def.waves.map((w) => w.map((k) => {
      const base = k.replace("*", ""), star = k.endsWith("*") ? "*" : "";
      // elites: half of them are this map's own elite monster
      if (star && el.length && rr() < 0.5) return el[Math.floor(rr() * el.length)] + star;
      return sw[base] && rr() < sw[base][1] ? sw[base][0] + star : k;
    })) };
  }
  /** which map's look / hazard a room uses (endless walks through all of them, 10 floors each) */
  roomMap(idx) {
    if (this.pvp) return MAPS[this.opt.map] || MAPS.grass;
    if (!this.endless) return this.mapDef;
    const ids = Object.keys(MAPS);
    return MAPS[ids[Math.floor(idx / 10) % ids.length]];
  }
  loadRoom(idx, def) {
    this.room = def;
    const kind = def.kind;
    const md = this.roomMap(idx);
    // every room uses its own map's look and floor hazard (the boss fights on home ground); shops have no hazard patches
    this.hazard = md.hazard;
    this.map = generateRoom(this.pvp ? "combat" : kind, this.seed + idx * 1013, md.theme, { hazard: this.hazard, koth: this.pvp && this.opt.pvpMode === "koth" });
    if (kind === "shop") this.map.mud.fill(0);
    this.ground = renderGround(this.map);
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.zones.length = 0;
    this.pickups.length = 0;
    this.lines.length = 0;
    this.timers.length = 0;
    this.fx.clearAll();
    this.wave = -1;
    this.waveDelay = 1.6;
    this.portal = null;
    this.chest = null;
    this.shovelItem = null;
    this.cardOffers = {};
    const rr = rng(this.seed + idx * 31);
    // players at spawn
    this.players.forEach((p, i) => {
      const sp = this.pvp ? this.map.spots[(rr.int(0, this.map.spots.length - 1) + i * 37) % this.map.spots.length] : this.map.spawn;
      p.x = sp.x + (this.pvp ? 0 : (i % 2) * 26 - 13);
      p.y = sp.y + (this.pvp ? 0 : (i >> 1) * 26 - 13);
      p.downed = false;
      p.dead = false;
      if (p.hp <= 0) p.hp = 1;
      p.dashT = 0;
      p.invuln = 1;
      this.fx.spawn("arcane/magic-circle-cast", p.x, p.y + 4, { palette: ELEM[CHARS[p.cid].elem].ramp, speed2: 1.8 });
    });
    // map items
    if (this.host) {
      const n = def.items || 0;
      for (let i = 0; i < n; i++) {
        const s = rr.pick(this.map.itemSpots);
        this.spawnItem(rr.weighted(Object.keys(ITEM_WEIGHTS), (k) => ITEM_WEIGHTS[k]), s.x, s.y, true);
      }
      // poison zones (debuff hazard) from the second room on
      if (kind === "combat" && idx >= 1) {
        const k = rr.int(1, 2);
        for (let i = 0; i < k; i++) {
          const s = rr.pick(this.map.itemSpots);
          this.addZone({ kind: "poison", x: s.x, y: s.y, r: 30, life: 1e9, side: "neutral" });
          const s2 = { x: this.map.pxW - s.x, y: this.map.pxH - s.y };
          this.addZone({ kind: "poison", x: s2.x, y: s2.y, r: 30, life: 1e9, side: "neutral" });
        }
      }
    }
    // SSR 检索增强: a random map item lands next to each player who equipped it (combat rooms, not the arena)
    if (this.host && !this.pvp && kind === "combat")
      for (const p of this.players) if (p.kit && p.kit.eq.t_rag) {
        const s = this.map.itemSpots.reduce((b, q) => (dist(q.x, q.y, p.x, p.y) > 40 && (!b || dist(q.x, q.y, p.x, p.y) < dist(b.x, b.y, p.x, p.y)) ? q : b), null);
        if (s) this.spawnItem(rr.weighted(Object.keys(ITEM_WEIGHTS), (k) => ITEM_WEIGHTS[k]), s.x, s.y, true);
      }
    if (kind === "shop") this.setupShop();
    this.phase = kind === "shop" ? "shop" : "fight";
    if (this.pvp) this.phase = "pvp";
    const floor = this.endless ? `无尽回廊 · 第 ${idx + 1} 层` : `第 ${idx + 1} 层 · ${md.name}`;
    this.banner = { text: this.pvp ? `竞技场 · ${this.pvpRule.name}` : kind === "boss" ? (this.endless ? `第 ${idx + 1} 层 · 首领` : `首领 · ${(ENEMIES[def.boss] || ENEMIES.boss_eye).name}`) : kind === "shop" ? "补给站" : floor, sub: this.pvp ? this.pvpRule.goalText : kind === "shop" ? "扭蛋机 / 补给 · 准备好后进入传送门" : kind === "boss" ? "击败它！" : md.hazardText || "清除所有敌人", t: 2.4 };
    if (kind === "boss") sfx("boss");
    this.flowT = 0;
    this.onUi("room");
  }
  setupShop() {
    const c = this.map.center, s = 70;
    const items = [
      { id: "gacha", name: "扭蛋机", price: 30, x: c.x - s * 1.6, y: c.y - 20 },
      { id: "heal", name: "血包 +3", price: 20, x: c.x - s * 0.55, y: c.y - 20 },
      { id: "maxshield", name: "护盾上限 +1", price: 35, x: c.x + s * 0.55, y: c.y - 20 },
      { id: "cube", name: "算力方块", price: 25, x: c.x + s * 1.6, y: c.y - 20 },
    ];
    this.shop = items.map((it) => ({ ...it, id2: nid() }));
    this.portal = { x: c.x, y: c.y + 110, t: 0 };
    this.fx.spawn("arcane/portal", this.portal.x, this.portal.y + 8, { layer: "back" });
    // a free supply chest
    this.chest = { x: c.x, y: c.y + 40, opened: false };
  }
  spawnWave() {
    const waves = this.room.boss ? [[this.room.boss]] : this.room.waves || [];
    this.wave++;
    if (this.wave >= waves.length) return false;
    if (this.room.boss) {
      const c = this.map.center;
      this.spawnEnemy(this.room.boss, c.x, c.y - 60, false, 1.4);
      return true;
    }
    const list = [...waves[this.wave]];
    const np = this.players.length;
    const extra = Math.round(list.length * BAL.coop.count * (np - 1));
    const rr = rng(this.seed + this.roomIdx * 97 + this.wave);
    for (let i = 0; i < extra; i++) list.push(rr.pick(waves[this.wave]).replace("*", ""));
    const spots = rr.shuffle([...this.map.spots]).filter((s) => this.players.every((p) => dist(s.x, s.y, p.x, p.y) > 150));
    list.forEach((k, i) => {
      const elite = k.endsWith("*");
      const s = spots[i % spots.length];
      this.spawnEnemy(k.replace("*", ""), s.x, s.y, elite, 0.6 + i * 0.12);
    });
    sfx("spawn");
    return true;
  }
  spawnEnemy(type, x, y, elite = false, delay = 0.8) {
    const d = ENEMIES[type], np = this.players.length;
    const mapK = this.endless ? 1 : this.mapDef.hp || 1;
    const hpMul = 1.5 * (1 + BAL.roomHp * Math.max(0, this.roomIdx)) * (1 + BAL.coop.hp * (np - 1)) * (elite ? 3 : 1) * mapK;
    const bossK = (1 + BAL.coop.hp * (np - 1)) * mapK * (this.endless ? 0.55 + 0.35 * Math.floor(this.roomIdx / 10) : 1);
    const e = {
      id: nid(), kind: "enemy", type, def: d, x, y, r: d.r * (elite ? 1.2 : 1) * (d.scale || 1), hp: d.hp * (d.boss ? bossK : hpMul), elite, boss: !!d.boss,
      vx: 0, vy: 0, kbx: 0, kby: 0, t: 0, cd: 1 + Math.random() * 1.5, st: "idle", anim: Math.random() * 5, face: 1, flash: 0,
      marks: {}, tide: 0, tideBy: null, sun: 0, bubble: 0, inkMark: 0, inkCd: 0, burnT: 0, burnDps: 0, slowT: 0, slowK: 0, stunT: 0, freezeT: 0, vulnT: 0, burnTick: 0,
      spawnT: delay, wob: Math.random() * 6, lastBy: null,
    };
    e.maxHp = e.hp;
    this.enemies.push(e);
    if (delay > 0) this.fx.spawn("spawn/spawn-portal", x, y + 4, { layer: "back", speed2: 1.6, life: delay + 0.4, palette: elite ? ["#1a0800", "#4a1a00", "#8a3a00", "#c86a10", "#ffa030", "#ffd070", "#fff0c0", "#ffffff"] : undefined });
    return e;
  }

  // ------------------------------------------------------------ helpers
  emit(ev) {
    if (this.mode === "host") this.events.push(ev);
  }
  /** fx that also replays on clients */
  vfx(id, x, y, o = {}) {
    const f = this.fx.spawn(id, x, y, o);
    if (this.mode === "host") {
      const oo = { ...o };
      if (oo.follow) (oo.followId = oo.follow.id), delete oo.follow;
      this.events.push({ t: "fx", id, x: Math.round(x), y: Math.round(y), o: oo });
    }
    return f;
  }
  sound(n, gap) {
    sfx(n, gap);
    if (this.mode === "host") this.events.push({ t: "snd", n });
  }
  text(x, y, s, color = "#fff", size = 1, life = 0.8) {
    this.floaters.push({ x, y, s: String(s), color, size, life, max: life, vy: -38 });
    if (this.mode === "host") this.events.push({ t: "txt", x: Math.round(x), y: Math.round(y), s: String(s), c: color, z: size });
  }
  line(x0, y0, x1, y1, color, w = 2, life = 0.18, kind = "zap") {
    this.lines.push({ x0, y0, x1, y1, color, w, life, max: life, kind, seed: Math.random() * 1000 });
    if (this.mode === "host") this.events.push({ t: "ln", a: [x0, y0, x1, y1].map(Math.round), c: color, w, l: life, k: kind });
  }
  after(t, fn) {
    this.timers.push({ t, fn });
  }
  addZone(z) {
    z.id = nid();
    z.t = 0;
    z.tick = 0;
    this.zones.push(z);
    return z;
  }
  enemiesNear(x, y, r, filter) {
    const out = [];
    for (const e of this.enemies) if (e.spawnT <= 0 && !e.dead && dist2(x, y, e.x, e.y) <= (r + e.r) * (r + e.r) && (!filter || filter(e))) out.push(e);
    return out;
  }
  nearestEnemy(x, y, r, exclude) {
    let best = null, bd = r * r;
    for (const e of this.enemies) {
      if (e.spawnT > 0 || e.dead || (exclude && exclude.has(e.id))) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) (bd = d), (best = e);
    }
    return best;
  }
  /** lock-on: nearest visible enemy in range, sticky to the current target */
  findTarget(p) {
    const range = CHARS[p.cid].atk.range * p.st.range;
    const cand = [];
    for (const e of this.enemies) {
      if (e.spawnT > 0 || e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > range + e.r) continue;
      const inBush = tileAt(this.map, e.x, e.y) === BUSH && d > 80;
      if (inBush) continue;
      cand.push({ e, d: d * (los(this.map, p.x, p.y - 10, e.x, e.y - 8) ? 1 : 1.8) });
    }
    if (this.pvp) {
      for (const o of this.players) {
        if (o === p || o.dead || o.downed) continue;
        const d = dist(p.x, p.y, o.x, o.y);
        if (d > range) continue;
        if (tileAt(this.map, o.x, o.y) === BUSH && d > 70) continue;
        cand.push({ e: o, d: d * (los(this.map, p.x, p.y - 10, o.x, o.y - 10) ? 1 : 1.8) });
      }
    }
    if (!cand.length) return null;
    cand.sort((a, b) => a.d - b.d);
    const cur = cand.find((c) => c.e === p.target);
    if (cur && cur.d < cand[0].d * 1.5) return cur.e;
    return cand[0].e;
  }

  // ------------------------------------------------------------ combat
  dmgMul(p) {
    let m = p.st.dmg * (1 + 0.06 * p.cubes);
    if (p.buff.star > 0) m *= 1.3;
    if (p.cards.low_rage && p.hp <= 2) m *= 1.6;
    if (p.kit && p.kit.eq.t_moe && p.hp * 2 <= p.maxHp) m *= 1.3; // SSR 混合专家
    return m;
  }
  /** damage an enemy (or a PVP player). src: {p, elem, crit?, noReact, kind, noCrit} */
  hit(e, amount, src = {}) {
    if (!e || e.dead || e.spawnT > 0) return 0;
    if (e.kind === "player") return this.hitPlayerPvp(e, amount, src);
    const p = src.p;
    let dmg = amount * (p ? this.dmgMul(p) : 1);
    let crit = false;
    if (p && !src.noCrit) {
      const c = p.dodgeCrit > 0 ? 1 : p.st.crit;
      if (Math.random() < c) (crit = true), (dmg *= BAL.critMul);
    }
    if (p && (e.elite || e.boss)) dmg *= p.st.elite || 1; // 对抗训练
    if (e.vulnT > 0) dmg *= 1.25;
    if (e.freezeT > 0) dmg *= 1.15;
    dmg = Math.max(0.5, dmg);
    e.hp -= dmg;
    e.flash = 0.1;
    e.lastBy = p ? p.id : e.lastBy;
    if (p) {
      p.ult = Math.min(1, p.ult + (dmg / CHARS[p.cid].ult.need) * p.st.ultG * (p.buff.ultOn > 0 ? 0.25 : 1));
      this.runStats.dmg += dmg;
    }
    const col = crit ? "#ffe14a" : src.elem ? ELEM[src.elem].glow : "#ffffff";
    this.text(e.x + (Math.random() - 0.5) * 10, e.y - e.r * 2 - 8, Math.round(dmg), col, crit ? 1.35 : 1, 0.6);
    if (!e.boss && src.x != null) this.knock(e, src.x, src.y, crit ? 70 : 35);
    if (crit && this.mode === "solo") this.hitStop = Math.max(this.hitStop || 0, 0.03);
    if (crit) this.vfx("impacts/hit-spark", e.x, e.y - e.r, { palette: ["#1a1000", "#5a3a00", "#a87000", "#f0b000", "#ffe14a", "#fff6b0", "#ffffff"] });
    this.sound(crit ? "crit" : "hit", 0.04);
    // elements & reactions
    if (src.elem && !src.noReact) this.applyElem(e, src.elem, p);
    if (e.hp <= 0) this.kill(e, p);
    return dmg;
  }
  applyElem(e, elem, p) {
    if (e.dead) return;
    const now = this.time;
    // look for a different live mark to react with
    for (const k of ELEM_KEYS) {
      if (k === elem || !(e.marks[k] > now)) continue;
      const key = reactionKey(k, elem);
      if (!key) continue;
      delete e.marks[k];
      this.react(e, key, p, k === "bubble" ? elem : k === elem ? k : elem === "bubble" ? k : elem);
      return;
    }
    e.marks[elem] = now + BAL.markTime * (p && p.cards.element_spread ? 1.5 : 1);
    if (p && p.cards.element_spread && Math.random() < 0.25) {
      const o = this.nearestEnemy(e.x, e.y, 70, new Set([e.id]));
      if (o) (o.marks[elem] = now + BAL.markTime), this.line(e.x, e.y - 8, o.x, o.y - 8, ELEM[elem].glow, 1, 0.15, "beam");
    }
  }
  react(e, key, p, spreadElem) {
    const R0 = REACTIONS[key], amp = p && p.cards.reaction_amp ? 1 + 0.6 * p.cards.reaction_amp : 1;
    const dmg = R0.dmg * amp * (1 + 0.08 * Math.max(0, this.roomIdx));
    this.runStats.reactions++;
    if (p) p.reactions = (p.reactions || 0) + 1;
    this.text(e.x, e.y - e.r * 2 - 22, R0.name + "!", "#ffffff", 1.25, 0.9);
    this.sound("reaction", 0.05);
    const src = { p, noReact: true, noCrit: false };
    const [a, b] = key.split("+");
    const col = key === "bubble" ? ELEM.bubble.ramp : ELEM[b || a].ramp;
    switch (R0.kind) {
      case "chain": {
        let from = e, seen = new Set([e.id]);
        this.hit(e, dmg * 0.6, src);
        for (let i = 0; i < 4; i++) {
          const n = this.nearestEnemy(from.x, from.y, 100, seen);
          if (!n) break;
          seen.add(n.id);
          this.line(from.x, from.y - 10, n.x, n.y - 10, "#fff6a0", 2, 0.22, "zap");
          this.vfx("lightning/zap-hit", n.x, n.y - 10, { palette: ELEM.thunder.ramp, light: 0.8 });
          this.hit(n, dmg, src);
          from = n;
        }
        break;
      }
      case "blast": {
        const fxid = R0.fx === "plasma" ? "explosions/plasma-explosion" : R0.fx === "sun" ? "holy/sunburst" : "water/splash";
        const pal = R0.fx === "steam" ? ["#20242a", "#4a525c", "#7a8590", "#aab4be", "#d0d8e0", "#e8eef4", "#f8fbff", "#ffffff"] : R0.fx === "sun" ? ELEM.sun.ramp : ELEM.dragon.ramp;
        this.vfx(fxid, e.x, e.y - (R0.fx === "steam" ? 0 : 10), { palette: pal, life: R0.fx === "sun" ? 0.7 : Infinity, opts: R0.fx === "steam" ? { stone: false } : {} });
        for (const o of this.enemiesNear(e.x, e.y, R0.r)) {
          this.hit(o, dmg, src);
          if (!o.boss) this.knock(o, e.x, e.y, 180);
        }
        this.shake = Math.max(this.shake, 4);
        break;
      }
      case "dot":
        e.burnT = 3;
        e.burnDps = dmg;
        
        {
          const o = this.nearestEnemy(e.x, e.y, 70, new Set([e.id]));
          if (o) (o.burnT = 3), (o.burnDps = dmg * 0.6);
        }
        this.hit(e, dmg, src);
        break;
      case "eclipse":
        this.vfx("shadow/eclipse", e.x, e.y - 20, { life: 0.8 });
        this.hit(e, dmg, src);
        if (!e.boss) e.stunT = 0.9;
        else e.stunT = 0.25;
        break;
      case "strike":
        this.vfx("lightning/lightning-strike", e.x, e.y, { palette: ELEM.sun.ramp, speed2: 1.8 });
        this.after(0.25, () => {
          for (const o of this.enemiesNear(e.x, e.y, R0.r)) this.hit(o, dmg, src);
          this.shake = Math.max(this.shake, 5);
        });
        break;
      case "rainbow":
        this.hit(e, dmg, src);
        for (const q of this.alivePlayers()) if (dist(q.x, q.y, e.x, e.y) < 160) (q.shield = Math.min(q.maxShield, q.shield + 1)), this.vfx("holy/heal-aoe", q.x, q.y, {palette: ["#0a1420", "#1a3a5a", "#2a7aaa", "#5ac0e0", "#a0f0ff", "#ffe0a0", "#fff6e0", "#ffffff"], opts: { reach: 34 }, speed2: 1.6 });
        break;
      case "soak":
        e.slowT = 2.5;
        e.slowK = 0.6;
        e.vulnT = 3;
        
        this.hit(e, dmg, src);
        break;
      case "multi":
        for (let i = 0; i < 3; i++)
          this.after(i * 0.18, () => {
            if (e.dead) return;
            this.line(e.x + 30, e.y - 120, e.x, e.y - 8, "#d8d0ff", 2, 0.15, "zap");
            this.vfx("lightning/zap-hit", e.x, e.y - 8, { palette: ELEM.ink.ramp });
            this.hit(e, dmg, src);
          });
        break;
      case "spread": {
        this.vfx("pickups/collect-burst", e.x, e.y - 6, { palette: ELEM.bubble.ramp });
        for (const o of this.enemiesNear(e.x, e.y, R0.r)) {
          this.hit(o, dmg, src);
          if (spreadElem && spreadElem !== "bubble" && o !== e) o.marks[spreadElem] = this.time + BAL.markTime;
        }
        break;
      }
    }
  }
  knock(e, fx, fy, power) {
    if (e.boss) return;
    const a = angTo(fx, fy, e.x, e.y);
    e.kbx += Math.cos(a) * power;
    e.kby += Math.sin(a) * power;
  }
  kill(e, p) {
    if (e.dead) return;
    e.dead = true;
    this.runStats.kills++;
    if (e.elite) this.runStats.elites++;
    if (p) p.kills++;
    if (p && (e.elite || e.boss) && p.st.replay) p.ult = Math.min(1, p.ult + p.st.replay); // 经验回放
    const col = { slime: ["#061412", "#12594a", "#47c752", "#a6f06a", "#f0ffd2"], slime_purple: ["#140a1e", "#4d1f6e", "#b05be0", "#e0a6ff", "#fff0ff"] }[e.type];
    this.vfx("spawn/poof", e.x, e.y + 2, col ? { palette: col } : {});
    this.sound("kill", 0.05);
    this.shake = Math.max(this.shake, e.elite ? 6 : 2);
    if (this.mode === "solo") this.hitStop = Math.max(this.hitStop || 0, e.elite || e.boss ? 0.09 : 0.025);
    // last enemy of the last wave: a beat of slow motion
    if (this.mode === "solo" && this.phase === "fight" && this.enemies.every((o) => o.dead) && this.wave >= (this.room.boss ? 0 : (this.room.waves || []).length - 1)) this.slowmo = 0.7;
    // drops
    const [c0, c1] = e.def.coin;
    const n = c0 + Math.floor(Math.random() * (c1 - c0 + 1)) + (e.elite ? 4 : 0);
    for (let i = 0; i < n; i++) this.spawnCoin(e.x, e.y);
    if (e.elite || Math.random() < 0.06) {
      const k = R.weighted(Object.keys(ITEM_WEIGHTS), (k) => ITEM_WEIGHTS[k]);
      this.spawnItem(e.elite ? R.pick(["cube", "star", "rage", "infuse"]) : k, e.x, e.y);
    }
    if (p) {
      if (p.cards.vamp && Math.random() < 0.08 * p.cards.vamp && p.hp < p.maxHp) (p.hp++), this.text(p.x, p.y - 60, "+1", "#ff6a8a");
      if (p.cards.kill_boom) {
        this.vfx("explosions/cartoon-pow", e.x, e.y - 10, { life: 0.5, text: "" });
        for (const o of this.enemiesNear(e.x, e.y, 46)) if (o !== e) this.hit(o, 10 * p.cards.kill_boom, { p, noReact: true });
      }
    }
    if (e.def.puddle) this.addZone({ kind: "poison", x: e.x, y: e.y, r: 22, life: 5, side: "neutral" });
    if (e.def.lavaPuddle) this.addZone({ kind: "poison", fire: true, x: e.x, y: e.y, r: 24, life: 4, side: "neutral" });
    if (e.def.split && !e.boss) for (const s of [-1, 1]) this.spawnEnemy(e.def.split, e.x + s * 16, e.y + 4, false, 0.15);
    if (e.type === "wisp" && e.st !== "boom") this.explodeAt(e.x, e.y, 34, 0, 12, null);
    if (e.boss) this.bossDown(e);
  }
  spawnCoin(x, y) {
    const a = Math.random() * TAU, s = 40 + Math.random() * 70;
    this.pickups.push({ id: nid(), kind: "coin", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: 90, t: 0, life: 25 });
  }
  spawnItem(item, x, y, placed = false) {
    const it = { id: nid(), kind: "item", item, x, y, vx: 0, vy: 0, z: placed ? 0 : 0, vz: placed ? 0 : 120, t: Math.random() * 3, life: 1e9 };
    if (!placed) {
      const a = Math.random() * TAU;
      it.vx = Math.cos(a) * 40;
      it.vy = Math.sin(a) * 40;
    }
    this.pickups.push(it);
    return it;
  }
  explodeAt(x, y, r, playerDmg, enemyDmg, p) {
    this.vfx("explosions/small-explosion", x, y + 8, { opts: { size: r > 45 ? 0.8 : 0.55 }, speed2: 1.3 });
    this.sound("explode");
    this.shake = Math.max(this.shake, 7);
    for (const o of this.enemiesNear(x, y, r)) {
      this.hit(o, enemyDmg, { p, noReact: true, noCrit: true });
      this.knock(o, x, y, 240);
    }
    if (playerDmg) for (const q of this.alivePlayers()) if (dist(q.x, q.y, x, y) < r + q.r) this.hurt(q, playerDmg, { x, y });
    // chain to barrels/crates
    const m = this.map;
    for (let ty = Math.floor((y - r) / T); ty <= Math.floor((y + r) / T); ty++)
      for (let tx = Math.floor((x - r) / T); tx <= Math.floor((x + r) / T); tx++) {
        const i = ty * m.W + tx;
        if (m.crates[i] && dist(x, y, tx * T + 16, ty * T + 16) < r + 12) this.damageTile(i, 40, p);
      }
  }
  /** area attacks that are not bullets (breath cones, shock rings) also hit crates and barrels.
   *  cone: optional [angle, halfWidth] — only tiles whose centre lies inside that cone count */
  hitTilesIn(x, y, r, dmg, p, cone) {
    if (!this.host) return;
    const m = this.map;
    for (let ty = Math.floor((y - r) / T); ty <= Math.floor((y + r) / T); ty++)
      for (let tx = Math.floor((x - r) / T); tx <= Math.floor((x + r) / T); tx++) {
        if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) continue;
        const i = ty * m.W + tx, cx = tx * T + 16, cy = ty * T + 16;
        if (!m.crates[i] || dist(x, y, cx, cy) > r + 12) continue;
        if (cone && Math.abs(((angTo(x, y, cx, cy) - cone[0] + Math.PI * 3) % TAU) - Math.PI) > cone[1]) continue;
        this.damageTile(i, dmg, p);
      }
  }
  damageTile(i, dmg, p) {
    const m = this.map, c = m.crates[i];
    if (!c || c.dead) return;
    c.hp -= dmg;
    c.flash = 0.1;
    if (c.hp > 0) return;
    c.dead = true;
    const kind = m.t[i];
    m.t[i] = 0;
    const x = (i % m.W) * T + 16, y = Math.floor(i / m.W) * T + 16;
    this.emit({ t: "tile", i });
    if (kind === BARREL) {
      this.explodeAt(x, y, 58, 1, 26, p);
    } else {
      this.vfx("spawn/poof", x, y + 6, { palette: ["#2a1a10", "#6a4020", "#b8742e", "#e0a050", "#ffd090", "#ffffff"] });
      this.sound("kill");
      if (Math.random() < 0.55) this.spawnItem(R.weighted(Object.keys(ITEM_WEIGHTS), (k) => ITEM_WEIGHTS[k]), x, y);
      else for (let k = 0; k < 3; k++) this.spawnCoin(x, y);
    }
    this.flowT = 0;
  }

  /**
   * 无尽回廊: enemies hit harder the deeper you go. Floor L (1-based): minions ×(1 + 0.05·(L-1)), elites another
   * +3%/floor, bosses another +4%/floor (their base hits are already big). Damage stays whole hearts: the fraction
   * is rolled (×1.6 on a 1-damage hit = 2 with 60% chance). Floor 20: minion ≈ ×1.95, elite ≈ ×2.5, boss ≈ ×2.7.
   */
  scaleHurt(n, src) {
    if (!this.endless || this.pvp) return n;
    const e = src && (src.kind === "enemy" ? src : src.src && src.src.kind === "enemy" ? src.src : null);
    if (!e) return n;
    const L = Math.max(0, this.roomIdx);
    const k = 1 + 0.05 * L + (e.elite ? 0.03 * L : 0) + (e.boss ? 0.04 * L : 0);
    const v = n * k, w = Math.floor(v);
    return w + (Math.random() < v - w ? 1 : 0);
  }
  /** hurt a player by n points */
  hurt(p, n, src = {}) {
    if (!p || p.dead || p.downed) return false;
    if (p.invuln > 0 || p.dashT > 0 || p.buff.star > 0) return false;
    if (p.barrier > 0) {
      p.barrier = 0;
      this.vfx("impacts/shield-block", p.x, p.y, { palette: ELEM.sun.ramp, flip: (src.x ?? p.x) < p.x });
      p.invuln = 0.4;
      this.barrierBurst(p);
      return false;
    }
    for (const z of this.zones) if (z.kind === "domain" && dist(p.x, p.y, z.x, z.y) < z.r && Math.random() < 0.4) {
      this.text(p.x, p.y - 60, "格挡", ELEM.sun.glow);
      p.invuln = 0.3;
      return false;
    }
    n = this.scaleHurt(n, src);
    p.lastHit = 0;
    this.runStats.hurt = (this.runStats.hurt || 0) + n;
    p.invuln = BAL.hurtInvuln;
    p.hurtT = 0.3;
    this.shake = Math.max(this.shake, p.local ? 6 : 2);
    let left = n;
    if (p.shield > 0) {
      const a = Math.min(p.shield, left);
      p.shield -= a;
      left -= a;
      if (p.shield <= 0) {
        this.sound("shieldbreak");
        if (p.kit.eq.t_firewall && p.fwCd <= this.time) this.firewall(p);
        if (p.cards.shield_nova) {
          this.vfx("ice/frost-nova", p.x, p.y, { palette: ["#06101e", "#10284a", "#20508a", "#4a90d0", "#8ac8ff", "#c0e4ff", "#eef8ff", "#ffffff"], speed2: 2, opts: { reach: 70 } });
          for (const o of this.enemiesNear(p.x, p.y, 80)) (this.hit(o, 18, { p, noReact: true })), this.knock(o, p.x, p.y, 300);
        }
      }
    }
    if (left > 0) {
      p.hp -= left;
      this.sound("hurt");
      this.text(p.x, p.y - 64, "-" + left, "#ff4a4a", 1.3);
    } else this.sound("hit");
    if (p.hp <= 0) this.down(p);
    return true;
  }
  hitPlayerPvp(o, amount, src) {
    if (!this.pvp || src.p === o) return 0;
    const dmg = amount * (src.p ? this.dmgMul(src.p) : 1);
    if (o.invuln > 0 || o.dashT > 0 || o.dead || o.downed) return 0;
    o.pvpAcc += dmg / 6;
    this.text(o.x, o.y - 66, Math.round(dmg), "#ffb0b0", 1, 0.5);
    if (src.p) src.p.ult = Math.min(1, src.p.ult + (dmg / CHARS[src.p.cid].ult.need) * 0.8);
    let n = 0;
    while (o.pvpAcc >= 1) (o.pvpAcc -= 1), n++;
    if (n) {
      const inv = o.invuln;
      o.invuln = 0;
      this.hurt(o, n, src);
      o.invuln = Math.min(o.invuln, 0.15) + inv * 0;
      if ((o.downed || o.koFlag) && src.p) {
        o.koFlag = false;
        if (this.pvpRule.koScore) this.pvpScore[src.p.id] = (this.pvpScore[src.p.id] || 0) + 1;
        this.text(src.p.x, src.p.y - 80, "击倒！", "#ffe14a", 1.4);
      }
    }
    return dmg;
  }
  /** SSR 零信任防火墙: shield broken -> shockwave */
  firewall(p) {
    p.fwCd = this.time + 8;
    this.vfx("ice/frost-nova", p.x, p.y, { palette: ["#0a0618", "#24104a", "#4a2a8a", "#7a5ad0", "#b090ff", "#dccaff", "#f4eeff", "#ffffff"], speed2: 2.2, opts: { reach: 80 } });
    this.text(p.x, p.y - 70, "防火墙！", "#c8b0ff", 1.2);
    this.shake = Math.max(this.shake, 6);
    for (const o of this.enemiesNear(p.x, p.y, 90)) (this.hit(o, 20, { p, noReact: true }), this.knock(o, p.x, p.y, 320));
    if (this.pvp) for (const o of this.players) if (o !== p && !o.downed && dist(o.x, o.y, p.x, p.y) < 90) this.hitPlayerPvp(o, 9, { p, x: p.x, y: p.y });
  }
  barrierBurst(p) {
    const tgt = p.target || this.nearestEnemy(p.x, p.y, 260);
    const base = tgt ? angTo(p.x, p.y, tgt.x, tgt.y) : p.face;
    for (let i = 0; i < 5; i++) {
      const a = base + (i - 2) * 0.18;
      this.bullets.push(this.mkBullet(p, { x: p.x, y: p.y - 18, h: 18, a, spd: 300, dmg: 5, elem: "sun", kind: "sunbolt", r: 4, life: 1, pierce: 0 }));
    }
  }
  down(p) {
    if (p.revives > 0) {
      // SSR 断点续训: she really goes down first (lying, ring filling), then reloads the checkpoint at full health
      p.revives--;
      if (this.pvp) p.koFlag = true; // the knock-out still counts for the opponent
      p.hp = 0;
      p.downed = true;
      p.reviveT = 0;
      p.rebootT = BAL.rebootTime || 1.3;
      this.vfx("spawn/poof", p.x, p.y, { palette: ELEM[CHARS[p.cid].elem].ramp.slice(1, 7) });
      this.sound("lose");
      return;
    }
    p.hp = 0;
    p.downed = true;
    p.reviveT = 0;
    p.respawnT = this.pvp ? 3 : 0;
    p.downT = 0;
    this.vfx("spawn/poof", p.x, p.y, { palette: ELEM[CHARS[p.cid].elem].ramp.slice(1, 7) });
    this.sound("lose");
    if (!this.pvp && this.alivePlayers().length === 0) this.gameOver();
  }
  revive(p, frac = 0.5) {
    p.downed = false;
    p.hp = Math.max(1, Math.ceil(p.maxHp * frac));
    p.invuln = 1.5;
    this.vfx("arcane/magic-circle-cast", p.x, p.y + 4, { palette: ELEM[CHARS[p.cid].elem].ramp, speed2: 1.8 });
    this.sound("heal");
  }
  gameOver() {
    if (this.phase === "over") return;
    this.phase = "over";
    this.after(1.6, () => this.onUi("over"));
    this.emit({ t: "over" });
  }
  victory() {
    if (this.phase === "win") return;
    this.phase = "win";
    // the run is over: drop the portal so standing in it can't re-trigger the leave fade every 0.7 s
    this.portal = null;
    this.onUi("win");
    this.emit({ t: "win" });
  }
  bossDown(e) {
    this.runStats.boss = true;
    this.shake = 14;
    this.vfx("explosions/plasma-explosion", e.x, e.y - 30, { palette: ["#1a0610", "#4a1028", "#8a2040", "#d04060", "#ff8090", "#ffd0d0", "#ffffff"] });
    this.after(0.5, () => this.vfx("ui/confetti", e.x, e.y - 40));
    this.sound("win");
    for (const q of this.enemies) if (!q.dead) q.hp = 0, this.kill(q, null);
  }

  // ------------------------------------------------------------ bullets
  mkBullet(p, o) {
    return {
      id: nid(), side: o.side || "p", owner: p ? p.id : null, x: o.x, y: o.y, vx: Math.cos(o.a) * o.spd, vy: Math.sin(o.a) * o.spd,
      r: o.r || 4, dmg: o.dmg, elem: o.elem, kind: o.kind, life: o.life ?? 1.2, pierce: o.pierce || 0, bounce: o.bounce || 0, hits: new Set(),
      splash: o.splash || 0, splashDmg: o.splashDmg || 0, slow: o.slow, burn: o.burn, knock: o.knock || 0, fusion: o.fusion, from: o.from, t: 0,
      h: o.h || 0, wave: o.wave, shieldGive: o.shieldGive, noReact: o.noReact, big: o.big, arcTo: o.arcTo, onLand: o.onLand,
    };
  }
  updateBullets(dt) {
    const m = this.map;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.t += dt;
      b.life -= dt;
      if (b.arcTo) {
        // lobbed: travel to a point then land
        const k = Math.min(1, b.t / b.arcTo.dur);
        b.x = b.arcTo.x0 + (b.arcTo.x - b.arcTo.x0) * k;
        b.y = b.arcTo.y0 + (b.arcTo.y - b.arcTo.y0) * k;
        b.z = Math.sin(k * Math.PI) * 50;
        if (k >= 1) {
          if (this.host && b.onLand) b.onLand(b);
          this.bullets.splice(i, 1);
        }
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let gone = b.life <= 0;
      const gy = b.y + (b.h || 0); // collide with walls at ground level (bullets fly at chest height)
      const t = tileAt(m, b.x, gy);
      if (!gone && BLOCKS_SHOT(t) && !b.wave) {
        gone = true;
        if (this.host && b.side === "p") {
          const ti = Math.floor(gy / T) * m.W + Math.floor(b.x / T);
          if (m.crates[ti]) this.damageTile(ti, b.dmg, this.player(b.owner));
        }
        if (b.side === "p" && b.kind !== "fire") this.fx.spawn("impacts/hit-spark", b.x - b.vx * 0.012, b.y - b.vy * 0.012, { angle: Math.atan2(b.vy, b.vx) + Math.PI, palette: ELEM[b.elem]?.ramp?.slice(1, 8), light: 0.6, opts: { height: 0 } });
      } else if (!gone && b.wave && t === WALL) b.life = Math.min(b.life, 0.05);
      if (!gone && !this.host && b.pred) {
        // client-side predicted shots: purely visual, vanish where they meet an enemy (the host deals the damage)
        for (const e of this.enemies) {
          if (e.spawnT > 0 || b.hits.has(e.id) || dist2(b.x, b.y, e.x, e.y - e.r) > (b.r + e.r + 2) ** 2) continue;
          b.hits.add(e.id);
          this.fx.spawn("impacts/hit-spark", b.x, b.y, { angle: Math.atan2(b.vy, b.vx) + Math.PI, palette: ELEM[b.elem]?.ramp?.slice(1, 8), light: 0.6, opts: { height: 0 } });
          if (b.pierce > 0) b.pierce--;
          else gone = true;
          break;
        }
        if (!gone && this.pvp)
          for (const o of this.players) {
            if (o.id === b.owner || o.downed || dist2(b.x, b.y, o.x, o.y - 16) > (b.r + 12) ** 2) continue;
            gone = true;
            break;
          }
      }
      if (!gone && this.host) {
        if (b.side === "p") {
          const owner = this.player(b.owner);
          for (const e of this.enemies) {
            if (e.dead || e.spawnT > 0 || b.hits.has(e.id)) continue;
            if (dist2(b.x, b.y, e.x, e.y - e.r) > (b.r + e.r + 2) * (b.r + e.r + 2)) continue;
            b.hits.add(e.id);
            onBulletHit(this, b, e, owner);
            if (b.pierce > 0) b.pierce--;
            else if (b.bounce > 0) {
              b.bounce--;
              const n = this.nearestEnemy(e.x, e.y, 150, b.hits);
              if (n) {
                const a = angTo(b.x, b.y, n.x, n.y - n.r), s = Math.hypot(b.vx, b.vy);
                b.vx = Math.cos(a) * s;
                b.vy = Math.sin(a) * s;
                b.life = Math.max(b.life, 0.6);
              } else gone = true;
            } else gone = true;
            break;
          }
          if (!gone && this.pvp)
            for (const o of this.players) {
              if (o.id === b.owner || o.dead || o.downed || b.hits.has(o.id)) continue;
              if (dist2(b.x, b.y, o.x, o.y - 16) > (b.r + 12) ** 2) continue;
              b.hits.add(o.id);
              this.hit(o, b.dmg, { p: owner, elem: b.elem });
              if (b.pierce > 0) b.pierce--;
              else gone = true;
              break;
            }
        } else {
          for (const p of this.players) {
            if (p.dead || p.downed) continue;
            if (dist2(b.x, b.y, p.x, p.y - 16) > (b.r + 10) * (b.r + 10)) continue;
            if (this.hurt(p, b.dmg, b)) {
              if (b.slow) p.buff.slow = 1.6;
              if (b.burn) p.buff.burn = 2.1;
            }
            gone = true;
            break;
          }
        }
      }
      if (gone) this.bullets.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ main update (host)
  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    if (this.banner) (this.banner.t -= dt), this.banner.t <= 0 && (this.banner = null);
    this.shake = Math.max(0, this.shake - dt * 30);
    for (const f of this.floaters) (f.life -= dt), (f.y += f.vy * dt), (f.vy *= 0.92);
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const l of this.lines) l.life -= dt;
    this.lines = this.lines.filter((l) => l.life > 0);
    if (!this.map) return;

    // flow field toward players
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flow = flowField(this.map, this.alivePlayers().length ? this.alivePlayers() : this.players);
      this.flowT = 0.3;
    }
    for (const p of this.players) this.updatePlayer(p, dt);
    for (const e of this.enemies) if (!e.dead) updateEnemy(this, e, dt);
    // lava burns walking enemies too
    if (this.hazard === "lava" && this.host)
      for (const e of this.enemies) if (!e.dead && !e.def.fly && e.spawnT <= 0 && mudAt(this.map, e.x, e.y) && (e.lavaCd || 0) < this.time) (e.lavaCd = this.time + 1), this.hit(e, 8, { noReact: true });
    // separate enemies a little
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead || a.boss) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2), k = ((rr - d) / d) * 0.5;
          a.x -= dx * k * 0.5; a.y -= dy * k * 0.5;
          if (!b.boss) (b.x += dx * k * 0.5), (b.y += dy * k * 0.5);
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.updateBullets(dt);
    this.updateZones(dt);
    this.updatePickups(dt);
    for (const k in this.map.crates) {
      const c = this.map.crates[k];
      if (c.flash > 0) c.flash -= dt;
    }
    // spikes cycle: 2.6 s, up for 0.7 s
    const sp = (this.time % 2.6) / 2.6;
    this.spikeUp = sp > 0.73 ? Math.min(1, (sp - 0.73) * 20) * (sp > 0.97 ? (1 - sp) * 33 : 1) : 0;
    if (this.spikeUp > 0.8 && this.host)
      for (const s of this.map.spikes) {
        const cx = s.x * T + 16, cy = s.y * T + 16;
        for (const p of this.alivePlayers()) if (Math.abs(p.x - cx) < 18 && Math.abs(p.y - cy) < 18) this.hurt(p, 1, { x: cx, y: cy });
        for (const e of this.enemiesNear(cx, cy, 14)) if (!e.def.fly && (e.spikeCd || 0) < this.time) (e.spikeCd = this.time + 1), this.hit(e, 8, { noReact: true });
      }
    if (this.host) this.updateFlow(dt);
  }

  updateFlow(dt) {
    if (this.phase === "fight") {
      const alive = this.enemies.length;
      const more = !this.room.boss && this.wave >= 0 && this.wave < (this.room.waves || []).length - 1;
      // the next wave rolls in while the last two or so are still alive: keeps the pressure on
      if (alive === 0 || (more && alive <= 2 && this.enemies.every((e) => e.spawnT <= 0))) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) {
          if (!this.spawnWave()) this.roomCleared();
          else this.waveDelay = 1.2;
        }
      }
    }
    // downed players: revive by standing near (co-op) / respawn (pvp)
    for (const p of this.players) {
      if (!p.downed) continue;
      p.downT = (p.downT || 0) + dt;
      if (p.rebootT > 0) {
        const T0 = BAL.rebootTime || 1.3;
        p.rebootT -= dt;
        p.reviveT = Math.min(2, ((T0 - p.rebootT) / T0) * 2); // the green ring fills while the checkpoint loads
        if (p.rebootT <= 0) {
          p.rebootT = 0;
          p.downed = false;
          p.hp = p.maxHp;
          p.shield = p.maxShield;
          p.invuln = 2;
          this.vfx("spawn/respawn-beam", p.x, p.y, { life: 1.2 });
          this.vfx("arcane/magic-circle-cast", p.x, p.y + 4, { palette: ELEM[CHARS[p.cid].elem].ramp, speed2: 1.8 });
          this.text(p.x, p.y - 70, "断点续训！满血复活", "#ffe14a", 1.4);
          this.sound("heal");
        }
        continue;
      }
      if (this.pvp) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          const s = R.pick(this.map.spots);
          p.x = s.x;
          p.y = s.y;
          p.shield = p.maxShield;
          this.revive(p, 1);
        }
        continue;
      }
      const helper = this.alivePlayers().find((q) => dist(q.x, q.y, p.x, p.y) < 44);
      if (helper) {
        p.reviveT += dt;
        if (p.reviveT >= 2) this.revive(p);
      } else p.reviveT = Math.max(0, p.reviveT - dt);
    }
    if (this.pvp) {
      if (this.pvpRule.zone) this.updateKoth(dt);
      for (const p of this.players) if ((this.pvpScore[p.id] || 0) >= this.pvpRule.goal && this.phase !== "win") {
        this.phase = "win";
        this.pvpWinner = p.id;
        this.emit({ t: "pvpwin", id: p.id });
        this.after(0.5, () => this.onUi("pvpwin"));
      }
      // keep the arena stocked with power cubes
      this.cubeT = (this.cubeT || 0) - dt;
      if (this.cubeT <= 0 && this.pickups.filter((q) => q.kind === "item").length < 6) {
        this.cubeT = 6;
        const s = R.pick(this.map.itemSpots);
        this.spawnItem(R.chance(0.5) ? "cube" : R.weighted(Object.keys(ITEM_WEIGHTS), (k) => ITEM_WEIGHTS[k]), s.x, s.y, true);
      }
    }
    if (this.phase === "cards") {
      this.cardsT = (this.cardsT || 0) + dt;
      if (this.cardsT > 30) for (const pid of Object.keys(this.cardOffers)) this.pickCard(+pid, this.cardOffers[pid][0]);
    } else this.cardsT = 0;
    if (this.portal && this.phase !== "cards" && this.phase !== "win" && this.phase !== "over") {
      this.portal.t += dt;
      const ps = this.alivePlayers();
      const inside = ps.filter((p) => dist(p.x, p.y, this.portal.x, this.portal.y) < 24);
      if (ps.length && inside.length === ps.length && this.portal.t > 0.8 && !this.leaving) {
        this.leaving = true;
        this.sound("portal");
        this.onUi("transition");
        if (this.portal.victory) return this.after(0.7, () => ((this.leaving = false), this.victory()));
        this.after(0.7, () => {
          this.leaving = false;
          this.runStats.rooms = Math.max(this.runStats.rooms, this.roomIdx + 1);
          // revive downed players between rooms
          for (const p of this.players) if (p.downed) this.revive(p, 0.5);
          this.nextRoom();
        });
      }
    }
  }
  /** 算力据点: whoever holds the centre alone scores 1 point per second */
  updateKoth(dt) {
    const c = this.map.center, R0 = this.pvpRule.zone;
    const inside = this.players.filter((p) => !p.downed && !p.dead && dist(p.x, p.y, c.x, c.y) < R0);
    this.kothOwner = inside.length === 1 ? inside[0].id : inside.length ? -1 : 0;
    if (inside.length !== 1) {
      this.kothT = 0;
      return;
    }
    this.kothT = (this.kothT || 0) + dt;
    if (this.kothT >= 1) {
      this.kothT -= 1;
      const p = inside[0];
      this.pvpScore[p.id] = (this.pvpScore[p.id] || 0) + 1;
      this.text(p.x, p.y - 74, "+1", "#7dffb0", 1);
      p.ult = Math.min(1, p.ult + 0.03);
    }
  }
  roomCleared() {
    if (this.phase !== "fight") return;
    this.phase = "clear";
    this.sound("clear");
    this.runStats.rooms = Math.max(this.runStats.rooms, this.roomIdx + 1);
    // a boss always drops a 梦境矿场 shovel: it lands with a light beam; walk over it to pick it up
    // (it is counted at the settlement either way)
    if (this.room.kind === "boss") this.dropShovel();
    // a boss sometimes leaves a 梦境裂隙: a 60-second dig (solo only)
    if (this.room.kind === "boss" && this.mode === "solo" && Math.random() < RIFT_CHANCE) {
      this.banner = { text: "梦境裂隙出现！", sub: "限时挖宝的机会", t: 2 };
      this.vfx("arcane/portal", this.map.center.x, this.map.center.y + 8, { layer: "back", life: 3 });
      this.after(1.8, () => this.onUi("rift"));
      if (!this.endless) return;
    }
    if (this.room.kind === "boss" && !this.endless) {
      // after the shovel lands, a portal opens; stepping in ends the run
      this.after(1.8, () => {
        const c = this.map.center;
        this.phase = "portal";
        this.portal = { x: c.x, y: c.y - 14, t: 0, victory: true };
        this.vfx("arcane/portal", this.portal.x, this.portal.y + 8, { layer: "back" });
        this.banner = { text: "传送门已开启", sub: "拾取铲子后进入传送门结算", t: 2 };
      });
      return;
    }
    this.banner = { text: "清场完成！", sub: "打开补给箱选择技能卡", t: 2 };
    const c = this.map.center;
    this.chest = { x: c.x, y: c.y + 38, opened: false };
    this.vfx("pickups/loot-beam", c.x, c.y + 44, { life: 2.5 });
    // vacuum coins
    for (const q of this.pickups) if (q.kind === "coin") q.magnet = true;
  }
  /** boss reward for 梦境矿场: 金 10% / 银 35% / 铜 55%, dropped at the centre with a beam in its colour */
  dropShovel() {
    if (this.runStats.shovel) return;
    const r = Math.random(), kind = r < 0.1 ? "au" : r < 0.45 ? "ag" : "cu";
    const c = this.map.center, col = { cu: "#ff9a4a", ag: "#d8e4ff", au: "#ffd84a" }[kind];
    this.runStats.shovel = kind;
    this.shovelItem = { kind, x: c.x + 46, y: c.y + 2, t: 0, col };
    this.vfx("pickups/loot-beam", this.shovelItem.x, this.shovelItem.y + 6, { life: 2 });
    this.text(this.shovelItem.x, this.shovelItem.y - 40, { cu: "铜铲", ag: "银铲", au: "金铲" }[kind] + "掉落！", col, 1.2, 1.4);
  }
  openChest(p) {
    if (!this.chest || this.chest.opened) return;
    this.chest.opened = true;
    this.vfx("pickups/chest-open", this.chest.x, this.chest.y + 10, {});
    this.sound("pickup");
    for (const q of this.players) this.offerCards(q);
    if (this.phase === "clear") this.phase = "cards";
  }
  /** roll 3 card offers for a player (host) */
  offerCards(p, n = 3, rarityFloor = null) {
    const meta = { cards: (p.kit && p.kit.cards) || [] };
    const pool = [...CARDS, ...fusionCards(p.cid)].filter((c) => {
      if ((p.cards[c.id] || 0) >= c.max) return false;
      if (c.locked) {
        if (c.tag === "混搭" && c.kind === "skill") return meta.cards.includes("links");
        return meta.cards.includes(c.id);
      }
      return true;
    });
    const out = [];
    const rr = rng((Math.random() * 1e9) | 0);
    while (out.length < n && pool.length) {
      let c = rr.weighted(pool, (c) => RARITY[c.r].w * (c.tag === "混搭" ? 1.6 : 1));
      if (rarityFloor && out.length === 0) {
        const hi = pool.filter((q) => q.r === "SR" || q.r === "SSR");
        if (hi.length) c = rr.pick(hi);
      }
      out.push(c);
      pool.splice(pool.indexOf(c), 1);
    }
    this.cardOffers[p.id] = out.map((c) => c.id);
    this.emit({ t: "cards", pid: p.id, ids: this.cardOffers[p.id] });
    this.onUi("cards", p.id);
  }
  pickCard(pid, cardId) {
    const p = this.player(pid);
    if (!p || !this.cardOffers[pid] || !this.cardOffers[pid].includes(cardId)) return;
    delete this.cardOffers[pid];
    if (p.local) this.onUi("cardsClosed");
    applyCard(this, p, cardId);
    if (p.startCards > 0) (p.startCards--, this.after(0.4, () => this.offerCards(p, 3, "SR")));
    this.sound("card");
    this.vfx("pickups/collect-burst", p.x, p.y - 10, { palette: ELEM[CHARS[p.cid].elem].ramp });
    if (this.phase === "cards" && Object.keys(this.cardOffers).length === 0) this.openPortal();
    this.onUi("hud");
  }
  openPortal() {
    if (this.room.kind === "shop") {
      this.phase = "shop";
      return;
    }
    this.phase = "portal";
    const c = this.map.center;
    // portal above, the (opened) chest below, so they never overlap
    this.portal = { x: c.x, y: c.y - 14, t: 0 };
    this.vfx("arcane/portal", this.portal.x, this.portal.y + 8, { layer: "back" });
    this.banner = { text: "传送门已开启", sub: "所有存活角色进入传送门前往下一层", t: 2 };
  }
  buy(p, item) {
    if (p.coins < item.price) {
      this.text(p.x, p.y - 64, "金币不足", "#ff8080");
      return;
    }
    p.coins -= item.price;
    this.sound("coin");
    if (item.id === "gacha") {
      item.price += 15;
      this.vfx("ui/confetti", item.x, item.y - 10, { life: 1.2 });
      this.offerCards(p, 1, Math.random() < 0.35 ? "SR" : null);
    } else if (item.id === "heal") {
      p.hp = Math.min(p.maxHp, p.hp + 3);
      this.vfx("holy/heal-aoe", p.x, p.y, { opts: { reach: 34 }, speed2: 1.6 });
      this.sound("heal");
    } else if (item.id === "maxshield") {
      p.maxShield++;
      p.shield = p.maxShield;
      item.price += 15;
    } else if (item.id === "cube") {
      this.applyItem(p, "cube");
      item.price += 10;
    }
    this.onUi("hud");
  }

  // ------------------------------------------------------------ players
  updatePlayer(p, dt) {
    p.animT += dt;
    for (const k in p.buff) if (p.buff[k] > 0) p.buff[k] -= dt;
    p.invuln -= dt;
    p.hurtT -= dt;
    p.recoil = Math.max(0, p.recoil - dt * 30);
    p.dodgeCrit -= dt;
    if (p.barrier > 0) {
      p.barrier -= dt;
      if (p.barrier <= 0) this.host && this.barrierBurst(p);
    }
    if (p.dead) return;
    if (p.downed) {
      p.moving = false;
      return;
    }
    const inp = p.input;
    const c = CHARS[p.cid];
    // movement
    let spd = c.speed * p.st.speed;
    if (p.kit && p.kit.eq.t_moe && p.hp * 2 <= p.maxHp) spd *= 1.15; // SSR 混合专家
    if (p.buff.speed > 0) spd *= 1.4;
    if (p.buff.ultOn > 0 && p.cid === "grok") spd *= 1.4;
    if (p.buff.inkHaste > 0) spd *= 1.3;
    if (p.buff.slow > 0) spd *= 0.6;
    const onHz = mudAt(this.map, p.x, p.y);
    if (onHz && this.hazard === "mud") spd *= 0.55;
    if (onHz && this.hazard === "ice") spd *= 1.12;
    if (p.breathT > 0) spd *= 0.7;
    let mx = inp.mx || 0, my = inp.my || 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) (mx /= ml), (my /= ml);
    p.moving = ml > 0.1;
    if ((p.buff.speed > 0 || (p.buff.ultOn > 0 && p.cid === "grok")) && p.moving && Math.random() < 0.35) p.trail = (p.trail || []).concat([{ x: p.x, y: p.y, t: 0.22 }]).slice(-5);
    // online: remote players' positions come from their own client (client-authoritative movement).
    // The host only counts their dash timer down (invulnerability) and never moves them itself,
    // otherwise the dash is applied twice and the client gets yanked back.
    const remote = this.mode === "host" && !p.local;
    if (remote) {
      if (p.dashT > 0) p.dashT -= dt;
    } else if (p.dashT > 0) {
      p.dashT -= dt;
      moveCircle(this.map, p, p.dashDx * BAL.dashSpeed * dt, p.dashDy * BAL.dashSpeed * dt);
      if (Math.random() < 0.6) p.trail = (p.trail || []).concat([{ x: p.x, y: p.y, t: 0.25 }]).slice(-6);
    } else if (this.hazard === "ice") {
      // ice: momentum carries you (accelerate / brake slowly while standing on it)
      const k = onHz ? 1 - Math.exp(-3 * dt) : 1;
      p.ivx = (p.ivx || 0) + (mx * spd - (p.ivx || 0)) * k;
      p.ivy = (p.ivy || 0) + (my * spd - (p.ivy || 0)) * k;
      moveCircle(this.map, p, p.ivx * dt, p.ivy * dt);
    } else moveCircle(this.map, p, mx * spd * dt, my * spd * dt);
    if (remote) p.moving = ml > 0.1;
    if (p.trail) for (const q of p.trail) q.t -= dt;
    if (!this.host && !p.local) return;
    if (!this.host) return; // clients only predict movement

    // shield regen
    p.lastHit += dt;
    if (p.lastHit > BAL.shieldDelay && p.shield < p.maxShield) {
      p.shieldT += dt * p.st.shieldRegen;
      if (p.shieldT >= BAL.shieldTick) (p.shieldT = 0), p.shield++;
    }
    // lava floor
    if (this.hazard === "lava" && onHz) {
      p.lavaT = (p.lavaT || 0) + dt;
      if (p.lavaT > 1) {
        p.lavaT = 0;
        if (this.hurt(p, 1, {})) this.text(p.x, p.y - 50, "灼烧", "#ff8a3a", 0.9);
      }
    } else p.lavaT = Math.min(p.lavaT || 0, 0.6);
    // status damage
    if (p.buff.burn > 0) {
      p.burnTick = (p.burnTick || 0) + dt;
      if (p.burnTick > 1) (p.burnTick = 0), (p.invuln = 0), this.hurt(p, 1, {});
    } else p.burnTick = 0;

    // dash
    p.dashCd -= dt;
    if (inp.dash && p.dashCd <= 0) {
      inp.dash = false;
      let dx = mx, dy = my;
      if (!p.moving) (dx = Math.cos(p.face)), (dy = Math.sin(p.face));
      const l = Math.hypot(dx, dy) || 1;
      p.dashDx = dx / l;
      p.dashDy = dy / l;
      p.dashT = BAL.dashTime;
      p.invuln = Math.max(p.invuln, BAL.dashInvuln);
      p.dashCd = BAL.dashCd;
      if (p.cards.dodge_crit) p.dodgeCrit = 2.5;
      this.sound("dash");
    }
    inp.dash = false;

    // targeting
    p.target = this.findTarget(p);
    let aim = null;
    if (inp.aim != null) aim = inp.aim;
    else if (p.target) aim = angTo(p.x, p.y - 18, p.target.x, p.target.y - (p.target.r || 12));
    if (aim != null && (inp.atk || p.castT > 0)) p.face = aim;
    else if (p.moving) p.face = Math.atan2(my, mx);
    else if (aim != null && p.target) p.face = aim;
    p.castT -= dt;

    // attack
    p.atkCd -= dt;
    if (inp.atk) {
      p.idleFire = 0;
      if (p.cid === "grok") p.rampT = Math.min(2, p.rampT + dt);
      if (p.atkCd <= 0) {
        const a = aim ?? p.face;
        fireAttack(this, p, a, inp.aim == null ? p.target : null);
        p.recoil = 2;
        p.castT = 0.25;
        let rate = c.atk.rate * p.st.rate;
        if (p.buff.rage > 0) rate *= 1.6;
        if (p.cid === "grok") rate *= 1 + c.atk.ramp * (p.rampT / 2) * (p.buff.ultOn > 0 ? 1 : 1);
        if (p.cid === "grok" && p.buff.ultOn > 0) rate *= 1.6;
        p.atkCd = 1 / rate;
      }
    } else {
      p.idleFire += dt;
      if (p.idleFire > 0.5) p.rampT = 0;
    }
    // skill
    p.skillCd -= dt;
    if (inp.skill) {
      inp.skill = false;
      if (p.skillCd <= 0) {
        const a = inp.castAim?.skill ?? aim ?? p.face;
        castSkill(this, p, p.cid, a, inp.castAim?.skill != null ? null : p.target, 1);
        for (const l of p.links) castSkill(this, p, l, a, p.target, 0.7);
        if (p.cards.echo && Math.random() < 0.35) this.after(0.45, () => castSkill(this, p, p.cid, p.face, p.target, 1));
        p.skillCd = 6 * 0 + (CHARS[p.cid].skill.cd * p.st.cd);
        p.castT = 0.4;
        this.sound("skill");
      }
    }
    if (inp.ult) {
      inp.ult = false;
      if (p.ult >= 1) {
        const a = inp.castAim?.ult ?? aim ?? p.face;
        p.ult = 0;
        castUlt(this, p, a, inp.castAim?.ult != null ? null : p.target);
        if (p.cards.second_ult) p.ult = 0.4;
        p.castT = 0.5;
        this.sound("ult");
        this.shake = Math.max(this.shake, 6);
      }
    }
    // hazards
    for (const z of this.zones) {
      if (z.kind !== "poison") continue;
      if (dist(p.x, p.y, z.x, z.y) < z.r + 6) {
        p.poisonT = (p.poisonT || 0) + dt;
        if (p.poisonT > 1.2) (p.poisonT = 0), this.hurt(p, 1, z);
        if (z.fire) p.buff.burn = Math.max(p.buff.burn || 0, 0.6);
        else p.buff.poison = 0.3;
      }
    }
    // boss shovel on the ground
    const si = this.shovelItem;
    if (si && !si.got && dist(p.x, p.y, si.x, si.y) < 26) {
      si.got = true;
      this.sound("pickup");
      this.vfx("pickups/collect-burst", si.x, si.y - 10, {});
      this.text(si.x, si.y - 40, "获得" + { cu: "铜铲", ag: "银铲", au: "金铲" }[si.kind] + "（梦境矿场）", si.col, 1.1, 1.4);
    }
    // chest & shop interaction
    if (this.chest && !this.chest.opened && dist(p.x, p.y, this.chest.x, this.chest.y) < 30) this.openChest(p);
    if (this.shop && this.room.kind === "shop") {
      for (const it of this.shop) {
        const near = dist(p.x, p.y, it.x, it.y + 16) < 26;
        if (near && inp.atk && !p.buyLock) {
          p.buyLock = true;
          this.buy(p, it);
        }
        if (near) p.nearShop = it;
      }
      if (!inp.atk) p.buyLock = false;
    }
  }

  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      z.life -= dt;
      if (z.update && this.host) z.update(z, dt);
      if (z.kind === "poison" && this.host) {
        z.tick += dt;
        if (z.tick > 1) {
          z.tick = 0;
          for (const e of this.enemiesNear(z.x, z.y, z.r)) if (!e.def.fly) this.hit(e, 4, { noReact: true, noCrit: true });
        }
      }
      if (z.life <= 0) {
        if (z.onEnd && this.host) z.onEnd(z);
        if (z.fxh) z.fxh.stop();
        this.zones.splice(i, 1);
      }
    }
  }

  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const q = this.pickups[i];
      q.t += dt;
      q.life -= dt;
      if (q.vz || q.z > 0) {
        q.z += q.vz * dt;
        q.vz -= 400 * dt;
        if (q.z <= 0) (q.z = 0), (q.vz = Math.abs(q.vz) > 40 ? -q.vz * 0.35 : 0);
      }
      if (q.vx || q.vy) {
        moveCircle(this.map, Object.assign(q, { r: 4 }), q.vx * dt, q.vy * dt, true);
        q.vx *= 0.9;
        q.vy *= 0.9;
        if (Math.abs(q.vx) < 1) q.vx = 0;
        if (Math.abs(q.vy) < 1) q.vy = 0;
      }
      if (!this.host) continue;
      const ps = this.alivePlayers();
      let best = null, bd = 1e9;
      for (const p of ps) {
        const d = dist(p.x, p.y, q.x, q.y);
        if (d < bd) (bd = d), (best = p);
      }
      if (!best) continue;
      if (q.kind === "coin") {
        const mag = (best.cards.coin_up ? 110 : 76) * (best.st.mag || 1) + (q.magnet ? 2000 : 0);
        if (bd < mag && q.t > 0.4) {
          const a = angTo(q.x, q.y, best.x, best.y - 10);
          q.x += Math.cos(a) * 320 * dt;
          q.y += Math.sin(a) * 320 * dt;
        }
        if (bd < 16 && q.t > 0.3) {
          const v = Math.random() < (best.st.coin % 1) ? Math.ceil(best.st.coin) : Math.floor(best.st.coin);
          best.coins += v;
          this.runStats.coins += v;
          this.sound("coin", 0.05);
          this.pickups.splice(i, 1);
          this.emit({ t: "pick", id: q.id });
          continue;
        }
      } else if (q.kind === "item" || q.kind === "orb") {
        if (bd < 20 && q.t > 0.3) {
          if (q.kind === "orb") {
            if (best.hp < best.maxHp) (best.hp = Math.min(best.maxHp, best.hp + 2)), this.text(best.x, best.y - 62, "+2", "#ff7aa0");
            else (best.shield = Math.min(best.maxShield, best.shield + 2)), this.text(best.x, best.y - 62, "护盾+2", "#a8c8ff");
            this.vfx("holy/heal-aoe", best.x, best.y, {palette: ELEM.bubble.ramp, opts: { reach: 34 }, speed2: 1.6 });
            this.sound("heal");
            const owner = this.player(q.owner);
            if (owner) owner.orbs--;
          } else this.applyItem(best, q.item);
          this.pickups.splice(i, 1);
          this.emit({ t: "pick", id: q.id });
          continue;
        }
      }
      if (q.life <= 0) this.pickups.splice(i, 1);
    }
  }
  applyItem(p, item) {
    const it = ITEMS[item];
    this.text(p.x, p.y - 70, it.name, it.color, 1.15, 1.1);
    this.sound("pickup");
    this.vfx("pickups/collect-burst", p.x, p.y - 12, {});
    switch (item) {
      case "cube":
        p.cubes++;
        if (p.cubes % 5 === 0) (p.maxHp++), p.hp++;
        break;
      case "speed":
        p.buff.speed = 6;
        
        break;
      case "rage":
        p.buff.rage = 6;
        break;
      case "shield":
        p.shield = p.maxShield;
        this.vfx("holy/divine-shield", p.x, p.y, { follow: p, life: 1.2, palette: ["#06101e", "#10284a", "#20508a", "#4a90d0", "#8ac8ff", "#c0e4ff", "#eef8ff", "#ffffff"] });
        break;
      case "heal":
        p.hp = Math.min(p.maxHp, p.hp + 2);
        this.vfx("holy/heal-aoe", p.x, p.y, { opts: { reach: 34 }, speed2: 1.6 });
        break;
      case "star":
        p.buff.star = 5;
        break;
      case "freeze":
        this.vfx("ice/frost-nova", p.x, p.y, { speed2: 1.6 });
        for (const e of this.enemiesNear(p.x, p.y, 170)) (e.freezeT = e.boss ? 0.8 : 2.5);
        break;
      case "infuse": {
        const own = CHARS[p.cid].elem;
        p.buff.infuse = 12;
        p.infuseElem = R.pick(Object.keys(ELEM).filter((k) => k !== own));
        this.text(p.x, p.y - 84, `灌注·${ELEM[p.infuseElem].name}`, ELEM[p.infuseElem].glow, 1);
        break;
      }
    }
    this.onUi("hud");
  }
}

/** apply a skill card's effect */
export function applyCard(g, p, id) {
  p.cards[id] = (p.cards[id] || 0) + 1;
  const s = p.st;
  switch (id) {
    case "atk_up": s.dmg *= 1.18; break;
    case "rate_up": s.rate *= 1.16; break;
    case "hp_up": p.maxHp += 2; p.hp += 2; break;
    case "shield_up": p.maxShield += 2; p.shield += 2; break;
    case "speed_up": s.speed *= 1.12; break;
    case "range_up": s.range *= 1.18; s.bspd *= 1.2; break;
    case "big_bullet": s.size *= 1.35; s.dmg *= 1.12; break;
    case "coin_up": s.coin *= 1.35; break;
    case "multishot": s.multi++; break;
    case "pierce": s.pierce++; break;
    case "bounce": s.bounce++; break;
    case "crit": s.crit += 0.12; break;
    case "cd_down": s.cd *= 0.8; break;
    case "ult_charge": s.ultG *= 1.3; break;
    case "vamp": s.vamp++; break;
  }
  if (id.startsWith("fa_")) p.fusions.push(id.slice(3));
  if (id.startsWith("fs_")) p.links.push(id.slice(3));
}
