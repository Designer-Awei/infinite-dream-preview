// Lobby (Brawl Stars-style home: hero on a stage in the middle, info on the left, play button bottom-right)
// and the capsule gacha with a staged pull sequence (crank → capsule → open → card flips → summary).
import { CHARS, CHAR_ORDER, ELEM, UNLOCKS, GACHA, RARITY, REACTIONS, MAPS, MAP_ORDER, LOADOUT_SLOTS, CORE_FX, CORE_DETAIL } from "./data.js";
import { STASH_ITEM, redeemExchangeCard } from "./save.js";
import { characterProgress } from "./save.js";
import { claimable } from "./minequests.js";
import { load, save, unlockProgress, pull, checkUnlocks, ssrDone, gachaDone, loadoutOf, setLoadout, exportSave, parseSave, importSave, mineState } from "./save.js";
import { sfx, setSound, setMusic, playMusic } from "./audio.js";
import { el } from "./util.js";
import { iconURL, skillIcon } from "./icons.js";
import { mountItemDemo, hasLiveDemo } from "./itemdemo.js";
import { localVersion, nativeInfo } from "./updater.js";
import { bushSprite, crateSprite, generateRoom, renderGround, wallSprite, wallMask, WALL, BUSH, CRATE, BARREL, LIFT } from "./map.js";
import { T } from "./data.js";
import { btn, toast, clear, showNet, showHelp, showUnlock, uiRoot } from "./ui.js";
import { app, playMode, mapUnlocked, endlessUnlocked } from "./main.js";
import { showPets } from "./petui.js";
import { drawEgg } from "./petwh.js";
import { petPortrait } from "./petdata.js";
import { petState } from './petsave.js';
import { petPreview, setPetPreview } from './petpreview.js';
import { EGGS, PET_ITEMS, eggCount } from './petdata.js';
import { stashExchange, readySlots } from './petsave.js';

const q = (s, r) => r.querySelector(s);
let entered = false; // full entrance animation only the first time per session

// ------------------------------------------------------------------ the island the hero stands on (pixel art)
function islandCanvas(elemColor) {
  const W = 220, H = 92, c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const cx = W / 2, top = 26, rx = 92, ry = 26, depth = 22;
  // dirt front face
  for (let y = 0; y < depth; y++) {
    const k = y / depth;
    g.fillStyle = y < 3 ? "#7a4f2c" : k < 0.5 ? "#a8713e" : "#8a5a30";
    const w = Math.sqrt(1 - Math.min(1, (0.05 * y) ** 2)) * rx * (1 - k * 0.12);
    g.fillRect(Math.round(cx - w), top + ry - 2 + y, Math.round(w * 2), 1);
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = i % 3 ? "#6a4224" : "#c08a50";
    g.fillRect(Math.round(cx - 80 + Math.random() * 160), Math.round(top + ry + 2 + Math.random() * (depth - 6)), 3, 2);
  }
  // grass top: checker ellipse
  for (let y = -ry; y <= ry; y++) {
    const w = Math.floor(Math.sqrt(1 - (y / ry) ** 2) * rx);
    for (let x = -w; x <= w; x++) {
      const ch = ((Math.floor((x + 200) / 12) + Math.floor((y + 200) / 7)) & 1) === 0;
      g.fillStyle = ch ? "#78c850" : "#6fbf48";
      g.fillRect(cx + x, top + y, 1, 1);
    }
    g.fillStyle = "#2a1a14";
    g.fillRect(cx - w - 1, top + y, 1, 1);
    g.fillRect(cx + w + 1, top + y, 1, 1);
  }
  g.fillStyle = "#9ae070";
  for (let x = -rx + 6; x < rx - 6; x += 1) {
    const yy = Math.round(-Math.sqrt(1 - (x / rx) ** 2) * ry);
    g.fillRect(cx + x, top + yy + 1, 1, 1);
  }
  // glowing summon circle in the element color
  g.strokeStyle = elemColor;
  g.globalAlpha = 0.8;
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(cx, top + 2, 46, 13, 0, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.ellipse(cx, top + 2, 38, 10, 0, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  // tufts & flowers
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.55 + Math.random() * 0.4;
    const x = Math.round(cx + Math.cos(a) * rx * r), y = Math.round(top + Math.sin(a) * ry * r);
    g.fillStyle = i % 4 === 0 ? ["#ffffff", "#ffe066", "#ff8ac0"][i % 3] : "#4f9a34";
    g.fillRect(x, y, 1, 2);
    if (i % 4 === 0) g.fillRect(x - 1, y + 1, 3, 1);
  }
  // props: bushes and a crate on the rim
  g.drawImage(bushSprite(0, 1), 8, top - 30);
  g.drawImage(bushSprite(0, 3), 26, top - 22);
  g.drawImage(bushSprite(0, 2), W - 48, top - 28);
  g.drawImage(crateSprite("crate"), W - 70, top - 16);
  return c;
}

// ------------------------------------------------------------------ lobby
export function showLobby() {
  clear();
  document.body.classList.remove("ingame");
  playMusic("lobby");
  const root = uiRoot();
  const m = load();
  if (!m.chars.includes(m.sel)) m.sel = m.chars[0];
  const s = el("div", "screen lobby lb" + (entered ? " quick" : ""));
  entered = true;
  const pulls = Math.floor(m.tokens / GACHA.cost1);
  s.innerHTML = `<div class="sparkles"></div><div class="lb-glow"></div>
  <div class="topbar">
    <div class="logo outline">无限梦境<span>INFINITE DREAM</span></div>
    <div class="spacer"></div>
    <button class="pill o1 name-pill" title="点击改名"><span>👤</span><span class="pname"></span></button>
    <button class="pill o1 curpill" data-cur="gem"><i class="cur gem"></i><span class="tok">${m.tokens}</span></button>
    <button class="btn small tb-ico codex-btn t-codex" title="怪物图鉴"><span>👾</span></button>
    <button class="btn small tb-ico help-btn t-help" title="玩法说明"><span>📖</span></button>
    <button class="btn gray small fs-btn" title="全屏">⛶</button>
    <button class="btn gray small set-btn" title="设置">⚙</button>
  </div>
  <div class="lb-left"><div class="lb-info"></div><div class="lb-roster"></div></div>
  <div class="lb-center"><div class="lb-rays"></div><div class="lb-motes">${Array.from({ length: 14 }, (_, i) => `<i style="left:${8 + ((i * 37) % 84)}%;animation-delay:${(i * 0.53) % 4}s;animation-duration:${3 + (i % 4) * 0.7}s"></i>`).join("")}</div><div class="lb-island"></div><div class="lb-hero"><img alt=""></div><div class="lb-name outline"></div></div>
  <div class="lb-right">
    <div class="lb-tiles"></div>
    <div class="lb-goal slim o1"></div>
    <div class="lb-modes"><div class="lm-track"></div><div class="lm-dots"></div></div>
    <div class="lb-play"></div>
  </div>`;
  root.appendChild(s);
  q(".pname", s).textContent = m.name;
  q(".name-pill", s).onclick = () => (sfx("click"), showRename(s));
  q(".set-btn", s).onclick = () => (sfx("click"), showSettings());
  // the partner entry (宠物仓库): the carried pet (with its 异色), else the most grown one; an egg when there are only eggs
  const pets=petState(),pet=pets.list.find((p)=>p.uid===pets.equipped)||pets.list[0];
  const eggs=eggCount(pets)+pets.slots.filter(Boolean).length,eggKind=['hur','ur','base'].find((k)=>pets.eggs[k]>0)||'base';
  if(pet||eggs){
    const entry=el('button','lb-pet pet-entry','<span class="lb-pet-preview"></span>');
    entry.title='宠物仓库';entry.setAttribute('aria-label','宠物仓库');q('.lb-right',s).appendChild(entry);
    if(pet)setPetPreview(petPreview(entry.querySelector('span'),pet.id,pet.stage,'lobby',true,false,true),{skin:pet.skin});
    else{const c=document.createElement('canvas');c.className='lb-pet-egg';drawEgg(c,0,eggKind);entry.querySelector('span').appendChild(c);}
    entry.onclick=()=>{sfx('click');showPets(()=>showLobby());};
  }
  wireCurrency(s);
  const fs = q(".fs-btn", s);
  if (window.Capacitor || !document.documentElement.requestFullscreen) fs.remove();
  else fs.onclick = async () => {
    sfx("click");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        try {
          await screen.orientation.lock("landscape");
        } catch {}
      }
    } catch {
      toast("当前浏览器不支持全屏，可添加到主屏幕或安装 APK");
    }
  };
  // side tiles (Brawl Stars keeps shop / brawlers / social as square tiles)
  const tiles = q(".lb-tiles", s);
  const tile = (icon, label, cls, fn, badge, sub = "") => {
    const t = el("button", "lb-tile " + cls, `<span class="ti">${icon}</span><span class="tt"><span class="tl outline">${label}</span>${sub ? `<small class="o1">${sub}</small>` : ""}</span>${badge ? `<i class="badge o1">${badge}</i>` : ""}`);
    t.onclick = () => (sfx("click"), fn());
    tiles.appendChild(t);
  };
  tile("🎰", "扭蛋机", "t-gacha", () => showGacha(), pulls > 0 && !gachaDone() ? Math.min(99, pulls) : "", "抽天赋卡");
  const msh = mineState(), shovels = msh.shovels.cu + msh.shovels.ag + msh.shovels.au + (msh.freePend || 0);
  tile('<img src="assets/ui/mine-pick.png" alt="">', "梦境矿场", "t-mine", () => import("./mineui.js").then((M) => M.showMineHub()), shovels || "", "搜 · 打 · 撤");
  if (claimable()) q(".t-mine", s).insertAdjacentHTML("beforeend", `<i class="rdot" title="有可领取的每日委托"></i>`);
  tile("👥", "联机模式", "t-net", () => showNet());
  q(".help-btn", s).onclick = () => (sfx("click"), showHelp());
  q(".codex-btn", s).onclick = () => (sfx("click"), import("./codex.js").then((C) => C.showCodex()));
  const play = q(".lb-play", s);
  const pb = btn(`<span class="pt">开始冒险</span>`, "big play-btn", () => {
    // launch: the hero leaps off the island while two doors slide shut, then the run starts behind them
    s.classList.add("launch");
    app.closeDoors().then(() => app.startSolo());
  });
  play.appendChild(pb);
  play.appendChild(el("div", "lb-stats o1", `击败 ${m.stats.kills} · 反应 ${m.stats.reactions} · 通关 ${m.stats.bossKills} · 最远 ${m.stats.best}/7`));
  // next goal (like Brawl Stars' trophy road progress): one slim line
  const next = CHAR_ORDER.find((id) => !m.chars.includes(id));
  const goal = q(".lb-goal", s);
  if (next) {
    const u = UNLOCKS[next], pr = unlockProgress(next);
    goal.innerHTML = `<img src="assets/portrait_${next}.png" alt=""><div class="g-tx"><b>下一个目标：解锁 ${CHARS[next].short}</b><div class="g-bar"><i style="width:${Math.round(pr * 100)}%"></i></div></div><small>${Math.min(m.stats[u.stat] || 0, u.need)}/${u.need}</small>`;
    goal.title = u.text;
  } else goal.innerHTML = `<div class="g-tx"><b>全部角色已解锁 🎉</b></div><small>通关 ${m.stats.bossKills} 次</small>`;
  // the notice bar: eggs to hatch come first; otherwise it rotates the goal above with short tips, each a shortcut
  {
    const ps = petState(), ready = readySlots(ps), stock = eggCount(ps), free = ps.slots.some((x) => !x);
    const msg = ready ? `${ready} 颗蛋可以孵化了` : stock && free ? `${stock} 颗宠物蛋待孵化` : "";
    if (msg) {
      const egg = document.createElement("canvas");
      const readyKind = ps.slots.find((x) => x && x.t0 + x.dur <= Date.now())?.kind;
      drawEgg(egg, ready ? 1 : 0, readyKind || ["hur", "ur", "base"].find((k) => ps.eggs[k] > 0) || "base");
      goal.innerHTML = `<div class="g-tx"><b>${msg}</b></div><small class="g-go">去仓库 ▶</small>`;
      goal.prepend(egg);
      goal.classList.add("egg-note");
      goal.title = "宠物仓库";
      goal.onclick = () => (sfx("click"), showPets(() => showLobby()));
    } else {
      const first = goal.innerHTML, firstTitle = goal.title;
      const slides = [{ html: first, title: firstTitle }, ...TIPS.map((t) => ({ tip: t }))];
      let k = 0;
      const show = () => {
        const sl = slides[k];
        goal.classList.toggle("tip-note", !!sl.tip);
        goal.innerHTML = sl.tip ? `<i class="g-tag o1">小知识</i><div class="g-tx"><b>${sl.tip[0]}</b></div><small class="g-go"><span class="g-gl">${sl.tip[1]} </span>▶</small>` : sl.html;
        goal.title = sl.tip ? sl.tip[1] : sl.title;
        goal.onclick = sl.tip ? () => (sfx("click"), sl.tip[2]()) : null;
        goal.classList.remove("g-in");
        void goal.offsetWidth;
        goal.classList.add("g-in");
      };
      // the goal first, then one random tip after another, every 6 s while the lobby is up
      const order = TIPS.map((_, n) => n + 1).sort(() => Math.random() - 0.5);
      let n = 0;
      const tick = setInterval(() => {
        if (!goal.isConnected) return clearInterval(tick);
        k = k === 0 ? order[n++ % order.length] : 0;
        show();
      }, 6000);
    }
  }
  renderModes(s);
  renderRoster(s);
  renderHero(s, m.sel, false);
  setTimeout(() => s.isConnected && heroSummon(s, s.classList.contains("quick")), s.classList.contains("quick") ? 0 : 300);
  // tap the hero: one of three drawn reaction clips, picked at random but never the same twice in a row
  q(".lb-hero", s).onclick = () => heroReact(s);
  const fresh = m.chars.filter((c) => !["deepseek", "gpt"].includes(c) && !m.seenUnlock.includes(c));
  if (fresh.length) setTimeout(() => showUnlock(fresh[0]), 900);
}

