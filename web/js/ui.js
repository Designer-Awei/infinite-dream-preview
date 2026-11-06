// HTML overlay: lobby, roster, gacha, net rooms, HUD, card picks, pause, results.
import { CHARS, CHAR_ORDER, ELEM, UNLOCKS, CARDS, fusionCards, RARITY, GACHA, RUN, STATUS, ITEMS, REACTIONS, MAPS, MAP_ORDER, PVP_MODES } from "./data.js";
import { load, save, unlockProgress, pull, checkUnlocks } from "./save.js";
import { A } from "./assets.js";
import { sfx, setSound, setMusic, playMusic } from "./audio.js";
import { el } from "./util.js";
import { iconURL, skillIcon } from "./icons.js";
import { ORES, ZONES, CHEST_STARS, oreIcon, chestIcon } from "./minedata.js";

let root, app;
export const $ = (s, r = root) => r.querySelector(s);
export const uiRoot = () => root;
export function initUI(r, a) {
  root = r;
  app = a;
}
export function clear() {
  root.querySelectorAll(":scope > .screen, :scope > .modal, :scope > .hud").forEach((n) => n.remove());
}
export function toast(msg, ms = 1800) {
  const t = el("div", "toast outline", msg);
  root.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
const cardById = (id, cid) => CARDS.find((c) => c.id === id) || fusionCards(cid).find((c) => c.id === id);
export function spriteCanvas(cid, view = "front") {
  const s = A.girls[cid], c = document.createElement("canvas");
  const top = s.top || 0;
  c.width = s.w;
  c.height = s.foot - top;
  c.getContext("2d").drawImage(s.views[view], 0, -top);
  return c;
}
export function btn(label, cls, fn) {
  const b = el("button", "btn " + (cls || ""), label);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    sfx("click");
    fn(e);
  });
  return b;
}

