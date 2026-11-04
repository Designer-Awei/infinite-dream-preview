// Live effect demos for gacha items (pool preview / exchange): a tiny real fight — the real Game, Renderer and
// effects — where the selected girl uses the item, like the mine guide's demos. Muted, looping, stops by itself
// when its canvas leaves the page.
import { VIEW_W, VIEW_H, RS, ELEM, ELEM_KEYS, CHARS } from "./data.js";
import { iconURL, skillIcon } from "./icons.js";
import { Game, applyCard } from "./game.js";
import { castSkill } from "./skills.js";
import { Renderer } from "./render.js";
import { FxLayer } from "./fx.js";
import { setSfxMute } from "./audio.js";


// how each item is shown. kit: talents/equips given to the demo girl; foes: enemy setup; tick: per-frame input/actions
const near = (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy });
const DEMO = {
  t_speed: { tick: (g, p, t, inp) => ((inp.mx = Math.cos(t * 1.6)), (inp.my = Math.sin(t * 1.6) * 0.7)) },
  t_range: { foes: { dx: 230, spread: 60 } },
  t_coin: { foes: { hp: 4, n: 4 }, respawn: 0.8 },
  t_magnet: { foes: { hp: 4, n: 4, dx: 150 }, respawn: 0.8 },
  t_start_coin: {},
  t_hp: { realHp: true, foes: { n: 3, hp: 300 } },
  t_shield: { foes: { type: "eyeball", n: 3, hp: 400 }, atk: false },
  t_shield2: { foes: { type: "eyeball", n: 3, hp: 400 }, atk: false },
  t_ult: { autoUlt: true },
  t_overclock: { autoUlt: true },
  u_second_ult: { autoUlt: true, ult: 1 },
  t_revive: {
    realHp: true,
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
    }),
    tick: (g, p, t, inp) => t > 1.3 && t < 2.4 && ((inp.mx = 0.9), (inp.my = 0.4), (inp.atk = false)),
  },
  t_moe: { realHp: true, start: (g, p) => ((p.hp = Math.floor(p.maxHp / 2))), tick: (g, p, t, inp) => ((inp.mx = Math.cos(t * 1.2) * 0.6), (inp.my = Math.sin(t * 1.2) * 0.5)) },
  t_elite: { foes: { n: 2, elite: true, hp: 300 } },
  t_replay: { foes: { n: 2, elite: true, hp: 6 }, respawn: 1.2, autoUlt: true, ult: 0.7 },
  t_cd: { autoSkill: true },
  // 自洽回声 with Grok: her skill is a dash, so the echo reads as a second dash right after the first.
  // The demo shows the echo every time (in a run it is a 35% chance).
  u_echo: {
    cid: "grok",
    noCard: true,
    foes: { n: 3, hp: 300, dx: 150, spread: 70 },
    tick: (g, p, t, inp, ui) => {
      const k = Math.floor((t - 0.5) / 2.2), ph = (t - 0.5) - k * 2.2;
      if (t < 0.5) return;
      const dir = k % 2 ? -1 : 1;
      if (ph < 1.1) (inp.mx = dir), (inp.my = 0.25 * dir);
      const ang = Math.atan2(0.25 * dir, dir);
      if (ph >= 0.15 && p.__e1 !== k) (p.__e1 = k), castSkill(g, p, "grok", ang, p.target, 1), ui.press(ui.skill), (p.skillCd = CHARS.grok.skill.cd);
      if (ph >= 0.6 && p.__e1 === k && p.__e2 !== k) (p.__e2 = k), castSkill(g, p, "grok", ang, p.target, 1); // the echo
    },
  },
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

/** SSR cards get a live demo (先验知识 keeps its card-deal scene); N/R/SR are plain stat or unlock cards — the card face is enough */
export const hasLiveDemo = (it) => it.r === "SSR" && it.id !== "t_startcard";

/**
 * box: an element to fill. Inside it goes a miniature of the real in-run screen — the game canvas at its real view,
 * the real HUD (portrait, health/shield bars, coins) and the real touch controls (joystick, attack / skill / ult /
 * dash buttons with their cooldowns and charge ring) — laid out at phone size and scaled down to fit.
 */