// ------------------------------------------------------------------ lobby hero: summon entrance + tap reactions
let lastReact = -1;
// lobby hero animation sheets (PixelLab): 256 px cells, one row per clip, 8 frames each
const LB_CLIPS = ["idle", "wave", "joy", "cast"], LB_FPS = { idle: 6, wave: 10, joy: 10, cast: 10 };
// PixelLab's idle loops keep the eyes shut for half the clip: play only the open-eyed frames back and forth
// (breathing / hair sway) and blink with one shut frame every few seconds. id: [open frames in order, blink frame]
const IDLE_EYES = { deepseek: [[0, 1, 2], 3], grok: [[7, 0, 1, 2], 3], claude: [[7, 0, 1, 2], 3], gpt: [[7, 0, 1, 2], 3], doubao: [[7, 0, 1], 2], glm: [[7, 0, 1, 2], 3] };
function idleSeq(id) {
  const e = IDLE_EYES[id];
  if (!e) return [0, 1, 2, 3, 4, 5, 6, 7];
  const [o, b] = e, back = o.slice(1, -1).reverse(), cyc = [...o, ...back];
  return [...cyc, ...cyc, ...cyc, ...o, b, o[o.length - 1], ...back];
}
const lbSheets = {};
function lbSheet(id) {
  if (!lbSheets[id]) {
    lbSheets[id] = new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = `assets/lobby/${id}.png`;
    });
  }
  return lbSheets[id];
}
/** the hero on the island plays her idle loop; a reaction clip plays once, then back to idle. Every 6~11 s one
 *  reaction clip also plays by itself, without sound (an idle carousel) */
const nextAuto = (now) => now + 6000 + Math.random() * 5000;
function heroAnim(s, id) {
  const h = q(".lb-hero", s);
  let cv = q("canvas.lb-anim", h);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.className = "lb-anim";
    cv.width = cv.height = 256;
    h.appendChild(cv);
  }
  const g = cv.getContext("2d");
  const st = (h.__anim = { id, clip: "idle", t0: performance.now(), sheet: null, seq: idleSeq(id), last: "", next: nextAuto(performance.now()) });
  h.classList.remove("anim");
  lbSheet(id).then((sheet) => {
    if (h.__anim !== st || !sheet) return;
    st.sheet = sheet;
    h.classList.add("anim");
    const frame = (now) => {
      if (h.__anim !== st || !cv.isConnected) return;
      const fps = LB_FPS[st.clip], k = Math.floor(((now - st.t0) / 1000) * fps);
      if (st.clip !== "idle" && k >= 8) (st.clip = "idle"), (st.t0 = now), (st.next = nextAuto(now));
      else if (st.clip === "idle" && now >= st.next && !document.hidden && !h.dataset.busy) heroReact(s, false);
      const f = st.clip === "idle" ? st.seq[k % st.seq.length] : Math.min(7, k), row = LB_CLIPS.indexOf(st.clip), key = row * 8 + f;
      requestAnimationFrame(frame);
      if (key === st.last) return; // the canvas only changes 6-10 times a second
      st.last = key;
      g.clearRect(0, 0, 256, 256);
      g.imageSmoothingEnabled = false;
      g.drawImage(sheet, f * 256, row * 256, 256, 256, 0, 0, 256, 256);
    };
    requestAnimationFrame(frame);
  });
}
/** restart a CSS animation class on the hero container (summon / swap); data-busy marks it as playing */
function playAnim(n, cls, ms) {
  n.classList.remove("summon", "summonq", "swap");
  void n.offsetWidth;
  n.classList.add(cls);
  n.dataset.busy = "1";
  clearTimeout(n.__t);
  n.__t = setTimeout(() => (n.classList.remove(cls), delete n.dataset.busy), ms);
}
/** element-coloured bits flying out from (x%, y%) of the stage */
function burst(stage, n, cls, x = 50, y = 55, spread = 1) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = (60 + Math.random() * 70) * spread;
    const p = el("i", "lbp " + cls);
    p.style.left = x + "%";
    p.style.top = y + "%";
    p.style.setProperty("--dx", Math.cos(a) * d + "px");
    p.style.setProperty("--dy", Math.sin(a) * d * 0.7 - 20 + "px");
    p.style.animationDelay = Math.random() * 0.12 + "s";
    stage.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
}
function fx(stage, cls, ms, html = "") {
  const n = el("div", cls, html);
  stage.appendChild(n);
  setTimeout(() => n.remove(), ms);
  return n;
}
/** the hero appears: magic circle on the island, a light pillar, she forms inside it from the feet up */
function heroSummon(s, quick) {
  const stage = q(".lb-center", s), h = q(".lb-hero", s);
  fx(stage, "lb-pillar" + (quick ? " q" : ""), 1300);
  setTimeout(() => burst(stage, quick ? 10 : 16, "mote", 50, 62, 0.8), quick ? 160 : 420);
  h.classList.add("ready"); // past the pre-entrance hide
  playAnim(h, "summon" + (quick ? "q" : ""), quick ? 700 : 1300);
}
function heroReact(s, loud = true) {
  const h = q(".lb-hero", s), stage = q(".lb-center", s), st = h.__anim;
  if (!st || !st.sheet || st.clip !== "idle") return;
  const m = load(), id = m.sel;
  let k;
  do k = Math.floor(Math.random() * 3);
  while (k === lastReact);
  lastReact = k;
  st.clip = ["wave", "joy", "cast"][k];
  st.t0 = performance.now();
  if (st.clip === "cast") {
    setTimeout(() => stage.isConnected && (fx(stage, "lb-wave", 800), burst(stage, 14, "spark", 50, 50, 1.1), loud && sfx("skill")), 300);
  } else if (loud) sfx(st.clip === "wave" ? "card" : "pickup");
}

function renderRoster(s) {
  const m = load(), r = q(".lb-roster", s);
  r.innerHTML = "";
  CHAR_ORDER.forEach((id, i) => {
    const c = CHARS[id], open = m.chars.includes(id);
    const d = el("div", "rcard" + (m.sel === id ? " sel" : "") + (open ? "" : " locked"));
    d.style.background = `linear-gradient(180deg, ${c.color}, #2a2470)`;
    d.style.animationDelay = 0.55 + i * 0.06 + "s";
    d.innerHTML = `<img src="assets/portrait_${id}.png" alt=""><img class="el-ico" src="${iconURL("elem_" + c.elem, 2)}" alt="${ELEM[c.elem].name}">`;
    d.title = c.short; // the name is shown big in the middle of the lobby
    if (!open) {
      const u = UNLOCKS[id], pr = unlockProgress(id);
      d.insertAdjacentHTML("beforeend", `<div class="lock o1"><div class="ic">🔒</div><div class="bar"><i style="width:${Math.round(pr * 100)}%"></i></div></div>`);
      d.title = u.text;
    }
    d.onclick = () => {
      sfx("click");
      if (open && m.sel !== id) {
        m.sel = id;
        save();
      }
      r.querySelectorAll(".rcard").forEach((n, k) => n.classList.toggle("sel", CHAR_ORDER[k] === id && open));
      renderHero(s, id, true);
    };
    r.appendChild(d);
  });
  // characters in the works: placeholder cards after the last girl (the roster scrolls sideways to them)
  for (const name of SOON_CHARS) {
    const d = el("div", "rcard soon", `<div class="rq outline">?</div><div class="nm o1">${name}</div>`);
    d.title = name + " · 筹备中";
    d.onclick = () => (sfx("click"), toast(`${name} · 新角色筹备中，敬请期待`));
    r.appendChild(d);
  }
}
const SOON_CHARS = ["双子星", "九千问"];

