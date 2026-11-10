// 梦境宠物技能演示：真实的 Game / Renderer / 特效跑一个小场景（跟随态普攻、大招；骑乘态普攻、大招），
// 镜头固定、按场景裁出一块世界区域放大到演示画布，所以特效不会改变宠物的位置或大小。静音、循环，
// 画布离开页面后自动停止。
import { VIEW_W, VIEW_H, RS, CHARS } from "./data.js";
import { Game } from "./game.js";
import { Renderer } from "./render.js";
import { FxLayer } from "./fx.js";
import { setSfxMute } from "./audio.js";
import { toggleMount } from "./pets.js";
import { PET_ATTACK_RANGE } from "./petdata.js";

// 每个演示：宠物/角色站位（相对场景中心）、敌人布置、循环时长、裁切宽度（世界像素）
const SCENES = {
  atk: { ride: false, dur: 4.2, foes: { n: 3, spread: 34 } },
  ult: { ride: false, dur: { dragon: 3.6, fox: 3, phoenix: 4.8 }, foes: { n: 3, spread: 40 } },
  rideAtk: { ride: true, px: -72, dur: 3.4, foes: { dx: 78, spread: 46, n: 3 } },
  rideUlt: { ride: true, px: { dragon: -86, fox: -84, phoenix: -6 }, dur: { dragon: 5.2, fox: 3.2, phoenix: 5.6 },
    foes: { dragon: { dx: 90, spread: 60, n: 3 }, fox: { dx: 46, spread: 30, n: 4 }, phoenix: { ring: 78, n: 5 } } },
};
const RIDE_DY = 62;
const pick = (v, id) => (v && typeof v === "object" && !("n" in v) ? v[id] : v);