export function showUnlock(id) {
  const m = load(), c = CHARS[id];
  if (!m.seenUnlock.includes(id)) m.seenUnlock.push(id);
  save();
  const md = el("div", "modal");
  md.innerHTML = `<div class="panel unlock-pop" style="text-align:center"><h2 class="outline">新角色解锁！</h2></div>`;
  const p = $(".panel", md);
  const cv = document.createElement("img");
  cv.src = `assets/hero_${id}.png`;
  cv.alt = "";
  cv.style.cssText = "height:150px;display:block;margin:6px auto;animation:bob 2s infinite";
  p.appendChild(cv);
  p.appendChild(el("div", "outline", `<div style="font-size:22px">${c.name}</div><div style="color:#ffe36a">「${c.title}」</div>`));
  p.appendChild(btn("太好了！", "", () => md.remove()));
  root.appendChild(md);
  sfx("ssr");
}
/** close a modal by tapping its dark background (not the panel) */
export function bgClose(md, onClose) {
  md.addEventListener("click", (e) => {
    if (e.target !== md) return;
    md.remove();
    onClose && onClose();
  });
  md.classList.add("bg-close");
}
const H = (t) => `<b class="hp-h">${t}</b>`;
export function showHelp() {
  const md = el("div", "modal help-md");
  const reacts = Object.entries(REACTIONS).map(([k, r]) => `<span class="chip">${k === "bubble" ? "泡+任意" : k.split("+").map((x) => ELEM[x].name).join("+")} → ${r.name}</span>`).join(" ");
  const cur = (cls, name, text) => `<div class="hp-cur"><span class="chip ${cls}">${name}</span><span>${text}</span></div>`;
  const SECS = [
    ["操作", `${H("电脑")}WASD 移动 · <b>J</b> 攻击（自动锁定范围内最近的敌人）· <b>K</b> 小技能 · <b>L</b> 大招 · 空格 闪避 · Esc 暂停
      ${H("手机")}左侧拖动摇杆移动 · 按住攻击键自动锁敌连射，拖动攻击键手动瞄准 · 技能 / 大招键轻点自动释放，拖动瞄准后松手释放`],
    ["闯关循环", `每局 7 个房间：战斗 → 战斗 → 补给站 → 精英战 → 战斗 → 补给站 → 首领。
      ${H("技能卡")}清场后开箱三选一技能卡，构筑你的流派。
      ${H("生存")}护盾受击后几秒自动回复，生命不会。
      ${H("首领")}首领倒下时地上会掉一把梦境矿场的铲子（带光柱），然后开出传送门；捡没捡都会在结算时计入。偶尔还会撕开「梦境裂隙」：90 秒限时挖宝，电量无限。`],
    ["技能混搭", `每位角色带一种元素。拿到【融合】【联动】卡后可以借用其他角色的弹幕和技能；不同元素先后命中同一敌人会触发反应：<div class="hp-chips">${reacts}</div>`],
    ["地图道具", `走过去自动拾取：${Object.values(ITEMS).map((i) => `<div class="hp-cur"><span class="chip" style="background:${i.color};color:#1a1020">${i.name}</span><span>${i.desc}</span></div>`).join("")}
      ${H("算力方块")}本局的成长道具：左上角绿色方块旁的数字就是已拿到的个数，每个让伤害 +6%，每 2 个最大生命 +1，持续到本局结束。打碎箱子、击败敌人会刷出。
      ${H("地块")}草丛可以隐身；毒雾、泥沼、尖刺、炸药桶会伤人（也会伤敌）。`],
    ["模式与地图", `在大厅「开始冒险」上方左右滑动地图卡切换（全部支持离线单机）：${MAP_ORDER.map((k, i) => { const d = MAPS[k]; return `${H(`主线 ${i + 1} · ${d.name}`)}${d.desc} 敌人血量 ×${d.hp}，晶石奖励 ×${d.reward}${d.need ? `，通关【${MAPS[d.need].name}】后解锁` : ""}；首通 +200 晶石。`; }).join("")}
      ${H("稀有怪物与梦境藏品")}每张地图都有一只稀有怪物（带金色光圈），偶尔混在战斗房间里出现：草原的黄金缓存史莱姆、冰原的极光水母、熔炉的黑曜骷髅。打倒它必掉一件该地图的梦境藏品（已集齐则换成 40 晶石）。
      ${H("怪物图鉴")}大厅右上角 👾：遇到过的怪物会显示出来并记录击败数，没遇到的只显示剪影；梦境藏品也在这里查看。
      ${H("无尽回廊")}一层接一层没有终点：每 5 层补给站、每 10 层首领（打完继续），每 10 层换一张地图，敌人越来越多越来越强，伤害也随层数提高（精英和首领涨得更快）；倒下时按层数结算。完成任意一局后解锁。`],
    ["梦境矿场", `${H("下潜")}用一把铲子下潜一次：A/D 走、S 向下挖、顶着墙走就横挖、W 喷气上升（耗电），J 攻击、K 炸药、L 撤离信标。从 4 格以上高处直接掉下来才会摔伤。
      ${H("分层")}越深越暗也越值钱：矿坑 → 洞穴（落石、瓦斯）→ 深海（氧气）→ 遗迹（坚岩、守卫）。铜铲到 60m，银铲到 90m，金铲全层。
      ${H("撤离")}在地面或撤离电梯里站定 1 秒、或用信标才算安全撤离；倒下只带回 30%，电量耗尽只带回 50%。
      ${H("遭遇")}每层有一个紫色遗物箱（三选一本次增益）；洞穴里的地下商人用背包矿物换东西；宝藏地鼠会逃跑，追上打倒掉一堆好矿；金铲能挖到遗迹最深处的砖室，打倒遗迹守护者才能开星图宝箱。
      ${H("铲子")}首领掉落；免费铜铲每 4 小时 1 把、最多攒 5 把（点矿场标题旁领取）；梦境工坊里 3 铜合 1 银、3 银合 1 金。
      ${H("货币")}${cur("cur-gem", "晶石", "通用货币：闯关和矿场带出的矿物换来；用于扭蛋、矿场装备升级。")}${cur("cur-ore", "矿石", "矿场材料：矿物带出时附带；和晶石一起升级矿场装备。")}${cur("cur-star", "星砂", "稀有货币：宝箱、深层矿物、抵达新深度和每日委托；在梦境工坊换最终减伤、SSR 兑换卡和梦核。")}
      ${H("矿物")}矿物带出后按价值换成晶石，同时得到矿石；带星砂图标的矿物挖到时额外给星砂。图标依次是：晶石、矿石、星砂。${Object.entries(ORES).map(([id, o]) => `<div class="hp-orow"><img src="${oreIcon(id)}" alt=""><b>${o.name}</b><em><i class="cur gem"></i>${o.v}</em><em>${o.m ? `<img class="cur" src="${iconURL("ore", 1)}" alt="矿石">${o.m}` : ""}</em><em>${o.s ? `<img class="cur" src="${oreIcon("star")}" alt="星砂">${o.s}` : ""}</em><span>${Object.keys(o.zones).map((z) => ZONES.find((q) => q.id === z).name).join("、")}${o.light ? " · 会发光" : ""}</span></div>`).join("")}
      ${H("宝箱")}<div class="hp-orow"><img src="${chestIcon("plain")}" alt=""><b>普通宝箱</b><span>2～4 个本层矿物，50% 多掉失落钱袋，星砂 ${CHEST_STARS[ZONES[0].id][0]}～${CHEST_STARS[ZONES[ZONES.length - 1].id][1]}</span></div><div class="hp-orow"><img src="${chestIcon("relic")}" alt=""><b>紫色遗物箱</b><span>每层一个，三选一本次下潜的遗物增益</span></div><div class="hp-orow"><img src="${chestIcon("star")}" alt=""><b>星图宝箱</b><span>遗迹深处，金铲开启：4 个遗迹矿物 + 星砂 ${CHEST_STARS.star.join("～")}</span></div>
      ${H("梦境工坊")}最终减伤（矿场里每次受伤 -1，最多 2 级）、SSR 兑换卡、角色专属梦核（强化该角色的大招）。`],
    ["养成", `${H("扭蛋机")}通关获得晶石，扭蛋机抽取永久天赋与稀有技能卡。SSR 不会重复，全部集齐后再抽到 SSR 会变成积攒点。
      ${H("天赋")}N/R/SR 天赋自动生效；SSR 天赋要在角色介绍卡右上角的「天赋」页装配，每个角色一页、2 个槽位，PVE 和 PVP 都生效。
      ${H("角色")}达成条件解锁新角色。`],
  ];
  md.innerHTML = `<div class="panel help-p"><h2 class="outline">玩法说明</h2><div class="hp-body"><div class="hp-nav"></div><div class="hp-main"></div></div></div>`;
  const nav = $(".hp-nav", md), main = $(".hp-main", md);
  const open = (i) => {
    nav.querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
    main.innerHTML = `<div class="hp-t">${SECS[i][0]}</div>` + SECS[i][1];
    main.scrollTop = 0;
  };
  SECS.forEach(([t], i) => {
    const b = el("button", "hp-tab", t);
    b.onclick = () => (sfx("click"), open(i));
    nav.appendChild(b);
  });
  open(0);
  bgClose(md);
  root.appendChild(md);
}