function bar(label, v, max, col) {
  const pct = Math.max(6, Math.min(100, (v / max) * 100));
  return `<div class="sb"><span class="sl">${label}</span><div class="st"><i style="width:${pct}%;background:${col}"></i></div><span class="sv">${typeof v === "number" ? Math.round(v) : v}</span></div>`;
}
function renderHero(s, id, swap) {
  const m = load(), c = CHARS[id], open = m.chars.includes(id), e = ELEM[c.elem];
  s.style.setProperty("--ec", e.color);
  s.style.setProperty("--eg", e.glow);
  const hero = q(".lb-hero", s), img = q("img", hero);
  const apply = () => {
    // retry once with a cache-buster if the image fails (e.g. the file host was swapped by a hot update)
    img.onerror = () => {
      if (img.dataset.retry === id) return;
      img.dataset.retry = id;
      setTimeout(() => (img.src = `assets/hero_${id}.png?r=${Date.now()}`), 250);
    };
    img.src = `assets/hero_${id}.png`;
    hero.classList.toggle("dark", !open);
    heroAnim(s, id);
    const isl = q(".lb-island", s);
    isl.innerHTML = "";
    isl.appendChild(islandCanvas(e.color));
    q(".lb-name", s).innerHTML = `<span class="${(load().cores || {})[id] ? "core-name" : ""}">${c.short}</span><small>${c.title}</small>`;
  };
  if (swap) {
    // the current girl dissolves upward into motes and stays hidden until the new girl's art and animation
    // sheet are both loaded, so the old picture (or a half-loaded one) never shows; then she is summoned
    const stage = q(".lb-center", s), token = (hero.__swap = {});
    playAnim(hero, "swap", 4000);
    burst(stage, 10, "mote", 50, 45, 0.7);
    const art = new Promise((res) => {
      const im = new Image();
      im.onload = im.onerror = res;
      im.src = `assets/hero_${id}.png`;
    });
    const ready = Promise.all([art, lbSheet(id), new Promise((r) => setTimeout(r, 180))]);
    Promise.race([ready, new Promise((r) => setTimeout(r, 2500))]).then(() => {
      if (hero.__swap !== token || !hero.isConnected) return;
      apply();
      heroSummon(s, true);
    });
    sfx("card");
  } else apply();
  const xp = characterProgress(id);
  const dps = c.atk.dmg * c.atk.rate, core = !!(load().cores || {})[id];
  const info = q(".lb-info", s);
  info.classList.remove("refresh");
  void info.offsetWidth;
  info.classList.add("refresh");
  info.innerHTML = `
    <div class="li-head"><div class="li-nrow"><div class="li-name outline${core ? " core-name" : ""}"${core ? ` title="梦核：${CORE_FX[id]}"` : ""}>${c.name}</div><span class="li-level o1">Lv.${xp.level}${xp.maxed ? '<i class="level-star" aria-label="满级" title="满级"></i>' : ""}</span><button class="li-kit" title="天赋装配">${loadoutOf(id).map((t) => `<i class="ks${t ? " on" : ""}">${t ? `<img src="${iconURL(t, 1)}" alt="">` : "+"}</i>`).join("")}<span class="o1">天赋</span></button></div><div class="li-title o1"><span>「${c.title}」</span><div class="li-xp" role="progressbar" aria-label="角色经验" aria-valuemin="0" aria-valuemax="${xp.maxed ? 1 : xp.need}" aria-valuenow="${xp.maxed ? 1 : xp.current}" title="${xp.maxed ? "已满级" : `${xp.current} / ${xp.need}`}" ><i style="width:${xp.fraction * 100}%"></i><span class="li-xp-text o1" aria-hidden="true">${xp.maxed ? "已满级" : `${xp.current}/${xp.need}`}</span></div></div>
      <div class="li-chips o1"><span class="chip el-chip" style="background:${e.color}"><img src="${iconURL("elem_" + c.elem, 1)}" alt="">${e.name}元素</span><span class="chip role">${c.role}</span><button class="li-more">详情</button></div></div>
    <div class="li-bars o1">
      ${bar("生命", c.hp, 7, "linear-gradient(90deg,#ff8a9a,#ff3a5a)")}
      ${bar("护盾", c.shield, 6, "linear-gradient(90deg,#e0ecff,#8aa8ff)")}
      ${bar("移速", c.speed, 125, "linear-gradient(90deg,#b0ffd0,#3ad07a)")}
      ${bar("火力", dps, 16, "linear-gradient(90deg,#ffe36a,#ff9a2e)")}
    </div>
    <div class="li-skills o1">
      ${[["J", c.atk.name, c.passive], ["K", c.skill.name, c.skill.desc + `（冷却${c.skill.cd}秒）`], ["L", c.ult.name, c.ult.desc]]
        .map(([k, n, d]) => `<div class="sk"><div class="sk-ic"><img src="${iconURL(skillIcon(id, k === "J" ? "atk" : k === "K" ? "skill" : "ult"), 2)}" alt=""><i>${k}</i></div><div class="sk-tx"><b>${n}</b><span title="${d}">${d}</span></div></div>`)
        .join("")}
    </div>
    `;
  q(".li-more", info).onclick = () => (sfx("click"), showCharDetail(id));
  info.querySelector(".li-skills").onclick = () => (sfx("click"), showCharDetail(id));
  q(".li-kit", info).onclick = () => (sfx("click"), showLoadout(id, () => renderHero(s, id, false)));
  updatePlay(s, id);
}

// ------------------------------------------------------------------ character detail (everything that doesn't fit the card)
export function showCharDetail(id) {
  const m = load(), c = CHARS[id], e = ELEM[c.elem], open = m.chars.includes(id), core = !!(m.cores || {})[id];
  const xp = characterProgress(id);
  const reacts = Object.entries(REACTIONS).filter(([k]) => k === "bubble" || k.split("+").includes(c.elem));
  const md = el("div", "modal cd-modal");
  md.innerHTML = `<div class="panel cd-panel">
    <div class="kit-head"><img class="kit-face" src="assets/head_${id}.png" alt=""><div class="cd-identity"><div class="cd-nrow"><h2 class="outline${core ? " core-name" : ""}">${c.name}</h2><div class="char-xp-detail o1">Lv.${xp.level} · ${xp.maxed ? '已满级 <i class="level-star" aria-label="满级"></i>' : `经验 ${xp.current} / ${xp.need}`}</div></div><div class="kit-sub o1">${c.title} · ${e.name}元素 · ${c.role}</div></div><button class="btn gray small x-btn">关闭</button></div>
    <div class="cd-body">
      <div class="cd-sec">${[["普攻 J", "atk", c.atk.name, c.passive], ["小技能 K", "skill", c.skill.name, c.skill.desc + `（冷却 ${c.skill.cd} 秒）`], ["大招 L", "ult", c.ult.name, c.ult.desc]]
        .map(([k, slot, n, d]) => `<div class="cd-sk"><img src="${iconURL(skillIcon(id, slot), 2)}" alt=""><div><b class="o1">${n} <small>${k}</small></b><p>${d}</p></div></div>`).join("")}
        <div class="cd-h o1" style="margin-top:2px">设定</div><p class="cd-lore">${c.lore}</p>
        ${open || !UNLOCKS[id] ? "" : `<div class="cd-h o1" style="margin-top:2px">解锁条件</div><p class="cd-lore">${UNLOCKS[id].text}（进度 ${Math.round(unlockProgress(id) * 100)}%）</p>`}</div>
      <div class="cd-sec"><div class="cd-h o1">元素反应（${e.name}元素参与）</div><div class="cd-res">${reacts
        .map(([k, r]) => `<div class="cd-re"><span class="chip">${k === "bubble" ? (c.elem === "bubble" ? "泡 + 任意元素" : "泡 + " + e.name) : k.split("+").map((x) => ELEM[x].name).join(" + ")}</span><b>${r.name}</b><span>${r.desc}</span></div>`).join("")}</div>
        <div class="cd-h o1">梦核${core ? ` <span class="core-name">已激活</span>` : "（未获得）"}</div><p class="cd-lore">${CORE_FX[id]}：${CORE_DETAIL[id]}${core ? "" : "可在梦境工坊用星砂兑换，获得后名字变为流彩。"}</p></div>
    </div></div>`;
  uiRoot().appendChild(md);
  q(".x-btn", md).onclick = () => md.remove();
  md.addEventListener("click", (e) => e.target === md && md.remove());
  md.onclick = (ev) => ev.target === md && md.remove();
}

// ------------------------------------------------------------------ talent loadout (one page per character)
export function showLoadout(cid, onClose) {
  if (uiRoot().querySelector(".kit-modal")) return;
  const c = CHARS[cid], m = load();
  const md = el("div", "modal kit-modal");
  let page = loadoutOf(cid), sel = page.indexOf(null) >= 0 ? page.indexOf(null) : 0;
  const ssr = GACHA.pool.filter((it) => it.eq);
  const passive = GACHA.pool.filter((it) => !it.eq && !it.card && m.talents[it.id]);
  // built once; taps only update the slots and the card states in place (no re-render, no flicker)
  md.innerHTML = `<div class="panel kit-panel">
    <div class="kit-head"><img class="kit-face" src="assets/head_${cid}.png" alt=""><div><h2 class="outline">天赋装配 · ${c.short}</h2><div class="kit-sub o1">PVE 与 PVP 都生效${(load().cores || {})[cid] ? " · 梦核：" + CORE_FX[cid] : ""}</div></div><button class="btn gray small x-btn">完成</button></div>
    <div class="kit-body">
      <div class="kit-l">
        <div class="kit-slots">${page.map((_, i) => `<button class="kslot" data-i="${i}"><span class="kn o1">槽位 ${i + 1}</span><span class="ks-in"></span></button>`).join("")}</div>
        <div class="kit-pass o1"><div class="kp-h">通用天赋（N/R/SR · 自动生效）</div>${passive.length ? `<div class="kp-grid">${passive.map((it) => `<span class="kp-it"><img src="${iconURL(it.id, 1)}" alt=""><b>${it.name}</b><em>Lv${m.talents[it.id]}</em></span>`).join("")}</div>` : `<span class="muted">还没有——去扭蛋机抽吧</span>`}</div>
      </div>
      <div class="kit-list">${ssr.map((it) => {
        const lv = m.talents[it.id] || 0;
        return `<button class="kcard${lv ? "" : " no"}" data-id="${it.id}"><img src="${iconURL(it.id, 2)}" alt=""><span class="kt"><b>${it.name}${it.max > 1 && lv ? ` Lv${lv}` : ""}</b><small>${it.desc}</small></span><i class="ktag o1"></i></button>`;
      }).join("")}</div>
    </div></div>`;
  const slots = [...md.querySelectorAll(".kslot")], cards = [...md.querySelectorAll(".kcard")];
  const refresh = () => {
    slots.forEach((b, i) => {
      const t = page[i], it = t && GACHA.pool.find((p) => p.id === t);
      b.classList.toggle("sel", i === sel);
      b.classList.toggle("full", !!it);
      const inner = it
        ? `<img src="${iconURL(it.id, 3)}" alt=""><b>${it.name}</b>${it.max > 1 ? `<small>Lv${m.talents[it.id]}</small>` : ""}<em class="kx">卸下</em>`
        : `<span class="kplus">+</span><small>点右侧天赋装上</small>`;
      const box = q(".ks-in", b);
      if (box.dataset.k !== (t || "")) (box.innerHTML = inner), (box.dataset.k = t || "");
    });
    cards.forEach((b) => {
      const id = b.dataset.id, at = page.indexOf(id), lv = m.talents[id] || 0;
      b.classList.toggle("eq", at >= 0);
      q(".ktag", b).textContent = at >= 0 ? "槽位" + (at + 1) : lv ? "装配" : "未拥有";
    });
  };
  const commit = () => setLoadout(cid, page);
  slots.forEach((b) => (b.onclick = (ev) => {
    const i = +b.dataset.i;
    if (ev.target.closest(".kx")) {
      page[i] = null;
      commit();
    }
    sel = i;
    sfx("click");
    refresh();
  }));
  cards.forEach((b) => (b.onclick = () => {
    const id = b.dataset.id, it = GACHA.pool.find((p) => p.id === id);
    if (!m.talents[id]) return toast(`${it.name}：还没有获得，去扭蛋机抽取（SSR）`);
    const at = page.indexOf(id);
    if (at >= 0) {
      page[at] = null; // tap again to take it off
      sel = at;
    } else {
      page[sel] = id;
      const free = page.indexOf(null);
      if (free >= 0) sel = free;
    }
    commit();
    sfx("card");
    refresh();
  }));
  const close = () => {
    md.remove();
    onClose && onClose();
  };
  q(".x-btn", md).onclick = close;
  md.onclick = (e) => e.target === md && close();
  refresh();
  uiRoot().appendChild(md);
}

