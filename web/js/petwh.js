// 宠物仓库：从主页角色右上方的宠物入口进入。右侧是库存格子（第一格是宠物蛋，其后每只已孵化的宠物；上锁的排在前面），
// 左侧是选中宠物：动画（左上角上锁按钮）、名字旁的异色 / 品质标签、词条（数值与范围）、经验条，以及
// 出战 / 进化 / 注入经验 / 融合 / 详情 / 放生。孵蛋与融合在面板内揭晓：蛋摇晃、裂开、宠物现身。图鉴按种类列出原色与各异色。点面板外关闭。
import { PETS, PET_ORDER, PET_STAGES, PET_EVOLVE, PET_MAX_XP, TRAITS, QUALITY, FUSE_SHINY, FUSE_SHINY_PARENT, EGGS, EGG_KINDS, PET_ITEMS, DEX_REWARDS, petQuality, petPortrait, skinsOf, rainbowChance, eggCount, traitCap, traitBand } from "./petdata.js";
import { PET_SKINS, skinnedFrame } from "./petskins.js";
import { petState, findPet, equipPet, injectXP, injectTarget, toggleLock, releasePet, releaseXP, fusePets, spendable, itemFor, useItem, incubate, speedSlot, speedCost, hatchSlot, slotLeft, dexCount, dexClaimable, claimDex } from "./petsave.js";
import { mineState } from "./save.js";
import { uiRoot, btn, toast } from "./ui.js";
import { el } from "./util.js";
import { sfx } from "./audio.js";
import { petPreview, setPetPreview } from "./petpreview.js";
import { showPetDetail } from "./petui.js";

// shell colours by egg kind: [light, mid, shadow, spots] — 宠物蛋 cream / teal, UR blue / white, HUR purple / gold
const EGG_PAL = { base: ["#fffaf0", "#f4ead4", "#d8c8a8", "#4ec0b0"], ur: ["#e8f6ff", "#8cc8ff", "#4a86d8", "#ffffff"], hur: ["#f4e0ff", "#c48aff", "#8048c8", "#ffd84a"] };
/** a code-drawn pixel egg (24 x 30) in its kind's colours; crack 0..3 draws that many crack segments */
export function drawEgg(c, crack = 0, kind = "base") {
  const P = EGG_PAL[kind] || EGG_PAL.base;
  const g = c.getContext("2d"), W = 24, H = 30;
  c.width = W;
  c.height = H;
  const inside = (x, y) => {
    const u = (x + 0.5 - 12) / 10.5, v = (y + 0.5 - 17) / 12.5;
    return u * u + v * v * (v < 0 ? 1.15 : 0.92) < 1;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) {
      if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) (g.fillStyle = "#1a1020"), g.fillRect(x, y, 1, 1);
      continue;
    }
    const lit = (x - 8) * (x - 8) + (y - 10) * (y - 10) < 18, dark = x > 16 || y > 25;
    g.fillStyle = lit ? P[0] : dark ? P[2] : P[1];
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = P[3];
  for (const [x, y, w] of [[6, 14, 3], [14, 9, 2], [15, 18, 3], [9, 22, 2], [17, 13, 1], [11, 17, 1]]) g.fillRect(x, y, w, w > 1 ? 2 : 1);
  g.fillStyle = "#1a1020";
  const seg = [[[7, 12], [9, 14], [11, 12], [13, 14]], [[13, 14], [15, 12], [17, 14]], [[11, 12], [12, 9], [11, 7]]];
  for (let k = 0; k < Math.min(crack, seg.length); k++) {
    const pts = seg[k];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let t = 0; t <= n; t++) g.fillRect(Math.round(x0 + ((x1 - x0) * t) / n), Math.round(y0 + ((y1 - y0) * t) / n), 1, 1);
    }
  }
}
/** a pet's portrait into a box: the stage art, recoloured for an 异色 */
function portrait(box, p) {
  const im = new Image();
  im.src = petPortrait(p.id, p.stage);
  if (!p.skin) return box.replaceChildren(im);
  const c = document.createElement("canvas");
  box.replaceChildren(c);
  const go = () => {
    const cell = skinnedFrame(p.skin, im, 0, 0, im.naturalWidth, im.naturalHeight, 1.5);
    c.width = cell.width;
    c.height = cell.height;
    c.getContext("2d").drawImage(cell, 0, 0);
  };
  im.complete && im.naturalWidth ? go() : (im.onload = go);
}
const order = (st) => [...st.list].sort((a, b) => (b.lock - a.lock) || ((b.uid === st.equipped) - (a.uid === st.equipped)) || (!!b.skin - !!a.skin) || (b.stage - a.stage) || (petQuality(b) - petQuality(a)) || (b.t - a.t));
/** one trait row: name, value, where it sits in its quality's range, and that range (流彩 shows the 150% cap too) */
const traitLine = (p) => ([k, v]) => {
  const t = TRAITS[k], [lo, hi] = traitBand(p.q, k), cap = traitCap(p, k), pos = Math.min(1, (v - lo) / Math.max(1, cap - lo));
  return `<div class="wh-tr"><b>${t.name}</b><span class="wh-td">${t.desc} ${t.minus ? "-" : "+"}${v}%</span><i class="wh-tb"><u style="width:${Math.round(8 + pos * 92)}%"></u></i><small>${lo}~${cap}%</small></div>`;
};

