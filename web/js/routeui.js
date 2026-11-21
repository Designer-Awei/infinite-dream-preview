// 梦境航线界面：事件房的对话面板（走近访客按攻击键打开，头像 + 台词 + 选项；骰子狐是押单双的掷骰小游戏）。
// 选路不再用面板：清场后房间里会出现 2～3 扇不同颜色的传送门（见 game.js openForkPortals）。
import { el } from "./util.js";
import { uiRoot, btn, toast } from "./ui.js";
import { drawEgg } from "./petwh.js";
import { iconURL } from "./icons.js";
import { EVENTS, NPCS, SLOT_SYMS } from "./route.js";
import { CURSES } from "./data.js";
import { A } from "./assets.js";
import { sfx } from "./audio.js";

/** the visitor's portrait: its idle loop, scaled up, in a small framed canvas (null if the atlas is missing) */
function portrait(id) {
  const N = A.npc, m = N && N.meta.npcs[id];
  if (!m) return null;
  const s = m.file ? m.cell : N.meta.cell, c = el("canvas", "ev-face"), src = m.file ? N.sheets[m.file] : N.image, row = m.file ? 0 : m.row;
  const [fx, fy, fw] = m.face || [0, 0, s]; // a wide scene shows a square crop around the visitor in its portrait
  c.width = fw;
  c.height = fw;
  if (m.file && m.cell > 128) c.classList.add("hd"); // a 256px strip is scaled down smoothly into the small portrait box
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  let f = 0, live = true;
  const tick = () => {
    if (!live || !c.isConnected) return;
    g.clearRect(0, 0, fw, fw);
    g.drawImage(src, (m.seq ? m.seq[f % m.seq.length] : f % m.n) * s + fx, row * s + fy, fw, fw, 0, 0, fw, fw);
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

// ---------------------------------------------------------------- 老虎机
// 8×8 reel symbols in SLOT_SYMS order (cherry, seven, star, heart, skull), the same pixel art as the machine's own reels
const SLOT_PX = [
  ["....gg..", "...g.g..", "..g...g.", ".rr..rr.", "rRrr.rRr", "rrrr.rrr", ".rr...rr", "........"],
  ["yyyyyyy.", "YYYYYyy.", "....yy..", "...yy...", "..yy....", "..yy....", "..YY....", "........"],
  ["...y....", "...y....", "yyyYyyy.", ".yyYyy..", "..yyy...", ".yy.yy..", ".y...y..", "........"],
  [".rr.rr..", "rRrrrrr.", "rrrrrrr.", ".rrrrr..", "..rrr...", "...r....", "........", "........"],
  ["..www...", ".wwwww..", ".k.w.k..", ".wwwww..", "..w.w...", "..www...", "........", "........"],
];
const SLOT_COL = { g: "#3aa84a", r: "#d8283c", R: "#ff8a8a", y: "#e8b020", Y: "#fff2a8", w: "#6a5a7a", k: "#1a1020" };
/** one reel: 10×10 canvas, the symbol `s` drawn with a vertical offset (for the scroll) */
function drawReel(g, s, off = 0, s2 = null) {
  g.fillStyle = "#f4efe2";
  g.fillRect(0, 0, 10, 10);
  const put = (sym, dy) => SLOT_PX[sym].forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === "." || j + dy < 0 || j + dy > 9) return;
    g.fillStyle = SLOT_COL[ch];
    g.fillRect(i + 1, j + dy + 1, 1, 1);
  }));
  put(s, off);
  if (s2 != null) put(s2, off - 10);
}
/** the slot game: pull (pays the cost), three reels spin and stop left to right, the payout lands; 离开 only closes */
function slotDialog(game, md, ev, hooks) {
  const box = md.querySelector(".ev-opts"), nv = game.npc, S = ev.slot;
  const area = el("div", "ev-dice ev-slot");
  area.innerHTML = `<div class="dice-round o1"></div><div class="slot-reels">${"<canvas width='10' height='10'></canvas>".repeat(3)}</div><div class="dice-res outline">777 大奖 · 三连有奖</div><div class="dice-sub o1">两个相同小奖 · 骷髅有风险</div>`;
  box.before(area);
  md.querySelector(".event-panel").classList.add("dice-mode");
  const reels = [...area.querySelectorAll(".slot-reels canvas")].map((c) => c.getContext("2d")), $ = (q) => area.querySelector(q);
  reels.forEach((g, i) => drawReel(g, [0, 1, 2][i]));
  let busy = false;
  const buttons = () => {
    box.innerHTML = "";
    const left = S.spins - (nv.spins || 0), coins = hooks.coins();
    $(".dice-round").textContent = left <= 0 ? `${S.spins} 次都拉完了` : coins >= S.cost ? `第 ${(nv.spins || 0) + 1} / ${S.spins} 次 · 每次 ${S.cost} 金币` : `还剩 ${left} 次 · 金币不足 ${S.cost}`;
    if (left > 0 && coins >= S.cost) box.appendChild(btn(`拉杆 ${S.cost}`, "", pull));
    box.appendChild(btn("离开", "gray", () => {
      if (busy) return;
      md.remove();
      hooks.close();
    }));
  };
  const pull = () => {
    if (busy) return;
    const r = hooks.spin();
    if (!r) return;
    busy = true;
    box.querySelectorAll(".btn").forEach((b) => (b.disabled = true));
    $(".dice-res").textContent = "……";
    $(".dice-res").style.color = "";
    $(".dice-sub").textContent = "";
    area.classList.remove("win", "lose");
    const t0 = performance.now(), stops = [700, 1050, 1400];
    const cur = [0, 1, 2].map(() => (Math.random() * 5) | 0);
    let lastTick = 0;
    const tick = (now) => {
      if (!area.isConnected) return;
      // (a frame's timestamp can be a little older than the click that started the spin: clamp, or the reel index
      // goes negative, drawing throws and the reels freeze mid-spin)
      const t = Math.max(0, now - t0), m5 = (k) => ((k % 5) + 5) % 5;
      reels.forEach((g, i) => {
        if (t >= stops[i]) return drawReel(g, r.reels[i]);
        const ph = (t / 55 + i * 0.3) % 1, step = Math.floor(t / 55 + i * 0.3);
        drawReel(g, m5(cur[i] + step), Math.round(ph * 10), m5(cur[i] + step + 1));
      });
      if (t - lastTick > 90 && t < stops[2]) (lastTick = t), sfx("click", 0.02);
      if (t < stops[2]) return requestAnimationFrame(tick);
      const q = r.pay, good = q.kind === "jackpot" || q.kind === "win" || q.kind === "small";
      area.classList.add(good ? "win" : "lose");
      $(".dice-res").textContent = r.reels.map((i) => SLOT_SYMS[i].name).join(" · ");
      $(".dice-res").style.color = good ? "#ffe14a" : "#ff8a8a";
      $(".dice-sub").textContent = q.text;
      hooks.settleSlot();
      busy = false;
      buttons();
    };
    requestAnimationFrame(tick);
  };
  buttons();
}