// ------------------------------------------------------------------ mode carousel (swipe left/right on the lobby)
const MODE_IDS = [...MAP_ORDER, "endless"];
let modesAbort = null;
const modeOpen = (id) => (id === "endless" ? endlessUnlocked() : mapUnlocked(id));
let modeInit = false;
function renderModes(s) {
  const m = load();
  if (!modeInit) {
    modeInit = true;
    m.playMode = { map: "grass", endless: false };
    save();
  }
  const pm = playMode();
  const box = q(".lb-modes", s), track = q(".lm-track", box), dots = q(".lm-dots", box);
  track.innerHTML = MODE_IDS.map((id) => {
    const ok = modeOpen(id);
    if (id === "endless")
      return `<div class="mcard pv${ok ? "" : " lock"}" data-id="endless"><img class="mc-map" src="${mapPreview("endless")}" alt="" draggable="false"><span class="mc-k">无尽</span><div class="mc-info"><b class="mc-t">无尽回廊</b><span class="mc-foot">${ok ? `最佳 ${m.stats.endlessBest || 0} 层` : "🔒 完成任意一局解锁"}</span></div></div>`;
    const d = MAPS[id], clears = (m.maps || {})[id] || 0;
    return `<div class="mcard pv${ok ? "" : " lock"}" data-id="${id}"><img class="mc-map" src="${mapPreview(id)}" alt="" draggable="false"><span class="mc-k">主线 ${MAP_ORDER.indexOf(id) + 1}/${MAP_ORDER.length}</span><div class="mc-info"><b class="mc-t">${d.name}</b><span class="mc-foot">${ok ? (id==="grass" ? "入门" + (clears ? ` · 通关${clears}` : "") : `通关${clears}`) : `🔒 先通关${MAPS[d.need].name}`}</span></div></div>`;
  }).join("");
  dots.innerHTML = MODE_IDS.map(() => "<i></i>").join("");
  const cards = [...track.children];
  let cur = Math.max(0, MODE_IDS.indexOf(pm.endless ? "endless" : pm.map));
  const mark = (i) => {
    cards.forEach((c, k) => c.classList.toggle("on", k === i));
    [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
  };
  const choose = (i) => {
    if (i === cur) return;
    cur = i;
    mark(i);
    const id = MODE_IDS[i];
    // remember the mode even when it is still locked (the play button says so); no lobby re-render
    m.playMode = id === "endless" ? { map: (m.playMode && m.playMode.map) || "grass", endless: true } : { map: id, endless: false };
    save();
    sfx("card");
    updatePlay(s);
  };
  // first card lines up with the left edge of the column, the last with the right edge, others centred
  const posOf = (k) => {
    const c = cards[k], max = track.scrollWidth - track.clientWidth;
    if (k === 0) return 0;
    if (k === cards.length - 1) return max;
    return Math.max(0, Math.min(max, c.offsetLeft - track.offsetLeft - (track.clientWidth - c.offsetWidth) / 2));
  };
  const nearest = (left) => {
    let best = 0, bd = 1e9;
    cards.forEach((_, k) => {
      const d = Math.abs(posOf(k) - left);
      if (d < bd) (bd = d), (best = k);
    });
    return best;
  };
  const go = (i, smooth = true) => {
    i = Math.max(0, Math.min(MODE_IDS.length - 1, i));
    track.scrollTo({ left: posOf(i), behavior: smooth ? "smooth" : "auto" });
    choose(i);
  };
  let t = 0;
  track.addEventListener("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => !drag && choose(nearest(track.scrollLeft)), 90);
  });
  // mouse drag on desktop (touch scrolls natively)
  if (modesAbort) modesAbort.abort();
  modesAbort = new AbortController();
  const signal = modesAbort.signal;
  let drag = null, justDragged = false;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    drag = { x: e.clientX, l: track.scrollLeft, moved: false };
    track.classList.add("dragging");
  });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    track.scrollLeft = drag.l - dx;
  }, { signal });
  addEventListener("pointerup", () => {
    if (!drag) return;
    const moved = drag.moved, startL = drag.l, endL = track.scrollLeft; // read before snapping comes back on
    track.classList.remove("dragging");
    drag = null;
    if (moved) {
      justDragged = true;
      setTimeout(() => (justDragged = false), 60);
    }
    if (moved) {
      // a short flick is enough: past 40px go one card in that direction, otherwise snap to the nearest
      const dx = endL - startL;
      let best = nearest(endL);
      if (best === cur && Math.abs(dx) > 40) best = cur + Math.sign(dx);
      go(best);
    }
  }, { signal });
  cards.forEach((c, k) => (c.onclick = () => k !== cur && !justDragged && go(k)));
  dots.onclick = (e) => {
    const k = [...dots.children].indexOf(e.target);
    if (k >= 0) go(k);
  };
  mark(cur);
  requestAnimationFrame(() => go(cur, false));
}
/** a thumbnail of a real in-game arena of that map (ground, water, walls, bushes, crates); endless = the 3 maps side by side */
const previews = {};
function mapPreview(id) {
  if (previews[id]) return previews[id];
  const W = 360, H = 170, c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  const draw = (mid, dx, dw, seed) => {
    const md = MAPS[mid];
    // pick the busiest of a few arenas (most walls / bushes / water / hazard in the middle band the card shows)
    let map = null, best = -1;
    for (let k = 0; k < 10; k++) {
      const mm = generateRoom("combat", seed + k * 131, md.theme, { hazard: md.hazard });
      let n = 0;
      for (let y = Math.floor(mm.H * 0.3); y < Math.ceil(mm.H * 0.7); y++)
        for (let x = 1; x < mm.W - 1; x++) n += mm.t[y * mm.W + x] !== 0 ? 1 : mm.mud[y * mm.W + x] ? 0.6 : 0;
      if (n > best) (best = n), (map = mm);
    }
    const ground = renderGround(map);
    const full = document.createElement("canvas");
    full.width = map.pxW;
    full.height = map.pxH;
    const f = full.getContext("2d");
    f.drawImage(ground, 0, 0);
    for (let y = 0; y < map.H; y++)
      for (let x = 0; x < map.W; x++) {
        const t = map.t[y * map.W + x];
        if (t === WALL) f.drawImage(wallSprite(map.theme, wallMask(map, x, y)), x * T, y * T - LIFT);
        else if (t === BUSH) f.drawImage(bushSprite(map.theme, (x * 7 + y * 13) % 5), x * T - 4, y * T - 12);
        else if (t === CRATE || t === BARREL) f.drawImage(crateSprite(t === CRATE ? "crate" : "barrel", 0), x * T, y * T - 8);
      }
    // a window around the middle of the arena, scaled to fill the slot
    // the whole arena width (inside the outer wall), cropped to the slot's aspect around the middle
    const sw = Math.min(map.pxW - T, ((map.pxH - T) * dw) / H), sh = (sw * H) / dw;
    g.drawImage(full, (map.pxW - sw) / 2, (map.pxH - sh) / 2 - LIFT / 2, sw, sh, dx, 0, dw, H);
  };
  try {
    if (id === "endless") {
      const w3 = W / 3;
      MAP_ORDER.forEach((mid, i) => draw(mid, Math.round(i * w3), Math.ceil(w3), 777 + i * 31));
      g.fillStyle = "rgba(40,10,90,.35)";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#1a1020";
      for (let i = 1; i < 3; i++) g.fillRect(Math.round(i * w3) - 1, 0, 3, H);
    } else draw(id, 0, W, 4242 + MAP_ORDER.indexOf(id) * 97);
  } catch (e) {
    console.warn("preview", e);
  }
  return (previews[id] = c.toDataURL());
}
/** the play button reflects both the selected girl and the selected mode */
function updatePlay(s, cid) {
  const m = load(), pb = q(".play-btn", s);
  if (!pb) return;
  if (cid) s.dataset.cid = cid;
  const pm = m.playMode || {}, id = pm.endless ? "endless" : pm.map || "grass";
  const charOk = m.chars.includes(s.dataset.cid || m.sel), mOk = modeOpen(id);
  pb.disabled = !charOk || !mOk;
  q(".pt", pb).textContent = !charOk ? "未解锁" : !mOk ? "模式未解锁" : "开始冒险";
}

function showSettings() {
  const m = load();
  const md = el("div", "modal");
  // two even columns: toggles, save tools, then a full-width close; the version line sits clear below the buttons
  md.innerHTML = `<div class="panel set-p"><h2 class="outline">设置</h2><div class="set-g"></div><div class="muted set-v"></div></div>`;
  const tg = (label, key, fn) =>
    btn(`${label}：${m[key] ? "开" : "关"}`, m[key] ? "green" : "gray", (ev) => {
      m[key] = !m[key];
      fn && fn(m[key]);
      save();
      const b=ev.target.closest("button");b.innerHTML = `${label}：${m[key] ? "开" : "关"}`;b.classList.toggle("green",m[key]);b.classList.toggle("gray",!m[key]);
    });
  q(".set-g", md).append(tg("音效", "sound", setSound), tg("音乐", "music", setMusic), btn("导出存档", "blue", () => showSaveExport()), btn("导入存档", "green", () => showSaveImport()), btn("联系作者", "pink", () => showContact()));
  q(".set-v", md).textContent = `版本 ${localVersion || "dev"}${nativeInfo.version ? " · 安装包 " + nativeInfo.version : ""}${window.Capacitor ? " · 启动时自动增量更新" : ""}`;
  md.onclick = (e) => e.target === md && md.remove();
  uiRoot().appendChild(md);
}

