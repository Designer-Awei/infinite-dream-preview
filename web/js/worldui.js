// 梦境大陆's world map (tap the minimap): the whole continent with the fog over what you have not walked yet — the
// coastline stays faintly drawn under it, so a pier can be guessed from the shape of the shore — the region bosses
// (today's state), the 传送门, your flag, the camp and the chests you have spotted. Travel from here: 营地, 旗帜, each lit
// 传送门; 插旗 plants your flag where you stand. The game is paused while it is open.
import { T } from "./data.js";
import { el } from "./util.js";
import { btn, toast, uiRoot } from "./ui.js";
import { sfx } from "./audio.js";
import { ENEMIES } from "./data.js";
import { baseMap, fogMap, FOG, dayKey, bossRespawnIn, explored, worldTeleport, placeFlag, inCombat, BIOMES, MATS, matSrc, WORKSHOP, workshopBuy } from "./world.js";
import { drawEgg } from "./petwh.js";
import { worldAtlas } from "./worldatlas.js";
import { BUILD, BUILD_ORDER, TOWER_REGIONS, slotCount, capHours, petRate, homeTick, homeSave, harvest, build, canBuild, petLabel, qualityOf } from "./home.js";
import { petState, findPet } from "./petsave.js";
import { petPortrait, PET_STAGES } from "./petdata.js";
import { load } from "./save.js";
import { titleHTML } from "./titles.js";

// the world map: the painted atlas (worldatlas.js) under the fog, a grid for telling positions (8×8 big cells A–H × 1–8,
// each 8×8 medium cells of 4×4 tiles), pinch / wheel / +− zoom and drag to pan. Markers keep their size and show by
// zoom: the whole map has only the main points (营地, you, your flag, the region bosses you have found, lit 传送门);
// closer in come the ferries, the other 传送门, the workshop and gold chests; closest, every chest you have spotted,
// today's 采集点 and the names.
const ZOOMS = [1, 2, 4, 6], LOD1 = 1.8, LOD2 = 3.2;
// a region name's spot: the centre of its continent's land (the big isle for 幻梦群岛), worked out once
const labelSpot = new Map();
function labelAt(m, L) {
  const key = L.b;
  if (labelSpot.has(key)) return labelSpot.get(key);
  let sx = 0, sy = 0, n = 0;
  const [ix, iy, ir] = m.isles[0];
  for (let i = 0; i < m.W * m.H; i++) {
    if (!m.land[i] || m.biome[i] !== L.b) continue;
    const x = i % m.W, y = (i / m.W) | 0;
    if (L.b === 3 && Math.hypot(x - ix, y - iy) > ir + 6) continue;
    (sx += x), (sy += y), n++;
  }
  const at = n ? [sx / n + 0.5, sy / n + 0.5] : [L.x, L.y];
  labelSpot.set(key, at);
  return at;
}
const NEED = { dragon: ["龙", "#e8642a"], fox: ["狐", "#d8a018"], phoenix: ["凰", "#2a9ad8"] };
const matImgs = [0, 1, 2, 3].map((k) => Object.assign(new Image(), { src: matSrc(k) }));
const NEED_TIP = { dragon: "骑火龙击碎裂纹岩", fox: "骑灵狐穿过电门", phoenix: "骑冰凰飞过去" };
let comp = null, compKey = null;
function mapArt(m, ws) {
  const key = ws.fog.join("");
  if (comp && compKey === key) return comp;
  const { art, rim } = worldAtlas(m), A = art.width;
  comp = comp || document.createElement("canvas");
  comp.width = comp.height = A;
  const g = comp.getContext("2d"), f = document.createElement("canvas");
  g.drawImage(art, 0, 0);
  f.width = f.height = FOG;
  const fg = f.getContext("2d"), img = fg.createImageData(FOG, FOG);
  for (let i = 0; i < FOG * FOG; i++) if (!ws.fog[i]) img.data.set([16, 12, 40, 246], i * 4);
  fg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; // (a soft edge to the fog)
  g.drawImage(f, 0, 0, A, A);
  g.globalAlpha = 0.6;
  g.drawImage(rim, 0, 0);
  g.globalAlpha = 1;
  compKey = key;
  return comp;
}
export const gridName = (tx, ty) => `${"ABCDEFGH"[Math.min(7, Math.floor(tx / 32))]}${Math.min(8, Math.floor(ty / 32) + 1)} · ${(Math.floor(tx / 4) % 8) + 1}-${(Math.floor(ty / 4) % 8) + 1}`;