/** the quality chip, and the 异色 chip when there is one (流彩 shows once, as its quality) */
const tags = (p) => {
  const q = petQuality(p), Q = QUALITY[q];
  const skin = p.skin && p.skin !== "flow" ? `<span class="wh-chip shiny">${PET_SKINS[p.skin].name}</span>` : "";
  return skin + `<span class="wh-chip${Q.rainbow ? " rainbow" : ""}" style="--qc:${Q.col}">${Q.name}</span>`;
};
const qBar = (q) => (QUALITY[q].rainbow ? "linear-gradient(90deg,#ff6a6a,#ffd84a,#6ee08a,#5aa8ff,#c27bff)" : QUALITY[q].col);

export function showWarehouse(onClose) {
  document.querySelector(".wh-modal")?.remove();
  const md = el("div", "modal pet-modal wh-modal");
  md.innerHTML = `<section class="wh-panel" role="dialog" aria-modal="true" aria-labelledby="wh-title">
    <header class="topbar"><button class="btn gray small back-btn">◀ 返回</button><h2 id="wh-title" class="outline">宠物仓库</h2><span class="wh-hbtn"></span><div class="wh-wallet o1"></div></header>
    <div class="wh-body">
      <div class="wh-detail"></div>
      <div class="wh-right"><div class="wh-slots"></div><div class="wh-grid"></div></div>
    </div></section>`;
  const $ = (s) => md.querySelector(s);
  const close = () => (md.remove(), onClose?.());
  md.querySelector(".back-btn").onclick = () => (sfx("click"), close());
  md.onkeydown = (e) => e.key === "Escape" && (e.stopPropagation(), close());
  uiRoot().appendChild(md);
  let sel = petState().equipped || order(petState())[0]?.uid || null, confirmRelease = false, canvas = null, fuseA = null;
  $(".wh-hbtn").appendChild(btn("图鉴", "small", () => (sfx("click"), codex())));

  const wallet = () => {
    const st = petState();
    const rc = rainbowChance(st.rb) * 100;
    const items = Object.entries(PET_ITEMS).filter(([k]) => st.items[k] > 0).map(([k, it]) => `<span>${it.name} <b>${st.items[k]}</b></span>`).join("");
    $(".wh-wallet").innerHTML = `<span>宠物蛋 <b>${eggCount(st)}</b></span>${items}<span>经验池 <b>${st.pool}</b></span><span>星砂 <b>${mineState().stars}</b></span><span title="每次孵化或融合没出流彩，下次概率 +0.05%，最高 5%；出了流彩后回到 0.2%">流彩 <b class="wh-rc">${rc.toFixed(rc < 1 ? 2 : 1)}%</b></span>`;
  };
  const grid = () => {
    const st = petState(), g = $(".wh-grid");
    g.replaceChildren();
    // one card per kind of egg you have (the plain one always shows, as the place eggs go)
    for (const k of EGG_KINDS) {
      const n = st.eggs[k];
      if (k !== "base" && !n) continue;
      const fl = EGGS[k].floor, egg = el("button", `wh-card wh-egg e-${k}` + (n ? "" : " none"), `<canvas></canvas><b class="o1">${k === "base" ? "孵化" : `${QUALITY[fl].name}起`}</b><i class="wh-n o1">×${n}</i>`);
      drawEgg(egg.querySelector("canvas"), 0, k);
      egg.title = n ? `${EGGS[k].name}：放入孵化槽，${EGGS[k].min} 分钟后孵化出${QUALITY[fl].name}或更高品质` : "击败首领、矿场撤离可获得宠物蛋，积攒也可兑换";
      egg.onclick = () => {
        if (!n) return toast("击败首领、矿场撤离可获得宠物蛋，积攒也可兑换");
        const r = incubate(k);
        if (!r.ok) return toast(r.reason);
        sfx("click");
        toast(`放入孵化槽，${EGGS[k].min} 分钟后孵化`);
        refresh();
      };
      g.appendChild(egg);
    }
    const A = fuseA && findPet(fuseA, st);
    for (const p of order(st)) {
      const q = petQuality(p), mate = A && p !== A && p.id === A.id && spendable(p, st);
      const c = el("button", "wh-card" + (p.uid === sel ? " on" : "") + (p.skin ? (p.skin === "flow" ? " rainbow" : " shiny") : "") + (A ? (p === A ? " fuse-a" : mate ? " fuse-ok" : " fuse-no") : ""), `<span class="wh-pic"></span><i class="wh-q" style="background:${qBar(q)}"></i><span class="wh-st o1">${PET_STAGES[p.stage - 1]}</span>`);
      c.style.setProperty("--pc", PETS[p.id].color);
      c.dataset.uid = p.uid;
      portrait(c.querySelector(".wh-pic"), p);
      if (p.lock) c.insertAdjacentHTML("beforeend", `<i class="wh-lock">🔒</i>`);
      if (p.uid === st.equipped) c.insertAdjacentHTML("beforeend", `<i class="wh-on o1">出战</i>`);
      c.onclick = () => {
        if (A) {
          if (p === A) return cancelFuse();
          if (!mate) return toast(p.id !== A.id ? "只能和同种宠物融合" : "上锁或出战中的宠物不能融合");
          return fuseConfirm(A, p);
        }
        if (sel === p.uid) return;
        sfx("click");
        sel = p.uid;
        confirmRelease = false;
        refresh();
      };
      g.appendChild(c);
    }
  };
  const detail = () => {
    const st = petState(), p = sel && findPet(sel, st), box = $(".wh-detail");
    if (!p) {
      canvas = null;
      box.innerHTML = `<div class="wh-empty o1"><canvas></canvas><p>${eggCount(st) ? "点右侧的宠物蛋孵化你的第一只宠物。" : "还没有宠物。击败首领可获得宠物蛋，也可以在图鉴里用积攒兑换。"}</p><div class="wh-btns"></div></div>`;
      drawEgg(box.querySelector("canvas"));
      box.querySelector(".wh-btns").appendChild(btn("图鉴", "small", () => (md.remove(), showPetDetail(null, () => showWarehouse(onClose)))));
      return;
    }
    const d = PETS[p.id], q = petQuality(p), to = injectTarget(p), next = PET_EVOLVE[p.stage + 1], ms = mineState();
    if (!canvas || !canvas.isConnected) {
      box.innerHTML = `<div class="wh-view"><div class="wh-anim"></div><button class="wh-lockbtn" aria-label="上锁"></button></div>
        <div class="wh-head" title="点击上方宠物查看技能详情"><b class="wh-name outline"></b><span class="wh-tags o1"></span></div>
        <div class="wh-traits o1"></div><div class="wh-xp"><u></u><span class="o1"></span></div><div class="wh-btns"></div>`;
      canvas = petPreview(box.querySelector(".wh-anim"), p.id, p.stage, "lobby", false, [320, 220], false, true);
      box.querySelector(".wh-view").insertAdjacentHTML("beforeend", `<span class="wh-hint o1">点击查看详情</span>`);
    }
    // tap the pet on the stage: its detail panel (skills, demos)
    box.querySelector(".wh-anim").onclick = () => (sfx("click"), md.remove(), showPetDetail(p.uid, () => showWarehouse(onClose)));
    setPetPreview(canvas, { id: p.id, stage: p.stage, skin: p.skin });
    box.style.setProperty("--pc", d.color);
    box.querySelector(".wh-name").textContent = d.name;
    box.querySelector(".wh-name").style.color = d.color;
    box.querySelector(".wh-tags").innerHTML = tags(p);
    const lk = box.querySelector(".wh-lockbtn");
    lk.textContent = p.lock ? "🔒" : "🔓";
    lk.classList.toggle("on", p.lock);
    lk.title = p.lock ? "已上锁：不能放生（点击解锁）" : "上锁：防止误放生，排在前面";
    lk.onclick = () => (sfx("click"), toast(toggleLock(p.uid) ? "已上锁" : "已解锁"), (confirmRelease = false), refresh());
    box.querySelector(".wh-traits").innerHTML = p.traits.map(traitLine(p)).join("");
    // one bar across the row, its text centred on it: stage, xp (or 经验已满) and the stars the next evolution costs
    const from = to === PET_EVOLVE[3].xp ? PET_EVOLVE[2].xp : 0;
    box.querySelector(".wh-xp u").style.width = Math.round(Math.min(1, to ? (p.xp - from) / (to - from) : 1) * 100) + "%";
    box.querySelector(".wh-xp span").textContent = `${PET_STAGES[p.stage - 1]} · ` + (to ? `经验 ${p.xp}/${to}` : "经验已满");
    // buttons: the pet's own actions on the left, 详情 / 放生 apart on the right
    const b = box.querySelector(".wh-btns");
    b.replaceChildren();
    const carried = st.equipped === p.uid;
    const go = btn(carried ? "休息" : "出战", carried ? "small gray" : "small blue", () => (equipPet(carried ? null : p.uid), sfx("click"), refresh()));
    b.appendChild(go);
    if (to) {
      const inj = btn("注入经验", "small green", () => {
        const r = injectXP(p.uid);
        if (!r.ok) return toast(r.reason);
        sfx(r.evolved ? "ssr" : "heal");
        toast(r.evolved ? `${d.name}进化为${PET_STAGES[r.stage - 1]}！` : `注入 ${r.give} 经验`);
        refresh();
      });
      inj.disabled = st.pool <= 0;
      inj.title = `从经验池注入，最多到 ${to}`;
      b.appendChild(inj);
    }
    // 淬炼: 淬灵露 (流彩晶 for a 流彩 pet) raises a random trait; shown while you have the item
    const it = itemFor(p);
    if (st.items[it.k] > 0) {
      const up = btn("淬炼", "small", () => {
        const r = useItem(p.uid);
        if (!r.ok) return toast(r.reason);
        sfx("heal");
        toast(`${r.item}：${TRAITS[r.key].name} +${r.add}%`);
        refresh();
      });
      up.disabled = !it.room;
      up.title = it.room ? `用 1 个${it.item.name}（剩 ${st.items[it.k]}）：${it.item.desc}` : "词条都已到上限";
      b.appendChild(up);
    }
    const fu = btn("融合", "small pink", () => startFuse(p));
    fu.disabled = !spendable(p, st) || !st.list.some((o) => o !== p && o.id === p.id && spendable(o, st));
    fu.title = fu.disabled ? "需要另一只未上锁、未出战的同种宠物" : "选另一只同种宠物融合";
    b.appendChild(fu);
    const gap = el("span", "wh-gap");
    b.appendChild(gap);
    const rel = btn(confirmRelease ? "确认放生" : "放生", "small red", () => {
      if (p.lock) return toast("已上锁，先解锁");
      if (carried) return toast("出战中的宠物不能放生");
      if (!confirmRelease) return (confirmRelease = true), sfx("click"), toast(`再点一次放生，经验池 +${releaseXP(p)}`), detail();
      const r = releasePet(p.uid);
      if (!r.ok) return toast(r.reason);
      sfx("coin");
      toast(`经验池 +${r.xp}`);
      sel = petState().equipped || order(petState())[0]?.uid || null;
      confirmRelease = false;
      canvas = null;
      refresh();
    });
    rel.disabled = p.lock || carried;
    rel.title = p.lock ? "已上锁" : carried ? "出战中" : `放生后经验池 +${releaseXP(p)}`;
    if (confirmRelease) rel.textContent = `确认 +${releaseXP(p)}`;
    b.appendChild(rel);
  };
  // ---- 孵化槽: three slots above the grid; an egg counts down in real time, 加速 pays 星砂, a ready one hatches on tap
  const mmss = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  const slots = () => {
    const st = petState(), box = $(".wh-slots");
    box.replaceChildren(el("span", "wh-sl-h o1", "孵化槽"));
    st.slots.forEach((sl, i) => {
      const left = slotLeft(sl), c = el("div", "wh-slot" + (!sl ? " empty" : left ? "" : " ready"));
      if (!sl) c.innerHTML = `<span class="o1">空</span>`;
      else {
        c.innerHTML = `<canvas></canvas><div class="wh-sl-t"><b class="o1">${left ? mmss(left) : "可孵化"}</b><i><u style="width:${Math.round((1 - left / sl.dur) * 100)}%"></u></i></div>`;
        drawEgg(c.querySelector("canvas"), left ? 0 : 1, sl.kind);
        if (left) {
          const sp = btn(`加速 ${speedCost(sl)}`, "small", () => {
            const r = speedSlot(i);
            if (!r.ok) return toast(r.reason);
            sfx("coin");
            refresh();
          });
          sp.title = `花 ${speedCost(sl)} 星砂立即完成（每分钟 4 星砂）`;
          c.querySelector(".wh-sl-t").appendChild(sp);
        } else c.onclick = () => {
          const r = hatchSlot(i);
          if (r) reveal(r.pet, false, r.kind);
        };
      }
      box.appendChild(c);
    });
  };
  const tickSlots = setInterval(() => (md.isConnected ? petState().slots.some((x) => x) && slots() : clearInterval(tickSlots)), 1000);
  const refresh = () => (wallet(), slots(), grid(), detail(), dexDot());
  const dexDot = () => $(".wh-hbtn .btn")?.classList.toggle("dot", dexClaimable().length > 0);

  // ---- hatching / fusion, revealed over the panel: shake, three cracks, the pet appears (异色 gold, 流彩 rainbow)
  const reveal = (p, again, kind = "base") => {
    const q = petQuality(p), Q = QUALITY[q], ov = el("div", "wh-hatch" + (p.skin ? " shiny" : "") + (Q.rainbow ? " rainbow" : ""));
    ov.innerHTML = `<div class="wh-hstage"><canvas class="wh-hegg"></canvas><div class="wh-hpet"></div></div><div class="wh-hinfo"></div><div class="wh-btns"></div>`;
    $(".wh-panel").appendChild(ov);
    const eggC = ov.querySelector(".wh-hegg");
    drawEgg(eggC, 0, kind);
    sfx("click");
    let k = 0;
    const tick = setInterval(() => {
      k++;
      if (!ov.isConnected) return clearInterval(tick);
      if (k <= 3) (drawEgg(eggC, k, kind), sfx("hit"), eggC.classList.remove("shake"), void eggC.offsetWidth, eggC.classList.add("shake"));
      else {
        clearInterval(tick);
        ov.classList.add("open");
        sfx(p.skin || q >= 4 ? "ssr" : "card");
        const c = petPreview(ov.querySelector(".wh-hpet"), p.id, p.stage, "lobby", false, [280, 200], false, true);
        setPetPreview(c, { skin: p.skin });
        const head = Q.rainbow ? `<div class="wh-shiny rainbow outline">流彩！</div>` : p.skin ? `<div class="wh-shiny outline">异色 · ${PET_SKINS[p.skin].name}！</div>` : "";
        ov.querySelector(".wh-hinfo").innerHTML = `${head}<div class="wh-head"><b class="outline" style="color:${PETS[p.id].color}">${PETS[p.id].name}</b><span class="wh-tags o1">${tags(p)}</span></div><div class="wh-traits o1">${p.traits.map(traitLine(p)).join("")}</div>`;
        const bb = ov.querySelector(".wh-btns"), done = () => (ov.remove(), (sel = p.uid), (canvas = null), refresh());
        bb.appendChild(btn("收下", "small blue", done));
      }
    }, 420);
  };
  // ---- fusion: pick the first pet (融合), then a second of the same kind in the grid, confirm, reveal
  const startFuse = (p) => {
    fuseA = p.uid;
    sfx("click");
    toast("选择另一只同种宠物（再点它自己取消）");
    md.classList.add("fusing");
    grid();
  };
  const cancelFuse = () => ((fuseA = null), md.classList.remove("fusing"), grid());
  const fuseConfirm = (A, B) => {
    const ov = el("div", "wh-hatch wh-fuse");
    const shiny = Math.round((A.skin || B.skin ? FUSE_SHINY_PARENT : FUSE_SHINY) * 100);
    ov.innerHTML = `<div class="wh-fpair"><span class="wh-pic a"></span><b class="outline">+</b><span class="wh-pic b"></span><b class="outline">→</b><canvas class="wh-fegg"></canvas></div>
      <div class="wh-hinfo o1">两只${PETS[A.id].name}融合成一只幼年体<br>词条择优 · 异色 ${shiny}%${A.skin || B.skin ? "（可能继承亲代异色）" : ""} · 流彩 ${(rainbowChance(petState().rb) * 100).toFixed(2)}%</div><div class="wh-btns"></div>`;
    $(".wh-panel").appendChild(ov);
    portrait(ov.querySelector(".wh-pic.a"), A);
    portrait(ov.querySelector(".wh-pic.b"), B);
    drawEgg(ov.querySelector(".wh-fegg"));
    const bb = ov.querySelector(".wh-btns");
    bb.appendChild(btn("取消", "small gray", () => (ov.remove(), cancelFuse())));
    bb.appendChild(btn("融合", "small pink", () => {
      const r = fusePets(A.uid, B.uid);
      ov.remove();
      fuseA = null;
      md.classList.remove("fusing");
      if (!r.ok) return toast(r.reason), refresh();
      reveal(r.pet, false);
    }));
  };
  // ---- 图鉴 (laid out like the monster codex): tabs 全部图鉴 / each kind on the left, animated cards, an info line
  const codex = () => {
    const st = petState(), have = (id, k) => (st.dex[id]?.skins || []).includes(k), md2 = el("div", "modal cdx-md pdx-md");
    const entries = PET_ORDER.flatMap((id) => ["base", ...skinsOf(id)].map((k) => ({ id, k, own: have(id, k) })));
    const got = entries.filter((e) => e.own).length;
    md2.innerHTML = `<div class="panel cdx-p"><div class="cdx-h"><h2 class="outline">宠物图鉴</h2><span class="o1">已收集 <b>${got}</b> / ${entries.length}</span><span class="cdx-x"></span></div>
      <div class="cdx-b"><div class="cdx-tabs">${["全部图鉴", ...PET_ORDER.map((id) => PETS[id].name), "收集奖励"].map((n, i) => `<button class="hp-tab cdx-tab" data-i="${i}">${n}</button>`).join("")}</div>
      <div class="cdx-main"><div class="cdx-grid pdx-grid"></div><div class="cdx-info o1"></div></div></div></div>`;
    const close2 = () => md2.remove();
    md2.querySelector(".cdx-x").appendChild(btn("关闭", "gray small", close2));
    md2.onclick = (e) => e.target === md2 && close2();
    const grid = md2.querySelector(".pdx-grid"), info = md2.querySelector(".cdx-info");
    const label = (k) => (k === "base" ? "原色" : PET_SKINS[k].name);
    const show = (e) => {
      grid.querySelectorAll(".cdx-c").forEach((c) => c.classList.toggle("on", c.dataset.id === e.id && c.dataset.k === e.k));
      const how = e.k === "base" ? "孵化宠物蛋获得" : e.k === "flow" ? "流彩品质专属，孵化或融合时有概率出现" : "孵化时 6% 概率为异色；融合更高";
      info.innerHTML = `<b>${e.own ? `${PETS[e.id].name} · ${label(e.k)}` : "？？？"}</b><span>${e.own ? "已收集" : "未收集"}</span><p>${how}</p>`;
    };
    const rewardsTab = PET_ORDER.length + 1;
    const rewards = () => {
      const n = dexCount();
      grid.className = "cdx-grid pdx-rw";
      grid.innerHTML = DEX_REWARDS.map((r) => {
        const done = petState().dexClaim.includes(r.n);
        return `<div class="pdx-r${done ? " done" : n >= r.n ? " can" : ""}"><b class="o1">收集 ${r.n} 种</b><span class="o1">${r.text}</span><i class="pdx-bar"><u style="width:${Math.min(100, (n / r.n) * 100)}%"></u></i><span class="pdx-b" data-n="${r.n}"></span></div>`;
      }).join("");
      grid.querySelectorAll(".pdx-b").forEach((sp) => {
        const k = +sp.dataset.n, done = petState().dexClaim.includes(k);
        const b = btn(done ? "已领取" : "领取", done ? "small gray" : "small", () => {
          const r = claimDex(k);
          if (!r.ok) return toast(r.reason);
          sfx("ssr");
          toast(`获得 ${r.text}`);
          rewards();
          refresh();
        });
        b.disabled = done || n < k;
        sp.appendChild(b);
      });
      info.innerHTML = `<b>收集奖励</b><span>已收集 ${n} / ${entries.length}</span><p>原色、异色与流彩各算一种，放生或融合后仍计入。</p>`;
    };
    const draw = (tab) => {
      md2.querySelectorAll(".cdx-tab").forEach((b) => b.classList.toggle("on", +b.dataset.i === tab));
      md2.querySelector(`.cdx-tab[data-i="${rewardsTab}"]`).classList.toggle("dot", dexClaimable().length > 0);
      if (tab === rewardsTab) return rewards();
      grid.className = "cdx-grid pdx-grid";
      const list = tab ? entries.filter((e) => e.id === PET_ORDER[tab - 1]) : entries;
      grid.innerHTML = list.map((e) => `<button class="cdx-c${e.own ? "" : " no"}" data-id="${e.id}" data-k="${e.k}"><span class="pdx-v"></span><b>${e.own ? label(e.k) : "？？？"}</b><small>${PETS[e.id].name}</small></button>`).join("");
      grid.querySelectorAll(".cdx-c").forEach((c, n) => {
        const e = list[n], cv = petPreview(c.querySelector(".pdx-v"), e.id, 3, "lobby", true, [120, 84], false, true);
        setPetPreview(cv, { skin: e.k === "base" ? null : e.k });
        c.onclick = () => (sfx("click"), show(e));
      });
      if (list[0]) show(list[0]);
    };
    md2.querySelectorAll(".cdx-tab").forEach((b) => (b.onclick = () => (sfx("click"), draw(+b.dataset.i))));
    uiRoot().appendChild(md2);
    draw(0);
  };
  refresh();
}