/** rename: the first change is free, every later one costs RENAME_COST 晶石 */
export const RENAME_COST = 500, NAME_MAX = 12;
export function showRename(lobby) {
  const m = load(), free = !m.renamed;
  const md = el("div", "modal");
  md.innerHTML = `<div class="panel rn-p"><h2 class="outline">修改名称</h2>
    <input class="rn-in" maxlength="${NAME_MAX * 2}" autocomplete="off" spellcheck="false">
    <div class="rn-cost o1"></div><div class="rn-err"></div>
    <div class="row rn-acts"></div></div>`;
  const inp = q(".rn-in", md), err = q(".rn-err", md), cost = q(".rn-cost", md), acts = q(".rn-acts", md);
  inp.value = m.name;
  cost.innerHTML = free ? `首次改名<b class="rn-free">免费</b>` : `本次改名消耗 <i class="cur gem"></i>${RENAME_COST}（当前 ${m.tokens}）`;
  const check = () => {
    const v = inp.value.trim(), n = [...v].length;
    if (!n) return "名字不能为空";
    if (n > NAME_MAX) return `最多 ${NAME_MAX} 个字`;
    if (/[<>&"'`\\]/.test(v)) return "不能包含 < > & 引号 反斜杠";
    if (v === m.name) return "和现在的名字一样";
    if (!free && m.tokens < RENAME_COST) return `晶石不足：需要 ${RENAME_COST}`;
    return "";
  };
  const ok = btn("确认", "", () => {
    const e = check();
    if (e) return (err.textContent = e), sfx("click");
    if (!free) m.tokens -= RENAME_COST;
    m.name = inp.value.trim();
    m.renamed = (m.renamed || 0) + 1;
    save();
    sfx("card");
    md.remove();
    toast(free ? `已改名为「${m.name}」` : `已改名为「${m.name}」，消耗 ${RENAME_COST} 晶石`);
    if (lobby) {
      q(".pname", lobby).textContent = m.name;
      const t = q(".tok", lobby);
      if (t) t.textContent = m.tokens;
    }
  });
  const refresh = () => {
    const e = check();
    err.textContent = inp.value.trim() === m.name ? "" : e;
    ok.classList.toggle("gray", !!e);
  };
  inp.oninput = refresh;
  inp.onkeydown = (e) => e.key === "Enter" && ok.click();
  acts.append(btn("取消", "gray", () => md.remove()), ok);
  refresh();
  md.onclick = (e) => e.target === md && md.remove();
  uiRoot().appendChild(md);
  setTimeout(() => (inp.focus(), inp.select()), 50);
}

/** the author's contact details (tap a line to copy it) */
const CONTACT = [["Email", "1974379701@qq.com"], ["微信", "WZin9921"]];
function showContact() {
  const md = el("div", "modal");
  md.innerHTML = `<div class="panel ct-p"><h2 class="outline">联系作者</h2>${CONTACT.map(([k, v]) => `<button class="ct-row" data-v="${v}"><span class="o1">${k}</span><b>${v}</b><small>点击复制</small></button>`).join("")}<div class="muted ct-tip">有建议或发现 bug，欢迎联系～</div></div>`;
  md.querySelectorAll(".ct-row").forEach((b) => (b.onclick = async () => {
    const v = b.dataset.v;
    let ok = false;
    try {
      await navigator.clipboard.writeText(v);
      ok = true;
    } catch {}
    toast(ok ? `已复制：${v}` : v);
  }));
  md.onclick = (e) => e.target === md && md.remove();
  md.classList.add("bg-close");
  uiRoot().appendChild(md);
}

// ------------------------------------------------------------------ save export / import
export function showSaveExport() {
  const code = exportSave();
  const md = el("div", "modal save-modal");
  md.innerHTML = `<div class="panel save-panel"><h2 class="outline">导出存档</h2>
    <div class="muted o1">下面这段存档码包含你的全部进度（晶石、角色、天赋、装配、纪录）。复制后保存在备忘录或发给自己，重装或换设备后在「设置 → 导入存档」粘贴即可恢复。</div>
    <textarea class="save-code" readonly></textarea>
    <div class="row acts"></div></div>`;
  const ta = q(".save-code", md);
  ta.value = code;
  const copy = async () => {
    ta.focus();
    ta.select();
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      try {
        ok = document.execCommand("copy");
      } catch {}
    }
    toast(ok ? "已复制存档码" : "请长按上面的文字手动复制");
  };
  q(".acts", md).append(btn("复制存档码", "", copy));
  if (navigator.share) q(".acts", md).append(btn("分享…", "blue small", () => navigator.share({ title: "无限梦境存档", text: code }).catch(() => {})));
  q(".acts", md).append(btn("关闭", "gray small", () => md.remove()));
  md.addEventListener("click", (e) => e.target === md && md.remove());
  uiRoot().appendChild(md);
  ta.onclick = () => ta.select();
}
export function showSaveImport() {
  const md = el("div", "modal save-modal");
  md.innerHTML = `<div class="panel save-panel"><h2 class="outline">导入存档</h2>
    <div class="muted o1">粘贴以 IDSAVE1 开头的存档码。导入会<b style="color:#ff8a9a">覆盖</b>当前设备上的进度。</div>
    <textarea class="save-code" placeholder="在这里粘贴存档码"></textarea>
    <div class="save-msg o1"></div>
    <div class="row acts"></div></div>`;
  const ta = q(".save-code", md), msg = q(".save-msg", md);
  const check = () => {
    if (!ta.value.trim()) return (msg.textContent = ""), null;
    try {
      const s = parseSave(ta.value);
      msg.style.color = "#8cff9a";
      msg.textContent = `存档有效：${s.name || "玩家"} · 晶石 ${s.tokens} · 角色 ${s.chars.length} 个 · 通关 ${(s.stats && s.stats.bossKills) || 0} 次`;
      return s;
    } catch (e) {
      msg.style.color = "#ff8a9a";
      msg.textContent = e.message;
      return null;
    }
  };
  ta.oninput = check;
  q(".acts", md).append(
    btn("从剪贴板粘贴", "blue small", async () => {
      try {
        ta.value = await navigator.clipboard.readText();
        check();
      } catch {
        toast("无法读取剪贴板，请长按输入框粘贴");
      }
    }),
    btn("导入", "", () => {
      if (!check()) return toast(msg.textContent || "请先粘贴存档码");
      importSave(ta.value);
      toast("存档已导入");
      md.remove();
      setTimeout(() => location.reload(), 400);
    }),
    btn("取消", "gray small", () => md.remove()),
  );
  uiRoot().appendChild(md);
}

// ------------------------------------------------------------------ gacha
/** tap any currency pill → what it is and where it comes from (same card as in the mine) */
export function wireCurrency(root) {
  root.querySelectorAll("[data-cur]").forEach((b) => (b.onclick = () => import("./mineui.js").then((M) => M.showCurInfo(b.dataset.cur))));
}
const FEATURED = ["t_chain", "t_rag", "t_moe", "t_revive", "u_links"]; // the three new SSRs first
const shortName = (n) => n.replace(/^卡牌·/, "");
const lvText = (it, lv) => (lv ? (it.max > 1 ? `Lv${lv}/${it.max}` : "已拥有") : "未拥有");
/** vertical mini card (banner, pool preview, exchange list): rarity tag, icon, short name, one status line */
function vcard(it, o = {}) {
  return `<div class="vc ${it.r}${o.dim ? " no" : ""}${o.cls ? " " + o.cls : ""}" data-id="${it.id}"><span class="vc-r">${it.r}</span>${o.tag ? `<i class="vc-tag">${o.tag}</i>` : ""}<span class="vc-i">${ICON(it, 2)}</span><b class="vc-n${shortName(it.name).length >= 6 ? " ln" : ""}">${shortName(it.name)}</b>${o.sub ? `<small class="vc-s">${o.sub}</small>` : ""}${o.rate ? `<em class="vc-p">${o.rate}</em>` : ""}</div>`;
}
const ICON = (it, s = 3) => `<img class="pxi" src="${iconURL(it.id, s)}" alt="">`;
const CAP_COLORS = ["#ffd84a", "#5fb4ff", "#c27bff", "#5dff7a", "#ff7cc8", "#ff8a5a"];

function stashFraction(n) {
  return n<=10?n/10*.3:n<=20?.3+(n-10)/10*.25:Math.min(1,.55+(n-20)/30*.45);
}
function stashBarContent(n, animated=false) {
  return `<div class="sb-h outline">积攒</div><div class="sb-tube"><i class="sb-fill" style="height:${stashFraction(n)*100}%"></i>
    <b class="sb-t ur" style="bottom:30%"><em>10</em></b><b class="sb-t hur" style="bottom:55%"><em>20</em></b><b class="sb-t" style="bottom:100%"><em>50</em></b></div><div class="sb-n outline">${animated?`<span class="sp-old">${n}<small>/∞</small></span><span class="sp-next">${n+1}<small>/∞</small></span>`:`${n}<small>/∞</small>`}</div>`;
}
function stashPreview(n) {
  return `<div class="sc sc-stash-preview" style="--stash-before:${stashFraction(n)*100}%;--stash-after:${stashFraction(n+1)*100}%">
    <div class="sp-side"><div class="sp-caption o1">当前</div><div class="stashbar sp-before" aria-label="当前积攒点 ${n}">${stashBarContent(n)}</div></div>
    <div class="sp-count o1"><div>${n} → <b>${n+1}</b></div><small>积攒点 +1</small></div>
    <div class="sp-side"><div class="sp-caption o1">增加后</div><div class="stashbar sp-after" aria-label="积攒点 ${n} 增加至 ${n+1}">${stashBarContent(n,true)}</div></div></div>`;
}

let pullBusy = false, latestPull = () => {};
export function showGacha() {
  clear();
  playMusic("lobby");
  const root = uiRoot();
  const m = load();
  const s = el("div", "screen gacha2");
  s.innerHTML = `<div class="sparkles"></div>
  <div class="topbar"><button class="btn gray small back-btn">◀ 返回</button><div class="logo outline">扭蛋机<span>算力抽卡</span></div><div class="spacer"></div><button class="pill o1 curpill" data-cur="gem"><i class="cur gem"></i><span class="tok">${m.tokens}</span></button></div>
  <div class="gm">
    <div class="gm-dome"><div class="gm-shine"></div></div>
    <div class="gm-neck"></div>
    <div class="gm-base"><div class="gm-label outline">算力扭蛋</div><div class="gm-slot"></div><div class="gm-crank"><i></i></div><div class="gm-chute"></div></div>
  </div>
  <div class="gp">
    <div class="gp-banner"><div class="gp-head"><div class="gp-title outline">常驻扭蛋</div><button class="gp-poolbtn o1"><img src="${iconURL("pool", 2)}" alt=""><span>卡池预览</span></button></div><div class="gp-feat"></div><div class="gp-tip o1">点击卡片预览效果</div></div>
    <div class="gp-pity o1"></div>
    <div class="gp-btns"></div>
  </div>`;
  root.appendChild(s);
  q(".back-btn", s).onclick = () => (sfx("click"), showLobby());
  wireCurrency(s);
  // capsules inside the dome: a little physics loop (gravity, ball-ball and ball-dome collisions, air puffs from below)
  const dome = q(".gm-dome", s);
  dome.classList.add("phys");
  capsulePhysics(dome, q(".gm", s));
  // glass highlights on top of the capsules: a tapered crescent along the upper-left rim with a short dash after it,
  // a thin inner reflection and a faint rim light on the lower right (cartoon glass, no blurry blob)
  const cres = (r, a0, a1, w) => {
    const out = [], inn = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, a = ((a0 + (a1 - a0) * t) * Math.PI) / 180, h = (w / 2) * Math.sin(Math.PI * t) ** 0.6;
      out.push([50 + (r + h) * Math.cos(a), 50 + (r + h) * Math.sin(a)]);
      inn.unshift([50 + (r - h) * Math.cos(a), 50 + (r - h) * Math.sin(a)]);
    }
    return "M" + [...out, ...inn].map(([x, y]) => x.toFixed(2) + " " + y.toFixed(2)).join(" L") + " Z";
  };
  // feathered: every highlight is blurred so its edges melt into the glass (no hard cut-out shapes)
  dome.insertAdjacentHTML("beforeend", `<svg class="gm-gloss" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <filter id="glsB" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
      <filter id="glsS" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.7"/></filter>
      <radialGradient id="glsG" cx="30%" cy="26%" r="34%"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <circle cx="50" cy="50" r="49" fill="url(#glsG)"/>
    <path d="${cres(40, 190, 258, 9)}" fill="#fff" fill-opacity=".55" filter="url(#glsB)"/>
    <path d="${cres(40.5, 198, 250, 4.2)}" fill="#fff" fill-opacity=".6" filter="url(#glsS)"/>
    <path d="${cres(40.5, 262, 274, 4)}" fill="#fff" fill-opacity=".55" filter="url(#glsS)"/>
    <path d="${cres(33.5, 204, 238, 3)}" fill="#fff" fill-opacity=".28" filter="url(#glsB)"/>
    <path d="${cres(44, 14, 66, 3.2)}" fill="#fff" fill-opacity=".3" filter="url(#glsB)"/>
  </svg>`);
  // featured SSR items
  const feat = q(".gp-feat", s);
  for (const id of FEATURED) {
    const it = GACHA.pool.find((p) => p.id === id);
    const lv = m.talents[id] || 0;
    feat.insertAdjacentHTML("beforeend", vcard(it, { sub: lvText(it, lv), cls: "feat" }));
    feat.lastElementChild.onclick = () => (sfx("card"), showItemPreview(it));
  }
  q(".gp-poolbtn", s).onclick = () => (sfx("click"), showPool());
  // 兑换卡 from 梦境工坊: pick any SSR that isn't maxed
  // SSR 兑换卡: always shown (×0 when used up), next to 卡池预览
  const exc = mineState().cards || 0;
  {
    const eb = el("button", "gp-poolbtn gp-exbtn o1", `<img src="${iconURL("cardgold", 2)}" alt=""><span><i class="lbl">兑换卡 </i>×${exc}</span>`);
    eb.onclick = () => (sfx("click"), showExchange(() => showGacha()));
    q(".gp-head", s).insertBefore(eb, q(".gp-poolbtn", s));
  }
  // 积攒条: always shown; once every SSR is maxed, SSR pulls fill it (ticks at 10 / 20 / 50; past 50 only the number grows)
  {
    const n = m.stash || 0;
    const sb = el("button", "stashbar", stashBarContent(n));
    sb.onclick = () => (sfx("click"), showStash());
    s.appendChild(sb);
    s.classList.add("has-stash");
  }
  const pity = q(".gp-pity", s);
  pity.innerHTML = `<div class="pb"><span>SSR 保底</span><div class="st"><i style="width:${(m.pity / GACHA.pity) * 100}%;background:linear-gradient(90deg,#ffe36a,#ff9a2e)"></i></div><span>${m.pity}/${GACHA.pity}</span></div>
    <div class="pb"><span>SR 保底</span><div class="st"><i style="width:${Math.min(10, m.pity10) * 10}%;background:linear-gradient(90deg,#e0b0ff,#a060ff)"></i></div><span>${Math.min(10, m.pity10)}/10</span></div>
    <div class="rates">概率 <b style="color:#ffd84a">SSR 3%</b> · <b style="color:#d6a8ff">SR 14%</b> · <b style="color:#8ac8ff">R 33%</b> · N 50%<span class="rf"> ｜ 满级的重复天赋返还晶石</span></div>`;
  const b = q(".gp-btns", s);
  const b1 = btn(`<span>单抽</span><small>${GACHA.cost1}<i class="cur gem"></i></small>`, "blue pull-btn", () => doPull(1));
  const b10 = btn(`<span>十连</span><small>${GACHA.cost10}<i class="cur gem"></i> · 必出SR</small>`, "pink pull-btn", () => doPull(10));
  if (m.tokens < GACHA.cost1) b1.classList.add("poor");
  if (m.tokens < GACHA.cost10) b10.classList.add("poor");
  b.append(b1, b10);

  // one pull at a time: taps while a pull (crank, reveal, summary) is running are ignored, so a quick double tap
  // or a tap on 十连 right after 收下 can never draw twice; 再来十连 runs the next pull itself under the same lock
  async function doPull(n, chained = false) {
    if (pullBusy && !chained) return;
    const cost = n === 1 ? GACHA.cost1 : GACHA.cost10;
    if (m.tokens < cost) return (pullBusy = false), toast("晶石不足：去地牢里赚吧！");
    pullBusy = true;
    let again = 0;
    try {
      m.tokens -= cost;
      const res = [];
      for (let i = 0; i < n; i++) res.push(pull());
      save();
      const unl = checkUnlocks();
      again = await pullSequence(s, res);
      showGacha();
      if (unl.length) showUnlock(unl[0]);
    } finally {
      if (!again) setTimeout(() => (pullBusy = false), 250); // a beat so the tap that closed the summary can't pull
    }
    if (again) setTimeout(() => latestPull(again, true), 60);
  }
  latestPull = doPull;
}