export function showWorldMap(game, me, app) {
  const m = game.map, ws = game.ws;
  if (!ws || document.querySelector(".wmap-modal")) return;
  sfx("click");
  app.paused = true;
  const md = el("div", "modal wmap-modal");
  md.innerHTML = `<div class="panel wmap-p"><div class="wm-left"><canvas class="wm-cv"></canvas></div>
    <div class="wm-side"><div class="wm-head"><h2 class="outline">梦境大陆</h2><button class="btn gray small x-btn">关闭</button></div>
    <div class="wm-stats o1"></div><div class="wm-mats o1"></div><div class="wm-boss"></div><div class="wm-pick o1"></div><div class="wm-tp"></div></div></div>`;
  const close = () => {
    md.remove();
    app.paused = false;
  };
  md.querySelector(".x-btn").onclick = () => (sfx("click"), close());
  md.onclick = (e) => e.target === md && close();
  const cv = md.querySelector(".wm-cv"), g = cv.getContext("2d"), today = dayKey(), art = mapArt(m, ws), AS = art.width / m.W;
  const seen = (o) => ws.fog[Math.floor(o.y / T / 4) * FOG + Math.floor(o.x / T / 4)];
  const towerR = TOWER_REGIONS[ws.home?.lv.tower || 0], towerSees = (o) => towerR.includes(m.biome[Math.floor(o.y / T) * m.W + Math.floor(o.x / T)]); // (家园 瞭望塔)
  const visited = new Set();
  for (let i = 0; i < FOG * FOG; i++) {
    const j = (i / FOG | 0) * 4 * m.W + 2 * m.W + (i % FOG) * 4 + 2;
    if (ws.fog[i] && m.land[j]) visited.add(m.biome[j]);
  }
  // the view: zoom z (1 = the whole world) round the centre (cx, cy) in tiles
  const view = { z: 1, cx: m.W / 2, cy: m.H / 2 };
  let Wc = 512, sc = 1, dpr = 1, sel = null, tapAt = null, dirty = true;
  const span = () => m.W / view.z;
  const clamp = () => {
    view.z = Math.max(1, Math.min(6, view.z));
    const h = span() / 2;
    view.cx = Math.max(h, Math.min(m.W - h, view.cx));
    view.cy = Math.max(h, Math.min(m.H - h, view.cy));
  };
  const toScr = (tx, ty) => [((tx - view.cx + span() / 2) / span()) * Wc, ((ty - view.cy + span() / 2) / span()) * Wc];
  const toTile = (X, Y) => [view.cx - span() / 2 + (X / Wc) * span(), view.cy - span() / 2 + (Y / Wc) * span()];
  const at = (o) => toScr(o.x / T, o.y / T).map(Math.round);
  const inView = ([x, y], pad = 20) => x > -pad && y > -pad && x < Wc + pad && y < Wc + pad;
  const mark = (o, draw) => {
    const p = at(o);
    if (!inView(p)) return;
    g.save();
    g.translate(p[0], p[1]);
    g.scale(sc, sc);
    draw(g);
    g.restore();
  };
  const ring = (c, r, fill) => (g2) => {
    g2.fillStyle = "#0c0814";
    g2.beginPath();
    g2.arc(0, 0, r + 2, 0, Math.PI * 2);
    g2.fill();
    g2.fillStyle = fill || c;
    g2.beginPath();
    g2.arc(0, 0, r, 0, Math.PI * 2);
    g2.fill();
  };
  const label = (text, x, y, px, col = "#ffffff", align = "center", stroke = 3) => {
    g.font = `${Math.round(px * dpr)}px Cubic, sans-serif`;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = stroke * dpr;
    g.strokeStyle = "#0c0814";
    g.strokeText(text, x, y);
    g.fillStyle = col;
    g.fillText(text, x, y);
  };
  const draw = () => {
    dirty = false;
    const sp = span(), lod = view.z >= LOD2 ? 2 : view.z >= LOD1 ? 1 : 0;
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#1e54ac";
    g.fillRect(0, 0, Wc, Wc);
    g.drawImage(art, (view.cx - sp / 2) * AS, (view.cy - sp / 2) * AS, sp * AS, sp * AS, 0, 0, Wc, Wc);
    // the grid: medium cells (4 tiles) from 2×, big cells (32 tiles) always, with A–H / 1–8 along the edges
    const line = (step, a) => {
      g.strokeStyle = `rgba(230,244,255,${a})`;
      g.lineWidth = Math.max(1, dpr * (step > 4 ? 1 : 0.6));
      g.beginPath();
      for (let t = Math.ceil((view.cx - sp / 2) / step) * step; t <= view.cx + sp / 2; t += step) {
        const x = Math.round(toScr(t, 0)[0]) + 0.5;
        g.moveTo(x, 0), g.lineTo(x, Wc);
      }
      for (let t = Math.ceil((view.cy - sp / 2) / step) * step; t <= view.cy + sp / 2; t += step) {
        const y = Math.round(toScr(0, t)[1]) + 0.5;
        g.moveTo(0, y), g.lineTo(Wc, y);
      }
      g.stroke();
    };
    if (view.z >= 2) line(4, 0.1 + Math.min(0.08, (view.z - 2) * 0.03));
    line(32, 0.34);
    for (let k = 0; k < 8; k++) {
      const x0 = Math.max(0, toScr(k * 32, 0)[0]), x1 = Math.min(Wc, toScr(k * 32 + 32, 0)[0]);
      if (x1 - x0 > 14 * dpr) label("ABCDEFGH"[k], (x0 + x1) / 2, 9 * dpr, 10, "#d8f0ff");
      const y0 = Math.max(0, toScr(0, k * 32)[1]), y1 = Math.min(Wc, toScr(0, k * 32 + 32)[1]);
      if (y1 - y0 > 14 * dpr) label(String(k + 1), 8 * dpr, (y0 + y1) / 2, 10, "#d8f0ff");
    }
    // markers, by zoom
    if (lod >= 2) for (const n of m.nodes) if (ws.nodeDay[n.id] !== today && seen(n)) mark(n, (g2) => {
      const im = matImgs[n.b];
      if (im.complete && im.naturalWidth) (g2.imageSmoothingEnabled = false), g2.drawImage(im, -8, -8, 16, 16);
    });
    for (const c of m.chests) if (!c.need && !ws.opened.has(c.id) && (seen(c) || towerSees(c)) && (lod >= 2 || (lod === 1 && c.gold))) mark(c, ring(0, 3, c.gold ? "#ffd84a" : "#e0a050"));
    // 坐骑秘境 / islets: a badge naming the mount it needs (from 2×; greyed once its chest is open)
    if (lod >= 1) for (const c of m.chests) if (c.need && (seen(c) || towerSees(c))) {
      const p = at(c), done = ws.opened.has(c.id), [ch, col] = NEED[c.need];
      if (!inView(p)) continue;
      mark(c, ring(0, 11, done ? "#5a5470" : col));
      label(ch, p[0], p[1] + dpr * 0.5, 9, done ? "#a8a0c0" : "#ffffff", "center", 2);
    }
    if (lod >= 1) for (const f of m.ferries || []) for (const p of [f.a, f.b]) if (seen(p)) mark(p, (g2) => {
      g2.fillStyle = "#0c0814"; g2.fillRect(-6, -4, 12, 8);
      g2.fillStyle = "#c88a4a"; g2.fillRect(-5, -3, 10, 6);
      g2.fillStyle = "#9ef0ff"; g2.fillRect(-1, -7, 2, 5);
    });
    if (lod >= 1) mark(m.shop, (g2) => {
      g2.fillStyle = "#0c0814"; g2.fillRect(-7, -7, 14, 12);
      for (let q = 0; q < 3; q++) (g2.fillStyle = q % 2 ? "#ffe8c0" : "#ff6a8a"), g2.fillRect(-6 + q * 4, -6, 4, 4);
      g2.fillStyle = "#9a5e2c"; g2.fillRect(-6, -2, 12, 6);
    });
    for (const w of m.waypoints) {
      const lit = ws.gates.has(w.id);
      if (!lit && (lod < 1 || !seen(w))) continue;
      mark(w, (g2) => {
        g2.fillStyle = "#0c0814";
        g2.beginPath(); g2.moveTo(0, -10); g2.lineTo(9, 0); g2.lineTo(0, 10); g2.lineTo(-9, 0); g2.fill();
        g2.fillStyle = lit ? "#3ac0e8" : "#7a7a90";
        g2.beginPath(); g2.moveTo(0, -7); g2.lineTo(6, 0); g2.lineTo(0, 7); g2.lineTo(-6, 0); g2.fill();
        if (lit) (g2.fillStyle = "#ffffff"), g2.fillRect(-1, -4, 2, 3);
      });
      if (lod >= 2) { const p = at(w); if (inView(p)) label(w.name, p[0], p[1] + 17 * sc, 10, lit ? "#9ef0ff" : "#c8c8dc"); }
    }
    for (const B of m.bosses) {
      if (!seen(B)) continue;
      const down = ws.bossDay[B.id] === today;
      mark(B, (g2) => {
        ring(0, 8, down ? "#5a4a5a" : "#e8344a")(g2);
        g2.fillStyle = down ? "#a89aa8" : "#ffffff"; // a little skull
        g2.fillRect(-4, -5, 8, 6); g2.fillRect(-3, 1, 6, 3);
        g2.fillStyle = down ? "#5a4a5a" : "#e8344a";
        g2.fillRect(-3, -3, 2, 2); g2.fillRect(1, -3, 2, 2);
      });
      if (lod >= 2) { const p = at(B); if (inView(p)) label(ENEMIES[B.type].name, p[0], p[1] + 18 * sc, 10, down ? "#a89aa8" : "#ffb0bc"); }
    }
    if (ws.flag) mark(ws.flag, (g2) => {
      g2.fillStyle = "#0c0814"; g2.fillRect(-2, -14, 4, 16); g2.fillRect(0, -15, 12, 9);
      g2.fillStyle = "#e8d8b0"; g2.fillRect(-1, -13, 2, 14);
      g2.fillStyle = "#ff6ab8"; g2.fillRect(1, -14, 10, 7);
    });
    mark(m.spawn, (g2) => {
      g2.fillStyle = "#0c0814"; g2.fillRect(-8, -4, 16, 12); g2.beginPath(); g2.moveTo(-10, -3); g2.lineTo(0, -12); g2.lineTo(10, -3); g2.fill();
      g2.fillStyle = "#7fe0ff"; g2.fillRect(-6, -3, 12, 9); g2.beginPath(); g2.moveTo(-7, -4); g2.lineTo(0, -10); g2.lineTo(7, -4); g2.fill();
      g2.fillStyle = "#1a3a5a"; g2.fillRect(-2, 1, 4, 5);
    });
    if (lod >= 2) { const p = at(m.spawn); if (inView(p)) label("营地", p[0], p[1] + 17 * sc, 10, "#9ef0ff"); }
    // region names on the whole map, centred on each continent's land (a region you have not set foot in stays 未知区域);
    // drawn over the markers so they stay readable
    if (lod < 2) for (const L of m.labels) {
      const B = BIOMES[L.b], [cx, cy] = labelAt(m, L), p = toScr(cx, cy);
      if (!inView(p, 0)) continue;
      const name = B.locked || visited.has(L.b) ? B.name : "未知区域", px = lod ? 12 : 11;
      g.font = `${Math.round(px * dpr)}px Cubic, sans-serif`;
      const hw = g.measureText(name).width / 2 + 3 * dpr, X = Math.max(hw + 16 * dpr, Math.min(Wc - hw - 2 * dpr, p[0])); // (kept clear of the row numbers and the edge)
      const Y = B.locked ? p[1] - 7 * dpr : p[1];
      label(name, X, Y, px, B.locked ? "#b8b0d0" : visited.has(L.b) ? "#fff6c0" : "#c8c0e0");
      if (B.locked) label("未开放", X, Y + 14 * dpr, 9, "#9890b8");
    }
    mark(me, (g2) => { // you: a pin standing on your spot (so the camp under it stays readable)
      g2.fillStyle = "#0c0814";
      g2.beginPath(); g2.moveTo(0, 1); g2.lineTo(-7, -11); g2.arc(0, -14, 8.5, Math.PI * 0.8, Math.PI * 2.2); g2.closePath(); g2.fill();
      g2.fillStyle = "#ff4a6a";
      g2.beginPath(); g2.moveTo(0, -2); g2.lineTo(-5, -11); g2.arc(0, -14, 6, Math.PI * 0.8, Math.PI * 2.2); g2.closePath(); g2.fill();
      g2.fillStyle = "#ffffff"; g2.beginPath(); g2.arc(0, -14, 2.6, 0, Math.PI * 2); g2.fill();
    });
    // the chosen destination (gold ring) or the spot you tapped (a small cross)
    const ringAt = (x, y, r) => {
      g.strokeStyle = "#0c0814"; g.lineWidth = 5 * dpr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = "#fff6c0"; g.lineWidth = 2.5 * dpr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    };
    if (sel) { const p = at(sel.o); if (inView(p)) ringAt(p[0], p[1], 15 * sc); }
    else if (tapAt) {
      const [x, y] = toScr(tapAt[0], tapAt[1]);
      g.fillStyle = "#0c0814"; g.fillRect(x - 6 * dpr, y - 2 * dpr, 12 * dpr, 4 * dpr); g.fillRect(x - 2 * dpr, y - 6 * dpr, 4 * dpr, 12 * dpr);
      g.fillStyle = "#fff6c0"; g.fillRect(x - 5 * dpr, y - 1 * dpr, 10 * dpr, 2 * dpr); g.fillRect(x - 1 * dpr, y - 5 * dpr, 2 * dpr, 10 * dpr);
    }
  };
  const redraw = () => {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(() => md.isConnected && draw());
  };
  // side: progress, materials, bosses
  const opened = m.chests.filter((c) => ws.opened.has(c.id)).length;
  md.querySelector(".wm-stats").innerHTML = `<div><span>探索度</span><b>${explored(ws.fog)}%</b></div><div><span>宝箱</span><b>${opened} / ${m.chests.length}</b></div><div><span>传送门</span><b>${ws.gates.size} / ${m.waypoints.length}</b></div>`;
  md.querySelector(".wm-mats").innerHTML = MATS.map((t, k) => `<span title="${t.name}"><img class="mat-ic" src="${matSrc(k)}" alt=""><b>${ws.mats[k]}</b></span>`).join(""); // (icon + count: fits any count)
  md.querySelector(".wm-boss").innerHTML = m.bosses.map((B) => {
    const down = ws.bossDay[B.id] === today;
    return `<div class="wm-b${down ? " down" : ""}"><i></i><span class="o1">${ENEMIES[B.type].name}</span><small class="o1">${BIOMES[B.region].name}</small><b class="o1">${down ? `<em>${bossRespawnIn()}</em> 刷新` : "可挑战"}</b></div>`;
  }).join("");
  const tick = setInterval(() => (md.isConnected ? md.querySelectorAll(".wm-b.down em").forEach((x) => (x.textContent = bossRespawnIn())) : clearInterval(tick)), 1000);
  // travel: tap a destination (营地, a lit 传送门, your flag) — it is ringed and named — then 传送; tapping anywhere else
  // shows that spot's grid position. 插旗 plants your flag where you stand
  const dests = [{ o: m.spawn, name: "营地" }, ...m.waypoints.filter((w) => ws.gates.has(w.id)).map((w) => ({ o: w, name: w.name })), ...(ws.flag ? [{ o: ws.flag, name: "旗帜" }] : [])];
  const pick = md.querySelector(".wm-pick");
  const here = () => gridName(me.x / T, me.y / T);
  const choose = (d, spot) => {
    sel = d;
    tapAt = d ? null : spot || null;
    if (d) pick.innerHTML = `目的地：<b>${d.name}</b>`;
    else if (spot) {
      const b = m.biome[Math.floor(spot[1]) * m.W + Math.floor(spot[0])], fogged = !ws.fog[Math.floor(spot[1] / 4) * FOG + Math.floor(spot[0] / 4)];
      pick.innerHTML = `坐标 <b>${gridName(spot[0], spot[1])}</b> · ${fogged ? "未探索" : m.land[Math.floor(spot[1]) * m.W + Math.floor(spot[0])] ? BIOMES[b].name : "海面"}`;
    } else pick.innerHTML = inCombat(game) ? "战斗中不能传送" : `你在 <b>${here()}</b> · 点营地、传送门或旗帜`;
    go.disabled = !d;
    redraw();
  };
  const tapPick = (X, Y) => {
    let best = null, bd = 30 * sc;
    for (const d of dests) {
      const [dx, dy] = at(d.o), dd = Math.hypot(dx - X, dy - Y);
      if (dd < bd) (bd = dd), (best = d);
    }
    if (!best) {
      const gate = m.waypoints.find((w) => !ws.gates.has(w.id) && seen(w) && Math.hypot(at(w)[0] - X, at(w)[1] - Y) < 24 * sc);
      if (gate) toast(`先走到${gate.name}点亮它`);
    }
    sfx("click");
    choose(best, best ? null : toTile(X, Y));
    const need = !best && view.z >= LOD1 && m.chests.find((c) => c.need && seen(c) && Math.hypot(at(c)[0] - X, at(c)[1] - Y) < 18 * sc);
    if (need) pick.innerHTML = `${ws.opened.has(need.id) ? "已开启" : "金宝箱"} · <b>${NEED_TIP[need.need]}</b>`;
  };
  // gestures: drag pans, two fingers pinch, the wheel zooms at the pointer, a still short touch is a tap
  const local = (e) => {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * Wc, ((e.clientY - r.top) / r.height) * Wc];
  };
  const zoomAt = (X, Y, z) => {
    const [tx, ty] = toTile(X, Y);
    view.z = Math.max(1, Math.min(6, z));
    view.cx = tx - (X / Wc - 0.5) * span();
    view.cy = ty - (Y / Wc - 0.5) * span();
    clamp();
    redraw();
  };
  const pts = new Map();
  let ges = null;
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, local(e));
    const P = [...pts.values()];
    if (P.length === 1) ges = { tap: true, p0: P[0], c0: [view.cx, view.cy], t0: performance.now() };
    else if (P.length === 2) {
      const mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
      ges = { tap: false, pinch: true, d0: Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1]) || 1, z0: view.z, mt: toTile(...mid) };
    }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId) || !ges) return;
    pts.set(e.pointerId, local(e));
    const P = [...pts.values()];
    if (ges.pinch && P.length >= 2) {
      const mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2], d = Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1]);
      view.z = Math.max(1, Math.min(6, (ges.z0 * d) / ges.d0));
      view.cx = ges.mt[0] - (mid[0] / Wc - 0.5) * span();
      view.cy = ges.mt[1] - (mid[1] / Wc - 0.5) * span();
      clamp();
      redraw();
    } else if (!ges.pinch) {
      const dx = P[0][0] - ges.p0[0], dy = P[0][1] - ges.p0[1];
      if (Math.hypot(dx, dy) > 8 * dpr) ges.tap = false;
      if (!ges.tap) {
        view.cx = ges.c0[0] - (dx / Wc) * span();
        view.cy = ges.c0[1] - (dy / Wc) * span();
        clamp();
        redraw();
      }
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.delete(e.pointerId);
    if (ges?.tap && !pts.size && performance.now() - ges.t0 < 500) tapPick(...p);
    if (pts.size === 1) { const q = [...pts.values()][0]; ges = { tap: false, p0: q, c0: [view.cx, view.cy] }; }
    else if (!pts.size) ges = null;
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [X, Y] = local(e);
    zoomAt(X, Y, view.z * (e.deltaY < 0 ? 1.25 : 0.8));
  }, { passive: false });
  const tp = md.querySelector(".wm-tp");
  tp.append(btn("插旗", "pink", () => {
    const err = placeFlag(game);
    if (err) return toast(err);
    close();
  }));
  const go = btn("传送", "blue", () => {
    if (!sel) return;
    const err = worldTeleport(game, sel.o, sel.name);
    if (err) return toast(err);
    close();
  });
  tp.append(go);
  uiRoot().appendChild(md);
  // the map is a square exactly as tall as the side column (its bottom lines up with 插旗 / 传送), at the screen's
  // pixel ratio (icons and text keep their size at any zoom)
  cv.style.height = cv.style.width = "0px"; // (let the side column take its own height first)
  const side = md.querySelector(".wm-side"), css = Math.round(Math.min(side.getBoundingClientRect().height, window.innerWidth * 0.5));
  cv.style.height = cv.style.width = css + "px";
  dpr = Math.min(2, window.devicePixelRatio || 1);
  Wc = cv.width = cv.height = Math.round((css - 6) * dpr) || 512;
  sc = (Wc / 512) * 1.0;
  choose(null);
  draw();
  md._view = view; // (tests)
}