/** box: element to fill. returns { set({id,stage,act}), stop() } */
export function mountPetDemo(box, opt) {
  const view = document.createElement("canvas");
  view.className = "pp-demo-cv";
  box.replaceChildren(view);
  const work = document.createElement("canvas");
  work.width = VIEW_W * RS;
  work.height = VIEW_H * RS;
  const fxl = new FxLayer(VIEW_W, VIEW_H);
  const rnd = new Renderer(work, fxl);
  let cfg = { ...opt }, g = null, p = null, t = 0, last = performance.now(), dur = 4, stopped = false, home = [], center = { x: 0, y: 0 };
  const scene = () => SCENES[cfg.act] || SCENES.atk;
  const build = () => {
    const S = scene(), id = cfg.id, stage = S.ride ? 3 : cfg.stage;
    const cid = Object.hasOwn(CHARS, cfg.cid || "") ? cfg.cid : "deepseek";
    g = new Game({ mode: "solo", seed: 7 + Math.floor(Math.random() * 1000), fx: fxl, opt: { map: "grass" } });
    fxl.clearAll && fxl.clearAll();
    p = g.addPlayer({ id: 1, cid, name: "", local: true, kit: { tal: {}, eq: {}, cards: [], pet: { id, stage } } });
    g.roomIdx = 0;
    g.loadRoom(0, { kind: "boss" });
    g.banner = null;
    g.enemies.length = 0;
    g.updateFlow = () => {}; // no waves, no room clear: the demo owns its foes
    g.phase = "fight";
    const c = g.map.center;
    center = { x: c.x, y: c.y };
    const range = PET_ATTACK_RANGE[id];
    if (S.ride) {
      p.x = c.x + pick(S.px, id);
      p.y = c.y + RIDE_DY; // riders stand lower so the skill name over their head stays in the crop
      p.face = 0;
      toggleMount(g, p);
    } else {
      // the girl waits below the crop (still within the pet's aggro range of the foes); the pet stands at its attack range from the foes
      p.x = c.x - 60;
      p.y = c.y + 160;
      p.face = 0;
      // pet and foes are centred on the crop: the pet at its attack range from the front foe
      Object.assign(p.pet, { x: c.x - range / 2 + 6, y: c.y, face: 0, room: 0, returning: false });
    }
    p.hp = p.maxHp = 999;
    const F = pick(S.foes, id);
    home = [];
    for (let i = 0; i < F.n; i++) {
      let x, y;
      if (F.ring) {
        const a = (i / F.n) * Math.PI * 2 + 0.4;
        x = p.x + Math.cos(a) * F.ring;
        y = p.y + Math.sin(a) * F.ring * 0.75;
      } else {
        const k = F.n > 1 ? i / (F.n - 1) - 0.5 : 0;
        x = c.x + (F.dx ?? range / 2 - 8) + (i % 2) * 22;
        y = c.y + (S.ride ? RIDE_DY : 0) + k * F.spread * 2;
      }
      home.push({ x, y });
    }
    spawn();
    const q = p.pet;
    q.attackCd = cfg.act === "atk" ? 0.5 : 99;
    q.skillCd = cfg.act === "ult" ? 0.55 : 99;
    q.auraCd = 99; // 灵狐的清弹光环不属于这两个演示
    p.ult = cfg.act === "rideUlt" ? 1 : 0;
    dur = pick(S.dur, id);
    t = 0;
  };
  const spawn = () => {
    for (const h of home) {
      const e = g.spawnEnemy("slime", h.x, h.y, false, 0); // no spawn delay: the pet would turn back to the girl meanwhile
      e.hp = e.maxHp = 260;
      e.__home = h;
    }
  };
  const draw = (dt = 0) => {
    const ctx = view.getContext("2d"), W = view.width, H = view.height;
    const S = scene(), cw = S.ride ? 330 : 250, ch = Math.round((cw * H) / W);
    // fixed camera: the crop is centred on the scene, a little above the ground line so tall sprites fit
    const cx = center.x + (S.ride ? -8 : 10), cy = center.y + (S.ride ? 8 : -16);
    rnd.cam.x = Math.round(cx - VIEW_W / 2);
    rnd.cam.y = Math.round(cy - VIEW_H / 2);
    rnd.draw(g, p, dt); // dt drives the renderer clock: the phoenix storms / blizzard ribbons are drawn from it
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(work, ((VIEW_W - cw) / 2) * RS, ((VIEW_H - ch) / 2) * RS, cw * RS, ch * RS, 0, 0, W, H);
  };
  const fit = () => {
    const r = box.getBoundingClientRect(), k = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(r.width * k)), h = Math.max(2, Math.round(r.height * k));
    if (view.width !== w || view.height !== h) (view.width = w), (view.height = h);
  };
  const frame = (now) => {
    if (stopped || !view.isConnected) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)) * (cfg.speed || 1); // rAF time can precede the mount time; speed: tests slow it down
    last = now;
    if (document.hidden) return requestAnimationFrame(frame);
    setSfxMute(true);
    try {
      t += dt;
      if (t > dur || !g || p.dead) build();
      const inp = p.input;
      inp.mx = inp.my = 0;
      inp.aim = null;
      inp.atk = cfg.act === "rideAtk" && t > 0.35;
      if (cfg.act === "rideUlt" && t > 0.5 && p.ult >= 1) inp.ult = true;
      // keep the stage still: foes hold their spots, enemy shots vanish, the girl never falls
      for (const e of g.enemies) if (e.__home && !e.dead) (e.x = e.__home.x), (e.y = e.__home.y), (e.vx = e.vy = 0);
      g.bullets = g.bullets.filter((b) => b.side !== "e");
      p.hp = p.maxHp;
      if (g.enemies.every((e) => e.dead)) spawn();
      g.update(dt);
      g.slowmo = 0;
      p.hurtT = 0; // no red hurt wash over the demo
      fxl.update(dt);
      fit();
      draw(dt);
    } catch (e) {
      console.warn("pet demo", cfg, e);
      return;
    } finally {
      setSfxMute(false);
    }
    requestAnimationFrame(frame);
  };
  setSfxMute(true);
  try {
    fit();
    build();
  } finally {
    setSfxMute(false);
  }
  requestAnimationFrame(frame);
  box.__demo = () => ({ g, p, cfg }); // for tests
  return {
    set(next) {
      cfg = { ...cfg, ...next };
      setSfxMute(true);
      try { build(); } finally { setSfxMute(false); }
      if (stopped) (stopped = false), (last = performance.now()), requestAnimationFrame(frame);
    },
    pause() { stopped = true; },
    stop() { stopped = true; },
  };
}
