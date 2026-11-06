// Draws the world: ground, y-sorted blocks/bushes/characters, pixelfx layers, bullets, overlays.
import { T, VIEW_W, VIEW_H, CHARS, ELEM, ITEMS, ENEMIES, RS } from "./data.js";
import { A, silhouette } from "./assets.js";
import { WALL, WATER, BUSH, CRATE, BARREL, wallSprite, wallMask, crateSprite, bushSprite, drawSpikes, tileAt, THEMES, LIFT } from "./map.js";
import { clamp, TAU, dist } from "./util.js";
import { input } from "./input.js";
import { hex } from "../pixelfx/core/index.js";
import { icon } from "./icons.js";
const shovelIcon = (k) => icon("shovel_" + k);
const HC = new Map();
const H = (c) => {
  let v = HC.get(c);
  if (v === undefined) HC.set(c, (v = hex(c)));
  return v;
};

const FONT = "Cubic, 'PingFang SC', 'Microsoft YaHei', sans-serif";
export class Renderer {
  constructor(canvas, fx) {
    this.c = canvas;
    this.g = canvas.getContext("2d");
    this.g.imageSmoothingEnabled = false;
    this.fx = fx;
    this.cam = { x: 0, y: 0 };
    this.icons = {};
    this.t = 0;
  }
  follow(game, p, dt, snap = false) {
    if (!game.map) return;
    let tx = p ? p.x : game.map.pxW / 2, ty = p ? p.y - 24 : game.map.pxH / 2;
    if (p && p.target && !p.dead) {
      const k = p.target.boss ? 0.4 : 0.18;
      tx += (p.target.x - p.x) * k;
      ty += (p.target.y - 30 - p.y) * k;
    }
    tx -= VIEW_W / 2;
    ty -= VIEW_H / 2;
    tx = clamp(tx, -16, Math.max(-16, game.map.pxW - VIEW_W + 16));
    ty = clamp(ty, -LIFT - 24, Math.max(-24, game.map.pxH - VIEW_H + 8));
    if (game.map.pxW < VIEW_W) tx = (game.map.pxW - VIEW_W) / 2;
    if (game.map.pxH < VIEW_H) ty = (game.map.pxH - VIEW_H) / 2;
    const k = snap ? 1 : 1 - Math.pow(0.0008, dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  draw(game, me, dt) {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    this.t += dt;
    this.gameTime = game.time;
    if (this.vig && this.vig.width !== VIEW_W) this.vig = null;
    g.setTransform(RS, 0, 0, RS, 0, 0);
    g.fillStyle = "#1c2a1a";
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!game.map) return;
    const sh = game.shake, sx = sh ? (Math.random() - 0.5) * sh : 0, sy = sh ? (Math.random() - 0.5) * sh : 0;
    const cx = Math.round(this.cam.x + sx), cy = Math.round(this.cam.y + sy);
    const m = game.map;
    // ground
    const gx0 = Math.max(0, cx), gy0 = Math.max(0, cy);
    g.drawImage(game.ground, gx0, gy0, Math.min(VIEW_W, m.pxW - gx0), Math.min(VIEW_H, m.pxH - gy0), gx0 - cx, gy0 - cy, Math.min(VIEW_W, m.pxW - gx0), Math.min(VIEW_H, m.pxH - gy0));
    g.translate(-cx, -cy);
    const tx0 = Math.max(0, Math.floor(cx / T) - 1), tx1 = Math.min(m.W - 1, Math.floor((cx + VIEW_W) / T) + 1);
    const ty0 = Math.max(0, Math.floor(cy / T) - 1), ty1 = Math.min(m.H - 1, Math.floor((cy + VIEW_H + LIFT) / T) + 1);
    const th = THEMES[m.theme];
    // water shimmer
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (m.t[y * m.W + x] === WATER) {
      const X = x * T, Y = y * T, ph = this.t * 2 + x * 1.3 + y * 0.7;
      g.fillStyle = th.waterHi;
      g.fillRect(X + 4 + Math.round(Math.sin(ph) * 3), Y + 10, 8, 1);
      g.fillRect(X + 16 + Math.round(Math.cos(ph * 1.1) * 3), Y + 20, 9, 1);
    }
    // live hazard floor: lava glows and bubbles, ice glints
    if (m.hazard === "lava" || m.hazard === "ice") {
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (m.mud[y * m.W + x]) {
        const X = x * T, Y = y * T, ph = this.t * (m.hazard === "lava" ? 2.2 : 1.1) + x * 1.7 + y * 2.3;
        if (m.hazard === "lava") {
          g.globalAlpha = 0.18 + 0.14 * Math.sin(ph);
          g.fillStyle = "#ffd04a";
          g.fillRect(X + 2, Y + 2, T - 4, T - 4);
          g.globalAlpha = 1;
          const b = (ph * 0.8) % 3;
          if (b < 1) {
            g.fillStyle = "#fff0a0";
            g.fillRect(X + 8 + ((x * 7) % 14), Y + 12 + ((y * 5) % 10) - Math.round(b * 3), 2, 2);
          }
        } else if ((ph % 6) < 0.6) {
          g.fillStyle = "#ffffff";
          const k = Math.round((ph % 6) * 20);
          g.fillRect(X + 4 + k, Y + 6 + (k >> 1), 3, 1);
          g.fillRect(X + 5 + k, Y + 5 + (k >> 1), 1, 3);
        }
      }
    }
    // 算力据点 capture zone
    if (game.pvp && game.pvpRule && game.pvpRule.zone) this.drawKoth(g, game, me);
    // spikes
    for (const s of m.spikes) if (s.x >= tx0 && s.x <= tx1 && s.y >= ty0 && s.y <= ty1) drawSpikes(g, s.x * T, s.y * T, game.spikeUp || 0);
    // zones on the floor (before the back fx layer)
    for (const z of game.zones) this.drawZone(g, z, game);
    // ground marks: own ring, lock-on reticle, telegraphs
    for (const p of game.players) if (!p.dead) this.drawRing(g, p, me);
    if (me && me.target && !me.target.dead && !me.target.downed) this.drawReticle(g, me.target);
    for (const e of game.enemies) this.drawTelegraph(g, e);

    // pixelfx: back layer
    g.setTransform(RS, 0, 0, RS, 0, 0);
    this.fx.begin(cx, cy);
    this.drawBullets(game, cx, cy);
    this.fx.drawBack(g);
    g.translate(-cx, -cy);

    // y-sorted scene
    const list = [];
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const t = m.t[y * m.W + x];
      if (t === WALL) list.push({ y: y * T + T, k: 0, x, ty: y });
      else if (t === BUSH) list.push({ y: y * T + T - 2, k: 1, x, ty: y });
      else if (t === CRATE || t === BARREL) list.push({ y: y * T + T, k: 2, x, ty: y, t });
    }
    for (const p of game.players) if (!p.dead) list.push({ y: p.y, k: 3, o: p });
    for (const e of game.enemies) if (e.spawnT <= 0.25) list.push({ y: e.y + (e.boss ? 20 : 0), k: 4, o: e });
    for (const q of game.pickups) list.push({ y: q.y, k: 5, o: q });
    for (const z of game.zones) if (z.kind === "station") list.push({ y: z.y, k: 6, o: z });
    if (game.shop && game.room && game.room.kind === "shop") for (const it of game.shop) list.push({ y: it.y + 10, k: 7, o: it });
    if (game.chest && !game.chest.opened) list.push({ y: game.chest.y + 8, k: 8, o: game.chest });
    if (game.shovelItem && !game.shovelItem.got) list.push({ y: game.shovelItem.y, k: 9, o: game.shovelItem });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) {
      switch (d.k) {
        case 0: g.drawImage(wallSprite(m.theme, wallMask(m, d.x, d.ty)), d.x * T, d.ty * T - LIFT); break;
        case 1: {
          const X = d.x * T, Y = d.ty * T;
          // players hiding inside: the bush goes see-through near them
          let near = false;
          for (const p of game.players) if (Math.abs(p.x - X - 16) < 34 && Math.abs(p.y - Y - 16) < 34 && (p === me || p.local)) near = true;
          g.globalAlpha = near ? 0.55 : 1;
          g.drawImage(bushSprite(m.theme, (d.x * 7 + d.ty * 13) % 5), X - 4, Y - 12);
          g.globalAlpha = 1;
          break;
        }
        case 2: {
          const c = m.crates[d.ty * m.W + d.x];
          const s = crateSprite(d.t === CRATE ? "crate" : "barrel", c ? 1 - c.hp / (d.t === CRATE ? 30 : 12) : 0);
          g.drawImage(s, d.x * T, d.ty * T - 8);
          if (c && c.flash > 0) {
            g.globalAlpha = 0.6;
            g.fillStyle = "#fff";
            g.fillRect(d.x * T + 4, d.ty * T - 4, 24, 34);
            g.globalAlpha = 1;
          }
          break;
        }
        case 3: this.drawHero(g, d.o, me, game); break;
        case 4: this.drawEnemy(g, d.o, game); break;
        case 5: this.drawPickup(g, d.o); break;
        case 6: this.drawStation(g, d.o); break;
        case 7: this.drawShopItem(g, d.o, me); break;
        case 8: this.drawChest(g, d.o); break;
        case 9: this.drawShovelDrop(g, d.o, game.time); break;
      }
    }
    // lobbed bullets get a shadow on the ground (drawn already) - lines
    g.setTransform(RS, 0, 0, RS, 0, 0);
    this.fx.drawFront(g);
    g.translate(-cx, -cy);
    this.drawLines(g, game);
    // overlays
    for (const e of game.enemies) this.drawEmbers(g, e), this.drawEnemyBar(g, e);
    for (const p of game.players) this.drawHeroBar(g, p, me, game);
    this.drawAim(g, me);
    for (const f of game.floaters) {
      const a = clamp(f.life / f.max * 2, 0, 1);
      const pop = 1 + Math.max(0, (f.life / f.max - 0.8) * 2.5);
      this.text(g, f.s, f.x, f.y, f.color, Math.round(12 * f.size * pop), a);
    }
    g.setTransform(RS, 0, 0, RS, 0, 0);
    this.drawEdgeArrows(g, game, me, cx, cy);
    // vignette
    if (!this.vig) {
      const v = document.createElement("canvas");
      v.width = VIEW_W;
      v.height = VIEW_H;
      const vg = v.getContext("2d"), gr = vg.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(10,20,30,0.42)");
      vg.fillStyle = gr;
      vg.fillRect(0, 0, VIEW_W, VIEW_H);
      this.vig = v;
    }
    // (vignette is a CSS overlay: cheaper than a full-screen blend every frame)
    if (me && me.hurtT > 0) {
      g.fillStyle = `rgba(255,40,60,${me.hurtT * 0.6})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (me && me.hp <= 1 && !me.downed && me.maxHp > 1) {
      g.strokeStyle = `rgba(255,30,50,${0.25 + 0.15 * Math.sin(this.t * 6)})`;
      g.lineWidth = 10;
      g.strokeRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  drawKoth(g, game, me) {
    const c = game.map.center, R0 = game.pvpRule.zone;
    const inside = game.players.filter((p) => !p.downed && !p.dead && Math.hypot(p.x - c.x, p.y - c.y) < R0);
    const own = inside.length === 1 ? inside[0].id : inside.length ? -1 : 0;
    const col = own > 0 ? (own === (me && me.id) ? "#5dff7a" : "#ff4a5a") : own < 0 ? "#ffd84a" : "#c8b8ff";
    g.save();
    g.globalAlpha = 0.16 + (own > 0 ? 0.1 * Math.sin(this.t * 8) : 0);
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(c.x, c.y, R0, R0 * 0.62, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 0.9;
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.setLineDash([8, 6]);
    g.lineDashOffset = -this.t * 20;
    g.stroke();
    g.setLineDash([]);
    g.restore();
    this.text(g, own > 0 ? "占领中" : own < 0 ? "争夺中" : "算力据点", c.x, c.y - R0 * 0.62 - 6, col, 10);
  }
  /** arrows at the screen edge for off-screen goals: portal, chest, last enemies, teammates */
  drawEdgeArrows(g, game, me, cx, cy) {
    if (!me) return;
    const goals = [];
    if (game.portal && game.phase !== "fight" && !game.pvp) goals.push({ x: game.portal.x, y: game.portal.y, c: "#b48cff", s: "门" });
    if (game.chest && !game.chest.opened) goals.push({ x: game.chest.x, y: game.chest.y, c: "#ffd84a", s: "箱" });
    if (game.pvp && game.pvpRule && game.pvpRule.zone) goals.push({ x: game.map.center.x, y: game.map.center.y, c: "#7dffb0", s: "点" });
    const live = game.enemies.filter((e) => e.spawnT <= 0);
    if (live.length && live.length <= 3) for (const e of live) goals.push({ x: e.x, y: e.y - 10, c: e.boss ? "#ff3a6a" : "#ff6a5a", s: e.boss ? "王" : "" });
    for (const p of game.players) if (p !== me && !p.dead && !p.pvpEnemy) goals.push({ x: p.x, y: p.y - 20, c: p.downed ? "#ff4a5a" : "#4ab8ff", s: p.downed ? "救" : "友" });
    const W = VIEW_W, Hh = VIEW_H, m = 18;
    for (const q of goals) {
      const sx = q.x - cx, sy = q.y - cy;
      if (sx > 0 && sx < W && sy > 0 && sy < Hh) continue;
      const ox = W / 2, oy = Hh / 2, dx = sx - ox, dy = sy - oy;
      const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (Hh / 2 - m) / Math.abs(dy || 1e-6));
      const ex = ox + dx * k, ey = oy + dy * k, a = Math.atan2(dy, dx);
      const bob = Math.sin(this.t * 6) * 2;
      g.save();
      g.translate(ex - Math.cos(a) * bob, ey - Math.sin(a) * bob);
      g.rotate(a);
      g.fillStyle = "#1a1020";
      g.beginPath();
      g.moveTo(12, 0); g.lineTo(-6, -9); g.lineTo(-6, 9); g.closePath();
      g.fill();
      g.fillStyle = q.c;
      g.beginPath();
      g.moveTo(9, 0); g.lineTo(-4, -6); g.lineTo(-4, 6); g.closePath();
      g.fill();
      g.restore();
      if (q.s) this.text(g, q.s, ex - Math.cos(a) * 16, ey - Math.sin(a) * 16, q.c, 11);
    }
  }
  text(g, s, x, y, color = "#fff", size = 12, alpha = 1, align = "center") {
    g.globalAlpha = alpha;
    g.font = `${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.lineWidth = Math.max(2, size / 4);
    g.strokeStyle = "#1a1020";
    g.lineJoin = "round";
    g.strokeText(s, Math.round(x), Math.round(y));
    g.fillStyle = color;
    g.fillText(s, Math.round(x), Math.round(y));
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------- heroes
  drawRing(g, p, me) {
    const col = this.pvpCol(p, me);
    g.save();
    g.globalAlpha = p.downed ? 0.4 : 0.85;
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(p.x, p.y, 17, 7, 0, 0, TAU);
    g.stroke();
    g.globalAlpha = 0.18;
    g.fillStyle = col;
    g.fill();
    g.restore();
  }
  pvpCol(p, me) {
    if (p === me) return "#5dff7a";
    return p.pvpEnemy ? "#ff4a5a" : "#4ab8ff";
  }
  drawHero(g, p, me, game) {
    const set = A.girls[p.cid];
    if (!set) return;
    const inBush = tileAt(game.map, p.x, p.y) === BUSH;
    if (inBush && p !== me && p.pvpEnemy) return;
    // pick a view from the facing angle
    const a = p.face, cs = Math.cos(a), sn = Math.sin(a);
    let v = Math.abs(sn) > Math.abs(cs) * 1.25 ? (sn > 0 ? "front" : "back") : cs >= 0 ? "side" : "sideL";
    if (!p.moving && p.castT <= 0 && !(p.target && p.input && p.input.atk)) v = p.idleView || "front";
    if (p.moving || p.castT > 0) p.idleView = v;
    const k = set.k || 1, W = set.w / k, H = set.foot / k, SW = set.w, SH = set.h / k;
    // drawn frames (PixelLab): run while moving (faster while dashing), the cast pose while shooting or casting in
    // place, breathing when idle; the sliced procedural sway is only a fallback for missing clips
    const dk = { front: "_s", back: "_n", side: "_e", sideL: "_eL" }[v], CL = set.clips || {};
    const firing = (p.input && p.input.atk && p.target) || p.castT > 0;
    let clip = null, fps = 13;
    if (!p.downed) {
      if (p.moving && CL["run" + dk]) (clip = CL["run" + dk]), (fps = p.dashT > 0 ? 24 : 13);
      else if (firing && CL["atk" + dk]) (clip = CL["atk" + dk]), (fps = 16);
      else if (CL["idle" + dk]) (clip = CL["idle" + dk]), (fps = 5);
    }
    const runF = clip ? clip[Math.floor(p.animT * fps) % clip.length] : null;
    const img = runF || set.views[v];
    const wht = (c) => c.__w || (c.__w = silhouette(c, "#ffffff")), tnt = (c) => c.__t || (c.__t = silhouette(c, ELEM[CHARS[p.cid].elem].glow));
    const silW = runF ? wht(runF) : set.white[v], silT = runF ? tnt(runF) : set.tint[v];
    const half = (q) => Math.round(q * k) / k;
    const x0 = half(p.x - W / 2), y0 = half(p.y - H + 1);
    // shadow
    g.fillStyle = "rgba(10,30,10,0.35)";
    g.beginPath();
    g.ellipse(p.x, p.y, 14, 5, 0, 0, TAU);
    g.fill();
    // dash afterimages
    if (p.trail) for (const q of p.trail) if (q.t > 0) {
      g.globalAlpha = q.t * 2;
      g.drawImage(silT, half(q.x - W / 2), half(q.y - H + 1), W, SH);
    }
    g.globalAlpha = 1;
    if (p.downed) {
      g.save();
      g.globalAlpha = 0.6;
      // lying on her side: only the figure rows (top..feet), rotated a quarter turn and centred on her spot
      const tp = set.top || 0, fh = (set.foot - tp) / k;
      g.translate(p.x, p.y - 6);
      g.rotate(-Math.PI / 2);
      g.drawImage(set.white[v], 0, tp, SW, set.foot - tp, -fh / 2, -W / 2, W, fh);
      g.globalAlpha = 0.45;
      g.drawImage(set.views[v], 0, tp, SW, set.foot - tp, -fh / 2, -W / 2, W, fh);
      g.restore();
      // revive progress
      if (!game.pvp) {
        g.strokeStyle = "#5dff7a";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(p.x, p.y - 20, 16, -Math.PI / 2, -Math.PI / 2 + TAU * (p.reviveT / 2));
        g.stroke();
        this.text(g, p.rebootT > 0 ? "读取断点…" : "等待救援", p.x, p.y - 44, p.rebootT > 0 ? "#ffe36a" : "#ffe0e0", 11);
      } else this.text(g, Math.ceil(p.respawnT) + "", p.x, p.y - 44, "#fff", 14);
      return;
    }
    const blink = p.invuln > 0 && p.hurtT < 0.5 && p.invuln < 0.9 && Math.floor(this.t * 20) % 2 === 0 && p.dashT <= 0;
    g.globalAlpha = inBush ? 0.55 : blink ? 0.45 : 1;
    // procedural animation: bob, sway of hair/skirt rows, stepping legs (rows sliced from the hi-res sprite)
    const t = p.animT, mv = p.moving;
    const bob = half(mv ? -Math.abs(Math.sin(t * 9)) * 2 : Math.sin(t * 2.2) * 0.6);
    const rec = p.recoil ? -Math.cos(p.face) * p.recoil : 0;
    if (runF) {
      // a real run cycle: draw the frame whole (no sliced bob / sway / legs)
      g.drawImage(runF, 0, 0, SW, set.h, x0 + half(rec), y0, W, SH);
    } else {
    const legH = 9, body = H - legH, top0 = Math.floor((set.top || 0) / k), fig = body - top0;
    const swayA = mv ? 1.6 : 0.7, swayDir = mv ? -(p.input?.mx || 0) : 0;
    // rows near the head barely move: draw them as one slice, then 2-row strips for hair/skirt
    const still = top0 + Math.floor(fig * 0.35);
    const dx0 = half(rec);
    g.drawImage(img, 0, 0, SW, still * k, x0 + dx0, y0 + bob, W, still);
    for (let y = still; y < body; y += 2) {
      const hgt = Math.min(2, body - y);
      const kk = Math.max(0, (y - still) / Math.max(1, body - still));
      const dx = half(Math.sin(t * (mv ? 9 : 2.4) - y * 0.12) * swayA * kk * 0.6 + swayDir * kk * 2 + rec);
      g.drawImage(img, 0, y * k, SW, hgt * k, x0 + dx, y0 + y + bob, W, hgt);
    }
    const rx = half(rec);
    if (mv) {
      const ph = Math.sin(t * 9), l = half(Math.max(0, ph) * 2.2), r2 = half(Math.max(0, -ph) * 2.2);
      g.drawImage(img, 0, body * k, SW / 2, legH * k, x0 + rx, y0 + body - l, W / 2, legH);
      g.drawImage(img, SW / 2, body * k, SW / 2, legH * k, x0 + W / 2 + rx, y0 + body - r2, W / 2, legH);
    } else g.drawImage(img, 0, body * k, SW, legH * k, x0 + rx, y0 + body, W, legH);
    }
    // flashes
    const flashA = p.hurtT > 0 ? p.hurtT * 2.5 : p.buff && p.buff.star > 0 ? 0.25 + 0.2 * Math.sin(this.t * 20) : 0;
    if (flashA > 0) {
      g.globalAlpha = Math.min(1, flashA);
      g.drawImage(p.buff.star > 0 ? silT : silW, x0, y0 + (runF ? 0 : bob), W, SH);
    }
    if (p.buff && p.buff.ultOn > 0) {
      g.globalAlpha = 0.18 + 0.12 * Math.sin(this.t * 10);
      g.globalCompositeOperation = "lighter";
      g.drawImage(silT, x0, y0 + (runF ? 0 : bob), W, SH);
      g.globalCompositeOperation = "source-over";
    }
    g.globalAlpha = 1;
    // muzzle flash
    if (p.recoil > 1.2) {
      const col = ELEM[CHARS[p.cid].elem].glow;
      const mx = p.x + Math.cos(p.face) * 14, my = p.y - 20 + Math.sin(p.face) * 8;
      g.globalCompositeOperation = "lighter";
      g.fillStyle = col;
      g.beginPath();
      g.arc(mx, my, 4, 0, TAU);
      g.fill();
      g.globalCompositeOperation = "source-over";
    }
  }
  drawHeroBar(g, p, me, game) {
    if (p.dead || p.downed) return;
    const set = A.girls[p.cid];
    if (tileAt(game.map, p.x, p.y) === BUSH && p !== me && p.pvpEnemy) return;
    const y = p.y - (set.foot - (set.top || 0)) / (set.k || 1) - 8, w = 34, x = p.x - w / 2;
    const col = p === me ? "#5dff7a" : p.pvpEnemy ? "#ff4a5a" : "#4ab8ff";
    // name
    if (game.players.length > 1 || p !== me) this.text(g, p.name, p.x, y - 9, col, 10);
    g.fillStyle = "#14101c";
    g.fillRect(x - 1, y - 1, w + 2, 6);
    g.fillStyle = "#3a1a24";
    g.fillRect(x, y, w, 4);
    g.fillStyle = col;
    g.fillRect(x, y, Math.round(w * clamp(p.hp / p.maxHp)), 4);
    if (p.shield > 0) {
      g.fillStyle = "#c8dcff";
      g.fillRect(x, y + 4, Math.round(w * clamp(p.shield / Math.max(1, p.maxShield))), 1);
    }
    // ult ready star
    if (p.ult >= 1) {
      g.fillStyle = "#ffe14a";
      g.fillRect(x + w + 3, y - 1, 5, 5);
      g.fillStyle = "#fff";
      g.fillRect(x + w + 4, y, 2, 2);
    }
  }
  drawAim(g, me) {
    if (!me || me.dead || me.downed) return;
    const show = (ang, len, wid, col) => {
      g.save();
      g.translate(me.x, me.y - 16);
      g.rotate(ang);
      g.globalAlpha = 0.28;
      g.fillStyle = col;
      g.fillRect(8, -wid / 2, len, wid);
      g.globalAlpha = 0.7;
      g.fillRect(8, -wid / 2, len, 1);
      g.fillRect(8, wid / 2 - 1, len, 1);
      g.restore();
    };
    const c = CHARS[me.cid];
    if (input.aim != null) show(input.aim, c.atk.range * me.st.range, 8, "#ffffff");
    if (input.skillAim != null) show(input.skillAim, 160, 24, "#7fd0ff");
    if (input.ultAim != null) show(input.ultAim, 190, 30, "#ffe14a");
  }

  // ---------------------------------------------------------- enemies
  drawReticle(g, e) {
    const r = e.r + 8 + Math.sin(this.t * 6) * 1.5;
    g.save();
    g.strokeStyle = "#ff4a5a";
    g.lineWidth = 2;
    g.globalAlpha = 0.9;
    for (let i = 0; i < 4; i++) {
      const a = this.t * 1.5 + (i * TAU) / 4;
      g.beginPath();
      g.ellipse(e.x, e.y + 2, r, r * 0.45, 0, a, a + 0.9);
      g.stroke();
    }
    g.restore();
  }
  drawTelegraph(g, e) {
    if (e.st === "aim" && e.lx != null) {
      g.save();
      g.globalAlpha = 0.35 + 0.2 * Math.sin(this.t * 20);
      g.fillStyle = "#ff3040";
      g.beginPath();
      g.ellipse(e.lx, e.ly, 26, 11, 0, 0, TAU);
      g.fill();
      g.restore();
    }
    if (e.st === "charge") {
      const r = (e.elite ? 80 : 60) * (1 - Math.max(0, e.cd) / 0.8);
      g.save();
      g.strokeStyle = "#a0f0ff";
      g.globalAlpha = 0.6;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(e.x, e.y, r, r * 0.5, 0, 0, TAU);
      g.stroke();
      g.restore();
    }
  }
  drawEnemy(g, e, game) {
    const d = e.def, s = A.critters[d.sprite];
    if (!s) return;
    // sprScale: the PixelLab monsters are drawn a bit larger than the original critters; shrink the picture only
    const sc = (d.scale || 1) * (d.sprScale || 1);
    const fr = Math.floor(e.anim * s.fps * (e.slowT > 0 ? 0.5 : 1)) % s.n;
    const fade = e.spawnT > 0 ? 1 - e.spawnT / 0.25 : 1;
    // shadow (fliers' strips include their own)
    g.save();
    g.globalAlpha = fade;
    if (e.elite || e.boss) {
      g.globalCompositeOperation = "lighter";
      g.fillStyle = e.boss ? "rgba(255,60,90,0.25)" : "rgba(255,190,60,0.3)";
      g.beginPath();
      g.ellipse(e.x, e.y, e.r * 1.6, e.r * 0.7, 0, 0, TAU);
      g.fill();
      g.globalCompositeOperation = "source-over";
    }
    if (d.rare) {
      // rare monster: a golden halo and sparkles orbiting it
      g.globalCompositeOperation = "lighter";
      g.fillStyle = `rgba(255,216,74,${0.22 + 0.1 * Math.sin(this.t * 5)})`;
      g.beginPath();
      g.ellipse(e.x, e.y, e.r * 1.8, e.r * 0.8, 0, 0, TAU);
      g.fill();
      for (let i = 0; i < 4; i++) {
        const a = this.t * 2.2 + (i * TAU) / 4, rx = e.r * 1.5, ry = e.r * 0.9;
        g.fillStyle = i % 2 ? "#fff6c0" : "#ffd84a";
        g.fillRect(Math.round(e.x + Math.cos(a) * rx) - 1, Math.round(e.y - e.r * 0.8 + Math.sin(a) * ry) - 1, 2, 2);
      }
      g.globalCompositeOperation = "source-over";
    }
    const z = e.z || 0;
    g.translate(Math.round(e.x), Math.round(e.y - z));
    if (e.face < 0 && d.sprite !== "eyeball") g.scale(-1, 1);
    const wiggle = e.st === "wind" || e.st === "charge" || e.st === "boom" ? Math.round(Math.sin(this.t * 60)) : 0;
    const dx = -s.ox * sc + wiggle, dy = -s.oy * sc;
    g.drawImage(s.img, fr * s.w, 0, s.w, s.h, dx, dy, s.w * sc, s.h * sc);
    let ov = null, oa = 0;
    if (e.flash > 0) (ov = s.white), (oa = e.boss ? 0.35 : 0.85);
    else if (e.freezeT > 0) (ov = s.blue), (oa = 0.6);
    else if (e.st === "boom") (ov = s.red), (oa = 0.5 + 0.5 * Math.sin(this.t * 40));
    else if (e.burnT > 0) (ov = s.red), (oa = 0.3 + 0.25 * Math.sin(this.t * 14));
    else if (e.slowT > 0 || e.vulnT > 0) (ov = s.blue), (oa = 0.35);
    else if (e.elite) (ov = s.red), (oa = 0.12 + 0.08 * Math.sin(this.t * 4));
    if (ov) {
      g.globalAlpha = oa * fade;
      g.drawImage(ov, fr * s.w, 0, s.w, s.h, dx, dy, s.w * sc, s.h * sc);
    }
    g.restore();
  }
  drawEmbers(g, e) {
    if (!(e.burnT > 0)) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const ph = (this.t * 1.6 + i * 0.25 + (e.id % 5) * 0.11) % 1;
      g.globalAlpha = 1 - ph;
      g.fillStyle = i % 2 ? "#ffb040" : "#ff6020";
      g.fillRect(Math.round(e.x + Math.sin(i * 2.1 + this.t * 3) * e.r * 0.7), Math.round(e.y - e.r - ph * 22), 2, 2);
    }
    g.restore();
  }
  drawEnemyBar(g, e) {
    if (e.spawnT > 0 || e.boss) return;
    const s = A.critters[e.def.sprite];
    const top = e.y - Math.min(s.oy, e.r * 2.6 + 10) - 6 - (e.z || 0);
    // element marks: colored pips (what can react)
    let i = 0;
    const marks = Object.keys(e.marks || {}).filter((k) => e.marks[k] > (this.gameTime ?? 0));
    const n = marks.length + (e.bubble > (this.gameTime ?? 0) ? 1 : 0);
    let px = e.x - (n * 6) / 2;
    for (const k of marks) {
      g.fillStyle = "#14101c";
      g.fillRect(px + i * 6, top - 9, 5, 5);
      g.fillStyle = ELEM[k].color;
      g.fillRect(px + i * 6 + 1, top - 8, 3, 3);
      i++;
    }
    if (e.elite) this.text(g, "精英", e.x, top - 16, "#ffd84a", 10);
    if (e.hp >= e.maxHp && !e.elite) return;
    const w = e.elite ? 30 : 22, x = e.x - w / 2;
    g.fillStyle = e.elite ? "#ffcf4a" : "#14101c";
    g.fillRect(x - 1, top - 1, w + 2, 5);
    g.fillStyle = "#3a1a24";
    g.fillRect(x, top, w, 3);
    g.fillStyle = "#ff4a5a";
    g.fillRect(x, top, Math.round(w * clamp(e.hp / e.maxHp)), 3);
  }

  // ---------------------------------------------------------- zones, pickups, props
  drawZone(g, z, game) {
    g.save();
    if (z.kind === "whale") {
      const k = clamp(z.t / 0.55);
      g.globalAlpha = 0.25 + 0.35 * k;
      g.fillStyle = "#0a2040";
      g.beginPath();
      g.ellipse(z.x, z.y, z.r * k, z.r * 0.5 * k, 0, 0, TAU);
      g.fill();
      g.strokeStyle = "#7fd0ff";
      g.lineWidth = 2;
      g.globalAlpha = 0.8;
      g.beginPath();
      g.ellipse(z.x, z.y, z.r, z.r * 0.5, 0, 0, TAU);
      g.stroke();
    } else if (z.kind === "domain" || z.kind === "inkcircle" || z.kind === "tome") {
      const col = { domain: "#ffb03a", inkcircle: "#7b6cff", tome: "#7b6cff" }[z.kind];
      const fadeIn = clamp(z.t * 4), fadeOut = clamp(z.life * 3);
      g.globalAlpha = 0.16 * fadeIn * fadeOut;
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU);
      g.fill();
      g.globalAlpha = 0.7 * fadeIn * fadeOut;
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.setLineDash([6, 4]);
      g.lineDashOffset = -this.t * 20;
      g.stroke();
    } else if (z.kind === "station") {
      g.globalAlpha = 0.14;
      g.fillStyle = "#ff7cc8";
      g.beginPath();
      g.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU);
      g.fill();
    } else if (z.kind === "poison") {
      // bubbling toxic pool (drawn by hand, Brawl Stars style poison)
      const fade = clamp(z.life * 2) * clamp(z.t * 3);
      const pc = z.fire ? ["#7a1e06", "#ff6a1a", "#ffd04a", "#fff0a0"] : ["#2f6a1e", "#6fd23a", "#a6f05a", "#d8ffa0"];
      g.globalAlpha = 0.85 * fade;
      g.fillStyle = pc[0];
      g.beginPath();
      g.ellipse(z.x, z.y, z.r + 2, z.r * 0.62 + 2, 0, 0, TAU);
      g.fill();
      g.fillStyle = pc[1];
      g.beginPath();
      g.ellipse(z.x, z.y, z.r, z.r * 0.62, 0, 0, TAU);
      g.fill();
      g.fillStyle = pc[2];
      g.beginPath();
      g.ellipse(z.x - z.r * 0.25, z.y - z.r * 0.18, z.r * 0.45, z.r * 0.2, 0, 0, TAU);
      g.fill();
      for (let i = 0; i < 4; i++) {
        const ph = (this.t * 0.9 + i * 0.27 + (z.id % 7) * 0.13) % 1, a = i * 1.7 + z.id;
        const bx = z.x + Math.cos(a) * z.r * 0.55, by = z.y + Math.sin(a) * z.r * 0.3 - ph * 10;
        g.globalAlpha = (1 - ph) * fade;
        g.strokeStyle = pc[3];
        g.lineWidth = 1;
        g.beginPath();
        g.arc(bx, by, 1.5 + ph * 2.5, 0, TAU);
        g.stroke();
      }
    }
    g.restore();
  }
  icon(item) {
    if (this.icons[item]) return this.icons[item];
    const c = document.createElement("canvas");
    c.width = c.height = 18;
    const g = c.getContext("2d"), p = (x, y, w, h, col) => ((g.fillStyle = col), g.fillRect(x, y, w, h));
    const ink = "#1a1020";
    switch (item) {
      case "cube":
        p(3, 3, 12, 12, ink); p(4, 4, 10, 10, "#3ad07a"); p(4, 4, 10, 3, "#9affc0"); p(4, 4, 3, 10, "#7affb0"); p(11, 7, 3, 7, "#1a8a4a"); p(7, 8, 3, 3, "#eafff0");
        break;
      case "speed":
        p(5, 2, 8, 14, ink); p(6, 3, 6, 12, "#2ab8e8"); p(6, 3, 6, 2, "#c0f4ff"); p(7, 7, 4, 4, "#ffffff"); p(8, 8, 2, 2, "#2ab8e8"); p(6, 13, 6, 2, "#1a7ab0");
        break;
      case "rage":
        p(3, 4, 12, 10, ink); p(4, 5, 10, 8, "#e83a3a"); p(4, 5, 10, 2, "#ff9a8a"); p(2, 6, 1, 1, ink); p(15, 6, 1, 1, ink); p(2, 10, 1, 1, ink); p(15, 10, 1, 1, ink); p(8, 6, 2, 4, "#fff"); p(8, 11, 2, 1, "#fff");
        break;
      case "shield":
        p(4, 2, 10, 2, ink); p(2, 4, 14, 8, ink); p(4, 12, 10, 3, ink); p(7, 15, 4, 1, ink);
        p(4, 3, 10, 2, "#a8c8ff"); p(3, 5, 12, 6, "#6a9aff"); p(5, 11, 8, 3, "#4a7aea"); p(5, 5, 3, 4, "#e0ecff");
        break;
      case "heal":
        p(2, 4, 14, 11, ink); p(3, 5, 12, 9, "#ffffff"); p(3, 5, 12, 2, "#ffe0e8"); p(8, 6, 2, 7, "#ff3a5a"); p(5, 9, 8, 2, "#ff3a5a");
        break;
      case "star":
        for (const [x, y, w] of [[8, 2, 2], [7, 4, 4], [2, 6, 14], [4, 8, 10], [5, 10, 8], [4, 12, 4], [10, 12, 4], [3, 14, 3], [12, 14, 3]]) p(x - 1, y - 1, w + 2, 3, ink);
        for (const [x, y, w] of [[8, 2, 2], [7, 4, 4], [2, 6, 14], [4, 8, 10], [5, 10, 8], [4, 12, 4], [10, 12, 4], [3, 14, 3], [12, 14, 3]]) p(x, y, w, 2, "#ffd84a");
        p(7, 6, 2, 3, "#fffbe0");
        break;
      case "freeze":
        p(4, 5, 10, 10, ink); p(5, 6, 8, 8, "#8ad8f8"); p(5, 6, 8, 2, "#e0f8ff"); p(8, 2, 2, 4, ink); p(9, 1, 3, 2, "#ff9a3a"); p(7, 8, 1, 4, "#ffffff"); p(6, 9, 3, 1, "#ffffff");
        break;
      case "infuse":
        p(7, 1, 4, 16, ink); p(5, 4, 8, 10, ink); p(8, 2, 2, 14, "#ff8ae8"); p(6, 5, 6, 8, "#d05ae0"); p(7, 5, 2, 5, "#ffd0f8");
        break;
      case "orb":
        p(3, 3, 12, 12, ink); p(4, 4, 10, 10, "#ffb0dc"); p(5, 5, 4, 3, "#ffffff"); p(7, 8, 4, 3, "#ff3a7a"); p(6, 8, 1, 2, "#ff3a7a"); p(11, 8, 1, 2, "#ff3a7a");
        break;
    }
    this.icons[item] = c;
    return c;
  }
  drawPickup(g, q) {
    const bob = q.kind === "coin" ? 0 : Math.sin(q.t * 3) * 2;
    const z = (q.z || 0) + (q.kind === "coin" ? 3 : 7) - bob;
    g.fillStyle = "rgba(10,30,10,0.3)";
    g.beginPath();
    g.ellipse(q.x, q.y, q.kind === "coin" ? 4 : 7, 2.5, 0, 0, TAU);
    g.fill();
    if (q.life < 3 && Math.floor(q.life * 8) % 2) return;
    if (q.kind === "coin") {
      const w = Math.max(1, Math.round(Math.abs(Math.cos(q.t * 6)) * 4));
      g.fillStyle = "#5a3a08";
      g.fillRect(q.x - w - 1, q.y - z - 5, w * 2 + 2, 8);
      g.fillStyle = "#ffc93a";
      g.fillRect(q.x - w, q.y - z - 4, w * 2, 6);
      g.fillStyle = "#fff4b0";
      g.fillRect(q.x - w, q.y - z - 4, Math.max(1, w - 1), 2);
      return;
    }
    const ic = this.icon(q.kind === "orb" ? "orb" : q.item);
    const col = q.kind === "orb" ? "#ff7cc8" : ITEMS[q.item].color;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.35 + 0.15 * Math.sin(q.t * 4);
    g.fillStyle = col;
    g.beginPath();
    g.arc(q.x, q.y - z - 0, 11, 0, TAU);
    g.fill();
    g.restore();
    g.drawImage(ic, Math.round(q.x - 9), Math.round(q.y - z - 9));
  }
  drawStation(g, z) {
    const x = Math.round(z.x), y = Math.round(z.y), p = (a, b, w, h, c) => ((g.fillStyle = c), g.fillRect(x + a, y + b, w, h));
    g.fillStyle = "rgba(10,30,10,0.35)";
    g.beginPath();
    g.ellipse(x, y, 14, 5, 0, 0, TAU);
    g.fill();
    p(-11, -30, 22, 30, "#1a1020");
    p(-10, -29, 20, 28, "#ffffff");
    p(-10, -29, 20, 4, "#ff9ad0");
    p(-7, -22, 14, 10, "#ff7cc8");
    p(-5, -20, 4, 3, "#ffd8ee");
    p(-2, -8, 4, 4, "#ff3a7a");
    p(-4, -6, 8, 1, "#ff3a7a");
    const bob = Math.round(Math.sin(this.t * 5) * 2);
    p(-3, -38 + bob, 6, 6, "#1a1020");
    p(-2, -37 + bob, 4, 4, "#ffb0dc");
    // remaining time
    g.fillStyle = "#ff7cc8";
    g.fillRect(x - 10, y + 3, Math.round(20 * clamp(z.life / 7)), 2);
  }
  drawShopItem(g, it, me) {
    const x = Math.round(it.x), y = Math.round(it.y);
    // pedestal
    g.fillStyle = "rgba(10,30,10,0.35)";
    g.beginPath();
    g.ellipse(x, y + 14, 18, 6, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#1a1020";
    g.fillRect(x - 16, y - 2, 32, 16);
    g.fillStyle = "#d8c8a0";
    g.fillRect(x - 15, y - 1, 30, 7);
    g.fillStyle = "#a89070";
    g.fillRect(x - 15, y + 6, 30, 7);
    if (it.id === "gacha") {
      // capsule machine
      g.fillStyle = "#1a1020";
      g.fillRect(x - 12, y - 34, 24, 34);
      g.fillStyle = "#ff5a7a";
      g.fillRect(x - 11, y - 14, 22, 13);
      g.fillStyle = "#cfefff";
      g.fillRect(x - 10, y - 33, 20, 18);
      const cols = ["#ffd84a", "#5fb4ff", "#c27bff", "#5dff7a", "#ff7cc8"];
      for (let i = 0; i < 6; i++) {
        g.fillStyle = cols[i % 5];
        g.fillRect(x - 8 + (i % 3) * 6, y - 22 - Math.floor(i / 3) * 6 + Math.round(Math.sin(this.t * 3 + i) * 1), 4, 4);
      }
      g.fillStyle = "#ffffff";
      g.fillRect(x - 9, y - 32, 3, 6);
      g.fillStyle = "#1a1020";
      g.fillRect(x - 3, y - 11, 6, 6);
      g.fillStyle = "#ffd84a";
      g.fillRect(x - 2, y - 10, 4, 4);
    } else {
      const ic = this.icon(it.id === "heal" ? "heal" : it.id === "maxshield" ? "shield" : "cube");
      g.drawImage(ic, x - 9, y - 22 + Math.round(Math.sin(this.t * 3) * 2));
    }
    const near = me && Math.abs(me.x - x) < 26 && Math.abs(me.y - (y + 16)) < 26;
    this.text(g, `${it.name}`, x, y + 24, near ? "#ffe14a" : "#ffffff", 11);
    this.text(g, `◎${it.price}`, x, y + 37, "#ffd84a", 11);
    if (near) this.text(g, input.touch ? "按攻击购买" : "按 J 购买", x, y - 46 + Math.sin(this.t * 5) * 2, "#5dff7a", 11);
  }
  /** boss shovel: a light pillar in its colour and the shovel bobbing above a glow */
  drawShovelDrop(g, si, t) {
    const x = si.x, y = si.y, bob = Math.sin(t * 4) * 3;
    g.save();
    const gr = g.createLinearGradient(0, y - 120, 0, y);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(1, si.col);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.55 + 0.2 * Math.sin(t * 6);
    g.fillStyle = gr;
    g.fillRect(x - 12, y - 140, 24, 140);
    g.fillRect(x - 5, y - 160, 10, 160);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 0.5;
    g.fillStyle = si.col;
    g.beginPath();
    g.ellipse(x, y, 18, 6, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    const ic = shovelIcon(si.kind);
    if (ic) g.drawImage(ic, x - 16, y - 40 + bob, 32, 32);
    g.restore();
  }
  drawChest(g, c) {
    const x = Math.round(c.x), y = Math.round(c.y), b = Math.round(Math.abs(Math.sin(this.t * 4)) * -2);
    const p = (a, bb, w, h, col) => ((g.fillStyle = col), g.fillRect(x + a, y + bb + b, w, h));
    g.fillStyle = "rgba(10,30,10,0.35)";
    g.beginPath();
    g.ellipse(x, y + 8, 16, 5, 0, 0, TAU);
    g.fill();
    p(-15, -16, 30, 24, "#1a1020");
    p(-14, -15, 28, 9, "#c05a2a");
    p(-14, -15, 28, 2, "#ff9a5a");
    p(-14, -6, 28, 13, "#9a3a1a");
    p(-14, -7, 28, 3, "#ffd84a");
    p(-3, -9, 6, 7, "#ffd84a");
    p(-2, -7, 2, 3, "#1a1020");
    p(-14, -15, 3, 22, "#ffd84a");
    p(11, -15, 3, 22, "#ffd84a");
  }

  // ---------------------------------------------------------- bullets & lines
  drawBullets(game, cx, cy) {
    const P = this.fx.painter("front");
    for (const b of game.bullets) {
      const x = b.x - 0, y = b.y - (b.z || 0);
      if (b.side === "e") {
        const r = b.r + (b.big ? 1 : 0);
        const col = b.kind === "fire" ? 0xff8a2a : b.kind === "ghost" ? 0x9ab8ff : 0xff3a6a;
        const hex = "#" + col.toString(16).padStart(6, "0");
        P.circle(x, y, r + 1, H("#2a0a14"), 1);
        P.circle(x, y, r, H(hex), 1);
        P.circle(x - 1, y - 1, Math.max(1, r - 3), H("#ffffff"), 1);
        P.glow(x, y, r + 5, H(hex), 0.35);
        continue;
      }
      const el = ELEM[b.elem] || ELEM.water, ang = Math.atan2(b.vy, b.vx);
      const r = b.r;
      if (b.wave) {
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        for (let i = -3; i <= 3; i++) {
          const k = 1 - Math.abs(i) / 4;
          P.circle(x + nx * i * 6 - Math.cos(ang) * Math.abs(i) * 3, y + ny * i * 6 - Math.sin(ang) * Math.abs(i) * 3, 5 * k + 2, H(i === 0 ? "#ffffff" : el.color), 1);
        }
        P.glow(x, y, 30, H(el.glow), 0.5);
        continue;
      }
      if (b.arcTo) {
        // lobbed bubble with ground shadow
        P.circle(b.x, b.y + 0, 5, H("#1a3010"), 0.4);
        P.circle(x, y, 7, H("#ffffff"), 1);
        P.circle(x, y, 6, H(el.color), 1);
        P.circle(x - 2, y - 2, 2, H("#ffffff"), 1);
        P.glow(x, y, 14, H(el.glow), 0.5);
        continue;
      }
      // trail
      const tl = Math.min(14, b.t * 300);
      P.glowLine(x - Math.cos(ang) * tl, y - Math.sin(ang) * tl, x, y, r * 0.8, H(el.color), 0.45);
      switch (b.kind) {
        case "gpt":
          P.circle(x, y, r + 1, H("#2a1050"), 1);
          P.circle(x, y, r, H(el.color), 1);
          P.circle(x, y, r - 2, H("#ffffff"), 1);
          break;
        case "claude":
        case "sunbolt": {
          // bookmark: small rotated rectangle
          const cs = Math.cos(ang), sn = Math.sin(ang);
          for (let i = -4; i <= 4; i++) for (let j = -1; j <= 1; j++) P.dot(x + cs * i - sn * j, y + sn * i + cs * j, H(i > 2 ? "#ffffff" : el.color));
          break;
        }
        case "doubao":
          P.circle(x, y, r + 1, H("#ffffff"), 1);
          P.circle(x, y, r, H(el.color), 1);
          P.circle(x - 1, y - 2, 2, H("#ffffff"), 1);
          break;
        case "glm": {
          const cs = Math.cos(ang), sn = Math.sin(ang);
          for (let i = -4; i <= 4; i++) for (let j = -2; j <= 2; j++) P.dot(x + cs * i - sn * j, y + sn * i + cs * j, H(Math.abs(j) === 2 || Math.abs(i) === 4 ? "#1a1430" : i === 0 ? el.color : "#f0eaff"));
          break;
        }
        case "grok":
        case "grokb":
          P.line(x - Math.cos(ang) * 6, y - Math.sin(ang) * 6, x, y, H(el.color), 1);
          P.circle(x, y, 2, H("#ffffff"), 1);
          break;
        default:
          P.circle(x, y, r + 1, H("#0a2040"), 1);
          P.circle(x, y, r, H(el.color), 1);
          P.circle(x - 1, y - 1, Math.max(1, r - 2), H("#e8f8ff"), 1);
      }
      P.glow(x, y, r + 7, H(el.glow), 0.5);
    }
  }
  drawLines(g, game) {
    for (const l of game.lines) {
      const a = clamp(l.life / l.max);
      g.save();
      if (l.kind === "warn") {
        const ang = Math.atan2(l.y1 - l.y0, l.x1 - l.x0), len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
        g.translate(l.x0, l.y0);
        g.rotate(ang);
        g.globalAlpha = 0.25 + 0.25 * Math.sin(this.t * 30);
        g.fillStyle = l.color;
        g.fillRect(0, -l.w / 2, len, l.w);
        g.restore();
        continue;
      }
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = l.color;
      g.globalAlpha = a;
      if (l.kind === "zap") {
        const n = 7, pts = [];
        for (let i = 0; i <= n; i++) {
          const k = i / n, j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 14;
          const nx = -(l.y1 - l.y0), ny = l.x1 - l.x0, nl = Math.hypot(nx, ny) || 1;
          pts.push([l.x0 + (l.x1 - l.x0) * k + (nx / nl) * j, l.y0 + (l.y1 - l.y0) * k + (ny / nl) * j]);
        }
        for (const [w, al] of [[l.w + 4, 0.25], [l.w, 1]]) {
          g.lineWidth = w;
          g.globalAlpha = a * al;
          g.beginPath();
          pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
        }
        g.strokeStyle = "#ffffff";
        g.lineWidth = 1;
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      } else {
        for (const [w, al] of [[l.w + 6, 0.2], [l.w, 0.8], [Math.max(1, l.w / 3), 1]]) {
          g.lineWidth = w;
          g.globalAlpha = a * al;
          g.strokeStyle = w === Math.max(1, l.w / 3) ? "#ffffff" : l.color;
          g.beginPath();
          g.moveTo(l.x0, l.y0);
          g.lineTo(l.x1, l.y1);
          g.stroke();
        }
      }
      g.restore();
    }
  }
}
