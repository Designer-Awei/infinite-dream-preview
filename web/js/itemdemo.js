// Live effect demos for gacha items (pool preview / exchange): a tiny real fight — the real Game, Renderer and
// effects — where the selected girl uses the item, like the mine guide's demos. Muted, looping, stops by itself
// when its canvas leaves the page.
import { VIEW_W, VIEW_H, RS, CHAR_ORDER, ELEM_KEYS, CHARS } from "./data.js";
import { Game, applyCard } from "./game.js";
import { Renderer } from "./render.js";
import { FxLayer } from "./fx.js";
import { setSfxMute } from "./audio.js";

const ZOOM = 2.1; // the visible canvas shows the middle of the view, closer than in a run

// how each item is shown. kit: talents/equips given to the demo girl; foes: enemy setup; tick: per-frame input/actions
const near = (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy });
const DEMO = {
  t_speed: { tick: (g, p, t, inp) => ((inp.mx = Math.cos(t * 1.6)), (inp.my = Math.sin(t * 1.6) * 0.7)) },
  t_range: { foes: { dx: 230, spread: 60 } },
  t_coin: { foes: { hp: 4, n: 4 }, respawn: 0.8 },
  t_magnet: { foes: { hp: 4, n: 4, dx: 150 }, respawn: 0.8 },
  t_start_coin: { start: (g, p) => g.after(0.5, () => g.text(p.x, p.y - 64, "开局金币 +75", "#ffd84a", 1.4, 1.6)) },
  t_hp: { foes: { type: "eyeball", n: 3 }, hp: 99, start: (g, p) => g.after(0.4, () => g.text(p.x, p.y - 64, "生命上限 +3", "#ff8a9a", 1.3, 1.6)) },
  t_shield: { foes: { type: "eyeball", n: 3, hp: 400 }, atk: false },
  t_shield2: { foes: { type: "eyeball", n: 3, hp: 400 }, atk: false, start: (g, p) => g.after(0.4, () => g.text(p.x, p.y - 64, "护盾上限 +2", "#a8c8ff", 1.3, 1.6)) },
  t_ult: { start: (g, p) => g.after(0.4, () => g.text(p.x, p.y - 64, "开局大招 60%", "#ffd84a", 1.3, 1.6)), autoUlt: true },
  t_overclock: { autoUlt: true },
  u_second_ult: { autoUlt: true, ult: 1, onUlt: (g, p) => g.after(0.15, () => g.text(p.x, p.y - 70, "返还 40% 充能", "#ffd84a", 1.3, 1.4)) },
  t_revive: {
    hp: 3,
    foes: { n: 3, hp: 300 },
    start: (g, p) => g.after(1.4, () => g.hurt(p, 99, { x: p.x + 20, y: p.y })),
  },
  t_firewall: {
    foes: { n: 4, hp: 300, dx: 60, spread: 40 },
    start: (g, p) => {
      for (const k of [1.1, 3.6]) g.after(k, () => { p.lastHit = 0; g.hurt(p, p.shield, { x: p.x + 20, y: p.y }); });
    },
  },
  t_chain: { foes: { n: 5, hp: 300, dx: 110, spread: 90, step: 40 } },
  t_ensemble: { foes: { n: 4, hp: 300, spread: 90 } },
  t_rag: {
    foes: { n: 2, hp: 300, dx: 210 },
    start: (g, p) => g.after(0.5, () => {
      g.spawnItem("cube", p.x + 70, p.y + 30, true);
      g.text(p.x + 70, p.y - 10, "检索增强：掉落道具", "#7dffb0", 1.1, 1.6);
    }),
    tick: (g, p, t, inp) => t > 1.3 && t < 2.4 && ((inp.mx = 0.9), (inp.my = 0.4), (inp.atk = false)),
  },
  t_moe: { hp: 12, start: (g, p) => ((p.hp = Math.floor(p.maxHp / 2)), g.after(0.4, () => g.text(p.x, p.y - 64, "半血：伤害 +30%  移速 +15%", "#ffb04a", 1.1, 1.8))), tick: (g, p, t, inp) => ((inp.mx = Math.cos(t * 1.2) * 0.6), (inp.my = Math.sin(t * 1.2) * 0.5)) },
  t_elite: { foes: { n: 2, elite: true, hp: 300 } },
  t_replay: { foes: { n: 2, elite: true, hp: 6 }, respawn: 1.2, autoUlt: true, ult: 0.7, onKill: (g, p) => g.text(p.x, p.y - 64, "大招充能 +30%", "#ffd84a", 1.2, 1.2) },
  t_cd: { autoSkill: true },
  u_echo: { autoSkill: true, cd: 0.3 },
  u_links: { autoSkill: true, cd: 0.4 },
  u_kill_boom: { foes: { n: 5, hp: 5, dx: 140, spread: 50, step: 22 }, respawn: 0.9 },
  u_shield_nova: {
    foes: { n: 4, hp: 300, dx: 60, spread: 40 },
    start: (g, p) => {
      for (const k of [1.1, 3.6]) g.after(k, () => { p.lastHit = 0; g.hurt(p, p.shield, { x: p.x + 20, y: p.y }); });
    },
  },
  u_reaction_amp: { infuse: true, foes: { n: 3, hp: 300 } },
  u_element_spread: { infuse: true, foes: { n: 5, hp: 300, spread: 80, step: 30 } },
};

