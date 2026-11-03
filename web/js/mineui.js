// 梦境矿场 UI: the hub (shovels, upgrades, exchange cards), the dive HUD and the results.
import { CHARS, GACHA, VIEW_H } from "./data.js";
import { RELICS, SUPPLIES, ORES, ZONES, zoneAt, SHOVELS, UPGRADES, FREE_SHOVEL_HOURS, FREE_SHOVEL_CAP, MT, STAR, WORKSHOP } from "./minedata.js";
import { load, save, mineState, refreshFreeShovels } from "./save.js";
import { el } from "./util.js";
import { iconURL } from "./icons.js";
import { sfx, playMusic } from "./audio.js";
import { btn, toast, clear, uiRoot } from "./ui.js";
import { app } from "./main.js";

const q = (s, r) => r.querySelector(s);

/** a little pixel nugget icon for an ore (cached data URL) */
const oreIcons = {};
export function oreIcon(id) {
  if (oreIcons[id]) return oreIcons[id];
  const o = id === "star" ? STAR : ORES[id];
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d");
  const P = [[3, 8], [7, 3], [12, 4], [14, 9], [10, 14], [4, 13]];
  g.fillStyle = "#1a1020";
  g.beginPath();
  P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.fillStyle = o.col[0];
  g.beginPath();
  P.forEach(([x, y], i) => (i ? g.lineTo(x + (8 - x) * 0.18, y + (9 - y) * 0.18) : g.moveTo(x + (8 - x) * 0.18, y + (9 - y) * 0.18)));
  g.closePath();
  g.fill();
  g.fillStyle = o.col[1];
  g.fillRect(6, 5, 3, 2);
  g.fillRect(5, 7, 2, 2);
  g.fillStyle = o.col[2];
  g.fillRect(9, 11, 3, 2);
  return (oreIcons[id] = c.toDataURL());
}
const fmtMs = (ms) => {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}小时${m % 60 ? (m % 60) + "分" : ""}` : `${m}分钟`;
};

// ------------------------------------------------------------------ hub
export function showMineHub() {
  clear();
  document.body.classList.remove("ingame", "mining");
  playMusic("lobby");
  const m = load(), ms = mineState();
  const wait = refreshFreeShovels(FREE_SHOVEL_HOURS, FREE_SHOVEL_CAP);
  const s = el("div", "screen mine-hub");
  s.innerHTML = `<div class="sparkles"></div>
  <div class="topbar"><button class="btn gray small back-btn">◀ 返回</button><div class="logo outline">梦境矿场<span>搜 · 打 · 撤</span></div><div class="spacer"></div>
    <div class="pill o1" title="晶石"><div class="gem"></div><span class="tok">${m.tokens}</span></div>
    <div class="pill o1" title="矿石：升级矿场装备"><img class="pi" src="${iconURL("ore", 1)}" alt=""><span class="mats">${ms.mats}</span></div>
    <div class="pill o1" title="星砂：在梦境工坊兑换梦核、兑换卡、铲子"><img class="pi" src="${oreIcon("star")}" alt=""><span class="stars">${ms.stars}</span></div></div>
  <div class="mh-l">
    <div class="mh-h o1">选择铲子下潜（一把铲 = 一次下潜）</div>
    <div class="mh-shovels"></div>
    <div class="mh-free o1">${ms.shovels.cu >= FREE_SHOVEL_CAP ? `免费铜铲已存满（${FREE_SHOVEL_CAP} 把）` : `下一把免费铜铲：${fmtMs(wait)}后`}　·　打败首领必得铲子</div>
    <div class="mh-sup"></div>
    <button class="btn big mh-go"><span class="pt">下潜</span></button>
    <div class="mh-rec o1">最深 ${ms.best}m · 下潜 ${ms.dives} 次</div>
  </div>
  <div class="mh-r">
    <div class="mh-tabs"><button class="mh-tab on" data-t="ups">矿场装备</button><button class="mh-tab" data-t="shop">梦境工坊<i class="o1">星砂</i></button></div>
    <div class="mh-ups"></div>
  </div>`;
  uiRoot().appendChild(s);
  q(".back-btn", s).onclick = () => (sfx("click"), import("./lobby.js").then((L) => L.showLobby()));
  // shovels
  let pick = ["au", "ag", "cu"].find((k) => ms.shovels[k] > 0) || "cu";
  const sh = q(".mh-shovels", s);
  const drawShovels = () => {
    sh.innerHTML = Object.entries(SHOVELS).map(([k, d]) => `<button class="mshv${k === pick ? " on" : ""}${ms.shovels[k] ? "" : " none"}" data-k="${k}"><img src="${iconURL("shovel_" + k, 3)}" alt=""><b>${d.name}</b><span class="n o1">×${ms.shovels[k]}</span><small>${d.desc}</small></button>`).join("");
    sh.querySelectorAll(".mshv").forEach((b) => (b.onclick = () => {
      pick = b.dataset.k;
      sfx("click");
      drawShovels();
      updGo();
    }));
  };
  const go = q(".mh-go", s);
  const supCost = () => (ms.supply || []).reduce((a, k) => a + (SUPPLIES[k] ? SUPPLIES[k].cost : 0), 0);
  const updGo = () => {
    const n = ms.shovels[pick], c = supCost();
    go.disabled = !n;
    q(".pt", go).textContent = n ? `用${SHOVELS[pick].name}下潜${c ? ` · 💎${c}` : ""}` : `没有${SHOVELS[pick].name}`;
  };
  // supplies: toggles that stay selected between dives; paid when you dive
  const sup = q(".mh-sup", s);
  const drawSup = () => {
    const on = new Set(ms.supply || []);
    sup.innerHTML = `<span class="o1">补给</span>` + Object.entries(SUPPLIES).map(([k, d]) => `<button class="msup${on.has(k) ? " on" : ""}" data-k="${k}" title="${d.name}：${d.desc}"><img src="${iconURL(d.icon, 2)}" alt=""><b>${d.desc}</b><small>💎${d.cost}</small></button>`).join("");
    sup.querySelectorAll(".msup").forEach((b) => (b.onclick = () => {
      const k = b.dataset.k, cur = new Set(ms.supply || []);
      cur.has(k) ? cur.delete(k) : cur.add(k);
      toast(cur.has(k) ? `已勾选补给：${SUPPLIES[k].name}（${SUPPLIES[k].desc}，下潜时扣 💎${SUPPLIES[k].cost}）` : `取消补给：${SUPPLIES[k].name}`);
      ms.supply = [...cur];
      save();
      sfx("click");
      drawSup();
      updGo();
    }));
  };
  drawSup();
  go.onclick = () => {
    if (!ms.shovels[pick]) return;
    sfx("portal");
    app.startDive({ shovel: pick });
  };
  drawShovels();
  updGo();
  // right column: upgrades (矿石 + 💎) or 梦境工坊 (星砂)
  const ups = q(".mh-ups", s);
  let tab = "ups";
  const pills = () => {
    q(".tok", s).textContent = m.tokens;
    q(".mats", s).textContent = ms.mats;
    q(".stars", s).textContent = ms.stars;
  };
  const drawUps = () => {
    ups.innerHTML = Object.entries(UPGRADES).map(([k, u]) => {
      const l = ms.up[k], max = l >= u.max, c = max ? null : u.cost(l);
      const ok = c && ms.mats >= c.m && m.tokens >= c.v;
      return `<div class="mup"><div class="mu-t"><b class="o1">${u.name} <small>Lv${l}/${u.max}</small></b><span>${u.desc(l)}${max ? "" : `　→　${u.desc(l + 1)}`}</span></div>
        ${max ? `<span class="mu-max o1">已满级</span>` : `<button class="btn small ${ok ? "" : "gray"} mu-b" data-k="${k}"><span>升级</span><small>⛏${c.m} · 💎${c.v}</small></button>`}</div>`;
    }).join("");
    ups.querySelectorAll(".mu-b").forEach((b) => (b.onclick = () => {
      const k = b.dataset.k, c = UPGRADES[k].cost(ms.up[k]);
      if (ms.mats < c.m || m.tokens < c.v) return toast(ms.mats < c.m ? "矿石不足：去矿场里挖吧" : "晶石不足");
      ms.mats -= c.m;
      m.tokens -= c.v;
      ms.up[k]++;
      save();
      sfx("card");
      toast(`${UPGRADES[k].name} 升到 Lv${ms.up[k]}`);
      pills();
      drawUps();
    }));
  };
  const drawShop = () => {
    const cid = m.chars.includes(m.sel) ? m.sel : "deepseek", hasCore = !!(m.cores || {})[cid];
    const rows = Object.entries(WORKSHOP).map(([k, w]) => {
      const owned = k === "card" ? `持有 ${ms.cards}` : k === "core" ? (hasCore ? `${CHARS[cid].short} 已拥有` : `给 ${CHARS[cid].short}`) : `持有 ${ms.shovels[k]}`;
      const can = ms.stars >= w.cost && !(k === "core" && hasCore);
      const ico = k === "card" ? iconURL("cardgold", 2) : k === "core" ? `assets/head_${cid}.png` : iconURL("shovel_" + k, 2);
      return `<div class="mup ws ws-${k}"><img class="ws-i${k === "core" ? " core" : ""}" src="${ico}" alt=""><div class="mu-t"><b class="o1">${w.name} <small>${owned}</small></b><span>${w.desc}</span></div>
        <button class="btn small ${can ? "" : "gray"} ws-b" data-k="${k}"><span>${k === "core" && hasCore ? "已拥有" : "兑换"}</span><small>★${w.cost}</small></button></div>`;
    }).join("");
    ups.innerHTML = rows + `<div class="ws-note o1">梦核是长期目标：大约需要 5 小时的打宝收益。换角色后这里显示对应角色的梦核。${ms.cards ? `　<b class="ws-use">使用兑换卡 ›</b>` : ""}</div>`;
    ups.querySelectorAll(".ws-b").forEach((b) => (b.onclick = () => {
      const k = b.dataset.k, w = WORKSHOP[k];
      if (k === "core" && hasCore) return toast("这个角色已经有梦核了：去大厅换个角色");
      if (ms.stars < w.cost) return toast(`星砂不足（${ms.stars}/${w.cost}）：越深的宝箱星砂越多`);
      ms.stars -= w.cost;
      if (k === "card") ms.cards++;
      else if (k === "core") (m.cores = m.cores || {}), (m.cores[cid] = 1);
      else ms.shovels[k]++;
      save();
      sfx(k === "core" ? "ssr" : "card");
      toast(k === "core" ? `${CHARS[cid].short} 获得梦核：第 3 个天赋槽已开启！` : `获得 ${w.name}`, 2200);
      pills();
      drawShovels();
      updGo();
      drawShop();
    }));
    const use = q(".ws-use", ups);
    if (use) use.onclick = () => showExchange(() => showMineHub());
  };
  const draw = () => (tab === "ups" ? drawUps() : drawShop());
  s.querySelectorAll(".mh-tab").forEach((b) => (b.onclick = () => {
    tab = b.dataset.t;
    s.querySelectorAll(".mh-tab").forEach((x) => x.classList.toggle("on", x === b));
    sfx("click");
    draw();
  }));
  draw();
}

// ------------------------------------------------------------------ exchange card: pick any SSR that isn't maxed
export function showExchange(after) {
  const m = load(), ms = mineState();
  const list = GACHA.pool.filter((it) => it.r === "SSR");
  const md = el("div", "modal ex-modal");
  md.innerHTML = `<div class="panel ex-panel"><div class="kit-head"><img class="kit-face" src="${iconURL("cardgold", 3)}" alt=""><div><h2 class="outline">兑换卡 ×${ms.cards}</h2><div class="kit-sub o1">每张可直接兑换 1 个未满级的 SSR · 兑换卡在梦境工坊用星砂换</div></div><button class="btn gray small x-btn">关闭</button></div>
    <div class="kit-list">${list.map((it) => {
      const lv = m.talents[it.id] || 0, full = lv >= it.max;
      return `<button class="kcard${full ? " no" : ""}" data-id="${it.id}"><img src="${iconURL(it.id, 2)}" alt=""><span class="kt"><b>${it.name}${it.max > 1 ? ` Lv${lv}/${it.max}` : ""}</b><small>${it.desc}</small></span><i class="ktag o1">${full ? "已满级" : ms.cards ? "兑换" : "缺兑换卡"}</i></button>`;
    }).join("")}</div></div>`;
  uiRoot().appendChild(md);
  const close = () => (md.remove(), after && after());
  q(".x-btn", md).onclick = close;
  md.querySelectorAll(".kcard").forEach((b) => (b.onclick = () => {
    const it = GACHA.pool.find((p) => p.id === b.dataset.id), lv = m.talents[it.id] || 0;
    if (lv >= it.max) return toast("已经满级了");
    if (!ms.cards) return toast("没有兑换卡：在梦境工坊用星砂兑换");
    ms.cards--;
    m.talents[it.id] = lv + 1;
    if (it.card && !m.cards.includes(it.card)) m.cards.push(it.card);
    save();
    sfx("ssr");
    toast(`兑换成功：${it.name}${it.max > 1 ? " Lv" + (lv + 1) : ""}`, 2400);
    close();
  }));
}

// ------------------------------------------------------------------ HUD during a dive
let hud = null, cache = {};
export function showMineHud(dive) {
  clear();
  document.body.classList.add("ingame", "mining");
  hud = el("div", "hud mhud");
  const cid = dive.o.cid;
  hud.innerHTML = `
   <div class="tl"><div class="face"><img src="assets/head_${cid}.png"></div>
     <div class="bars"><div class="bar hp"><i></i><span class="o1"></span></div><div class="bar en"><i></i><span class="o1"></span></div><div class="bar ox"><i></i><span class="o1"></span></div><div class="mrel"></div></div></div>
   <div class="tc o1"><div class="depth"></div><div class="lite"></div></div>
   <div class="tr"><div class="bag o1"></div><button class="btn small gray pausebtn">Ⅱ</button></div>
   <div class="gauge"><i class="me"></i></div>
   <div class="keys o1">A/D 移动 · S 向下挖 · W 喷气上升（耗电）· 顶着墙走 = 横挖 · J 攻击 · K 炸药 · L 撤离信标</div>
   <div class="pcskills o1">
     <div class="pcs s-skill"><i class="bface"></i><img class="ico" alt=""><b class="cnt"></b><span class="k">K</span></div>
     <div class="pcs ult s-ult"><i class="bface"></i><img class="ico" alt=""><b class="cnt"></b><span class="k">L</span></div>
     <div class="pcs big s-atk"><i class="bface"></i><img class="ico" alt=""><span class="k">J</span></div>
   </div>`;
  uiRoot().appendChild(hud);
  hud.querySelector(".pausebtn").onclick = () => app.pause();
  // depth gauge: zone bands, seal, lifts
  const gauge = q(".gauge", hud), rows = dive.rows;
  for (const z of ZONES) {
    if (z.from >= rows) continue;
    const b = el("i", "band " + z.id);
    b.style.top = (z.from / rows) * 100 + "%";
    b.style.height = ((Math.min(z.to, rows) - z.from) / rows) * 100 + "%";
    b.title = z.name;
    gauge.appendChild(b);
  }
  if (dive.maxDepth < rows - 2) {
    const s = el("i", "seal");
    s.style.top = (dive.maxDepth / rows) * 100 + "%";
    gauge.appendChild(s);
  }
  for (const l of dive.lifts) {
    const s = el("i", "lift");
    s.style.top = (l.r / rows) * 100 + "%";
    gauge.appendChild(s);
  }
  // touch + PC buttons: bomb on the skill button, beacon on the ult button
  const icons = { atk: iconURL("pick", 4), skill: iconURL("bomb", 4), ult: iconURL("beacon", 4) };
  for (const k in icons) document.querySelectorAll(`.b-${k} .ico, .s-${k} .ico`).forEach((im) => (im.src = icons[k]));
  const lbs = { atk: "攻击", skill: "炸药", ult: "撤离" };
  for (const k in lbs) document.querySelectorAll(`.b-${k} .lb`).forEach((n) => (n.textContent = lbs[k]));
  cache = {};
}
export function hideMineHud() {
  document.body.classList.remove("mining");
  hud = null;
}
export function updateMineHud(dive) {
  if (!hud) return;
  const p = dive.p, set = (k, v, fn) => cache[k] !== v && ((cache[k] = v), fn(v));
  set("hp", p.hp + "/" + p.maxHp, () => {
    q(".hp i", hud).style.width = (p.hp / p.maxHp) * 100 + "%";
    q(".hp span", hud).textContent = `❤ ${p.hp}/${p.maxHp}`;
  });
  set("en", Math.ceil(p.energy), (v) => {
    q(".en i", hud).style.width = (p.energy / p.maxE) * 100 + "%";
    q(".en span", hud).textContent = `⚡ ${v}/${p.maxE}`;
    q(".en", hud).classList.toggle("low", p.energy < p.maxE * 0.2);
  });
  set("ox", Math.ceil(p.o2) + "|" + (p.o2 < p.maxO2), () => {
    const ox = q(".ox", hud);
    ox.style.display = p.o2 < p.maxO2 - 0.05 ? "" : "none";
    q(".ox i", hud).style.width = (p.o2 / p.maxO2) * 100 + "%";
    q(".ox span", hud).textContent = `氧气 ${Math.ceil(p.o2)}s`;
    ox.classList.toggle("low", p.o2 < 6);
  });
  const row = Math.max(0, Math.floor(p.y / MT));
  set("dep", row, (v) => (q(".depth", hud).textContent = v <= 0 ? "地面 · 营地" : `${v}m · ${zoneAt(v).name}`));
  if (dive.lite) set("lite", Math.ceil(dive.lite.left ?? dive.lite.time), (v) => (q(".lite", hud).textContent = `裂隙关闭 ${v}s`));
  set("bag", dive.bag.length + "|" + dive.stars + "|" + dive.bagCap, () => {
    q(".bag", hud).innerHTML = `🎒 ${dive.bag.length}/${dive.bagCap}<small>💎${dive.bagValue()}</small>${dive.stars ? `<small class="fr">★${dive.stars}</small>` : ""}`;
    q(".bag", hud).classList.toggle("full", dive.bag.length >= dive.bagCap);
  });
  set("rel", JSON.stringify(dive.rel), () => {
    q(".mrel", hud).innerHTML = Object.entries(dive.rel).map(([id, n]) => `<span class="${RELICS[id].curse ? "curse" : ""}" title="${RELICS[id].name}：${RELICS[id].desc}"><img src="${iconURL(RELICS[id].icon, 2)}" alt="">${n > 1 ? `<b>${n}</b>` : ""}</span>`).join("");
  });
  set("keys", dive.time > 15, (v) => q(".keys", hud).classList.toggle("gone", v));
  set("g", Math.round((p.y / MT / dive.rows) * 200), () => (q(".gauge .me", hud).style.top = clamp01(p.y / MT / dive.rows) * 100 + "%"));
  set("cnt", p.bombs + "|" + p.beacons, () => {
    document.querySelectorAll(".s-skill .cnt").forEach((n) => (n.textContent = p.bombs));
    document.querySelectorAll(".s-ult .cnt").forEach((n) => (n.textContent = p.beacons));
    document.querySelectorAll(".b-skill .cdt").forEach((n) => (n.textContent = "×" + p.bombs));
    document.querySelectorAll(".b-ult .cdt").forEach((n) => (n.textContent = "×" + p.beacons));
    document.querySelectorAll(".b-skill, .s-skill").forEach((n) => n.classList.toggle("empty", !p.bombs));
    document.querySelectorAll(".b-ult, .s-ult").forEach((n) => n.classList.toggle("empty", !p.beacons));
  });
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ------------------------------------------------------------------ results
const HOW = {
  extract: ["安全撤离！", "背包全部带出"],
  timeup: ["裂隙关闭", "收获全部带出"],
  power: ["电量耗尽 · 紧急回收", "只带回了一半背包"],
  dead: ["倒下了…", "只带回了 30% 的背包"],
};
export function showMineResult(res, again, back) {
  const ms = mineState(), m = load();
  const counts = {};
  for (const id of res.kept) counts[id] = (counts[id] || 0) + 1;
  const [title, sub] = HOW[res.how] || HOW.extract;
  const md = el("div", "modal result mres");
  md.innerHTML = `<div class="panel res2 ${res.how === "dead" ? "lose" : "win"}">
    <div class="res-l"><h2 class="outline">${title}</h2><div class="res-sub o1">${sub}${res.lost ? `（丢失 ${res.lost} 件）` : ""}</div>
      <div class="res-gain"><span class="big outline">+${res.value}</span><div class="gem"></div></div>
      <div class="res-chip o1"><span>矿石</span><b>+${res.mats}</b></div>
      ${res.stars ? `<div class="res-chip o1"><span>★ 星砂</span><b>+${res.stars}${res.starsFound > res.stars ? `（丢失 ${res.starsFound - res.stars}）` : ""}</b></div>` : ""}
      ${res.record ? `<div class="res-chip o1"><span>最深纪录</span><b>${res.depth}m</b></div>` : ""}
      ${res.relics && Object.keys(res.relics).length ? `<div class="mres-rel o1">遗物 ${Object.keys(res.relics).map((id) => `<img src="${iconURL(RELICS[id].icon, 2)}" title="${RELICS[id].name}" alt="">`).join("")}</div>` : ""}</div>
    <div class="res-r"><div class="mres-items">${Object.keys(counts).length ? Object.entries(counts).sort((a, b) => ORES[b[0]].v - ORES[a[0]].v).map(([id, n]) => `<div class="mri"><img src="${oreIcon(id)}" alt=""><span>${ORES[id].name}</span><b>×${n}</b></div>`).join("") : `<div class="muted">两手空空…</div>`}</div>
      <div class="res-stats"><div class="res-st"><span>到达深度</span><b class="outline">${res.depth}m</b></div><div class="res-st"><span>挖掘方块</span><b class="outline">${res.dug}</b></div><div class="res-st"><span>击败怪物</span><b class="outline">${res.kills}</b></div><div class="res-st"><span>剩余铲子</span><b class="outline">${ms.shovels.cu + ms.shovels.ag + ms.shovels.au}</b></div></div>
      <div class="row acts"></div></div></div>`;
  const a = q(".acts", md);
  if (again) a.appendChild(btn("再次下潜", "", again));
  a.appendChild(btn(again ? "返回矿场" : "继续", "blue", back));
  uiRoot().appendChild(md);
  void m;
}

// ------------------------------------------------------------------ relic pick (pick 1 of 3; the dive waits)
export function showRelicPick(dive, onPick) {
  const md = el("div", "modal cards-modal relic-modal");
  const touch = document.body.classList.contains("touchmode");
  md.innerHTML = `<div class="cm-wrap"><div class="cm-title outline">梦境遗物</div><div class="cm-sub o1">三选一 · 只在本次下潜生效</div><div class="cards"></div><div class="muted cm-hint">${touch ? "点击选择" : "点击或按 1 / 2 / 3 选择"}</div></div>`;
  const wrap = q(".cards", md), els = [];
  dive.choice.forEach((id, i) => {
    const r = RELICS[id], lv = dive.rel[id] || 0;
    const d = el("div", "card2 " + (r.curse ? "SSR" : "SR"));
    d.style.setProperty("--rc", r.curse ? "#ff6ab0" : "#b07dff");
    d.style.animationDelay = i * 0.09 + "s";
    const pips = r.max > 1 ? `<div class="c-pips">${Array.from({ length: r.max }, (_, k) => `<i class="${k < lv ? "on" : k === lv ? "new" : ""}"></i>`).join("")}</div>` : `<div class="c-pips one">唯一</div>`;
    d.innerHTML = `<i class="c-frame"></i><div class="c-rar o1">${r.curse ? "诅咒" : "遗物"}</div><div class="c-art" style="--ac:${r.curse ? "#ff6ab0" : "#b07dff"}"><i class="c-rays"></i><img class="c-ico" src="${iconURL(r.icon, 4)}" alt=""></div><div class="c-body"><div class="c-name">${r.name}</div><div class="c-desc">${r.desc}</div>${pips}</div><div class="c-key">${i + 1}</div>`;
    d.onclick = () => pick(id, d);
    wrap.appendChild(d);
    els.push(d);
  });
  let done = false;
  function pick(id, d) {
    if (done) return;
    done = true;
    removeEventListener("keydown", key);
    md.classList.add("picking");
    for (const o of els) o.classList.add(o === d ? "picked" : "dropped");
    setTimeout(() => {
      md.remove();
      document.body.classList.remove("cards-open");
      onPick(id);
    }, 480);
  }
  function key(e) {
    if (e.repeat) return;
    const k = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
    if (k != null && dive.choice[k]) pick(dive.choice[k], els[k]);
  }
  setTimeout(() => addEventListener("keydown", key), 350);
  document.body.classList.add("cards-open");
  uiRoot().appendChild(md);
  sfx("card");
}

