// pixelfx bridge: live effects drawn into two pixel frames (behind / in front of characters),
// composited into canvases each frame (color normally, light additively).
import { createFrame, clearFrame, createFx, painterFor, setSimHz } from "../pixelfx/core/index.js";
import { VIEW_W, VIEW_H } from "./data.js";
import { FX_MODS } from "./fxmods.js";
import { mountedShield } from './pets.js';
import { flyingMount } from './petcombat.js';

export const FX_IDS = [
  "fire/fire-tornado",
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

let MAX = 40;
// big screen-filling effects: overlapping ults used to stack 3-4 of each (rune circles of radius ~90 px painted
// every frame), which is what made phones heat up; keep the newest few and drop the oldest of the same kind
const HEAVY = new Set([
  "fire/fire-tornado",
  "arcane/rune-circle", "holy/holy-pillar", "arcane/magic-circle-cast", "arcane/star-fall", "arcane/portal",
  "shadow/eclipse", "shadow/black-hole", "shadow/hex-sigil", "water/whirlpool", "water/wave-crash",
  "holy/sunburst", "holy/heal-aoe", "lightning/thunderclap", "ice/frost-nova", "scifi/force-field",
  "nature/poison-cloud", "fire/fire-breath", "explosions/plasma-explosion", "explosions/implosion",
]);
export class FxLayer {
  constructor(w = VIEW_W, h = VIEW_H) {
    this.w = w;
    this.h = h;
    this.back = createFrame(w, h);
    this.front = createFrame(w, h);
    // heavy effects paint into their own pair of frames, refreshed at their authored 30 fps rather than every
    // display frame (and shifted with the camera in between): half the per-pixel glow work at 60 fps
    this.hback = createFrame(w, h);
    this.hfront = createFrame(w, h);
    // Shield shells belonging to flying riders must be drawn after their body.
    // Other front effects stay below the flying rider as before.
    this.airShield = createFrame(w, h);
    this.hT = 0;
    this.hcam = [0, 0];
    this.cam = [0, 0];
    this.list = [];
    this.petFx = new Map();
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
    this.cHB = mk();
    this.cHF = mk();
    this.cHLB = mk();
    this.cHLF = mk();
    this.cAirShield = mk();
    this.cAirLight = mk();
    this.img = new ImageData(w, h);
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.enabled = true;
    // bright Brawl-Stars-like floors wash out under full additive light
    this.lightB = 0.4;
    this.lightF = 0.62;
  }
  /** low-effects mode for slow devices: fewer live effects, half-rate particle simulation */
  setLite(on) {
    this.lite = !!on;
    setSimHz(on ? 60 : 120);
  }
  clearAll() {
    this.list.length = 0;
    this.petFx.clear();
    this.hNew = true;
  }
  /** spawn an effect; o: {palette, angle, flip, light, layer, follow:{x,y}, dy, loop, life, scale} */
  spawn(id, x, y, o = {}) {
    const mod = mods[id];
    if (!mod || !this.enabled) return null;
    const cap = id==='fire/fire-tornado'?4:HEAVY.has(id) ? (this.lite ? 1 : 2) : this.lite ? 4 : 8;
    let n = 0, old = -1;
    for (let i = 0; i < this.list.length; i++) if (this.list[i].id === id) {
      if (old < 0) old = i;
      n++;
    }
    if (n >= cap) this.list.splice(old, 1);
    const max = this.lite ? 26 : MAX;
    while (this.list.length >= max) {
      const i = this.list.findIndex((f) => !f.meta.loop);
      if (i >= 0) this.list.splice(i, 1);
      else return null;
    }
    const opts = { x, y, seed: (Math.random() * 1000) | 0 };
    for (const k of ["palette", "angle", "flip", "light", "reach", "radius", "width", "height", "spread", "speed", "hop", "rays", "shafts", "size", "stone", "text"]) if (o[k] !== undefined) opts[k] = o[k];
    if (o.opts) Object.assign(opts, o.opts);
    const fx = createFx(mod, opts);
    fx.id = id;
    fx.heavy = HEAVY.has(id);
    if (fx.heavy) this.hNew = true;
    fx.layer = o.layer || "front";
    fx.follow = o.follow || null;
    fx.baseRadius=fx.options.radius;
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
        if(f.id==='holy/divine-shield'){
          const shield=mountedShield(f.follow);
          f.options.radius=shield?shield.radius:f.baseRadius;
          if(shield){f.options.x=shield.x;f.options.y=shield.y;}
        }
      }
      f.life -= dt;
      if (f.life <= 0) {
        f.stop();
        f.life = Infinity;
      }
      if (f.done()) this.list.splice(i, 1);
    }
  }
  // Field IDs survive cooperative snapshots; visual objects stay local, never serialized.
  syncPetFields(game) {
    const active=new Set();
    for(const f of game.petFields||[]){
      if(f.kind!=='tornado'||f.life<=0)continue;
      const p=game.player(f.owner);if(!p?.mounted||p.pet?.id!=='dragon'||p.dead||p.downed)continue;
      active.add(f.id);let fx=this.petFx.get(f.id);
      if(!fx||!this.list.includes(fx)){
        fx=this.spawn('fire/fire-tornado',f.x,f.y,{height:94,radius:f.r,follow:f,layer:'front',skip:f.t%2});
        if(fx)this.petFx.set(f.id,fx);
      }
      if(fx){fx.follow=f;fx.options.x=f.x;fx.options.y=f.y;}
    }
    for(const [id,fx] of this.petFx)if(!active.has(id)){fx.follow=null;fx.stop();this.petFx.delete(id);this.hNew=true;}
  }
  /** start a frame: clear (only what was drawn last frame) & position at camera */
  begin(camX, camY) {
    const cx = Math.round(camX), cy = Math.round(camY), now = performance.now();
    this._clear(this.back);
    this._clear(this.front);
    this._clear(this.airShield);
    this.back.ox = this.front.ox = this.cam[0] = cx;
    this.back.oy = this.front.oy = this.cam[1] = cy;
    this.airShield.ox=cx;this.airShield.oy=cy;this.airShieldUsed=false;
    const re = this.hNew || now - this.hT >= (this.lite ? 48 : 30);
    if (re) {
      this._clear(this.hback);
      this._clear(this.hfront);
      this.hback.ox = this.hfront.ox = this.hcam[0] = cx;
      this.hback.oy = this.hfront.oy = this.hcam[1] = cy;
      this.hT = now;
      this.hNew = false;
    }
    this.backUsed = this.frontUsed = false;
    for (const f of this.list) {
      if(f.id==='holy/divine-shield'&&f.follow&&!f.follow.dead&&!f.follow.downed&&flyingMount(f.follow)){
        this.airShieldUsed=true;f.draw(this.airShield);continue;
      }
      const back = f.layer === "back";
      if (f.heavy) {
        if (re) f.draw(back ? this.hback : this.hfront);
        continue;
      }
      if (back) this.backUsed = true;
      else this.frontUsed = true;
      f.draw(back ? this.back : this.front);
    }
    if (re) {
      this._comp(this.hback, this.cHB, this.cHLB);
      this._comp(this.hfront, this.cHF, this.cHLF);
    }
  }
  _clear(fr) {
    const b = fr.bbox;
    if (b === undefined) return clearFrame(fr); // first frame: unknown
    if (!b) return; // nothing was drawn last frame
    const w = this.w;
    for (let y = b[1]; y <= b[3]; y++) {
      const o = y * w;
      fr.color.fill(0, o + b[0], o + b[2] + 1);
      fr.light.fill(0, o + b[0], o + b[2] + 1);
    }
  }
  painter(layer = "front") {
    if (layer === "back") this.backUsed = true;
    else this.frontUsed = true;
    const p = painterFor(layer === "back" ? this.back : this.front);
    p.place(0, 0);
    return p;
  }
  /**
   * composite a frame into its canvases — only the rectangle effects actually covered this frame: the copies,
   * uploads and the (additive) draws used to cover the whole screen twice per layer, every frame
   */
  _comp(frame, cColor, cLight) {
    const w = this.w, h = this.h, out = this.u32, C = frame.color, L = frame.light, D = frame.dirty;
    if (!D || D[2] < 0) return (frame.bbox = null);
    const x0 = D[0], y0 = D[1], x1 = D[2], y1 = D[3], lit = !!frame.lit;
    D[0] = w, D[1] = h, D[2] = D[3] = -1, frame.lit = false;
    const bb = (frame.bbox = [x0, y0, x1, y1]), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    for (let y = y0; y <= y1; y++) {
      const o = y * w;
      out.set(C.subarray(o + x0, o + x1 + 1), o + x0);
    }
    cColor.getContext("2d").putImageData(this.img, 0, 0, x0, y0, bw, bh);
    if (lit) {
      for (let y = y0; y <= y1; y++) {
        const o = y * w;
        for (let i = o + x0, e = o + x1; i <= e; i++) out[i] = L[i] | 0xff000000;
      }
      cLight.getContext("2d").putImageData(this.img, 0, 0, x0, y0, bw, bh);
    }
    bb.light = lit;
    return bb;
  }
  /** colours of the heavy frame (shifted by the camera move since it was painted) then this frame's, then lights */
  _blit(g, hframe, hc, hl, frame, cColor, cLight, used, k) {
    const hb = hframe.bbox, nb = used ? this._comp(frame, cColor, cLight) : (frame.bbox = null);
    if (!hb && !nb) return;
    const dx = this.hcam[0] - this.cam[0], dy = this.hcam[1] - this.cam[1];
    const put = (c, b, ox, oy) => {
      const bw = b[2] - b[0] + 1, bh = b[3] - b[1] + 1;
      g.drawImage(c, b[0], b[1], bw, bh, b[0] + ox, b[1] + oy, bw, bh);
    };
    if (hb) put(hc, hb, dx, dy);
    if (nb) put(cColor, nb, 0, 0);
    if ((hb && hb.light) || (nb && nb.light)) {
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = k;
      if (hb && hb.light) put(hl, hb, dx, dy);
      if (nb && nb.light) put(cLight, nb, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }
  }
  drawBack(g) {
    this._blit(g, this.hback, this.cHB, this.cHLB, this.back, this.cBack, this.cLightB, this.backUsed, this.lightB);
  }
  drawFront(g) {
    this._blit(g, this.hfront, this.cHF, this.cHLF, this.front, this.cFront, this.cLightF, this.frontUsed, this.lightF);
  }
  drawAirShields(g) {
    this._blit(g,{bbox:null},null,null,this.airShield,this.cAirShield,this.cAirLight,this.airShieldUsed,this.lightF);
  }
}
