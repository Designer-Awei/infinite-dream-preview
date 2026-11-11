// Boot, the frame loop, and the app controller tying UI, game and network together.
import { VIEW_H, VIEW_W, setViewW, CHARS, REWARD, ELEM, RS, setRS, MAPS, MAP_ORDER, PVP_MODES, ENEMIES } from "./data.js";
import { loadAll, A } from "./assets.js";
import { loadFx, FxLayer } from "./fx.js";
import { Renderer } from "./render.js";
import { Game } from "./game.js";
import { input, initInput, consume } from "./input.js";
import { initAudio, playMusic, sfx, setSound, setMusic } from "./audio.js";
import { trackExperienceTime, sessionExperience } from "./progression.js";
import { load, save, checkUnlocks, makeKit, mineState, grantCharacterXP } from "./save.js";
import { Dive } from "./mine.js";
import { progressQuests, questText } from "./minequests.js";
import { recordCodex, recordCurios, CURIOS } from "./codex.js";
import * as MUI from "./mineui.js";
import { SHOVELS } from "./minedata.js";
import * as UI from "./ui.js";
import { showLobby, showGacha } from "./lobby.js";
import { Net } from "./net.js";
import { initUpdater } from "./updater.js";
import { PETS, PET_EVOLVE, MINE_EGG_CHANCE, petExperience } from "./petdata.js";
import { grantPetXP, grantEggs, petState, findPet, addPool } from "./petsave.js";
import { showEvent } from "./routeui.js";

const canvas = document.getElementById("view");
const uiRoot = document.getElementById("ui");
let fx = null, renderer = null;

function resize() {
  const W = innerWidth, H = innerHeight, aspect = W / H;
  const vw = Math.max(560, Math.min(820, Math.round((VIEW_H * aspect) / 2) * 2));
  if (vw !== VIEW_W || !fx || canvas.width !== vw * RS) {
    setViewW(vw);
    canvas.width = vw * RS;
    canvas.height = VIEW_H * RS;
    const lite = fx && fx.lite;
    fx = new FxLayer(vw, VIEW_H);
    if (lite) fx.setLite(true);
    if (renderer) {
      const old = renderer;
      renderer = new Renderer(canvas, fx);
      renderer.cam = old.cam;
    }
    if (app.game) app.game.fx = fx;
    if (app.dive) app.dive.fx = fx;
  }
  const s = Math.min(W / vw, H / VIEW_H);
  // prefer integer scaling when it costs little space
  const si = Math.floor(s);
  const sc = si >= 2 && si / s > 0.9 ? si : s;
  canvas.style.width = Math.round(vw * sc) + "px";
  canvas.style.height = Math.round(VIEW_H * sc) + "px";
}

/** the solo mode picked in the lobby: { map, endless } (falls back to an unlocked map) */
export function playMode() {
  const m = load(), pm = m.playMode || {};
  const map = MAPS[pm.map] && mapUnlocked(pm.map) ? pm.map : "grass";
  return { map, endless: !!pm.endless && endlessUnlocked() };
}
export function mapUnlocked(id) {
  const need = MAPS[id] && MAPS[id].need, m = load();
  return !need || ((m.maps || {})[need] || 0) > 0;
}
export const endlessUnlocked = () => (load().stats.runs || 0) > 0;

