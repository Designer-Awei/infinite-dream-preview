// 梦境大陆's world map (tap the minimap): the whole continent with the fog over what you have not walked yet — the
// coastline stays faintly drawn under it, so a pier can be guessed from the shape of the shore — the region bosses
// (today's state), the 传送门, your flag, the camp and the chests you have spotted. Travel from here: 营地, 旗帜, each lit
// 传送门; 插旗 plants your flag where you stand. The game is paused while it is open.
import { T } from "./data.js";
import { el } from "./util.js";
import { btn, toast, uiRoot } from "./ui.js";
import { sfx } from "./audio.js";
import { ENEMIES } from "./data.js";
import { baseMap, fogMap, FOG, dayKey, explored, worldTeleport, placeFlag, inCombat, BIOMES, MATS, WORKSHOP, workshopBuy } from "./world.js";
import { drawEgg } from "./petwh.js";
import { load } from "./save.js";
import { titleHTML } from "./titles.js";

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

export function showWorldMap(game, me, app) {
  const m = game.map, ws = game.ws;
  if (!ws || document.querySelector(".wmap-modal")) return;
  sfx("click");
  app.paused = true;
  const md = el("div", "modal wmap-modal");
  md.innerHTML = `<div class="panel wmap-p"><div class="wm-left"><canvas class="wm-cv" width="512" height="512"></canvas></div>
    <div class="wm-side"><div class="wm-head"><h2 class="outline">梦境大陆</h2><button class="btn gray small x-btn">关闭</button></div>
    <div class="wm-stats o1"></div><div class="wm-mats o1"></div><div class="wm-boss"></div><div class="wm-pick o1"></div><div class="wm-tp"></div></div></div>`;
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
  md.querySelector(".wm-mats").innerHTML = MATS.map((t, k) => `<span><i style="background:${t.col}"></i>${t.name} <b>${ws.mats[k]}</b></span>`).join("");
  md.querySelector(".wm-boss").innerHTML = m.bosses.map((B) => {
    const down = ws.bossDay[B.id] === today;
    return `<div class="wm-b${down ? " down" : ""}"><i></i><span class="o1">${ENEMIES[B.type].name}</span><small class="o1">${BIOMES[B.region].name}</small><b class="o1">${down ? "今日已击败" : "可挑战"}</b></div>`;
  }).join("");
  // travel: tap a destination on the map (营地, a lit 传送门, your flag) — it is ringed and named — then 传送;
  // 插旗 plants your flag where you stand
  const dests = [{ o: m.spawn, name: "营地" }, ...m.waypoints.filter((w) => ws.gates.has(w.id)).map((w) => ({ o: w, name: w.name })), ...(ws.flag ? [{ o: ws.flag, name: "旗帜" }] : [])];
  const snap = g.getImageData(0, 0, cv.width, cv.height), pick = md.querySelector(".wm-pick");
  let sel = null;
  const choose = (d) => {
    sel = d;
    g.putImageData(snap, 0, 0);
    if (d) {
      const [x, y] = at(d.o);
      g.strokeStyle = "#0c0814"; g.lineWidth = 5; g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = "#fff6c0"; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.stroke();
    }
    pick.innerHTML = d ? `目的地：<b>${d.name}</b>` : inCombat(game) ? "战斗中不能传送" : "点地图上的营地、已点亮的传送门或旗帜";
    go.disabled = !d;
  };
  cv.onclick = (e) => {
    const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * cv.width, y = ((e.clientY - r.top) / r.height) * cv.height;
    let best = null, bd = 30; // (a finger-sized pick radius, in map pixels)
    for (const d of dests) {
      const [dx, dy] = at(d.o), dd = Math.hypot(dx - x, dy - y);
      if (dd < bd) (bd = dd), (best = d);
    }
    if (!best) {
      const gate = m.waypoints.find((w) => !ws.gates.has(w.id) && Math.hypot(at(w)[0] - x, at(w)[1] - y) < 30);
      if (gate) toast(`先走到${gate.name}点亮它`);
    }
    sfx("click");
    choose(best);
  };
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
  choose(null);
  uiRoot().appendChild(md);
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
  const chips = () => MATS.map((t, k) => `<span class="ws-mat"><i style="background:${t.col}"></i>${t.name}<b>${ws.mats[k]}</b></span>`).join("");
  const cost = (o) => o.cost.map((c, k) => (c ? `<span class="ws-c${ws.mats[k] < c ? " short" : ""}"><i style="background:${MATS[k].col}"></i>${c}</span>` : "")).join("");
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
