// 梦境航线界面：事件房的对话面板（走近访客按攻击键打开，头像 + 台词 + 选项；骰子狐是押单双的掷骰小游戏）。
// 选路不再用面板：清场后房间里会出现 2～3 扇不同颜色的传送门（见 game.js openForkPortals）。
import { el } from "./util.js";
import { uiRoot, btn } from "./ui.js";
import { EVENTS, NPCS } from "./route.js";
import { A } from "./assets.js";
import { sfx } from "./audio.js";

/** the visitor's portrait: its idle loop, scaled up, in a small framed canvas (null if the atlas is missing) */
function portrait(id) {
  const N = A.npc, m = N && N.meta.npcs[id];
  if (!m) return null;
  const s = N.meta.cell, c = el("canvas", "ev-face");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  let f = 0, live = true;
  const tick = () => {
    if (!live || !c.isConnected) return;
    g.clearRect(0, 0, s, s);
    g.drawImage(N.image, (m.seq ? m.seq[f % m.seq.length] : f % m.n) * s, m.row * s, s, s, 0, 0, s, s);
    f++;
    setTimeout(tick, 1000 / N.meta.fps);
  };
  requestAnimationFrame(tick);
  c.stop = () => (live = false);
  return c;
}

// ---------------------------------------------------------------- 骰子狐's die
// a 24px pixel die (scaled up by CSS), pips laid out on a 3x3 grid; 1 and 4 are red like a real Chinese die
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function drawDie(g, face, glow = null) {
  g.clearRect(0, 0, 24, 24);
  const r = (c, x, y, w, h) => ((g.fillStyle = c), g.fillRect(x, y, w, h));
  if (glow) r(glow, 0, 1, 24, 22), r(glow, 1, 0, 22, 24);
  r("#1a1020", 1, 2, 22, 20), r("#1a1020", 2, 1, 20, 22);
  r("#fff8ec", 2, 2, 20, 19), r("#fff8ec", 3, 21, 18, 1);
  r("#e6d6c4", 20, 3, 2, 18), r("#e6d6c4", 3, 19, 18, 3);
  r("#ffffff", 3, 3, 6, 2);
  const red = face === 1 || face === 4;
  for (const k of PIPS[face]) {
    const x = 5 + (k % 3) * 5, y = 4 + Math.floor(k / 3) * 5, big = face === 1;
    if (big) r("#c81e32", x - 1, y - 1, 5, 5), r("#ff5a6a", x - 1, y - 1, 2, 2);
    else r(red ? "#c81e32" : "#1a1020", x, y, 3, 3), r(red ? "#ff6a7a" : "#5a4a6a", x, y, 1, 1);
  }
}
/** roll to `face` in about 1.5 s: tumbling faces that slow down, three shrinking bounces, then a pop */
function rollDie(stage, face, done) {
  const cv = stage.querySelector("canvas"), g = cv.getContext("2d"), sh = stage.querySelector(".dice-shadow");
  const T = 1500, t0 = performance.now();
  let next = 0, cur = 1 + Math.floor(Math.random() * 6);
  stage.classList.remove("pop", "win", "lose");
  const tick = (now) => {
    if (!cv.isConnected) return;
    const t = Math.min(1, (now - t0) / T);
    if (t >= 1) {
      drawDie(g, face);
      cv.style.transform = "";
      sh.style.transform = "";
      stage.classList.add("pop");
      return done();
    }
    if (now - t0 >= next) {
      let f;
      do f = 1 + Math.floor(Math.random() * 6); while (f === cur);
      cur = f;
      drawDie(g, cur);
      sfx("click", 0.02);
      next += 45 + 230 * t * t;
    }
    const hop = Math.abs(Math.sin(Math.PI * 3 * t)) * Math.pow(1 - t, 1.4) * 46, spin = Math.pow(1 - t, 2) * 620;
    cv.style.transform = `translateY(${-hop}px) rotate(${spin}deg)`;
    sh.style.transform = `scale(${1 - hop / 80})`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
/** the bet share, 30%~80% in 10% steps; kept between dialogs so the player's choice sticks for the session */
let betShare = 0.5;
const BET_MIN = 0.3, BET_MAX = 0.8, snapShare = (v) => Math.min(BET_MAX, Math.max(BET_MIN, Math.round(v * 10) / 10));
/** a slider snapping to the 10% steps between 30% and 80%; onChange(share) */
function betSlider(onChange) {
  const n = Math.round((BET_MAX - BET_MIN) * 10);
  const box = el("div", "dice-bet");
  box.innerHTML = `<span class="db-l o1">押注</span><div class="db-track"><i class="db-fill"></i>${Array.from({ length: n + 1 }, (_, i) => `<u style="left:${(i / n) * 100}%"></u>`).join("")}<b class="db-knob"></b></div><span class="db-v o1"></span>`;
  const track = box.querySelector(".db-track");
  const set = (v, quiet) => {
    const s = snapShare(v), pc = ((s - BET_MIN) / (BET_MAX - BET_MIN)) * 100;
    box.querySelector(".db-fill").style.width = pc + "%";
    box.querySelector(".db-knob").style.left = pc + "%";
    if (s !== betShare && !quiet) sfx("click", 0.05);
    betShare = s;
    onChange(s);
  };
  const at = (e) => {
    const r = track.getBoundingClientRect();
    set(BET_MIN + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (BET_MAX - BET_MIN));
  };
  let drag = false;
  track.addEventListener("pointerdown", (e) => {
    if (box.classList.contains("off")) return;
    drag = true;
    track.setPointerCapture(e.pointerId);
    at(e);
  });
  track.addEventListener("pointermove", (e) => drag && at(e));
  track.addEventListener("pointerup", () => (drag = false));
  track.addEventListener("pointercancel", () => (drag = false));
  box.set = set;
  return box;
}
/** the dice game: bet odd / even with a share of the coins, watch the roll, settle; 离开 only closes (the fox stays until its rounds are used) */
function diceDialog(game, md, ev, hooks) {
  const box = md.querySelector(".ev-opts"), nv = game.npc, R = ev.dice.rounds;
  const area = el("div", "ev-dice");
  area.innerHTML = `<div class="dice-round o1"></div><div class="dice-stage"><canvas width="24" height="24"></canvas><i class="dice-shadow"></i></div><div class="dice-res outline">单 1·3·5 · 双 2·4·6</div><div class="dice-sub o1"></div>`;
  box.before(area);
  md.querySelector(".event-panel").classList.add("dice-mode");
  const stage = area.querySelector(".dice-stage"), g = stage.querySelector("canvas").getContext("2d");
  const $ = (q) => area.querySelector(q);
  drawDie(g, 1 + Math.floor(Math.random() * 6));
  let busy = false;
  const slider = betSlider((s) => (slider.querySelector(".db-v").textContent = `${Math.round(s * 100)}% · ${Math.max(1, Math.round(hooks.coins() * s))} 金币`));
  area.appendChild(slider);
  const buttons = () => {
    box.innerHTML = "";
    const left = R - (nv.rounds || 0), coins = hooks.coins();
    $(".dice-round").textContent = left <= 0 ? `${R} 轮都玩完了` : coins > 0 ? `第 ${(nv.rounds || 0) + 1} / ${R} 轮` : `还剩 ${left} 轮 · 身上没有金币可押了`;
    slider.classList.toggle("off", !(left > 0 && coins > 0));
    slider.set(betShare, true);
    if (left > 0 && coins > 0) for (const [odd, name] of [[true, "押单数"], [false, "押双数"]]) box.appendChild(btn(name, odd ? "" : "blue", () => bet(odd)));
    box.appendChild(btn("离开", "gray", () => {
      if (busy) return;
      md.remove();
      hooks.close();
    }));
  };
  const bet = (odd) => {
    if (busy) return;
    const r = hooks.roll(odd, betShare);
    if (!r) return;
    busy = true;
    box.querySelectorAll(".btn").forEach((b) => (b.disabled = true));
    slider.classList.add("off");
    $(".dice-res").textContent = "……";
    $(".dice-res").style.color = "";
    $(".dice-sub").textContent = `押了${odd ? "单" : "双"}数`;
    rollDie(stage, r.face, () => {
      stage.classList.add(r.win ? "win" : "lose");
      drawDie(g, r.face, r.win ? "#ffe14a" : "#ff5a6a");
      $(".dice-res").textContent = `${r.face} 点 · ${r.face % 2 ? "单" : "双"}数`;
      $(".dice-res").style.color = r.win ? "#ffe14a" : "#ff8a8a";
      $(".dice-sub").textContent = r.win ? `押中了！赢得 ${r.stake} 金币` : `没押中……输掉 ${r.stake} 金币`;
      hooks.settle();
      busy = false;
      buttons();
    });
  };
  buttons();
}

/** an event room's choice; onPick(k) with k = option index. A dice event (ev.dice) runs its own game via hooks */
export function showEvent(game, onPick, hooks = null) {
  const id = game.room.event, ev = EVENTS[id], npc = NPCS[id], md = el("div", "modal event-modal");
  md.innerHTML = `<div class="panel event-panel"><div class="ev-top"><div class="ev-face-box"></div><div class="ev-say"><div class="ev-head"><h2 class="outline">${ev.name}</h2><span class="ev-who o1">${npc ? npc.name : ""}</span></div><p class="o1">${ev.text}</p></div></div><div class="ev-opts"></div></div>`;
  const face = portrait(id);
  if (face) md.querySelector(".ev-face-box").appendChild(face);
  else md.querySelector(".ev-face-box").remove();
  const box = md.querySelector(".ev-opts");
  if (ev.dice && hooks) {
    diceDialog(game, md, ev, hooks);
    uiRoot().appendChild(md);
    return md;
  }
  let done = false;
  ev.options.forEach((o, k) => box.appendChild(btn(o.label, k === ev.options.length - 1 && o.label === "离开" ? "gray" : "", () => {
    if (done) return;
    done = true;
    face?.stop();
    md.remove();
    onPick(k);
  })));
  uiRoot().appendChild(md);
  return md;
}