// ---------------------------------------------------------------- 奇遇商人's goods
/** the merchant's shop: four goods side by side (picture, name, what it is, price), two purchases, each kind once.
 *  Paid from the account (金铲 / 晶石) through hooks.buy; 离开 only closes, so you can come back while purchases remain */
function shopDialog(game, md, ev, hooks) {
  const box = md.querySelector(".ev-opts"), shop = ev.shop, area = el("div", "ev-shop");
  md.querySelector(".event-panel").classList.add("dice-mode", "shop-mode");
  area.innerHTML = `<div class="sh-goods"></div><div class="sh-foot o1"><span class="sh-left"></span><span class="sh-wallet"></span></div>`;
  box.before(area);
  const price = (c) => (c.au ? `<img class="sh-cur" src="${iconURL("shovel_au", 2)}" alt="">金铲 ×${c.au}` : `<i class="cur gem"></i>${c.gem}`);
  const draw = () => {
    const w = hooks.wallet(), bought = hooks.bought(), left = shop.buys - bought.length, grid = area.querySelector(".sh-goods");
    area.querySelector(".sh-left").textContent = left > 0 ? `还能买 ${left} 样 · 同一样只卖一次` : "两样都买好了";
    area.querySelector(".sh-wallet").innerHTML = `<img class="sh-cur" src="${iconURL("shovel_au", 2)}" alt="">${w.au} · <i class="cur gem"></i>${w.gem}`;
    grid.innerHTML = "";
    for (const g of shop.goods) {
      const has = bought.includes(g.id), afford = g.cost.au ? w.au >= g.cost.au : w.gem >= g.cost.gem;
      const card = el("div", "sh-good" + (has ? " sold" : "") + (g.egg ? " e-" + g.egg : " e-card"));
      card.innerHTML = `<div class="sh-pic"></div><b class="o1">${g.name}</b><small class="o1">${g.sub}</small><span class="sh-price o1${afford ? "" : " poor"}">${price(g.cost)}</span>`;
      if (g.egg) {
        const c = el("canvas");
        drawEgg(c, 0, g.egg);
        card.querySelector(".sh-pic").appendChild(c);
      } else card.querySelector(".sh-pic").innerHTML = `<img src="${iconURL("cardgold", 3)}" alt="">`;
      const b = btn(has ? "已购" : "购买", has ? "gray small" : "small", () => {
        const r = hooks.buy(g);
        if (!r.ok) return r.reason && toast(r.reason);
        sfx("coin");
        draw();
      });
      b.disabled = has || left <= 0 || !afford;
      card.appendChild(b);
      grid.appendChild(card);
    }
  };
  // 离开 sits top-right in the header row, like the 地下商人 panel; no visitor name next to the title
  md.querySelector(".ev-who")?.remove();
  box.remove();
  md.querySelector(".ev-top").appendChild(btn("离开", "blue ev-leave", () => {
    md.querySelector(".ev-face")?.stop?.();
    md.remove();
    hooks.close();
  }));
  draw();
}