// ---------------------------------------------------------------- 营地工坊: the four materials into lasting rewards
const GIVE = {
  pool: ["宠物经验池 +200", "进宠物仓库的经验池", null],
  ur: ["淬灵露 ×1", "宠物养成道具", "ur"],
  stars: ["星砂 ×10", "梦境矿场升级用", null],
  egg_ur: ["UR 宠物蛋 ×1", "孵化必出稀有或更高", "egg:ur"],
  hur: ["流彩晶 ×1", "宠物养成道具", "hur"],
  egg_hur: ["HUR 宠物蛋 ×1", "孵化必出史诗或更高", "egg:hur"],
  title: ["称号", "伤害 +5%（只能兑换一次）", "title"],
};
export function showWorkshop(game, me, app) {
  const ws = game.ws;
  if (!ws || document.querySelector(".wshop-md")) return;
  app.paused = true;
  sfx("click");
  const md = el("div", "modal stash-md wshop-md");
  const chips = () => MATS.map((t, k) => `<span class="ws-mat"><img class="mat-ic" src="${matSrc(k)}" alt="">${t.name}<b>${ws.mats[k]}</b></span>`).join("");
  const cost = (o) => o.cost.map((c, k) => (c ? `<span class="ws-c${ws.mats[k] < c ? " short" : ""}"><img class="mat-ic" src="${matSrc(k)}" alt="">${c}</span>` : "")).join("");
  const ico = (o) => {
    const k = GIVE[o.id][2];
    return k?.startsWith("egg:") ? `<canvas class="st-egg" data-k="${k.slice(4)}"></canvas>` : k === "title" ? `<span class="st-ttl">${titleHTML(o.once)}</span>` : k ? `<i class="st-ico ${k}"></i>` : `<i class="ws-ico ${o.id}"></i>`;
  };
  md.innerHTML = `<div class="panel stash-p wshop-p"><div class="ws-head"><h2 class="outline">营地工坊</h2><div class="ws-mats o1"></div><button class="btn gray small x-btn">关闭</button></div>
    <div class="st-sub o1">在大陆上采集、开宝箱、打精英与区域首领得到材料 · 兑换的奖励直接进存档</div>
    <div class="st-list">${WORKSHOP.map((o) => `<div class="st-it ws-it" data-id="${o.id}">${ico(o)}<div class="st-tx"><b class="outline">${o.id === "title" ? "" : GIVE[o.id][0]}</b><span>${GIVE[o.id][1]}</span></div><div class="ws-cost o1"></div><button class="btn small st-go"><span>兑换</span></button></div>`).join("")}</div></div>`;
  md.querySelectorAll(".st-egg").forEach((c) => drawEgg(c, 0, c.dataset.k));
  const close = () => (md.remove(), (app.paused = false));
  md.querySelector(".x-btn").onclick = () => (sfx("click"), close());
  md.onclick = (e) => e.target === md && close();
  const owned = (o) => o.once && !!load().titles?.own?.[o.once];
  const sync = () => {
    md.querySelector(".ws-mats").innerHTML = chips();
    md.querySelectorAll(".ws-it").forEach((it) => {
      const o = WORKSHOP.find((q) => q.id === it.dataset.id), b = it.querySelector("button");
      it.querySelector(".ws-cost").innerHTML = cost(o);
      b.disabled = owned(o) || o.cost.some((c, k) => ws.mats[k] < c);
      b.querySelector("span").textContent = owned(o) ? "已拥有" : "兑换";
    });
  };
  md.querySelectorAll(".ws-it").forEach((it) => (it.querySelector("button").onclick = () => {
    const o = WORKSHOP.find((q) => q.id === it.dataset.id), err = workshopBuy(game, o);
    if (err) return toast(err);
    sfx("pickup");
    toast(`兑换成功：${o.id === "title" ? "称号「大陆旅者」" : GIVE[o.id][0]}`);
    sync();
  }));
  sync();
  uiRoot().appendChild(md);
}