export const app = {
  game: null,
  me: null,
  paused: false,
  cardOpen: false,
  net: null,
  hudT: 0,
  /** 实时进化: once a second, the carried pet's xp earned so far in this run; when it reaches the next stage it is
   *  saved at once and the pet evolves on the field (solo / host only — a client's pet evolves at the result) */
  petLiveXP() {
    const g = this.game, me = this.me;
    if (!g || !g.host || g.pvp || this.petTrial || this.ended || !me?.pet) return;
    const uid = petState().equipped, p = uid && findPet(uid);
    if (!p || p.stage >= 3 || p.id !== me.pet.id) return;
    const total = petExperience({ seconds: this.progressSession?.seconds, rooms: g.runStats.xpRooms, bosses: g.runStats.xpBosses });
    const add = total - (this.petGranted || 0);
    if (add <= 0 || p.xp + add < PET_EVOLVE[p.stage + 1].xp) return;
    grantPetXP(uid, add);
    this.petGranted = total;
    const np = findPet(uid);
    if (np.stage > me.pet.stage) g.evolvePetLive(me, np.stage);
  },
  startPetTrial(id) {
    if (!Object.hasOwn(PETS, id)) return;
    const m = load(); this.net = null;
    this.beginLoading({ mode: "solo", pvp: false, petTrial: id, seed: (Math.random() * 1e9) | 0, players: [{id:1,cid:m.sel,name:m.name,kit:{...makeKit(m.sel),pet:{id,stage:3}}}], myId:1, opt:{map:"grass",petTrial:true} });
  },

  startSolo() {
    const m = load();
    this.net = null;
    if (!m.tutorialSeen) {
      m.tutorialSeen = true;
      save();
      UI.clear(); // drop the lobby (and its white launch wipe) so the tutorial is visible
      return UI.showTutorial(() => this.startSolo());
    }
    const pm = playMode();
    this.beginLoading({ mode: "solo", pvp: false, seed: (Math.random() * 1e9) | 0, players: [{ id: 1, cid: m.sel, name: m.name, kit: makeKit(m.sel) }], myId: 1, opt: pm });
  },
  /** two sliding doors shut over the screen (if they aren't shut already); resolves once closed */
  closeDoors() {
    let d = uiRoot.querySelector(".doors");
    if (d) return Promise.resolve(d);
    d = document.createElement("div");
    d.className = "doors";
    d.innerHTML = `<div class="dr l"><i class="dr-bolt"></i><i class="dr-bolt b"></i><i class="dr-half"></i></div><div class="dr r"><i class="dr-bolt"></i><i class="dr-bolt b"></i><i class="dr-half"></i></div><div class="dr-plate"><div class="el-t outline"></div><div class="el-s o1"></div><div class="ld-bar"><i></i></div><div class="el-tip o1"></div></div>`;
    uiRoot.appendChild(d);
    sfx("portal");
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add("shut")));
    return new Promise((r) => setTimeout(() => (sfx("hit", 0.3), r(d)), 430));
  },
  /** shut the doors, build the run behind them, then slide them open */
  async beginLoading(cfg) {
    const c = CHARS[cfg.players.find((p) => p.id === cfg.myId)?.cid || "deepseek"];
    const o = cfg.opt || {};
    const where = cfg.pvp ? "竞技场 · " + (PVP_MODES[o.pvpMode] || PVP_MODES.brawl).name : o.endless ? "无尽回廊" : (MAPS[o.map] || MAPS.grass).name;
    const d = await this.closeDoors();
    d.querySelector(".el-t").textContent = where;
    d.querySelector(".el-s").textContent = `${c.short} · ${c.title}`;
    d.querySelector(".el-tip").textContent = TIPS[(Math.random() * TIPS.length) | 0];
    d.classList.add("info");
    const bar = d.querySelector(".ld-bar i");
    requestAnimationFrame(() => (bar.style.width = "45%"));
    await new Promise((r) => setTimeout(r, 120));
    try {
      this.begin(cfg);
    } finally {
      uiRoot.appendChild(d); // keep the doors on top of the freshly built HUD
      bar.style.width = "100%";
      setTimeout(() => (d.classList.remove("info"), d.classList.remove("shut"), d.classList.add("open"), sfx("portal")), 520);
      setTimeout(() => d.remove(), 1200);
    }
  },
  /** start a run (solo, host or client). cfg: {mode, pvp, seed, players:[{id,cid,name}], myId} */
  begin(cfg) {
    consume("mount");
    UI.closeCards();
    const g = new Game({ mode: cfg.mode, pvp: cfg.pvp, seed: cfg.seed, fx, opt: cfg.opt || {} });
    this.cfg = cfg;
    this.petTrial = cfg.petTrial || null;
    for (const p of cfg.players) {
      const pl = g.addPlayer({ id: p.id, cid: p.cid, name: p.name, local: p.id === cfg.myId, kit: p.kit });
      if (cfg.pvp && p.id !== cfg.myId) pl.pvpEnemy = true;
    }
    this.game = g;
    this.me = g.player(cfg.myId);
    if (this.petTrial) this.me.ult = 1;
    this.paused = false;
    this.cardOpen = false;
    this.ended = false;
    this.riftLoot = null;
    this.progressSession = { seconds: 0, idle: 0 };
    this.petGranted = 0; // pet xp already saved during this run (live evolution)
    this.petCheckT = 0;
    g.onUi = (k, pid) => this.onGameUi(k, pid);
    if (cfg.mode !== "client") g.startRun();
    UI.showHud(g, this.me);
    playMusic(cfg.pvp ? "boss" : "battle");
    renderer.follow(g, this.me, 0, true);
    // equipped SSR talents of every player (host / solo simulates them)
    if (cfg.mode !== "client") g.applyLoadouts();
  },
  onGameUi(kind, pid) {
    const g = this.game;
    if (!g) return;
    if (kind === "cards") {
      if (pid !== this.me.id) return;
      const ids = g.cardOffers[pid];
      if (!ids?.length) {
        delete g.cardOffers[pid];
        UI.closeCards();
        this.cardOpen = false;
        if (g.host && g.phase === "cards" && !Object.keys(g.cardOffers).length) g.openPortal();
        return;
      }
      this.cardOpen = true;
      UI.showCards(g, this.me, ids, (id) => {
        this.cardOpen = false;
        if (g.mode === "client") this.net.send({ t: "pick", card: id });
        else g.pickCard(this.me.id, id);
      });
    } else if (kind === "over") this.endRun(false);
    else if (kind === "win") this.endRun(true);
    else if (kind === "pvpwin") this.endPvp();
    else if (kind === "transition") fade();
    else if (kind === "rift") this.offerRift();
    else if (kind === "event") {
      this.paused = true;
      const me = this.me;
      showEvent(g, (k) => {
        this.paused = false;
        if (this.game === g) g.resolveEvent(me.id, k);
      }, {
        coins: () => me.coins,
        roll: (odd, ratio) => (this.game === g ? g.rollDice(me.id, odd, ratio) : null),
        settle: () => this.game === g && g.settleDice(me.id),
        // 奇遇商人: what the account holds, and a purchase paid from it (金铲 / 晶石), goods straight into the account
        wallet: () => ({ au: mineState().shovels.au || 0, gem: load().tokens || 0 }),
        bought: () => (this.game === g && g.npc?.bought) || [],
        buy: (good) => {
          if (this.game !== g) return { ok: false, reason: "" };
          const chk = g.merchantCheck(good.id);
          if (!chk.ok) return chk;
          const m = load(), ms = mineState();
          if (good.cost.au && (ms.shovels.au || 0) < good.cost.au) return { ok: false, reason: "金铲不够" };
          if (good.cost.gem && (m.tokens || 0) < good.cost.gem) return { ok: false, reason: "晶石不够" };
          if (good.cost.au) ms.shovels.au -= good.cost.au;
          if (good.cost.gem) m.tokens -= good.cost.gem;
          if (good.card) ms.cards = (ms.cards || 0) + good.card;
          save();
          if (good.egg) grantEggs(1, good.egg);
          g.merchantBought(me.id, good.id);
          return { ok: true };
        },
        close: () => {
          this.paused = false;
          if (this.game === g) g.closeEvent();
        },
      });
    }
    else if (kind === "cardsClosed") {
      UI.closeCards();
      this.cardOpen = false;
    }
    else if (kind === "room") {
      renderer.follow(g, this.me, 0, true);
      if (g.room && g.room.kind === "boss") playMusic("boss");
      else if (!g.pvp) playMusic("battle");
    }
  },
  endRun(win) {
    if (this.ended) return;
    this.ended = true;
    if (this.petTrial) {
      const id = this.petTrial, rs = this.game.runStats;
      UI.showResult({title:"宠物试炼结束",sub:`${PETS[id].name} · 试用收益不保存`,rows:[["清理房间",rs.rooms],["击败敌人",rs.kills],["造成伤害",Math.round(rs.dmg)]],extras:[["宠物试用","未消耗货币，不保存收益"]],tokens:0,win,cid:this.me.cid},()=>this.startPetTrial(id),()=>this.toLobby());
      return;
    }
    const g = this.game, m = load(), rs = g.runStats;
    const o = g.opt, endless = g.endless, md = g.mapDef;
    m.maps = m.maps || {};
    const first = win && !endless && !m.maps[o.map];
    const mul = endless ? 1 : md.reward || 1;
    const riftBonus = (rs.riftDeclines || 0) * REWARD.riftSkip;
    const tokens = Math.round((rs.rooms * REWARD.room + rs.kills * REWARD.kill + rs.elites * REWARD.elite + (rs.boss ? REWARD.boss : 0)) * mul) + (first ? REWARD.firstBoss : 0) + riftBonus;
    if (win && !endless) m.maps[o.map] = (m.maps[o.map] || 0) + 1;
    const prevBest = m.stats.endlessBest || 0;
    if (endless) m.stats.endlessBest = Math.max(prevBest, rs.rooms);
    m.tokens += tokens;
    m.stats.kills += rs.kills;
    m.stats.reactions += rs.reactions;
    m.stats.runs++;
    if (!endless) m.stats.best = Math.max(m.stats.best, rs.rooms);
    if (rs.boss) m.stats.bossKills++;
    save();
    const unl = checkUnlocks();
    // 梦境矿场 shovels: a boss always drops one; a decent run sometimes gives a copper one
    const drops = rs.shovels?.length ? [...rs.shovels] : [rs.shovel || rollShovel(rs)].filter(Boolean);
    for (const drop of drops) mineState().shovels[drop]++;
    if (drops.length) save();
    sfx(win ? "win" : "lose");
    const rows = [[endless ? "到达层数" : "清理房间", endless ? rs.rooms + "" : rs.rooms + " / 7"], ["击败敌人", rs.kills], ["精英", rs.elites], ["元素反应", rs.reactions], ["造成伤害", Math.round(rs.dmg)], ["承受伤害", rs.hurt || 0], ["技能卡", Object.keys(this.me.cards).length]];
    const xp = grantCharacterXP(this.me.cid, sessionExperience({ seconds: this.progressSession?.seconds, rooms: rs.xpRooms, bosses: rs.xpBosses, win: win && !endless }));
    const extras = [];
    const petTotal = petExperience({seconds:this.progressSession?.seconds,rooms:rs.xpRooms,bosses:rs.xpBosses});
    // the rest of the run's pet xp goes to the carried pet; what a full (or maxed-out) pet can't take fills the 经验池
    const petLeft = this.me.pet ? Math.max(0, petTotal - (this.petGranted || 0)) : 0, petAdd = petLeft && grantPetXP(petState().equipped || this.me.pet.id, petLeft);
    const petXP = this.me.pet && (this.petGranted || 0) + petAdd, petOver = this.me.pet && findPet(petState().equipped) ? petLeft - petAdd : 0;
    if (petXP) extras.push(["宠物经验",`${PETS[this.me.pet.id].name} +${petXP}`]);
    if (petOver > 0 && addPool(petOver)) extras.push(["经验池", `+${petOver}（宠物经验溢出）`]);
    // 宠物蛋：每击败一个首领 1 颗（一局最多 3 颗），在宠物仓库孵化
    const eggs = grantEggs(Math.min(3, rs.xpBosses || 0));
    if (eggs) extras.push(["宠物蛋", `+${eggs}（宠物仓库孵化）`]);
    if (xp.gained) extras.push([xp.after.level > xp.before.level ? "角色升级" : "角色经验", `+${xp.gained} · Lv.${xp.after.level}`]);
    if (first) extras.push([`首通 ${md.name}`, "+" + REWARD.firstBoss + '<i class="cur gem"></i>']);
    if (first) {
      const nx = MAP_ORDER.find((id) => MAPS[id].need === o.map);
      if (nx) extras.push(["🔓 新地图", MAPS[nx].name]);
    }
    if (endless && rs.rooms > prevBest) extras.push(["无尽新纪录", rs.rooms + " 层"]);
    if (!endless && mul > 1) extras.push(["地图加成", "×" + mul]);
    if (unl.length) extras.push(["🔓 新角色解锁", unl.map((id) => CHARS[id].short).join("、")]);
    if (drops.length) extras.push(["梦境矿场", Object.keys(SHOVELS).filter(k => drops.includes(k)).map(k => `${SHOVELS[k].name}×${drops.filter(d => d === k).length}`).join("、")]);
    if (rs.eventStars) {
      // 星砂泉: star sand carried out of the run
      mineState().stars += rs.eventStars;
      save();
      extras.push(["星砂泉", `+${rs.eventStars} 星砂`]);
    }
    if (rs.challenges || rs.events) extras.push(["梦境航线", `挑战成功 ${rs.challenges || 0} · 事件 ${rs.events || 0}`]);
    if (riftBonus) extras.push(["放弃裂隙", `${rs.riftDeclines} 次 · +${riftBonus}<i class="cur gem"></i>`]);
    // 怪物图鉴 + 梦境藏品
    const met = recordCodex(g.seen, g.killedTypes);
    if (met.length) extras.push(["📖 怪物图鉴", `新收录 ${met.length} 种`]);
    if (g.curiosFound.length) {
      const cr = recordCurios(g.curiosFound);
      for (const id of cr.fresh) extras.push(["梦境藏品", CURIOS[id].name]);
      if (cr.gems) extras.push(["重复藏品", `+${cr.gems}<i class="cur gem"></i>`]);
    }
    if (this.riftLoot) {
      const r = this.riftLoot;
      extras.push(["梦境裂隙", `<i class="cur gem"></i>${r.value} · 矿石${r.mats}${r.stars ? " · 星砂" + r.stars : ""}`]);
      this.riftLoot = null;
    }
    const title = endless ? `无尽回廊 · 第 ${rs.rooms} 层` : win ? "通关！幻觉已破除" : "倒下了…";
    const sub = endless ? (rs.rooms > prevBest ? "刷新了最佳纪录！" : `最佳纪录 ${Math.max(prevBest, rs.rooms)} 层`) : win ? `${CHARS[this.me.cid].name} 击败了${md.name}的幻觉之眼` : "再接再厉，构筑会更强！";
    UI.showResult({ title, sub, rows, extras, tokens, win: win || (endless && rs.rooms > prevBest), cid: this.me.cid },
      this.net ? null : () => this.startSolo(),
      () => this.toLobby());
  },
  endPvp() {
    if (this.ended) return;
    this.ended = true;
    const g = this.game, w = g.player(g.pvpWinner);
    const mine = g.pvpWinner === this.me.id;
    const m = load();
    const tokens = mine ? 60 : 20;
    m.tokens += tokens;
    save();
    sfx(mine ? "win" : "lose");
    const unit = g.pvpRule.koScore ? " 击倒" : " 分";
    UI.showResult({ title: mine ? "胜利！" : `${w ? w.name : "对手"} 获胜`, sub: "竞技场 · " + g.pvpRule.name, rows: g.players.map((p) => [p.name + "（" + CHARS[p.cid].short + "）", (g.pvpScore[p.id] || 0) + unit]), tokens, win: mine, cid: (w || this.me).cid }, null, () => this.toLobby());
  },
  // ---------------------------------------------------------- 梦境矿场
  startDive({ shovel }) {
    const m = load(), ms = mineState();
    if (!ms.shovels[shovel]) return;
    ms.shovels[shovel]--;
    ms.dives++;
    save();
    fx.clearAll();
    const d = new Dive({ cid: m.chars.includes(m.sel) ? m.sel : "deepseek", shovel, up: { ...ms.up }, fx, talents: m.talents });
    d.onEnd = (res) => setTimeout(() => this.endDive(d, res), res.how === "dead" ? 1100 : 500);
    this.dive = d;
    this.diveShovel = shovel;
    this.paused = false;
    MUI.showMineHud(d);
    playMusic("battle");
  },
  /** boss rift: a timed 90-second dig; endless returns to the current corridor */
  offerRift() {
    const g = this.game;
    if (!g || this.net || this.ended || g.riftPromptRoom === g.roomIdx) return;
    g.riftPromptRoom = g.roomIdx;
    this.paused = true;
    let chosen = false;
    const modal = UI.showMsg("梦境裂隙", `首领倒下时撕开了一道裂隙：<br>进入后有 <b>90 秒</b>限时挖宝：电量无限、不消耗铲子、矿物更密集，时间到自动带出全部收获。${g.endless ? '<div class="rift-tip">无尽模式：挖宝结束后返回当前进度继续闯关，不会提前结算。</div>' : ''}<div class="rift-tip">放弃进入：本局结算额外获得 ${REWARD.riftSkip} 晶石。</div>`, "进入裂隙", () => {
      if (chosen || this.game !== g) return;
      chosen = true;
      this.startRift();
    });
    modal.classList.add("rift-modal");
    const row = modal.querySelector(".row");
    row.classList.add("eq-btns");
    row.appendChild(UI.btn("放弃进入", "gray", () => {
      if (chosen || this.game !== g) return;
      chosen = true;
      modal.remove();
      g.runStats.riftDeclines = (g.runStats.riftDeclines || 0) + 1;
      this.paused = false;
      if (!g.endless) g.victory();
      else UI.toast(`已放弃裂隙，本局结算额外 +${REWARD.riftSkip} 晶石`, 2000);
    }));
  },
  startRift() {
    const m = load(), ms = mineState();
    fx.clearAll();
    const d = new Dive({ cid: this.me ? this.me.cid : m.sel, shovel: "cu", up: { ...ms.up }, fx, talents: m.talents, lite: { rows: 34, time: 90, rich: true, power: true } });
    d.onEnd = (res) => setTimeout(() => this.endRift(d, res), 600);
    this.dive = d;
    this.paused = false;
    MUI.showMineHud(d);
  },
  endRift(d, res) {
    if (this.dive !== d) return;
    const m = load(), ms = mineState(), g = this.game;
    m.tokens += res.value;
    ms.mats += res.mats;
    ms.stars += res.stars;
    save();
    this.dive = null;
    MUI.hideMineHud();
    this.riftLoot = res;
    if (this.progressSession) this.progressSession.seconds += d.progressSession?.seconds || 0;
    if (!g) return MUI.showMineHub();
    if (g.endless) {
      // back to the corridor: the haul also feeds this run (coins and a power cube)
      if (this.me) (this.me.coins += res.value), (this.me.cubes += 1);
      UI.showHud(g, this.me);
      UI.toast(`裂隙收获：<i class="cur gem"></i>${res.value} · 矿石 ${res.mats}${res.stars ? " · 星砂 " + res.stars : ""}`, 2600);
      return;
    }
    g.victory();
  },
  endDive(d, res) {
    if (this.dive !== d || d.xpSettled) return;
    d.xpSettled = true;
    res.cid = d.o.cid;
    res.characterXP = grantCharacterXP(d.o.cid, sessionExperience({ seconds: d.progressSession?.seconds, mine: true, extracted: res.how === "extract" && (res.dug > 0 || res.kills > 0) }));
    const m = load(), ms = mineState();
    m.tokens += res.value;
    ms.mats += res.mats;
    ms.stars += res.stars;
    res.record = res.depth > ms.best;
    ms.best = Math.max(ms.best, res.depth);
    save();
    res.questsDone = progressQuests(res).map(questText);
    // 矿场掉蛋：a safe extraction with something dug or fought finds a 宠物蛋 now and then
    res.petEgg = res.how === "extract" && (res.dug > 0 || res.kills > 0) && Math.random() < MINE_EGG_CHANCE ? grantEggs(1) : 0;
    res.codexNew = recordCodex(res.seenTypes, res.killTypes);
    this.dive = null;
    MUI.hideMineHud();
    const sh = this.diveShovel, again = ms.shovels[sh] ? () => this.startDive({ shovel: sh }) : null;
    MUI.showMineResult(res, again, () => MUI.showMineHub());
  },
  toLobby() {
    this.petTrial = null;
    this.game = null;
    this.me = null;
    if (this.net) this.net.close(), (this.net = null);
    showLobby();
  },
  pause() {
    if (this.dive && !this.pauseMd) {
      this.paused = true;
      this.pauseMd = UI.showPause(null, {
        resume: () => ((this.paused = false), (this.pauseMd = null)),
        quit: () => {
          this.paused = false;
          this.pauseMd = null;
          this.dive && this.dive.finish("dead");
        },
        quitLabel: `放弃（带回${Math.round(this.dive.retainedFraction("dead") * 100)}%）`,
      });
      return;
    }
    if (!this.game || this.pauseMd) return;
    if (!this.net) this.paused = true;
    this.pauseMd = UI.showPause(this.game, {
      me: this.me,
      resume: () => ((this.paused = false), (this.pauseMd = null)),
      quit: () => {
        this.paused = false;
        this.pauseMd = null;
        if (this.net) return this.toLobby();
        this.game.phase = "over";
        this.endRun(false);
      },
    });
  },

  // ---------------------------------------------------------- network glue
  hostRoom(pvp) {
    this.net = new Net(this);
    this.net.host(pvp); // online keeps the classic setup (草原主线 / 自由混战); new modes are offline single-player
  },
  setNetOpt(o) {
    if (this.net) this.net.setOpt(o);
  },
  mapOk: (id) => mapUnlocked(id),
  joinRoom(code) {
    if (!/^[A-Z0-9]{4}$/.test(code)) return UI.toast("请输入 4 位房间码");
    this.net = new Net(this);
    this.net.join(code);
  },
  pickNetChar(cid) {
    const m = load();
    m.sel = cid;
    save();
    this.net && this.net.setChar(cid);
  },
  startNet() {
    this.net && this.net.start();
  },
  leaveNet() {
    if (this.net) this.net.close();
    this.net = null;
    showLobby();
  },
};
window.__app = app;
import { flowField, flowDir } from "./map.js";
window.__dbg = { input, flowField, flowDir, UI, get renderer() { return renderer; } };