// ---------------------------------------------------------------- 血契商人
/** three pact cards (cost in red, gain in gold) and 签订 on each; up to `max` signed. The 诅咒契 names its curse up
 *  front. 离开 sits top-right like the merchant's. */
function pactDialog(game, md, ev, hooks) {
  const box = md.querySelector(".ev-opts"), P = ev.pact, area = el("div", "ev-pact");
  md.querySelector(".event-panel").classList.add("dice-mode", "pact-mode");
  area.innerHTML = `<div class="pc-deals"></div><div class="pc-foot o1"></div>`;
  box.before(area);
  const nv = game.npc;
  if (!nv.curseOffer) {
    const free = Object.keys(CURSES).filter((k) => !game.curses.includes(k));
    nv.curseOffer = free[(Math.random() * free.length) | 0] || null;
  }
  const draw = () => {
    const done = nv.deals || [], left = P.max - done.length, me = game.players[0];
    area.querySelector(".pc-foot").innerHTML = `${left > 0 ? `还能签 ${left} 份` : "两份契约已签"} · 当前诅咒 ${game.curses.length ? game.curses.map((c) => `<em>${CURSES[c].name}</em>`).join(" ") : "无"} · 金币 ${me.coins}`;
    const grid = area.querySelector(".pc-deals");
    grid.innerHTML = "";
    for (const d of P.deals) {
      const signed = done.includes(d.id);
      let cost = d.cost, why = "";
      if (d.id === "curse") {
        cost = nv.curseOffer ? `背上诅咒·${CURSES[nv.curseOffer].name}<small>${CURSES[nv.curseOffer].desc}</small>` : "诅咒已满";
        if (!nv.curseOffer || game.curses.length >= 5) why = "诅咒已满";
      }
      if (d.id === "blood" && me.maxHp <= 2) why = "生命上限太低";
      if (d.id === "atone" && !game.curses.length) why = "没有诅咒";
      else if (d.id === "atone" && me.coins < 40) why = "金币不足";
      const card = el("div", "pc-deal d-" + d.id + (signed ? " signed" : ""));
      card.innerHTML = `<div class="pc-pic"><img src="${iconURL(d.id === "blood" ? "vamp" : d.id === "curse" ? "curse" : "purify", 3)}" alt=""></div><b class="o1">${d.name}</b><div class="pc-cost">代价：${cost}</div><div class="pc-gain">获得：${d.gain}</div>`;
      const b = btn(signed ? "已签订" : why || "签订", signed || why ? "gray small" : "small", () => {
        const r = hooks.deal(d.id);
        if (!r) return;
        sfx("card");
        card.classList.add("stamp");
        toast(r);
        setTimeout(draw, 350);
      });
      b.disabled = signed || !!why || left <= 0;
      card.appendChild(b);
      grid.appendChild(card);
    }
  };
  md.querySelector(".ev-who")?.remove();
  box.remove();
  md.querySelector(".ev-top").appendChild(btn("离开", "blue ev-leave", () => {
    md.querySelector(".ev-face")?.stop?.();
    md.remove();
    hooks.close();
  }));
  draw();
}

// ---------------------------------------------------------------- 诅咒宝箱
/** the chest itself fills the left (the visitor's frames, crisp ×2); the right lists what may be inside until
 *  打开: the lid rattles ~0.9 s, then the fate card (icon, title, what happened). A 宝箱怪 fate closes with 迎战！ and
 *  the fight starts (game.closeEvent). 离开 before opening keeps the chest for later. */