/** one-line caption under each demo (the card itself keeps the full text) */
const CAPS = {
  t_dmg: "全角色伤害 +4%/级（满级 +20%）",
  t_hp: "全角色生命上限 +1/级（满级 +3）",
  t_shield: "护盾回复速度 +10%/级（满级 +50%）",
  t_speed: "移速 +3%/级（满级 +9%）",
  t_coin: "局内金币 +12%/级（满级 +60%）",
  t_start_coin: "开局金币 +15/级（满级 +75）",
  t_crit: "暴击率 +3%/级（满级 +15%）",
  t_ult: "开局大招充能 +30%/级（满级 60%）",
  t_revive: "每局一次：倒下时原地满血复活",
  t_overclock: "大招充能 +30%，开局大招 50%",
  t_firewall: "护盾破碎时放冲击波（8 秒冷却）",
  t_ensemble: "每第 4 次普攻追加 3 发散射弹",
  t_rate: "攻速 +2%/级（满级 +10%）",
  t_range: "射程 +3%/级（满级 +15%）",
  t_magnet: "金币吸取范围 +15%/级（满级 +45%）",
  t_cd: "小技能冷却 -4%/级（满级 -20%）",
  t_elite: "对精英和首领伤害 +5%/级（满级 +25%）",
  t_shield2: "护盾上限 +1/级（满级 +2）",
  t_replay: "击败精英或首领时大招 +10%/级",
  t_chain: "每第 5 次普攻放闪电，弹跳 4 个敌人",
  t_rag: "每进一个战斗房间，身边掉 1 个道具",
  t_moe: "半血以下：伤害 +30%，移速 +15%",
  u_kill_boom: "敌人死亡时爆炸，炸伤周围敌人",
  u_reaction_amp: "元素反应伤害 +60%",
  u_element_spread: "元素印记 25% 概率传给附近敌人",
  u_shield_nova: "护盾破碎时放冲击波并击退敌人",
  u_echo: "小技能 35% 概率再放一次",
  u_second_ult: "放完大招立即返还 40% 充能",
  u_links: "放小技能时附带另一位角色的小技能",
};
export const demoCaption = (it) => CAPS[it.id] || it.desc;

/** every item gets a live demo except 先验知识 (a card deal before the run — the card scene shows it better) */
export const hasLiveDemo = (it) => it.id !== "t_startcard";