// ------------------------------------------------------------------ pool preview + item effect preview
/** exact per-item odds of a single pull (pity aside): rarity rate split evenly inside the rarity */
export function itemRate(it) {
  const n = GACHA.pool.filter((p) => p.r === it.r).length;
  return GACHA.rates[it.r] / n;
}
const pct = (x) => (x * 100 >= 1 ? (x * 100).toFixed(1).replace(/\.0$/, "") : (x * 100).toFixed(2)) + "%";

function showPool() {
  const m = load();
  const md = el("div", "modal pool-modal");
  const groups = ["SSR", "SR", "R", "N"].map((r) => {
    const items = GACHA.pool.filter((p) => p.r === r);
    return `<div class="pl-g"><div class="pl-gh o1"><span class="pl-r ${r}">${r}</span>品质总概率 <b>${pct(GACHA.rates[r])}</b><small>· 每张 ${pct(GACHA.rates[r] / items.length)}</small></div>
      <div class="vgrid">${items.map((it) => { const lv = m.talents[it.id] || 0; return vcard(it, { dim: !lv, sub: lv ? lvText(it, lv) : it.max > 1 ? `上限 Lv${it.max}` : "未拥有", rate: pct(itemRate(it)) }); }).join("")}</div></div>`;
  }).join("");
  md.innerHTML = `<div class="panel pool-panel"><div class="pl-head"><h2 class="outline">卡池预览</h2><button class="btn gray small x-btn">×</button></div>
    <div class="pl-rule o1">单抽 ${GACHA.cost1}<i class="cur gem"></i> · 十连 ${GACHA.cost10}<i class="cur gem"></i> 必出 SR 及以上 · ${GACHA.pity} 抽内必出 SSR · 满级重复返还晶石（N ${GACHA.refund.N} / R ${GACHA.refund.R} / SR ${GACHA.refund.SR} / SSR ${GACHA.refund.SSR}）</div>
    <div class="pl-list">${groups}</div></div>`;
  uiRoot().appendChild(md);
  const close = () => md.remove();
  q(".x-btn", md).onclick = close;
  md.onclick = (e) => e.target === md && close();
  md.querySelectorAll(".vc").forEach((d) => (d.onclick = () => (sfx("card"), showItemPreview(GACHA.pool.find((p) => p.id === d.dataset.id)))));
}

/** SSR 兑换卡 (bought in 梦境工坊 with 星砂): same card grid as the pool; tap → effect preview with the 兑换 button */
export function showExchange(after) {
  const m = load(), ms = mineState();
  const stash={...STASH_ITEM,desc:"消耗1张兑换卡，获得1积攒点；可用于兑换梦境宠物。",exchangeStash:true};
  const list = [...GACHA.pool.filter((it) => it.r === "SSR"),stash];
  const md = el("div", "modal pool-modal ex-modal");
  const full = it => !it.exchangeStash && (m.talents[it.id] || 0) >= it.max;
  const fit = () => {
    if(!md.isConnected)return;
    const panel=q('.pool-panel',md),featured=document.querySelector('.gacha2 .gp-feat .vc');
    // Measure the original compact panel before increasing only its internal rows.
    md.style.removeProperty('--exchange-card-height');panel.style.height='';
    const height=getComputedStyle(panel).height;
    panel.style.height=height;
    if(featured)md.style.setProperty('--exchange-card-height',getComputedStyle(featured).height);
  };
  const draw = () => {
    const ordered=[...list].sort((a,b)=>Number(full(a))-Number(full(b)));
    md.innerHTML = `<div class="panel pool-panel"><div class="pl-head"><img class="ex-face" src="${iconURL("cardgold", 3)}" alt=""><h2 class="outline">兑换卡 ×${ms.cards}</h2><button class="btn gray small x-btn">×</button></div>
      <div class="pl-rule o1">每张兑换卡可换1级未满级SSR，或1积攒点 · 点卡片查看并兑换</div>
      <div class="pl-list"><div class="vgrid">${ordered.map((it) => { if(it.exchangeStash)return vcard(it,{sub:`持有 ${m.stash||0} 点`,tag:"+1"});const lv = m.talents[it.id] || 0, done = full(it); return vcard(it, { dim: done, tag: done ? "已满级" : "", sub: lv ? `Lv${lv}/${it.max}` : "未拥有" }); }).join("")}</div></div></div>`;
    q(".x-btn", md).onclick = close;
    md.querySelectorAll(".vc").forEach((d) => (d.onclick = () => {
      const it = list.find((p) => p.id === d.dataset.id), lv=m.talents[it.id]||0,full=!it.exchangeStash&&lv>=it.max;
      sfx("card");
      showItemPreview(it,{exchange:true,label:full?"已满级":ms.cards?`兑换${it.exchangeStash?"积攒点 +1":it.max>1?" → Lv"+(lv+1):""}（兑换卡 ×${ms.cards}）`:"没有兑换卡",off:full||!ms.cards,fn:()=>{
        const r=redeemExchangeCard(it.id);if(!r.ok){toast(r.reason);draw();return;}
        sfx("ssr");toast(`兑换成功：${r.name}${r.level&&it.max>1?" Lv"+r.level:""}`,2400);draw();
      }});
    }));
    fit();
  };
  let resize,removal;
  const cleanup=()=>{resize?.disconnect();removal?.disconnect();};
  const close = () => (cleanup(),md.remove(), after && after());
  md.addEventListener("click", (e) => e.target === md && close());
  draw();
  uiRoot().appendChild(md);
  fit();
  resize=new ResizeObserver(fit);resize.observe(uiRoot());
  const featured=document.querySelector('.gacha2 .gp-feat .vc');if(featured)resize.observe(featured);
  removal=new MutationObserver(()=>{if(!md.isConnected)cleanup();});removal.observe(uiRoot(),{childList:true});
}