// ------------------------------------------------------------------ net
export function showNet(pre = {}) {
  clear();
  const m = load();
  const s = el("div", "modal");
  s.style.background = "radial-gradient(120% 90% at 30% 20%, #4a7cff 0%, #3a3ad0 35%, #241a6a 70%, #140c30 100%)";
  // the player's name is changed only from the lobby (first change free, later ones cost 晶石), so no name field here
  s.innerHTML = `<div class="panel netp np2">
   <div class="np-h"><h2 class="outline">联机 · 合作闯关 / 竞技场</h2><div class="back"></div></div>
   <div class="np-cols">
     <div class="np-col"><div class="np-t o1">创建房间</div><div class="np-row c-btns"></div></div>
     <div class="np-div"></div>
     <div class="np-col"><div class="np-t o1">加入房间</div><div class="np-row"><input class="code-in" maxlength="4" placeholder="房间码"><span class="j-btns"></span></div></div>
   </div>
   <div class="np-notes o1"><p><b>怎么玩</b><span>把 4 位房间码发给朋友即可一起玩（2~4 人，点对点直连，无需注册）</span></p><p><b>合作闯关</b><span>敌人血量与数量随人数提升；倒地的队友，靠近 2 秒可救起</span></p><p><b>竞技场</b><span>自由混战，先拿 5 次击倒获胜；各自装配的天赋都会生效</span></p></div></div>`;
  root.appendChild(s);
  $(".c-btns", s).append(btn("合作闯关", "green", () => app.hostRoom(false)), btn("竞技场PVP", "red", () => app.hostRoom(true)));
  $(".j-btns", s).append(btn("加入", "blue", () => app.joinRoom($(".code-in", s).value.trim().toUpperCase())));
  $(".back", s).append(btn("返回大厅", "gray small", () => app.leaveNet()));
}
/** room lobby (both host and clients) */
export function showRoom(info) {
  clear();
  const m = load();
  const s = el("div", "modal");
  s.style.background = "radial-gradient(120% 90% at 30% 20%, #4a7cff 0%, #3a3ad0 35%, #241a6a 70%, #140c30 100%)";
  s.innerHTML = `<div class="panel netp room2"><div class="rm-h"><h2 class="outline">${info.pvp ? "竞技场 PVP" : "合作闯关"}</h2><span class="o1">房间码</span><span class="code outline">${info.code}</span></div>
    <div class="muted rm-st">${info.status || "把房间码或邀请链接发给朋友"}</div>
    <div class="plist"></div>
    <div class="row acts"></div></div>`;
  root.appendChild(s);
  const pl = $(".plist", s);
  for (const p of info.players) {
    const mine = p.id === info.myId;
    const d = el("div", "pl o1" + (mine ? " me" : ""), `<img src="assets/portrait_${p.cid}.png"><div>${escapeHtml(p.name)}${p.host ? " 👑" : ""}</div><div style="color:#ffe36a">${CHARS[p.cid].short}</div>`);
    if (mine) {
      const sw = el("button", "pl-sw", `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#1a1020" d="M4 11 L10.5 4.5 L10.5 8.5 L20 8.5 L20 11 Z"/><path fill="#1a1020" d="M20 13 L13.5 19.5 L13.5 15.5 L4 15.5 L4 13 Z"/></svg>`);
      sw.title = "切换角色";
      sw.onclick = () => (sfx("click"), pickRoomChar(m.chars, info.myCid));
      d.appendChild(sw);
      d.querySelector("img").onclick = sw.onclick;
    }
    pl.appendChild(d);
  }
  for (let i = info.players.length; i < 4; i++) pl.appendChild(el("div", "pl o1", `<div class="pl-q">?</div><div>等待加入…</div>`));
  const acts = $(".acts", s);
  if (info.isHost) acts.appendChild(btn(info.pvp ? "开战！" : "出发！", "rm-act", () => app.startNet()));
  else acts.appendChild(el("div", "muted rm-act rm-wait", "等待房主开始…"));
  acts.appendChild(btn("复制邀请", "blue rm-act", async () => {
    const base = window.Capacitor ? "https://designer-awei.github.io/infinite-dream-preview/" : location.origin + location.pathname + location.search;
    const url = base + "#join-" + info.code;
    try {
      await navigator.clipboard.writeText(url);
      toast("已复制：发给朋友打开即可加入");
    } catch {
      toast("房间码：" + info.code);
    }
  }));
  acts.appendChild(btn("离开", "gray rm-act", () => app.leaveNet()));
  // the buttons span exactly the row of player slots
  requestAnimationFrame(() => (acts.style.width = pl.getBoundingClientRect().width + "px"));
}
/** room: choose your girl (opened from the ⇄ on your own card) */
function pickRoomChar(ids, cur) {
  const md = el("div", "modal rc-pick");
  md.innerHTML = `<div class="panel rcp"><h2 class="outline">切换角色</h2><div class="rcp-g"></div></div>`;
  const g = $(".rcp-g", md);
  for (const id of ids) {
    const b = el("button", "rcp-c o1" + (id === cur ? " on" : ""), `<img src="assets/portrait_${id}.png" alt=""><span>${CHARS[id].short}</span>`);
    b.onclick = () => (md.remove(), app.pickNetChar(id));
    g.appendChild(b);
  }
  md.onclick = (e) => e.target === md && md.remove();
  root.appendChild(md);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ------------------------------------------------------------------ HUD
let hud = null, hudCache = {};
export function showHud(game, me) {
  clear();
  document.body.classList.add("ingame");
  hud = el("div", "hud");
  hud.innerHTML = `
   <div class="tl"><div class="face"><img src="assets/portrait_${me.cid}.png"></div>
     <div class="bars"><div class="bar hp"><i></i><span class="o1"></span></div><div class="bar sh"><i></i><span class="o1"></span></div>
     <div class="res o1"><div><div class="coin"></div><span class="coins">0</span></div><div><div class="cube"></div><span class="cubes">0</span></div><div class="pvpscore"></div></div></div></div>
   <div class="tc"><div class="pips"></div><div class="bossbar" style="display:none"><div class="nm o1">幻觉之眼</div><div class="bar"><i></i></div></div></div>
   <div class="tr"><div class="buffs"></div><button class="btn small gray pausebtn">Ⅱ</button></div>
   <div class="banner-slot"></div>
   <div class="keys o1">WASD 移动 · J 攻击(自动锁敌) · K 技能 · L 大招 · 空格 闪避</div>
   <div class="pcskills o1">
     <div class="pcs s-dash"><i class="bface"></i><img class="ico" alt=""><i class="cdm"></i><b class="cdt"></b><span class="k">空格</span></div>
     <div class="pcs s-skill"><i class="ring"></i><i class="bface"></i><img class="ico" alt=""><i class="cdm"></i><b class="cdt"></b><span class="k">K</span></div>
     <div class="pcs ult s-ult"><i class="ring"></i><i class="bface"></i><img class="ico" alt=""><i class="cdm"></i><b class="cdt"></b><span class="k">L</span></div>
     <div class="pcs big s-atk"><i class="bface"></i><img class="ico" alt=""><span class="k">J</span></div>
   </div>
   <div class="tipline o1" style="display:none"></div>`;
  root.appendChild(hud);
  hud.querySelector(".pausebtn").onclick = () => app.pause();
  // skill icons for this girl on both the PC widgets and the touch buttons
  const ec = ELEM[CHARS[me.cid].elem];
  document.body.style.setProperty("--ec", ec.color);
  document.body.style.setProperty("--eg", ec.glow);
  for (const [slot, sel] of [["atk", "atk"], ["skill", "skill"], ["ult", "ult"], ["dash", "dash"]]) {
    const url = iconURL(skillIcon(me.cid, slot), 4);
    document.querySelectorAll(`.b-${sel} .ico, .s-${sel} .ico`).forEach((im) => (im.src = url));
  }
  const tips = { skill: CHARS[me.cid].skill.name, ult: CHARS[me.cid].ult.name, atk: CHARS[me.cid].atk.name };
  for (const k in tips) document.querySelectorAll(`.b-${k} .lb`).forEach((n) => (n.textContent = tips[k]));
  const pips = hud.querySelector(".pips");
  if (!game.pvp) RUN.forEach((r, i) => pips.appendChild(el("div", "pip o1", r.kind === "shop" ? "🛒" : r.kind === "boss" ? "👑" : "⚔")));
  hudCache = {};
}
export function updateHud(game, me) {
  if (!hud || !me) return;
  const set = (k, v, fn) => {
    if (hudCache[k] !== v) (hudCache[k] = v), fn(v);
  };
  set("hp", me.hp + "/" + me.maxHp, (v) => {
    hud.querySelector(".bar.hp i").style.width = (100 * Math.max(0, me.hp)) / me.maxHp + "%";
    hud.querySelector(".bar.hp span").textContent = "❤ " + v;
  });
  set("sh", me.shield + "/" + me.maxShield, (v) => {
    hud.querySelector(".bar.sh i").style.width = (100 * me.shield) / Math.max(1, me.maxShield) + "%";
    hud.querySelector(".bar.sh span").textContent = "🛡 " + v;
  });
  set("coins", me.coins, (v) => (hud.querySelector(".coins").textContent = v));
  set("cubes", me.cubes, (v) => (hud.querySelector(".cubes").textContent = v));
  set("room", game.roomIdx, (v) => hud.querySelectorAll(".pip").forEach((p, i) => (p.className = "pip o1" + (i < v ? " done" : i === v ? " cur" : ""))));
  const boss = game.enemies.find((e) => e.boss);
  set("boss", boss ? Math.ceil((boss.hp / boss.maxHp) * 200) : -1, (v) => {
    const bb = hud.querySelector(".bossbar");
    bb.style.display = v < 0 ? "none" : "";
    if (v >= 0) bb.querySelector("i").style.width = v / 2 + "%";
    if (boss) bb.querySelector(".nm").textContent = boss.def.name;
  });
  // buffs
  const bl = [];
  for (const k of ["speed", "rage", "star", "infuse", "ultOn", "slow", "burn", "poison"]) if (me.buff[k] > 0) bl.push(k + Math.ceil(me.buff[k]));
  set("buffs", bl.join(","), () => {
    const b = hud.querySelector(".buffs");
    b.innerHTML = "";
    for (const k of ["speed", "rage", "star", "infuse", "ultOn", "slow", "burn", "poison"]) if (me.buff[k] > 0) {
      const d = el("div", "buff o1", `${k === "infuse" && me.infuseElem ? "灌注·" + ELEM[me.infuseElem].name : STATUS[k].name} ${Math.ceil(me.buff[k])}s`);
      d.style.background = STATUS[k].color;
      b.appendChild(d);
    }
  });
  // banner
  const bn = game.banner ? game.banner.text + "|" + game.banner.sub : "";
  set("banner", bn, () => {
    const slot = hud.querySelector(".banner-slot");
    slot.innerHTML = "";
    if (game.banner) slot.appendChild(el("div", "banner outline", `<b>${game.banner.text}</b><small>${game.banner.sub || ""}</small>`));
  });
  // cooldowns (PC widgets + touch buttons)
  const c = CHARS[me.cid];
  const sk = me.skillCdFrac ?? Math.max(0, me.skillCd) / (c.skill.cd * me.st.cd);
  const dk = me.dashCdFrac ?? Math.max(0, me.dashCd) / 1.6;
  const uk = Math.min(1, me.ult);
  const q = (x) => Math.round(x * 50) / 50;
  const skCd = sk * c.skill.cd * me.st.cd, dkCd = dk * 1.6;
  const t1 = (v) => (Math.ceil(v * 10) / 10 || 0.1).toFixed(1); // never shows "0.0" while still cooling down
  const skT = sk > 0 ? (skCd >= 1 ? String(Math.ceil(skCd)) : t1(skCd)) : "", dkT = dk > 0 ? t1(dkCd) : "";
  // the key holds what is actually shown (ready state + countdown text): rounding alone could hide the
  // last step from "0.0" to ready and leave the button grey
  set("cds", q(sk) + "," + q(dk) + "," + q(uk) + "," + (me.input.atk ? 1 : 0) + "," + skT + "," + dkT + "," + (sk <= 0 ? 1 : 0) + (dk <= 0 ? 1 : 0) + (uk >= 1 ? 1 : 0), () => {
    const upd = (key, frac, ready, secs, ring) => {
      const nodes = [hud.querySelector(".s-" + key), document.querySelector(".b-" + key)];
      for (const n of nodes) {
        if (!n) continue;
        const cd = n.querySelector(".cd, .cdm");
        if (cd) cd.style.setProperty("--p", Math.round(frac * 100) + "%");
        const was = n.classList.contains("ready");
        n.classList.toggle("ready", ready);
        if (ready && !was && hudCache.started) {
          n.classList.remove("ping");
          void n.offsetWidth;
          n.classList.add("ping");
        }
        const t = n.querySelector(".cdt");
        if (t) t.textContent = secs;
        if (ring != null) n.style.setProperty("--chg", Math.round(ring * 100) + "%");
      }
    };
    upd("skill", sk, sk <= 0, skT);
    upd("dash", dk, dk <= 0, dkT);
    upd("ult", 0, uk >= 1, uk < 1 ? Math.floor(uk * 100) + "%" : "", uk);
    const firing = !!me.input.atk;
    for (const n of [hud.querySelector(".s-atk"), document.querySelector(".b-atk")]) n && n.classList.toggle("firing", firing);
    hudCache.started = true;
  });
  // tip line
  let tip = "";
  if (game.room && game.room.kind === "shop" && me.nearShop) tip = `${me.nearShop.name}：◎${me.nearShop.price}（${load().sel && "按攻击键购买"}）`;
  if (me.downed && !game.pvp) tip = "倒地了！等待队友靠近救援…";
  if (game.phase === "portal") tip = "前往传送门 ↓";
  set("tip", tip, (v) => {
    const t = hud.querySelector(".tipline");
    t.style.display = v ? "" : "none";
    t.textContent = v;
  });
  me.nearShop = null;
  if (game.pvp) {
    const sc = game.players.map((p) => `${p.name}:${game.pvpScore[p.id] || 0}`).join(" ") + ` / ${game.pvpRule.goal}`;
    set("pvp", sc, (v) => (hud.querySelector(".pvpscore").textContent = (game.pvpRule.zone ? "⛳ " : "⚔ ") + v));
  }
}

// ------------------------------------------------------------------ cards
export function showCards(game, me, ids, onPick) {
  closeCards();
  document.body.classList.add("cards-open");
  const md = el("div", "modal cards-modal");
  md.innerHTML = `<div class="cm-wrap"><div class="cm-title outline">选择一张技能卡</div><div class="cm-sub o1">清场奖励 · 构筑你的混搭流派</div><div class="cards"></div><div class="build o1"></div><div class="muted cm-hint">${document.body.classList.contains("touchmode") ? "点击卡牌选择" : "点击或按 1 / 2 / 3 选择"}</div></div>`;
  const wrap = $(".cards", md);
  const els = [];
  ids.forEach((id, i) => {
    const c = cardById(id, me.cid);
    if (!c) return;
    const lv = me.cards[id] || 0;
    const d = el("div", "card2 " + c.r);
    d.style.setProperty("--rc", RARITY[c.r].color);
    d.style.animationDelay = i * 0.09 + "s";
    let art;
    if (c.fuse) {
      const fe = ELEM[CHARS[c.fuse].elem];
      art = `<div class="c-art fuse" style="--ac:${fe.color}"><img class="c-por" src="assets/portrait_${c.fuse}.png" alt=""><img class="c-badge" src="${iconURL(c.kind === "atk" ? c.fuse + "_atk" : skillIcon(c.fuse, "skill"), 3)}" alt=""></div>`;
    } else art = `<div class="c-art" style="--ac:${RARITY[c.r].color}"><i class="c-rays"></i><img class="c-ico" src="${iconURL(id, 4)}" alt=""></div>`;
    const pips = c.max > 1 ? `<div class="c-pips">${Array.from({ length: c.max }, (_, k) => `<i class="${k < lv ? "on" : k === lv ? "new" : ""}"></i>`).join("")}</div>` : `<div class="c-pips one">${lv ? "已拥有" : "唯一"}</div>`;
    d.innerHTML = `<i class="c-frame"></i><div class="c-rar o1">${c.r}</div>${art}<div class="c-body"><div class="c-name">${c.name}</div><span class="c-tag o1">${c.tag}</span><div class="c-desc">${c.desc}</div>${pips}</div><div class="c-key">${i + 1}</div>`;
    d.onclick = () => pick(id, d);
    wrap.appendChild(d);
    els.push(d);
  });
  const owned = Object.entries(me.cards);
  const b = $(".build", md);
  if (owned.length) b.innerHTML = owned.map(([id, n]) => `<span><img src="${iconURL(id.startsWith("f") ? id.slice(3) + (id[1] === "a" ? "_atk" : "_skill") : id, 2)}" alt="">${cardById(id, me.cid)?.name || id}${n > 1 ? "×" + n : ""}</span>`).join("");
  let done = false;
  function pick(id, d) {
    if (done) return;
    done = true;
    removeEventListener("keydown", key);
    sfx("card");
    md.classList.add("picking");
    for (const o of els) o.classList.add(o === d ? "picked" : "dropped");
    setTimeout(() => {
      md.remove();
      document.body.classList.remove("cards-open");
      onPick(id);
    }, 520);
  }
  function key(e) {
    if (e.repeat) return;
    const k = { Digit1: 0, Digit2: 1, Digit3: 2, KeyJ: 0, KeyK: 1, KeyL: 2 }[e.code];
    if (k != null && ids[k]) pick(ids[k], els[k]);
  }
  setTimeout(() => addEventListener("keydown", key), 350);
  md._cleanup = () => (removeEventListener("keydown", key), document.body.classList.remove("cards-open"));
  root.appendChild(md);
  sfx("card");
}
export function closeCards() {
  root.querySelectorAll(".cards-modal").forEach((n) => (n._cleanup && n._cleanup(), n.remove()));
}

// ------------------------------------------------------------------ pause / results
export function showPause(game, opts) {
  const md = el("div", "modal pause-modal");
  const m = load();
  // top row: toggles; bottom row: 放弃本局 (left) and 继续 (right)
  md.innerHTML = `<div class="panel pause-p"><h2 class="outline">暂停</h2><div class="row r1"></div><div class="row r2"></div><div class="build o1"></div></div>`;
  const tg = (label, get, flip) => btn(`${label}：${get() ? "开" : "关"}`, "gray small pz-tg", (e) => (flip(), save(), (e.target.closest("button").innerHTML = `${label}：${get() ? "开" : "关"}`)));
  $(".r1", md).append(
    tg("音效", () => m.sound, () => ((m.sound = !m.sound), setSound(m.sound))),
    tg("音乐", () => m.music, () => ((m.music = !m.music), setMusic(m.music))),
    tg("自动攻击", () => m.autoFire, () => (m.autoFire = !m.autoFire)),
  );
  $(".r2", md).append(btn(opts.quitLabel || "放弃本局", "red pz-act", () => (md.remove(), opts.quit())), btn("继续", "pz-act", () => (md.remove(), opts.resume())));
  const me = opts.me;
  if (me) {
    const owned = Object.entries(me.cards);
    $(".build", md).innerHTML = owned.length ? "构筑：" + owned.map(([id, n]) => `<span>${cardById(id, me.cid)?.name || id}${n > 1 ? "×" + n : ""}</span>`).join("") : "还没有技能卡";
  }
  root.appendChild(md);
  return md;
}
export function showTutorial(go) {
  const md = el("div", "modal");
  const touch = document.body.classList.contains("touchmode");
  md.innerHTML = `<div class="panel" style="max-width:640px;text-align:center"><h2 class="outline">操作说明</h2>
   <div class="row" style="gap:18px;align-items:stretch">
    <div class="kit o1" style="text-align:left;flex:1;max-height:none">
     <div style="color:#ffe36a">${touch ? "📱 手机" : "⌨ 电脑"}</div>
     ${touch ? "左侧任意位置拖动 = 移动<br>右下红键 = 攻击（按住自动锁定最近的敌人，拖动可手动瞄准；暂停菜单可开启自动攻击）<br>蓝键 = 技能 · 黄键 = 大招（轻点自动瞄准，拖动瞄准松手释放）<br>绿键 = 闪避（短暂无敌）" : "<span class='key'>W</span><span class='key'>A</span><span class='key'>S</span><span class='key'>D</span> 移动<br><span class='key'>J</span> 按住攻击：自动吸附锁定范围内最近的敌人<br><span class='key'>K</span> 小技能 · <span class='key'>L</span> 大招（打出伤害充能）<br><span class='key'>空格</span> 闪避（短暂无敌）· <span class='key'>Esc</span> 暂停"}
    </div>
    <div class="kit o1" style="text-align:left;flex:1;max-height:none">
     <div style="color:#ffe36a">生存要点</div>
     🛡 护盾受击后几秒自动回满，❤ 生命不会<br>🌿 躲进草丛可以隐身<br>✦ 不同元素先后命中同一敌人 = 元素反应<br>📦 清场后开箱选卡，构筑你的混搭流派
    </div></div><div class="row" style="margin-top:12px"></div></div>`;
  $(".row:last-child", md).appendChild(btn("出发！", "big", () => (md.remove(), go())));
  root.appendChild(md);
}
export function showResult(r, onAgain, onLobby) {
  closeCards(); // a pending card choice must not cover the results
  // landscape two-column panel: everything (incl. the buttons) fits a 360px-tall phone screen without scrolling
  const md = el("div", "modal result");
  // Progress and new rewards come before routine bonuses. Stable ties retain run order.
  const priority = (label) => /首通|新地图|新角色|新纪录/.test(label) ? 0 : /梦境藏品/.test(label) ? 1 : /梦境裂隙/.test(label) ? 2 : /梦境矿场/.test(label) ? 3 : /怪物图鉴/.test(label) ? 4 : 5;
  const extras = [...(r.extras || [])].sort((a, b) => priority(a[0]) - priority(b[0]));
  const chip = ([label, value]) => {
    // Emoji and pixel text have different baselines: align separate, fixed icon boxes.
    const parts = label.match(/^(⛏|📖|🔓)\s*(.*)$/u);
    return `<div class="res-chip o1"><span class="res-label">${parts ? `<i class="res-icon" aria-hidden="true">${parts[1]}</i>${parts[2]}` : label}</span><b>${value}</b></div>`;
  };
  const hero = r.cid ? `<div class="res-hero${r.win ? "" : " lost"}"><i class="res-glow"></i><img src="assets/hero_${r.cid}.png" alt=""></div>` : "";
  md.innerHTML = `<div class="panel res2 ${r.win ? "win" : "lose"}">
    <div class="res-l">
      <h2 class="outline">${r.title}</h2>
      <div class="res-sub o1">${r.sub || ""}</div>
      ${hero}
      <div class="res-rewards"><div class="res-gain" data-cur="gem"><span class="big outline">+${r.tokens}</span><div class="gem"></div></div></div>
      <div class="res-extras${extras.length > 2 ? " has-more" : ""}">${extras.slice(0, 2).map(chip).join("")}${extras.length > 2 ? `<button class="res-more o1" aria-haspopup="dialog" aria-expanded="false">其余 ${extras.length - 2} 项</button>` : ""}</div>
    </div>
    <div class="res-r">
      <div class="res-stats">${r.rows.map(([a, b], i) => `<div class="res-st" style="animation-delay:${0.08 + i * 0.05}s"><span>${a}</span><b class="outline">${b}</b></div>`).join("")}</div>
      <div class="row acts"></div>
    </div></div>`;
  const more = $(".res-more", md);
  if (more) more.onclick = () => {
    if ($(".res-details", md)) return;
    const overlay = el("div", "res-details");
    overlay.innerHTML = `<section class="panel res-sheet" role="dialog" aria-modal="true" aria-labelledby="res-detail-title" tabindex="-1"><header><h2 id="res-detail-title">本局收获</h2></header><div class="res-detail-list" tabindex="0" aria-label="结算明细">${extras.map(chip).join("")}</div></section>`;
    const sheet = $(".res-sheet", overlay);
    const close = () => { overlay.remove(); more.setAttribute("aria-expanded", "false"); more.focus(); };
    const closeButton = btn("收起 ↓", "blue", close);
    $("header", sheet).appendChild(closeButton);
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    overlay.onkeydown = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "Tab") { e.preventDefault(); (document.activeElement === closeButton ? $(".res-detail-list", sheet) : closeButton).focus(); }
    };
    md.appendChild(overlay);
    more.setAttribute("aria-expanded", "true");
    closeButton.focus();
  };
  const a = $(".acts", md);
  if (onAgain) a.appendChild(btn("再来一局", "", onAgain));
  a.appendChild(btn("返回大厅", "blue", onLobby));
  root.appendChild(md);
  md.querySelectorAll("[data-cur]").forEach((b) => (b.onclick = () => import("./mineui.js").then((M) => M.showCurInfo(b.dataset.cur))));
}
export function showMsg(title, text, okLabel = "好的", ok) {
  const md = el("div", "modal");
  md.innerHTML = `<div class="panel" style="text-align:center;max-width:460px"><h2 class="outline">${title}</h2><div class="muted" style="font-size:14px;color:#fff">${text}</div><div class="row" style="margin-top:10px"></div></div>`;
  $(".row", md).appendChild(btn(okLabel, "", () => (md.remove(), ok && ok())));
  root.appendChild(md);
  return md;
}