export function mountItemDemo(cvs, it, cid) {
  const D = DEMO[it.id] || {};
  const fxl = new FxLayer(VIEW_W, VIEW_H);
  const off = document.createElement("canvas");
  off.width = VIEW_W * RS;
  off.height = VIEW_H * RS;
  const rnd = new Renderer(off, fxl);
  const vis = cvs.getContext("2d");
  let g = null, p = null, t = 0, last = performance.now(), dur = D.dur || 6.5, respawnT = 0;
  const kitFor = () => {
    const kit = { tal: {}, eq: {}, cards: [] };
    if (it.eq) kit.eq[it.id] = it.max;
    else if (!it.card) kit.tal[it.id] = it.max;
    return kit;
  };
  const foes = () => {
    const f = { type: "slime", n: 3, hp: 60, dx: 95, spread: 55, step: 26, elite: false, ...(D.foes || {}) };
    for (let i = 0; i < f.n; i++) {
      const a = (i - (f.n - 1) / 2) / Math.max(1, f.n - 1);
      const q = near(p, f.dx + (i % 2) * f.step, a * f.spread * 2);
      const e = g.spawnEnemy(f.type, q.x, q.y, f.elite, 0.25);
      e.hp = e.maxHp = f.hp * (f.elite ? 2 : 1);
    }
  };
  const build = () => {
    g = new Game({ mode: "solo", seed: 99 + Math.floor(Math.random() * 1000), fx: fxl, opt: { map: "grass" } });
    fxl.clearAll && fxl.clearAll();
    p = g.addPlayer({ id: 1, cid, name: "", local: true, kit: kitFor() });
    g.roomIdx = 0;
    g.loadRoom(0, { kind: "boss" });
    g.phase = "demo";
    g.banner = null;
    g.enemies.length = 0;
    // stand a little left of the centre, facing the dummies
    const c = g.map.center;
    p.x = c.x - 90;
    p.y = c.y;
    p.invuln = 0;
    p.hp = p.maxHp = Math.max(p.maxHp, D.hp || 10);
    if (D.hp && D.hp < p.maxHp) p.hp = D.hp;
    if (it.eq || it.card) g.applyLoadouts();
    if (it.card && !it.eq) applyCard(g, p, it.card);
    if (D.cd) p.st.cd = D.cd;
    if (D.ult != null) p.ult = D.ult;
    if (D.infuse) {
      p.buff.infuse = 999;
      p.infuseElem = ELEM_KEYS.find((k) => k !== CHARS[cid].elem && k !== "ink") || "thunder";
    }
    foes();
    if (D.start) D.start(g, p);
    t = 0;
    respawnT = 0;
    rnd.follow(g, p, 0, true);
  };
  const frame = (now) => {
    if (!cvs.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    setSfxMute(true);
    try {
      t += dt;
      if (t > dur || !g.players[0] || p.dead) build();
      const inp = p.input;
      inp.mx = 0;
      inp.my = 0;
      inp.atk = D.atk !== false && t > 0.4;
      inp.aim = null;
      if (D.tick) D.tick(g, p, t, inp);
      if (D.autoSkill && p.skillCd <= 0 && t > 0.6) inp.skill = true;
      if (D.autoUlt && p.ult >= 1 && t > 0.6) {
        inp.ult = true;
        if (D.onUlt) D.onUlt(g, p);
      }
      // keep the fight going: refill the dummies a moment after they all fall
      if (g.enemies.every((e) => e.dead)) {
        respawnT += dt;
        if (respawnT > (D.respawn || 0.9) && t < dur - 1) {
          if (D.onKill) D.onKill(g, p);
          respawnT = 0;
          foes();
        }
      }
      g.update(dt);
      fxl.update(dt);
      rnd.follow(g, p, dt);
      rnd.draw(g, p, dt);
      // show the middle of the view, a bit closer
      const sw = (VIEW_W * RS) / ZOOM, sh = Math.min(VIEW_H * RS, (sw * cvs.height) / cvs.width);
      vis.imageSmoothingEnabled = false;
      vis.drawImage(off, (VIEW_W * RS - sw) / 2, (VIEW_H * RS - sh) / 2 + 12 * RS, sw, sh, 0, 0, cvs.width, cvs.height);
    } catch (e) {
      console.warn("item demo", it.id, e);
      return;
    } finally {
      setSfxMute(false);
    }
    requestAnimationFrame(frame);
  };
  setSfxMute(true);
  try {
    build();
  } finally {
    setSfxMute(false);
  }
  requestAnimationFrame(frame);
}