const TIPS = ["小提示：护盾受击后几秒会自动回满，生命不会", "小提示：躲进草丛，敌人就找不到你", "小提示：不同元素先后命中同一敌人会触发元素反应", "小提示：炸药桶会伤到所有人，包括敌人", "小提示：大招靠造成伤害充能，蓄满会发光", "小提示：融合卡能借用其他角色的子弹"];
let fadeEl = null;
function fade() {
  if (!fadeEl) {
    fadeEl = document.createElement("div");
    fadeEl.style.cssText = "position:absolute;inset:0;background:#0b0a10;opacity:0;pointer-events:none;transition:opacity .35s;z-index:8";
    uiRoot.appendChild(fadeEl);
  }
  uiRoot.appendChild(fadeEl);
  fadeEl.style.opacity = 1;
  setTimeout(() => (fadeEl.style.opacity = 0), 750);
}

// ------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const wallDt = Math.min(.25, Math.max(0, (now - last) / 1000));
  let dt = Math.min(0.05, wallDt);
  last = now;
  if (app.dive) return diveFrame(dt, wallDt);
  const g = app.game;
  if (!g) {
    renderer.g.setTransform(RS, 0, 0, RS, 0, 0);
    renderer.g.fillStyle = "#120c1e";
    renderer.g.fillRect(0, 0, VIEW_W, VIEW_H);
    return;
  }
  const me = app.me;
  if (consume("pause")) app.pauseMd ? null : app.pause();
  const frozen = app.paused || (app.cardOpen && !app.net);
  if (me && !frozen) {
    const inp = me.input;
    inp.mx = input.mx;
    inp.my = input.my;
    const auto = !!load().autoFire; // off by default; can be switched on in the pause menu
    inp.atk = (input.atk || (auto && !!me.target && !me.downed)) && !app.cardOpen;
    inp.aim = input.aim;
    if (consume("skill")) (inp.skill = true), (inp.castAim = { ...inp.castAim, skill: input.castAim.skill });
    if (consume("ult")) (inp.ult = true), (inp.castAim = { ...inp.castAim, ult: input.castAim.ult });
    if (consume("dash")) inp.dash = true;
    if (consume("mount")) inp.mount = true;
  }
  const active = me && (Math.abs(me.input.mx) > .1 || Math.abs(me.input.my) > .1 || me.input.atk || me.input.skill || me.input.ult || me.input.dash || me.castT > 0);
  if ((app.petCheckT = (app.petCheckT || 0) + wallDt) >= 1) (app.petCheckT = 0), app.petLiveXP();
  trackExperienceTime(app.progressSession, wallDt, active, !document.hidden && !frozen && !app.cardOpen && !app.ended && !g.pvp && !me?.dead && !me?.downed && ["fight", "clear", "portal"].includes(g.phase) && g.room?.kind !== "shop");
  if (g.hitStop > 0) {
    g.hitStop -= dt;
    dt = 0.0001;
  }
  if (g.slowmo > 0) {
    g.slowmo -= dt;
    dt *= 0.3;
  }
  if (!frozen) {
    if (g.mode === "client") app.net && app.net.clientTick(dt);
    else g.update(dt);
    if (g.mode === "host") app.net && app.net.hostTick(dt);
    fx.update(dt);
  }
  renderer.follow(g, me, dt);
  renderer.draw(g, me, frozen ? 0 : dt);
  // adaptive quality: slow devices drop to 1x canvas resolution
  app.ft = (app.ft ?? 16) * 0.97 + (now - (app.lastNow ?? now)) * 0.03;
  app.lastNow = now;
  app.slowT = app.ft > 24 && !app.fixedQ ? (app.slowT || 0) + dt : 0;
  if (RS > 1 && app.slowT > 3) {
    setRS(1);
    resize();
    app.slowT = 0;
  } else if (RS <= 1 && !fx.lite && app.slowT > 2) {
    fx.setLite(true); // still slow at 1x: lighter effects for the rest of the session
    app.slowT = 0;
  }
  app.hudT -= dt;
  if (app.hudT <= 0) {
    app.hudT = 0.06;
    UI.updateHud(g, me);
  }
}