export function mountItemDemo(box, it, cid) {
  const D = DEMO[it.id] || {};
  if (D.cid) cid = D.cid;
  const SW = 860, SH = Math.round((SW * VIEW_H) / VIEW_W); // the phone-sized screen we lay out, then scale down
  box.style.setProperty("--va", String(VIEW_W / VIEW_H));
  const scr = document.createElement("div");
  scr.className = "demo-scr";
  scr.style.width = SW + "px";
  scr.style.height = SH + "px";
  const ec = ELEM[CHARS[cid].elem];
  scr.style.setProperty("--ec", ec.color);
  scr.style.setProperty("--eg", ec.glow);
  scr.innerHTML = `<canvas class="demo-cv"></canvas>
    <div class="hud"><div class="tl"><div class="face"><img src="assets/portrait_${cid}.png" alt=""></div>
      <div class="bars"><div class="bar hp"><i></i><span class="o1"></span></div><div class="bar sh"><i></i><span class="o1"></span></div>
      <div class="res o1"><div><div class="coin"></div><span class="coins">0</span></div><div><div class="cube"></div><span class="cubes">0</span></div></div></div></div>
      <div class="tr"><button class="btn small gray pausebtn" tabindex="-1">Ⅱ</button></div></div>
    <div class="touchpad">
      <div class="joy"><div class="joyknob"></div></div>
      <div class="tbtn b-atk"><i class="bface"></i><img class="ico" alt=""><span class="lb">${CHARS[cid].atk.name}</span></div>
      <div class="tbtn b-skill"><i class="ring"></i><i class="bface"></i><img class="ico" alt=""><i class="cd"></i><b class="cdt"></b><span class="lb">${CHARS[cid].skill.name}</span></div>
      <div class="tbtn b-ult"><i class="ring"></i><i class="bface"></i><img class="ico" alt=""><i class="cd"></i><b class="cdt"></b><span class="lb">${CHARS[cid].ult.name}</span></div>
      <div class="tbtn b-dash"><i class="bface"></i><img class="ico" alt=""><i class="cd"></i><b class="cdt"></b><span class="lb">闪避</span></div>
    </div>`;
  box.appendChild(scr);
  for (const slot of ["atk", "skill", "ult", "dash"]) scr.querySelector(`.b-${slot} .ico`).src = iconURL(skillIcon(cid, slot), 4);
  box.__demo = () => ({ g, p }); // for tests
  const fit = () => (scr.style.transform = `scale(${box.clientWidth / SW})`);
  fit();
  const cvs = scr.querySelector(".demo-cv");
  cvs.width = VIEW_W * RS;
  cvs.height = VIEW_H * RS;
  const fxl = new FxLayer(VIEW_W, VIEW_H);
  const rnd = new Renderer(cvs, fxl);
  const q = (s) => scr.querySelector(s);
  const ui = {
    hpI: q(".bar.hp i"), hpT: q(".bar.hp span"), shI: q(".bar.sh i"), shT: q(".bar.sh span"), coins: q(".coins"), cubes: q(".cubes"),
    knob: q(".joyknob"), joy: q(".joy"), atk: q(".b-atk"), skill: q(".b-skill"), ult: q(".b-ult"), dash: q(".b-dash"),
  };
  const cache = {};
  const put = (k, v, fn) => cache[k] !== v && ((cache[k] = v), fn(v));
  const press = (n) => (n.classList.add("down"), setTimeout(() => n.classList.remove("down"), 140));
  let g = null, p = null, t = 0, last = performance.now(), dur = D.dur || 6.5, respawnT = 0;
  const kitFor = () => {
    const kit = { tal: {}, eq: {}, cards: [] };
    if (it.eq) kit.eq[it.id] = it.max;
    else if (!it.card) kit.tal[it.id] = it.max;
    return kit;
  };
  const foes = () => {
    const f = { type: "slime", n: 3, hp: 60, dx: 120, spread: 60, step: 26, elite: false, ...(D.foes || {}) };
    for (let i = 0; i < f.n; i++) {
      const a = (i - (f.n - 1) / 2) / Math.max(1, f.n - 1);
      const qq = near(p, f.dx + (i % 2) * f.step, a * f.spread * 2);
      const e = g.spawnEnemy(f.type, qq.x, qq.y, f.elite, 0.25);
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
    const c = g.map.center;
    p.x = c.x - 110;
    p.y = c.y;
    p.invuln = 0;
    // a little extra health keeps the girl standing through the loop, except where her health is the point
    if (!D.realHp) p.hp = p.maxHp = Math.max(p.maxHp, D.hp || 10);
    if (D.hp && D.hp < p.maxHp) p.hp = D.hp;
    if ((it.eq || it.card) && !D.noCard) g.applyLoadouts();
    if (it.card && !it.eq && !D.noCard) applyCard(g, p, it.card);
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
  // the real HUD and buttons, fed from the demo girl (same rules as the in-run HUD)
  const hud = () => {
    put("hp", p.hp + "/" + p.maxHp, (v) => ((ui.hpI.style.width = (100 * Math.max(0, p.hp)) / p.maxHp + "%"), (ui.hpT.textContent = "❤ " + v)));
    put("sh", p.shield + "/" + p.maxShield, (v) => ((ui.shI.style.width = (100 * p.shield) / Math.max(1, p.maxShield) + "%"), (ui.shT.textContent = "🛡 " + v)));
    put("coins", p.coins, (v) => (ui.coins.textContent = v));
    put("cubes", p.cubes, (v) => (ui.cubes.textContent = v));
    const c = CHARS[cid], sk = Math.max(0, p.skillCd) / (c.skill.cd * p.st.cd), dk = Math.max(0, p.dashCd) / 1.6, uk = Math.min(1, p.ult);
    const t1 = (v) => (Math.ceil(v * 10) / 10 || 0.1).toFixed(1);
    const skT = sk > 0 ? (sk * c.skill.cd * p.st.cd >= 1 ? String(Math.ceil(sk * c.skill.cd * p.st.cd)) : t1(sk * c.skill.cd * p.st.cd)) : "";
    put("sk", skT + (sk <= 0), () => {
      ui.skill.querySelector(".cd").style.setProperty("--p", Math.round(sk * 100) + "%");
      ui.skill.querySelector(".cdt").textContent = skT;
      ui.skill.classList.toggle("ready", sk <= 0);
    });
    put("dk", Math.round(dk * 20), () => {
      ui.dash.querySelector(".cd").style.setProperty("--p", Math.round(dk * 100) + "%");
      ui.dash.querySelector(".cdt").textContent = dk > 0 ? t1(dk * 1.6) : "";
      ui.dash.classList.toggle("ready", dk <= 0);
    });
    put("uk", Math.floor(uk * 100), () => {
      ui.ult.style.setProperty("--chg", Math.round(uk * 100) + "%");
      ui.ult.querySelector(".cdt").textContent = uk < 1 ? Math.floor(uk * 100) + "%" : "";
      ui.ult.classList.toggle("ready", uk >= 1);
    });
    const m = Math.hypot(p.input.mx, p.input.my) > 0.1;
    put("joy", `${p.input.mx.toFixed(2)},${p.input.my.toFixed(2)}`, () => {
      ui.knob.style.transform = `translate(${p.input.mx * 46}px,${p.input.my * 46}px)`;
      ui.joy.classList.toggle("on", m);
    });
    ui.atk.classList.toggle("firing", !!p.input.atk);
  };
  const frame = (now) => {
    if (!box.isConnected) return;
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
      if (D.tick) D.tick(g, p, t, inp, { press, skill: ui.skill, ult: ui.ult });
      if (D.autoSkill && p.skillCd <= 0 && t > 0.6) (inp.skill = true), press(ui.skill);
      if (D.autoUlt && p.ult >= 1 && t > 0.6) (inp.ult = true), press(ui.ult);
      // keep the fight going: refill the dummies a moment after they all fall
      if (g.enemies.every((e) => e.dead)) {
        respawnT += dt;
        if (respawnT > (D.respawn || 0.9) && t < dur - 1) (respawnT = 0), foes();
      }
      g.update(dt);
      fxl.update(dt);
      rnd.follow(g, p, dt);
      rnd.draw(g, p, dt);
      hud();
      if (box.clientWidth && cache.w !== box.clientWidth) (cache.w = box.clientWidth), fit();
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
