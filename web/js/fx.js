// pixelfx bridge: live effects drawn into two pixel frames (behind / in front of characters),
// composited into canvases each frame (color normally, light additively).
import { createFrame, clearFrame, createFx, painterFor } from "../pixelfx/core/index.js";
import { VIEW_W, VIEW_H } from "./data.js";
import { FX_MODS } from "./fxmods.js";

export const FX_IDS = [
  "water/splash", "water/wave-crash", "water/whirlpool", "water/bubbles",
  "fire/fire-breath", "explosions/plasma-explosion", "explosions/small-explosion", "explosions/implosion",
  "lightning/zap-hit", "lightning/lightning-strike", "lightning/thunderclap",
  "holy/divine-shield", "holy/heal", "holy/heal-aoe", "holy/sunburst", "holy/holy-pillar", "holy/smite",
  "arcane/rune-circle", "arcane/magic-circle-cast", "arcane/portal", "arcane/mana-burst", "arcane/star-fall",
  "shadow/hex-sigil", "shadow/eclipse", "shadow/dark-explosion", "shadow/black-hole",
  "nature/poison-cloud", "nature/toxic-puddle",
  "spawn/poof", "spawn/spawn-portal", "spawn/respawn-beam", "scifi/warp-in",
  "pickups/collect-burst", "pickups/loot-beam", "pickups/chest-open",
  "ui/confetti", "impacts/hit-spark", "impacts/crit-hit", "impacts/shield-block",
  "status/burning", "status/slowed", "status/stunned", "status/haste", "status/frozen", "status/poisoned",
  "ice/frost-nova", "scifi/force-field", "explosions/cartoon-pow", "explosions/dirt-explosion",
];

const mods = {};
export async function loadFx() {
  Object.assign(mods, FX_MODS);
}

const MAX = 48;
export class FxLayer {
  constructor(w = VIEW_W, h = VIEW_H) {
    this.w = w;
    this.h = h;
    this.back = createFrame(w, h);
    this.front = createFrame(w, h);
    this.list = [];
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    };
    this.cBack = mk();
    this.cFront = mk();
    this.cLightB = mk();
    this.cLightF = mk();
    this.img = new ImageData(w, h);
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.enabled = true;
    // bright Brawl-Stars-like floors wash out under full additive light
    this.lightB = 0.4;
    this.lightF = 0.62;
  }
  clearAll() {
    this.list.length = 0;
  }
  /** spawn an effect; o: {palette, angle, flip, light, layer, follow:{x,y}, dy, loop, life, scale} */
  spawn(id, x, y, o = {}) {
    const mod = mods[id];
    if (!mod || !this.enabled) return null;
    if (this.list.length >= MAX) {
      const i = this.list.findIndex((f) => !f.meta.loop);
      if (i >= 0) this.list.splice(i, 1);
      else return null;
    }
    const opts = { x, y, seed: (Math.random() * 1000) | 0 };
    for (const k of ["palette", "angle", "flip", "light", "reach", "radius", "width", "height", "spread", "speed", "hop", "rays", "shafts", "size", "stone", "text"]) if (o[k] !== undefined) opts[k] = o[k];
    if (o.opts) Object.assign(opts, o.opts);
    const fx = createFx(mod, opts);
    fx.layer = o.layer || "front";
    fx.follow = o.follow || null;
    fx.dy = o.dy || 0;
    fx.dx = o.dx || 0;
    fx.life = o.life ?? Infinity;
    fx.speed = o.speed2 || 1;
    if (o.skip) fx.update(o.skip);
    this.list.push(fx);
    return fx;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.update(dt * f.speed);
      if (f.follow) {
        if (f.follow.dead || f.follow.gone) f.stop();
        f.options.x = f.follow.x + f.dx;
        f.options.y = f.follow.y + f.dy;
      }
      f.life -= dt;
      if (f.life <= 0) {
        f.stop();
        f.life = Infinity;
      }
      if (f.done()) this.list.splice(i, 1);
    }
  }
  /** start a frame: clear & position at camera */
  begin(camX, camY) {
    clearFrame(this.back);
    clearFrame(this.front);
    this.back.ox = this.front.ox = Math.round(camX);
    this.back.oy = this.front.oy = Math.round(camY);
    this.backUsed = false;
    for (const f of this.list) {
      if (f.layer === "back") this.backUsed = true;
      f.draw(f.layer === "back" ? this.back : this.front);
    }
  }
  painter(layer = "front") {
    const p = painterFor(layer === "back" ? this.back : this.front);
    p.place(0, 0);
    return p;
  }
  /** composite a frame into its canvases */
  _comp(frame, cColor, cLight) {
    const n = this.w * this.h, out = this.u32, C = frame.color, L = frame.light;
    out.set(C);
    cColor.getContext("2d").putImageData(this.img, 0, 0);
    let any = false;
    for (let i = 0; i < n; i++) {
      const l = L[i];
      if (l) any = true;
      out[i] = l | 0xff000000;
    }
    if (any) cLight.getContext("2d").putImageData(this.img, 0, 0);
    return any;
  }
  drawBack(g) {
    if (!this.backUsed) return;
    const any = this._comp(this.back, this.cBack, this.cLightB);
    g.drawImage(this.cBack, 0, 0);
    if (any) {
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = this.lightB;
      g.drawImage(this.cLightB, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }
  }
  drawFront(g) {
    const any = this._comp(this.front, this.cFront, this.cLightF);
    g.drawImage(this.cFront, 0, 0);
    if (any) {
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = this.lightF;
      g.drawImage(this.cLightF, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }
  }
}