function diveFrame(dt, wallDt = dt) {
  const d = app.dive;
  if (consume("pause")) app.pauseMd ? null : app.pause();
  const bomb = consume("skill");
  let beacon = consume("ult");
  // the beacon ends the dive, so ask first (only when there is one to use and it isn't already counting down)
  if (beacon && d.p.beacons > 0 && !d.p.beaconT && !app.beaconAsk) {
    beacon = false;
    app.beaconAsk = true;
    app.paused = true;
    MUI.confirmBeacon(d, () => ((app.beaconAsk = false), (app.paused = false), (app.beaconGo = true)), () => ((app.beaconAsk = false), (app.paused = false)));
  }
  if (app.beaconGo) (beacon = true), (app.beaconGo = false);
  consume("dash");
  if (d.shop && !app.shopOpen) {
    app.shopOpen = true;
    MUI.showMerchant(d, () => (app.shopOpen = false));
  }
  if (d.choice && !app.relicOpen) {
    app.relicOpen = true;
    MUI.showRelicPick(d, (id) => {
      app.relicOpen = false;
      if (app.dive === d) d.takeRelic(id);
    });
  }
  if (!app.paused) {
    trackExperienceTime(d.progressSession, wallDt, Math.abs(input.mx) > .1 || Math.abs(input.my) > .1 || input.atk || bomb || beacon, !document.hidden && !d.ended && !d.choice && !d.shop);
    d.update(dt, { mx: input.mx, my: input.my, atk: input.atk, bomb, beacon });
    fx.update(dt);
  }
  d.draw(renderer.g, RS);
  app.hudT -= dt;
  if (app.hudT <= 0) {
    app.hudT = 0.08;
    MUI.updateMineHud(d);
  }
}
/** shovel drop at the end of a run */
function rollShovel(rs) {
  const r = Math.random();
  if (rs.boss) return r < 0.1 ? "au" : r < 0.45 ? "ag" : "cu"; // normally already dropped in the boss room (rs.shovel)
  if (rs.rooms >= 3 && r < 0.4) return "cu";
  return null;
}

// ------------------------------------------------------------ boot
async function boot() {
  const bar = document.querySelector(".ld-bar i"), tip = document.querySelector(".ld-tip");
  resize();
  renderer = new Renderer(canvas, fx);
  addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && app.game && !app.net && !app.ended && !app.cardOpen) app.pause();
  });
  const m = load();
  setSound(m.sound);
  setMusic(m.music);
  try {
    await Promise.all([loadAll((p) => (bar.style.width = p * 70 + "%")), loadFx().then(() => (tip.textContent = "特效就绪…"))]);
  } catch (e) {
    tip.textContent = "加载失败：" + e.message;
    throw e;
  }
  bar.style.width = "100%";
  initInput(uiRoot);
  UI.initUI(uiRoot, app);
  const unlock = () => {
    initAudio();
    playMusic(app.game ? "battle" : "lobby");
  };
  addEventListener("pointerdown", unlock, { once: false });
  addEventListener("keydown", unlock, { once: false });
  document.getElementById("loading").remove();
  showLobby();
  requestAnimationFrame(frame);
  initUpdater();
  // deep link: #join-ABCD
  const h = location.hash.match(/^#join-([A-Z0-9]{4})$/i);
  if (h) app.joinRoom(h[1].toUpperCase());
}
boot();