// ---------------------------------------------------------------- 家园: 派遣 (the board) and 建造 (the steward)
const panel = (app, cls, title, chips) => {
  app.paused = true;
  sfx("click");
  const md = el("div", `modal stash-md ${cls}`);
  md.innerHTML = `<div class="panel stash-p wshop-p"><div class="ws-head"><h2 class="outline">${title}</h2><div class="ws-mats o1">${chips || ""}</div><button class="btn gray small x-btn">关闭</button></div><div class="st-sub o1"></div><div class="st-list"></div><div class="hm-foot"></div></div>`;
  const close = () => (md.remove(), (app.paused = false));
  md.querySelector(".x-btn").onclick = () => (sfx("click"), close());
  md.onclick = (e) => e.target === md && close();
  uiRoot().appendChild(md);
  return { md, close, list: md.querySelector(".st-list"), sub: md.querySelector(".st-sub"), foot: md.querySelector(".hm-foot"), chips: md.querySelector(".ws-mats") };
};
const matChips = (ws, short) => MATS.map((t, k) => `<span class="ws-mat"><img class="mat-ic" src="${matSrc(k)}" alt="">${short ? "" : t.name}<b>${ws.mats[k]}</b></span>`).join("");
export function showDispatch(game, me, app) {
  const ws = game.ws, H = ws.home;
  if (!ws || document.querySelector(".hm-disp")) return;
  const P = panel(app, "hm-disp", "派遣", matChips(ws));
  const render = () => {
    homeTick(H);
    const st = petState(), n = slotCount(H), cap = capHours(H);
    let total = 0;
    for (const sl of H.slots) total += petRate(findPet(sl.uid, st), H);
    P.chips.innerHTML = matChips(ws);
    P.sub.innerHTML = `派遣的宠物住进家园牧场，按小时采集所选材料（离线也算）· 合计 <b>${total.toFixed(1)}</b> 个/小时 · 最多存 <b>${cap}</b> 小时`;
    const rows = [];
    for (let k = 0; k < 5; k++) {
      const sl = H.slots[k];
      if (k >= n) { rows.push(`<div class="st-it hm-row lock"><i class="hm-pic"></i><div class="st-tx"><b class="outline">未解锁</b><span>宠物牧场 Lv.${k} 解锁这个栏位</span></div></div>`); continue; }
      if (!sl) { rows.push(`<div class="st-it hm-row" data-k="${k}"><i class="hm-pic empty"></i><div class="st-tx"><b class="outline">空栏位</b><span>挑一只宠物住进牧场</span></div><button class="btn blue small st-go hm-add"><span>派遣</span></button></div>`); continue; }
      const p = findPet(sl.uid, st), q = qualityOf(p), rate = petRate(p, H), stored = Math.floor(sl.acc || 0), full = sl.acc >= rate * cap - 0.01;
      rows.push(`<div class="st-it hm-row" data-k="${k}"><img class="hm-pic" src="${petPortrait(p.id, p.stage)}" alt=""><div class="st-tx"><b class="outline" style="color:${q.col}">${petLabel(p)}</b><span>${q.name} · ${PET_STAGES[p.stage - 1]} · ${rate.toFixed(1)} 个/小时</span></div>
        <div class="hm-mat">${MATS.map((t, j) => `<button class="hm-m${sl.mat === j ? " on" : ""}" data-j="${j}" title="${t.name}"><img class="mat-ic" src="${matSrc(j)}" alt=""></button>`).join("")}</div>
        <div class="hm-acc o1${full ? " full" : ""}"><img class="mat-ic" src="${matSrc(sl.mat)}" alt="">${stored}${full ? "<small>已满</small>" : ""}</div><button class="btn gray small st-go hm-back"><span>召回</span></button></div>`);
    }
    P.list.innerHTML = rows.join("");
    const ready = H.slots.reduce((a, sl) => a + Math.floor(sl.acc || 0), 0);
    P.foot.innerHTML = "";
    const go = btn(ready ? `全部收获 ${ready}` : "全部收获", "", () => {
      const got = harvest(H, ws.mats);
      if (!got.some((v) => v)) return toast("还没有可收获的材料");
      got.forEach((v, j) => v && (ws.loot[MATS[j].name] = (ws.loot[MATS[j].name] || 0) + v));
      toast(`收获：${got.map((v, j) => (v ? `${MATS[j].name} +${v}` : "")).filter(Boolean).join("　")}`);
      sfx("pickup");
      render();
    });
    go.disabled = !ready;
    P.foot.append(go);
    P.list.querySelectorAll(".hm-row[data-k]").forEach((row) => {
      const k = +row.dataset.k, sl = H.slots[k];
      row.querySelector(".hm-add")?.addEventListener("click", (e) => (e.stopPropagation(), pick(k)));
      row.querySelector(".hm-back")?.addEventListener("click", (e) => {
        e.stopPropagation();
        sfx("click");
        const n2 = Math.floor(sl.acc || 0);
        if (n2) (ws.mats[sl.mat] += n2), toast(`${MATS[sl.mat].name} +${n2}`);
        H.slots.splice(k, 1);
        homeSave(H);
        render();
      });
      row.querySelectorAll(".hm-m").forEach((b) => b.addEventListener("click", (e) => {
        e.stopPropagation();
        sfx("click");
        const n2 = Math.floor(sl.acc || 0); // (switching banks what it gathered so far)
        if (n2) ws.mats[sl.mat] += n2;
        sl.acc = 0;
        sl.mat = +b.dataset.j;
        homeSave(H);
        render();
      }));
    });
  };
  // the picker: pets from the warehouse that are not 出战 and not already posted
  const pick = (k) => {
    sfx("click");
    const st = petState(), taken = new Set(H.slots.map((s) => s.uid)), list = st.list.filter((p) => p.uid !== st.equipped && !taken.has(p.uid)).sort((a, b) => petRate(b, H) - petRate(a, H));
    const ov = el("div", "hm-pick");
    ov.innerHTML = `<div class="hm-pick-p"><div class="ws-head"><b class="outline">选择派遣的宠物</b><button class="btn gray small x-btn">返回</button></div><div class="hm-grid">${list.length ? list.map((p) => `<button class="hm-card" data-u="${p.uid}" style="--q:${qualityOf(p).col}"><img src="${petPortrait(p.id, p.stage)}" alt=""><b class="o1">${petLabel(p)}</b><small class="o1">${qualityOf(p).name} · ${petRate(p, H).toFixed(1)}/时</small></button>`).join("") : `<div class="hm-none o1">没有可派遣的宠物（出战中的宠物不能派遣）</div>`}</div></div>`;
    ov.querySelector(".x-btn").onclick = (e) => (e.stopPropagation(), sfx("click"), ov.remove());
    ov.querySelectorAll(".hm-card").forEach((c) => (c.onclick = (e) => {
      e.stopPropagation();
      sfx("pickup");
      H.slots.splice(k, 0, { uid: c.dataset.u, mat: [0, 1, 2, 3].sort((a, b) => ws.mats[a] - ws.mats[b])[0], acc: 0, t: Date.now() }); // (starts on the material you hold least of)
      homeSave(H);
      ov.remove();
      render();
    }));
    P.md.querySelector(".panel").appendChild(ov);
  };
  render();
}
const BUILD_ICON = { farm: "assets/home/board.png", hut: "assets/home/hut.png", store: "assets/home/store.png", spring: "assets/home/spring.png", tower: "assets/home/tower.png" };
export function showBuild(game, me, app) {
  const ws = game.ws, H = ws.home;
  if (!ws || document.querySelector(".hm-build")) return;
  const P = panel(app, "hm-build", "家园建造", matChips(ws, true));
  const render = () => {
    P.chips.innerHTML = matChips(ws, true) + `<span class="ws-mat"><i class="cur gem"></i><b>${load().tokens || 0}</b></span>`; // (icons only: five chips fit the header)
    P.sub.textContent = "用材料和晶石建造、升级家园建筑 · 效果长期有效，不随大陆重置";
    P.list.innerHTML = BUILD_ORDER.map((id) => {
      const B = BUILD[id], lv = H.lv[id], max = lv >= B.max, c = B.cost[lv + 1], err = canBuild(H, id, ws.mats);
      const cost = max ? "" : c.slice(0, 4).map((v, k) => (v ? `<span class="ws-c${ws.mats[k] < v ? " short" : ""}"><img class="mat-ic" src="${matSrc(k)}" alt="">${v}</span>` : "")).join("") + (c[4] ? `<span class="ws-c${(load().tokens || 0) < c[4] ? " short" : ""}"><i class="cur gem"></i>${c[4]}</span>` : "");
      return `<div class="st-it hm-row" data-id="${id}"><img class="hm-pic bld" src="${BUILD_ICON[id]}" alt=""><div class="st-tx"><b class="outline">${B.name} <em>Lv.${lv}/${B.max}</em></b><span>${max ? B.fx(lv) : `${lv ? B.fx(lv) + " → " : ""}${B.fx(lv + 1)}`}</span></div><div class="ws-cost o1">${cost}</div><button class="btn small st-go"${err ? " disabled" : ""}><span>${max ? "已满级" : lv ? "升级" : "建造"}</span></button></div>`;
    }).join("");
    P.list.querySelectorAll(".hm-row").forEach((row) => row.querySelector("button").addEventListener("click", (e) => {
      e.stopPropagation();
      const id = row.dataset.id, err = build(H, id, ws.mats);
      if (err) return toast(err);
      sfx("pickup");
      toast(`${BUILD[id].name} 升到 Lv.${H.lv[id]}`);
      game.vfx("ui/confetti", (game.map.home.plots[id] || game.map.home.board).x, (game.map.home.plots[id] || game.map.home.board).y - 30);
      import("./world.js").then((W) => W.worldSaveNow(game));
      render();
    }));
  };
  render();
}