function chestDialog(game, md, ev, hooks) {
  const box = md.querySelector(".ev-opts"), nv = game.npc, area = el("div", "ev-chest");
  md.querySelector(".event-panel").classList.add("dice-mode", "pact-mode", "chest-mode");
  area.innerHTML = `<div class="ch-stage"><canvas class="ch-box" width="96" height="96"></canvas></div><div class="ch-side"></div>`;
  box.before(area);
  box.remove();
  md.querySelector(".ev-who")?.remove();
  const cv = area.querySelector(".ch-box"), g = cv.getContext("2d"), N = A.npc, m = N?.meta.npcs.curse, side = area.querySelector(".ch-side");
  g.imageSmoothingEnabled = false;
  let f = 0, live = true, mode = nv.chest ? "done" : "idle";
  const tick = () => {
    if (!live || !cv.isConnected) return;
    g.clearRect(0, 0, 96, 96);
    if (m) g.drawImage(N.image, (m.seq ? m.seq[f % m.seq.length] : f % m.n) * 96, m.row * 96, 96, 96, 0, 0, 96, 96);
    f++;
    setTimeout(tick, mode === "shake" ? 60 : 1000 / N.meta.fps);
  };
  if (m) requestAnimationFrame(tick);
  const close = () => {
    live = false;
    md.querySelector(".ev-face")?.stop?.();
    md.remove();
    hooks.close();
  };
  const ico = (k) => (k === "dew" ? "assets/ui/dew.png" : k === "mimic" ? null : iconURL(k, 3));
  const idle = () => {
    side.innerHTML = `<div class="ch-q o1">打开后会是……</div><div class="ch-fates">${[["heart", "局内加成", "生命·伤害·金币等"], ["dew", "淬灵露", "局外宠物道具"], ["mimic", "宝箱怪", "变精英，打赢有奖"], ["curse", "诅咒", "背诅咒，可选卡"]].map(([k, n, d]) => `<div class="ch-fate f-${k}">${k === "mimic" ? `<i class="ch-mimic"></i>` : `<img src="${ico(k)}" alt="">`}<b class="o1">${n}</b><span>${d}</span></div>`).join("")}</div><div class="ch-acts"></div>`;
    side.querySelector(".ch-acts").appendChild(btn("打开", "", open));
  };
  const reveal = (r) => {
    side.innerHTML = `<div class="ch-res r-${r.fate}"><div class="ch-pic">${r.icon === "mimic" ? `<i class="ch-mimic big"></i>` : `<img src="${ico(r.icon)}" alt="">`}</div><b class="outline">${r.title}</b><p class="o1">${r.text}</p></div><div class="ch-acts"></div>`;
    side.querySelector(".ch-acts").appendChild(btn(r.fate === "mimic" ? "迎战！" : "收下", r.fate === "mimic" ? "red" : "", close));
  };
  let opening = false;
  function open() {
    if (opening) return;
    opening = true;
    const r = hooks.openChest?.();
    if (!r) return void (opening = false);
    sfx("click");
    mode = "shake";
    area.classList.add("rattle");
    side.querySelector(".ch-acts .btn").disabled = true; // keeps its place: the panel must not jump while it rattles
    setTimeout(() => {
      mode = "done";
      area.classList.remove("rattle");
      area.classList.add(r.fate === "mimic" ? "burst-red" : r.fate === "curse" ? "burst-purple" : "burst-gold");
      sfx(r.fate === "mimic" || r.fate === "curse" ? "hurt" : "ssr");
      reveal(r);
    }, 900);
  }
  md.querySelector(".ev-top").appendChild(btn("离开", "blue ev-leave", close));
  if (nv.chest) reveal(nv.chest);
  else idle();
}

/** an event room's choice; onPick(k) with k = option index. A dice event (ev.dice) runs its own game via hooks */
export function showEvent(game, onPick, hooks = null) {
  const id = game.room.event, ev = EVENTS[id], npc = NPCS[id], md = el("div", "modal event-modal");
  md.innerHTML = `<div class="panel event-panel"><div class="ev-top"><div class="ev-face-box"></div><div class="ev-say"><div class="ev-head"><h2 class="outline">${ev.name}</h2><span class="ev-who o1">${npc && npc.name !== ev.name ? npc.name : ""}</span></div><p class="o1">${ev.text}</p></div></div><div class="ev-opts"></div></div>`;
  const face = portrait(id);
  if (face) md.querySelector(".ev-face-box").appendChild(face);
  else md.querySelector(".ev-face-box").remove();
  const box = md.querySelector(".ev-opts");
  if ((ev.dice || ev.shop || ev.slot || ev.pact || ev.chest) && hooks) {
    (ev.shop ? shopDialog : ev.slot ? slotDialog : ev.pact ? pactDialog : ev.chest ? chestDialog : diceDialog)(game, md, ev, hooks);
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