// ------------------------------------------------------------------ 地下商人 (pays with ore from the bag)
export function showMerchant(dive, onClose) {
  const md = el("div", "modal mshop-md");
  const draw = () => {
    const offers = dive.shopOffers(), bv = dive.bagValue();
    md.innerHTML = `<div class="panel mshop"><div class="ms-h"><h2 class="outline">地下商人</h2><span class="o1">用背包里的矿物付款（从最便宜的开始扣）· 背包价值 💎${bv}</span></div>
      <div class="ms-list">${offers.map((o) => `<div class="ms-it${o.left <= 0 ? " sold" : ""}"><img src="${iconURL(o.icon, 3)}" alt=""><div class="mu-t"><b class="o1">${o.name}</b><span>${o.desc}${o.left > 0 ? `　剩 ${o.left}` : "　售罄"}</span></div>
        <button class="btn small ${o.left > 0 && bv >= o.price ? "" : "gray"}" data-k="${o.k}"><span>${o.left > 0 ? "购买" : "售罄"}</span><small>💎${o.price}</small></button></div>`).join("")}</div>
      <div class="row ms-acts"></div></div>`;
    md.querySelectorAll(".ms-it button").forEach((b) => (b.onclick = () => {
      const k = b.dataset.k, o = dive.shopOffers().find((x) => x.k === k);
      if (o.left <= 0) return;
      if (dive.bagValue() < o.price) return toast("背包里的矿物不够付款");
      dive.buy(k);
      toast(`买下了 ${o.name}`);
      if (k === "relic") return close();
      draw();
    }));
    q(".ms-acts", md).appendChild(btn("离开", "blue", () => (dive.shop = false, close())));
  };
  function close() {
    md.remove();
    onClose && onClose();
  }
  draw();
  uiRoot().appendChild(md);
  sfx("card");
}