/** a little looping stage that demonstrates what the item does */
function previewScene(it) {
  const m = load();
  if(it.exchangeStash)return stashPreview(m.stash||0);
  const me = CHARS[m.sel] ? m.sel : "deepseek";
  const mate = me === "gpt" ? "deepseek" : "gpt";
  const hero = (id, cls = "") => `<img class="sc-hero ${cls}" src="assets/hero_${id}.png" alt="">`;
  const ic = (name, cls = "") => `<img class="sc-ic ${cls}" src="${iconURL(name, 3)}" alt="">`;
  switch (it.id) {
    case "t_revive":
      return `<div class="sc sc-revive"><div class="sc-hp"><i></i></div>${hero(me)}<i class="sc-ring"></i><i class="sc-ring b"></i><div class="sc-pop outline">满血复活！</div><div class="sc-cap o1">倒下的瞬间 → 读取断点 → 满血站起（每局 1 次）</div></div>`;
    case "t_startcard":
      return `<div class="sc sc-deal">${["atk_up", "multishot", "crit"].map((c, i) => `<div class="sc-card" style="--i:${i}">${ic(c)}</div>`).join("")}<div class="sc-card gold" style="--i:3">${ic("cardgold")}<b class="outline">+1</b></div><div class="sc-cap o1">开局：额外多选 1 张技能卡（满级 +2）</div></div>`;
    case "u_links":
      return `<div class="sc sc-link"><div class="sc-who">${hero(me)}${ic(skillIcon(me, "skill"), "sk")}</div><div class="sc-beam"><i></i></div><div class="sc-who b">${hero(mate)}${ic(skillIcon(mate, "skill"), "sk")}</div><div class="sc-pop outline">联动！</div><div class="sc-cap o1">放小技能时，同时放出另一位角色的小技能（70% 效果）</div></div>`;
    case "u_echo":
      return `<div class="sc sc-echo">${ic(skillIcon(me, "skill"), "big")}${ic(skillIcon(me, "skill"), "big ghost")}<div class="sc-pop outline">×2</div><div class="sc-cap o1">小技能有 35% 概率自动再释放一次</div></div>`;
    case "u_second_ult":
      return `<div class="sc sc-ult"><div class="sc-meter">${ic(skillIcon(me, "ult"), "big")}<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/></svg></div><div class="sc-pop outline">+40%</div><div class="sc-cap o1">放完大招，立刻返还 40% 充能</div></div>`;
    default:
      return `<div class="sc sc-basic">${ic(it.id, "big")}<div class="sc-cap o1">${it.desc}${it.max > 1 ? `（可叠加至 Lv${it.max}）` : ""}</div></div>`;
  }
}

function showItemPreview(it, act) {
  const m = load(), lv = m.talents[it.id] || 0;
  const md = el("div", "modal pv-modal");
  md.innerHTML = `<div class="pvm ${it.r}"><div class="pvm-card rc ${it.r}" style="--c:${RCOL[it.r]}"><div class="rc-front"><div class="rr o1">${it.r}</div><div class="ri">${ICON(it, 4)}</div><div class="rn">${it.name}</div><div class="rd">${it.desc}</div><div class="rl">${it.exchangeStash ? `持有 ${m.stash||0} 点` : lv ? (it.max > 1 ? `已拥有 Lv${lv}/${it.max}` : "已拥有") : "未拥有"}</div></div></div>
    <div class="pvm-r${it.r === "SSR" ? "" : " plain"}">${it.r === "SSR" ? `<div class="pvm-h outline">效果预览</div>${!it.exchangeStash&&hasLiveDemo(it) ? `<div class="sc sc-live"></div>` : previewScene(it)}` : `<div class="pvm-h outline">${it.name}</div><div class="pvm-desc o1">${it.desc}${it.max > 1 ? `<br><small>最高 Lv${it.max}，可叠加</small>` : ""}</div>`}${act?.exchange?"":`<div class="pvm-odds o1">单抽获得概率 <b>${pct(itemRate(it))}</b>${it.r === "SSR" ? ` · ${GACHA.pity} 抽保底必出 SSR` : ""}</div>`}${act ? `<button class="btn ${act.off ? "gray" : ""} pvm-act"><span>${act.label}</span></button>` : ""}<div class="pvm-close o1">点击其他地方关闭</div></div></div>`;
  uiRoot().appendChild(md);
  // live demo: the selected girl actually using the item in a small real fight
  const live = md.querySelector(".sc-live");
  if (live) mountItemDemo(live, it, CHARS[m.sel] ? m.sel : "deepseek");
  md.onclick = (e) => {
    if (act && e.target.closest(".pvm-act")) {
      if (act.off) return sfx("click");
      md.remove();
      return act.fn();
    }
    md.remove();
  };
}

const ORDER = ["N", "R", "SR", "SSR"];
const RCOL = { N: "#b8c4d6", R: "#5fb4ff", SR: "#c27bff", SSR: "#ffc93a" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function particles(canvas) {
  const g = canvas.getContext("2d"), parts = [];
  let raf = 0, alive = true;
  const fit = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  };
  fit();
  const tick = () => {
    if (!alive) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += 1 / 60;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.grav;
      p.vx *= 0.99;
      p.rot += p.vr;
      const a = Math.max(0, 1 - p.t / p.life);
      if (a <= 0) {
        parts.splice(i, 1);
        continue;
      }
      g.save();
      g.globalAlpha = a;
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.c;
      if (p.kind === "spark") {
        g.globalCompositeOperation = "lighter";
        g.fillRect(-p.s, -p.s / 4, p.s * 2, p.s / 2);
      } else g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s / 1.5);
      g.restore();
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return {
    burst(x, y, n, cols, kind = "confetti", speed = 9) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * speed;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === "confetti" ? 4 : 0), grav: kind === "confetti" ? 0.18 : 0.02, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, s: kind === "confetti" ? 7 + Math.random() * 7 : 10 + Math.random() * 16, c: cols[i % cols.length], t: 0, life: kind === "confetti" ? 2.6 : 0.9, kind });
      }
    },
    stop() {
      alive = false;
      cancelAnimationFrame(raf);
    },
  };
}

/**
 * Capsules floating inside the dome, computed live every frame (no loop, no gravity). Units: the dome's inner width = 1,
 * origin at its centre. Each capsule drifts slowly in a straight line; capsule-capsule and capsule-glass collisions are
 * elastic reflections. Every capsule turns at a steady 10°/s; a collision decides which way, from the sliding direction
 * at the contact (two touching disks rub each other the same way round, the glass rolls them). A soft speed regulator keeps every capsule drifting
 * at a calm pace so the motion neither dies out nor builds up. Turning the crank (.gm.crank) briefly speeds them up.
 */
