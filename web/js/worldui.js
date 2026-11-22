// 梦境大陆's world map (tap the minimap): the whole continent with the fog over what you have not walked yet — the
// coastline stays faintly drawn under it, so a pier can be guessed from the shape of the shore — the region bosses
// (today's state), the 传送门, your flag, the camp and the chests you have spotted. Travel from here: 营地, 旗帜, each lit
// 传送门; 插旗 plants your flag where you stand. The game is paused while it is open.
import { T } from "./data.js";
import { el } from "./util.js";
import { btn, toast, uiRoot } from "./ui.js";
import { sfx } from "./audio.js";
import { ENEMIES } from "./data.js";
import { baseMap, fogMap, FOG, dayKey, explored, worldTeleport, placeFlag, inCombat, BIOMES } from "./world.js";

let outline = null;
function coast(m) {
  if (outline) return outline;
  outline = document.createElement("canvas");
  outline.width = m.W;
  outline.height = m.H;
  const g = outline.getContext("2d"), img = g.createImageData(m.W, m.H), wet = (i) => m.t[i] === 2;
  for (let y = 1; y < m.H - 1; y++) for (let x = 1; x < m.W - 1; x++) {
    const i = y * m.W + x;
    if (wet(i) || !(wet(i - 1) || wet(i + 1) || wet(i - m.W) || wet(i + m.W))) continue;
    img.data.set([232, 240, 255, 200], i * 4);
  }
  g.putImageData(img, 0, 0);
  return outline;
}
const GATE_SHORT = ["草原门", "冰原门", "熔炉门", "群岛门"];

export function showWorldMap(game, me, app) {
  const m = game.map, ws = game.ws;
  if (!ws || document.querySelector(".wmap-modal")) return;
  sfx("click");
  app.paused = true;
  const md = el("div", "modal wmap-modal");
  md.innerHTML = `<div class="panel wmap-p"><div class="wm-left"><canvas class="wm-cv" width="512" height="512"></canvas></div>
    <div class="wm-side"><div class="wm-head"><h2 class="outline">梦境大陆</h2><button class="btn gray small x-btn">关闭</button></div>
    <div class="wm-stats o1"></div><div class="wm-boss"></div><div class="wm-sec"><span class="o1">传送</span></div><div class="wm-tp"></div></div></div>`;
  const close = () => {
    md.remove();
    app.paused = false;
  };
  md.querySelector(".x-btn").onclick = () => (sfx("click"), close());
  md.onclick = (e) => e.target === md && close();
  // the map
  const cv = md.querySelector(".wm-cv"), g = cv.getContext("2d"), k = cv.width / m.W, today = dayKey();
  g.imageSmoothingEnabled = false;
  g.drawImage(baseMap(m), 0, 0, cv.width, cv.height);
  g.drawImage(fogMap(ws), 0, 0, cv.width, cv.height);
  g.globalAlpha = 0.55;
  g.drawImage(coast(m), 0, 0, cv.width, cv.height);
  g.globalAlpha = 1;
  const at = (o) => [Math.round((o.x / T) * k), Math.round((o.y / T) * k)];
  const seen = (o) => ws.fog[Math.floor(o.y / T / 4) * FOG + Math.floor(o.x / T / 4)];
  const mark = (o, draw) => {
    const [x, y] = at(o);
    g.save();
    g.translate(x, y);
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
  for (const c of m.chests) if (!ws.opened.has(c.id) && seen(c)) mark(c, ring(0, 3, c.gold ? "#ffd84a" : "#e0a050"));
  for (const f of m.ferries || []) for (const p of [f.a, f.b]) if (seen(p)) mark(p, (g2) => {
    g2.fillStyle = "#0c0814"; g2.fillRect(-6, -4, 12, 8);
    g2.fillStyle = "#c88a4a"; g2.fillRect(-5, -3, 10, 6);
    g2.fillStyle = "#9ef0ff"; g2.fillRect(-1, -7, 2, 5);
  });
  for (const w of m.waypoints) mark(w, (g2) => {
    const lit = ws.gates.has(w.id);
    g2.fillStyle = "#0c0814";
    g2.beginPath(); g2.moveTo(0, -10); g2.lineTo(9, 0); g2.lineTo(0, 10); g2.lineTo(-9, 0); g2.fill();
    g2.fillStyle = lit ? "#3ac0e8" : "#7a7a90";
    g2.beginPath(); g2.moveTo(0, -7); g2.lineTo(6, 0); g2.lineTo(0, 7); g2.lineTo(-6, 0); g2.fill();
    if (lit) (g2.fillStyle = "#ffffff"), g2.fillRect(-1, -4, 2, 3);
  });
  for (const B of m.bosses) mark(B, (g2) => {
    const down = ws.bossDay[B.id] === today;
    ring(0, 8, down ? "#5a4a5a" : "#e8344a")(g2);
    g2.fillStyle = down ? "#a89aa8" : "#ffffff"; // a little skull
    g2.fillRect(-4, -5, 8, 6); g2.fillRect(-3, 1, 6, 3);
    g2.fillStyle = down ? "#5a4a5a" : "#e8344a";
    g2.fillRect(-3, -3, 2, 2); g2.fillRect(1, -3, 2, 2);
  });
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
  mark(me, (g2) => {
    g2.fillStyle = "#0c0814"; g2.fillRect(-6, -6, 12, 12);
    g2.fillStyle = "#ffffff"; g2.fillRect(-4, -4, 8, 8);
    g2.fillStyle = "#ff4a6a"; g2.fillRect(-2, -2, 4, 4);
  });
  // side: progress, bosses, travel
  const opened = m.chests.filter((c) => ws.opened.has(c.id)).length;
  md.querySelector(".wm-stats").innerHTML = `<div><span>探索度</span><b>${explored(ws.fog)}%</b></div><div><span>宝箱</span><b>${opened} / ${m.chests.length}</b></div><div><span>传送门</span><b>${ws.gates.size} / ${m.waypoints.length}</b></div>`;
  md.querySelector(".wm-boss").innerHTML = m.bosses.map((B) => {
    const down = ws.bossDay[B.id] === today;
    return `<div class="wm-b${down ? " down" : ""}"><i></i><span class="o1">${ENEMIES[B.type].name}</span><small class="o1">${BIOMES[B.region].name}</small><b class="o1">${down ? "今日已击败" : "可挑战"}</b></div>`;
  }).join("");
  const tp = md.querySelector(".wm-tp");
  const go = (to, name) => {
    const err = worldTeleport(game, to, name);
    if (err) return toast(err);
    close();
  };
  // 插旗 sits on the section line; the six destinations fill an even 3×2 grid
  md.querySelector(".wm-sec").append(btn("插旗", "pink small wm-flag", () => {
    const err = placeFlag(game);
    if (err) return toast(err);
    close();
  }));
  tp.append(btn("营地", "blue small", () => go(m.spawn, "营地")));
  tp.append(btn("旗帜", ws.flag ? "blue small" : "gray small", () => (ws.flag ? go(ws.flag, "旗帜") : toast("还没有插旗"))));
  m.waypoints.forEach((w, i) => tp.append(btn(GATE_SHORT[i] || w.name, ws.gates.has(w.id) ? "blue small" : "gray small", () => (ws.gates.has(w.id) ? go(w, w.name) : toast(`先走到${w.name}点亮它`)))));
  if (inCombat(game)) md.querySelector(".wm-sec span").textContent = "传送（战斗中不可用）";
  uiRoot().appendChild(md);
}