function capsulePhysics(dome, machine) {
  const N = 18, r = 0.078, R = 0.5 - 0.012, m2 = 4 * r * r, lim = R - r;
  const CRUISE = 0.075, SPIN = (10 * Math.PI) / 180;
  // all capsules are drawn on one canvas: moving 18 DOM elements cost a style recalculation every frame
  const cv = el("canvas", "gm-caps");
  dome.appendChild(cv);
  const g = cv.getContext("2d");
  const balls = [];
  for (let i = 0; i < N; i++) {
    const col = CAP_COLORS[i % CAP_COLORS.length];
    // a free spot that overlaps nothing
    let x = 0, y = 0;
    for (let k = 0; k < 200; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * lim;
      x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (balls.every((o) => (o.x - x) ** 2 + (o.y - y) ** 2 > m2 * 1.05)) break;
    }
    const dir = Math.random() * Math.PI * 2, sp = CRUISE * (0.7 + Math.random() * 0.6);
    balls.push({ col, x, y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, cruise: sp, a: Math.random() * Math.PI * 2, w: Math.random() < 0.5 ? SPIN : -SPIN });
  }
  dome.__balls = balls;
  let boost = 1, last = performance.now();
  const turn = (slide, w) => (Math.abs(slide) < 0.03 ? w : slide > 0 ? SPIN : -SPIN); // glancing touches keep the current direction
  const step = (dt) => {
    // cranking: everything speeds up for a moment, then eases back to the cruise speed
    boost += ((machine.classList.contains("crank") ? 4 : 1) - boost) * Math.min(1, dt * 3);
    for (const b of balls) {
      const sp = Math.hypot(b.vx, b.vy) || 1e-6, want = b.cruise * boost, k = 1 + ((want - sp) / sp) * Math.min(1, dt * 0.8);
      b.vx *= k;
      b.vy *= k;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += b.w * dt;
    }
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 >= m2 || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, o = (2 * r - d) / 2;
      a.x -= nx * o, a.y -= ny * o, b.x += nx * o, b.y += ny * o;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) continue;
      // equal masses, elastic: swap the normal components
      a.vx += vn * nx, a.vy += vn * ny, b.vx -= vn * nx, b.vy -= vn * ny;
      // sliding speed at the contact point (tangent), including the spins → equal and opposite spin kick
      const tx = -ny, ty = nx, slide = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
      a.w = turn(slide, a.w);
      b.w = turn(slide, b.w);
    }
    for (const b of balls) {
      const d = Math.hypot(b.x, b.y);
      if (d <= lim) continue;
      const nx = b.x / d, ny = b.y / d;
      b.x = nx * lim, b.y = ny * lim;
      const vn = b.vx * nx + b.vy * ny;
      if (vn <= 0) continue;
      b.vx -= 2 * vn * nx, b.vy -= 2 * vn * ny; // mirror off the glass
      b.w = turn(b.vx * -ny + b.vy * nx, b.w); // rolls along the glass the way it is moving
    }
  };
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#1a1020";
  const draw = () => {
    const W = dome.clientWidth, dpr = Math.min(3, window.devicePixelRatio || 1), px = Math.round(W * dpr);
    if (cv.width !== px) (cv.width = cv.height = px), (cv.style.width = cv.style.height = W + "px");
    const s = W * dpr, lw = 3 * dpr, rad = r * s;
    g.clearRect(0, 0, px, px);
    for (const b of balls) {
      g.save();
      g.translate((b.x + 0.5) * s, (b.y + 0.5) * s);
      g.rotate(b.a);
      g.beginPath();
      g.arc(0, 0, rad - lw / 2, 0, Math.PI * 2);
      g.fillStyle = "#fff";
      g.fill();
      g.beginPath();
      g.arc(0, 0, rad - lw / 2, Math.PI, Math.PI * 2);
      g.closePath();
      g.fillStyle = b.col;
      g.fill();
      g.beginPath();
      g.arc(0, 0, rad - lw / 2, 0, Math.PI * 2);
      g.lineWidth = lw;
      g.strokeStyle = ink;
      g.stroke();
      g.restore();
    }
  };
  const frame = (now) => {
    if (!dome.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt / 2);
    step(dt / 2);
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** crank → capsule drops and rolls to center → tap to open → cards fly out and flip → summary */
function pullSequence(screen, res) {
  return new Promise(async (resolve) => {
    const best = res.reduce((b, r) => (ORDER.indexOf(r.r) > ORDER.indexOf(b) ? r.r : b), "N");
    let skip = false;
    const machine = q(".gm", screen);
    // 1. crank and rattle
    machine.classList.add("crank");
    sfx("gacha");
    await sleep(750);
    machine.classList.remove("crank");
    // overlay
    const ov = el("div", "pull-ov");
    ov.innerHTML = `<canvas class="pv-fx"></canvas><div class="pv-rays"></div><div class="pv-stage"><div class="pv-cap"><i class="beam"></i><i class="top"></i><i class="lin"></i><i class="bot"></i></div><div class="pv-hint outline">点击打开</div></div><div class="pv-cards"></div><div class="pv-foot"></div><button class="btn gray small pv-skip">跳过 ▶▶</button>`;
    uiRoot().appendChild(ov);
    const fx = particles(q(".pv-fx", ov));
    const cap = q(".pv-cap", ov), rays = q(".pv-rays", ov);
    // the capsule shows the best rarity of the pull right away (no colour switch later)
    const shown = best;
    cap.style.setProperty("--c", RCOL[shown]);
    rays.style.setProperty("--c", RCOL[shown]);
    ov.classList.add("r-" + shown);
    q(".pv-skip", ov).onclick = (e) => {
      e.stopPropagation();
      skip = true;
      ov.classList.add("skipping");
    };
    setTimeout(() => sfx("coin"), 420);
    setTimeout(() => sfx("coin"), 700);
    await sleep(skip ? 0 : 950);
    cap.classList.add("landed"); // stays centred from now on (no replay of the entry animation)
    // 2. wait for the tap (or skip)
    ov.classList.add("ready");
    if (!skip)
      await new Promise((r) => {
        const go = () => (ov.removeEventListener("click", go), r());
        ov.addEventListener("click", go);
        const t = setInterval(() => skip && (clearInterval(t), r()), 100);
      });
    ov.classList.remove("ready");
    // 3. open in place: it trembles (longer and with sparks for SR/SSR), the seam glows, then the halves part up/down
    if (!skip) {
      cap.classList.add("shake");
      if (best === "SSR") sfx("ssr");
      await sleep(best === "SSR" ? 700 : best === "SR" ? 450 : 250);
    }
    cap.classList.remove("shake");
    cap.classList.add("open");
    ov.classList.add("flash");
    sfx("pickup");
    await sleep(skip ? 0 : 700);
    q(".pv-stage", ov).classList.add("gone");
    // 4. cards
    const wrap = q(".pv-cards", ov);
    wrap.classList.toggle("ten", res.length > 1);
    const cards = res.map((r, i) => {
      const it = r.item;
      const d = el("div", "rc " + r.r);
      d.style.setProperty("--c", RCOL[r.r]);
      d.style.setProperty("--i", i);
      d.innerHTML = `<div class="rc-in"><div class="rc-back"><span>?</span></div><div class="rc-front"><div class="rr o1">${r.r}</div><div class="ri">${ICON(it, 4)}</div><div class="rn">${it.name}</div><div class="rd">${it.desc}</div><div class="rl">${r.stash ? "积攒 " + r.lv + " / ∞" : r.dup ? "已满级 · 返还 " + r.refund + '<i class="cur gem"></i>' : it.max > 1 ? "Lv " + r.lv + " / " + it.max : "新获得！"}</div></div></div>`;
      wrap.appendChild(d);
      return d;
    });
    await sleep(skip ? 0 : 450 + res.length * 40);
    // flip: commons quick, rares slow with a burst
    for (let i = 0; i < cards.length; i++) {
      const r = res[i], d = cards[i];
      d.classList.add("flip");
      if (!skip) {
        if (r.r === "SSR") {
          sfx("ssr");
          ov.classList.add("flash");
          setTimeout(() => ov.classList.remove("flash"), 260);
          await sleep(700);
        } else if (r.r === "SR") {
          sfx("card");
          await sleep(380);
        } else {
          sfx("click");
          await sleep(120);
        }
      }
    }
    // 5. summary
    const foot = q(".pv-foot", ov);
    const m = load();
    const refund = res.reduce((a, r) => a + r.refund, 0);
    foot.innerHTML = `<div class="o1 pv-sum">${res.length} 抽 · 最高 <b style="color:${RCOL[best]}">${best}</b>${refund ? ` · 返还 ${refund}<i class="cur gem"></i>` : ""} · 剩余 ${m.tokens}<i class="cur gem"></i></div>`;
    const again = btn(res.length > 1 ? `再来十连 ${GACHA.cost10}<i class="cur gem"></i>` : `再来一抽 ${GACHA.cost1}<i class="cur gem"></i>`, "pink", () => finish(res.length));
    const ok = btn("收下", "", () => finish(0));
    foot.append(ok, again);
    q(".pv-skip", ov).remove();
    foot.classList.add("show");
    let done = false;
    function finish(again) {
      if (done) return; // a second tap on 收下 / 再来 does nothing
      done = true;
      fx.stop();
      ov.remove();
      resolve(again);
    }
  });
}

/** UR exchanges a young pet; HUR content is reserved and cannot be redeemed. */
const ssrOwned = () => {
  const m = load(), list = GACHA.pool.filter((it) => it.r === "SSR");
  return `${list.filter((it) => (m.talents[it.id] || 0) >= it.max).length} / ${list.length}`;
};
// 主页通知条的小知识：[一句话, 跳转按钮文字, 跳转]
export const TIPS = [
  ["矿场撤离能挖到宠物蛋", "去矿场", () => import("./mineui.js").then((M) => M.showMineHub())],
  ["梦境藏品提供永久加成", "看藏品", () => import("./codex.js").then((C) => (C.showCodex(), document.querySelector(".cdx-md .cdx-tab:last-child")?.click()))],
  ["积攒点可换 HUR 宠物蛋", "去兑换", () => (showGacha(), showStash())],
  ["同品质融合有机会升品", "去仓库", () => showPets(() => showLobby())],
  ["两只异色融合必出异色", "去仓库", () => showPets(() => showLobby())],
  ["孵化越多流彩概率越高", "去仓库", () => showPets(() => showLobby())],
  ["宠物图鉴收集有奖励", "去仓库", () => showPets(() => showLobby())],
  ["高品质宠物放生经验多", "去仓库", () => showPets(() => showLobby())],
  ["传送门颜色代表房间类型", "看说明", () => showHelp()],
  ["矿场每日委托送星砂", "去矿场", () => import("./mineui.js").then((M) => M.showMineHub())],
];
// 积攒兑换：[what, rarity, name, one line, cost, egg kind]
const STASH_ROWS = [
  ["egg_ur", "UR", EGGS.ur.name, "孵化必出稀有或更高品质", EGGS.ur.cost, "ur"],
  ["egg_hur", "HUR", EGGS.hur.name, "孵化必出史诗或更高品质", EGGS.hur.cost, "hur"],
  ["item_ur", "UR", PET_ITEMS.ur.name, PET_ITEMS.ur.desc, PET_ITEMS.ur.cost, null],
  ["item_hur", "HUR", PET_ITEMS.hur.name, PET_ITEMS.hur.desc, PET_ITEMS.hur.cost, null],
];
function showStash() {
  const m = load(), n = m.stash || 0;
  const md = el("div", "modal stash-md");
  md.innerHTML = `<div class="panel stash-p"><h2 class="outline">积攒兑换</h2>
    <div class="st-sub o1">SSR 全部收齐后，每抽到 1 张 SSR 积攒 1 点（当前 <b class="st-n">${n}</b> 点）。兑换的宠物蛋与道具放进宠物仓库。${ssrDone() ? "" : `<br><b class="st-prog">SSR 收集进度 ${ssrOwned()}，收齐后开始积攒</b>`}</div>
    <div class="st-list">${STASH_ROWS.map(([what, r, name, desc, cost, kind]) => `<div class="st-it ${r.toLowerCase()}" data-w="${what}"><div class="st-r o1">${r}</div>${kind ? `<canvas class="st-egg" data-k="${kind}"></canvas>` : `<i class="st-ico ${r.toLowerCase()}"></i>`}<div class="st-tx"><b class="outline">${name}</b><span>${desc}</span></div><button class="btn small"><span>兑换</span><small>积攒 ${cost}</small></button></div>`).join("")}</div></div>`;
  md.onclick = (e) => e.target === md && md.remove();
  md.querySelectorAll(".st-egg").forEach((c) => drawEgg(c, 0, c.dataset.k));
  const sync = () => md.querySelectorAll(".st-it").forEach((it) => (it.querySelector("button").disabled = (load().stash || 0) < STASH_ROWS.find((r) => r[0] === it.dataset.w)[4]));
  md.querySelectorAll(".st-it").forEach((it) => (it.querySelector("button").onclick = () => {
    const r = stashExchange(it.dataset.w);
    if (!r.ok) return toast(r.reason);
    sfx("ssr");
    toast(`获得${r.name}，在宠物仓库使用`);
    md.querySelector(".st-n").textContent = load().stash || 0;
    sync();
  }));
  sync();
  uiRoot().appendChild(md);
}
