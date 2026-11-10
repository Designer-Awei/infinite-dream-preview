// 宠物仓库：从主页角色右上方的宠物入口进入。右侧是库存格子（第一格是宠物蛋，其后每只已孵化的宠物；上锁的排在前面），
// 左侧是选中宠物：动画（左上角上锁按钮）、名字旁的异色 / 品质标签、词条（数值与范围）、经验条，以及
// 出战 / 进化 / 注入经验 / 融合 / 详情 / 放生。孵蛋与融合在面板内揭晓：蛋摇晃、裂开、宠物现身。图鉴按种类列出原色与各异色。点面板外关闭。
import { PETS, PET_ORDER, PET_STAGES, PET_EVOLVE, PET_MAX_XP, TRAITS, QUALITY, FUSE_SHINY, FUSE_SHINY_PARENT, EGGS, EGG_KINDS, PET_ITEMS, petQuality, petPortrait, skinsOf, rainbowChance, eggCount, traitCap } from "./petdata.js";
import { PET_SKINS, skinnedFrame } from "./petskins.js";
import { petState, findPet, hatchEgg, equipPet, evolvePet, injectXP, injectTarget, toggleLock, releasePet, releaseXP, fusePets, spendable, itemFor, useItem } from "./petsave.js";
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
const traitLine = ([k, v]) => {
  const t = TRAITS[k], pos = Math.min(1, (v - t.min) / (t.max - t.min));
  return `<div class="wh-tr"><b>${t.name}</b><span class="wh-td">${t.desc} ${t.minus ? "-" : "+"}${v}%</span><i class="wh-tb"><u style="width:${Math.round(8 + pos * 92)}%"></u></i><small>${t.min}~${t.max}%</small></div>`;
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
  md.innerHTML = `<section class="panel pet-panel wh-panel" role="dialog" aria-modal="true" aria-labelledby="wh-title">
    <header><h2 id="wh-title">宠物仓库</h2><span class="wh-hbtn"></span><div class="wh-wallet o1"></div></header>
    <div class="wh-body">
      <div class="wh-detail"></div>
      <div class="wh-grid"></div>
    </div></section>`;
  const $ = (s) => md.querySelector(s);
  const close = () => (md.remove(), onClose?.());
  md.onclick = (e) => e.target === md && close();
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
      egg.title = n ? `${EGGS[k].name}：孵化出${QUALITY[fl].name}或更高品质` : "击败首领可获得宠物蛋";
      egg.onclick = () => (n ? hatch(k) : toast("击败首领可获得宠物蛋，积攒也可兑换"));
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
        <div class="wh-head"><b class="wh-name outline"></b><span class="wh-tags o1"></span></div>
        <div class="wh-traits o1"></div><div class="wh-xp"><u></u><span class="o1"></span></div><div class="wh-btns"></div>`;
      canvas = petPreview(box.querySelector(".wh-anim"), p.id, p.stage, "lobby", false, [320, 220], false, true);
    }
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
    box.querySelector(".wh-traits").innerHTML = p.traits.map(traitLine).join("");
    // one bar across the row, its text centred on it: stage, xp (or 经验已满) and the stars the next evolution costs
    const from = to === PET_EVOLVE[3].xp ? PET_EVOLVE[2].xp : 0;
    box.querySelector(".wh-xp u").style.width = Math.round(Math.min(1, to ? (p.xp - from) / (to - from) : 1) * 100) + "%";
    box.querySelector(".wh-xp span").textContent = `${PET_STAGES[p.stage - 1]} · ` + (to ? `经验 ${p.xp}/${to}` : "经验已满") + (next && p.xp >= next.xp ? ` · 进化需 ${next.stars} 星砂` : "");
    // buttons: the pet's own actions on the left, 详情 / 放生 apart on the right
    const b = box.querySelector(".wh-btns");
    b.replaceChildren();
    const carried = st.equipped === p.uid;
    const go = btn(carried ? "休息" : "出战", carried ? "small gray" : "small blue", () => (equipPet(carried ? null : p.uid), sfx("click"), refresh()));
    b.appendChild(go);
    if (next) {
      const ev = btn("进化", "small", () => {
        const r = evolvePet(p.uid);
        if (!r.ok) return toast(r.reason);
        sfx("ssr");
        toast(`${d.name}进化为${PET_STAGES[r.stage - 1]}！`);
        refresh();
      });
      ev.disabled = p.xp < next.xp || ms.stars < next.stars;
      ev.title = `经验 ${next.xp}，${next.stars} 星砂`;
      b.appendChild(ev);
    }
    if (to) {
      const inj = btn("注入经验", "small green", () => {
        const r = injectXP(p.uid);
        if (!r.ok) return toast(r.reason);
        sfx("heal");
        toast(`注入 ${r.give} 经验`);
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
    b.appendChild(btn("详情", "small gray", () => (md.remove(), showPetDetail(p.uid, () => showWarehouse(onClose)))));
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
  const refresh = () => (wallet(), grid(), detail());

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
        ov.querySelector(".wh-hinfo").innerHTML = `${head}<div class="wh-head"><b class="outline" style="color:${PETS[p.id].color}">${PETS[p.id].name}</b><span class="wh-tags o1">${tags(p)}</span></div><div class="wh-traits o1">${p.traits.map(traitLine).join("")}</div>`;
        const bb = ov.querySelector(".wh-btns"), done = () => (ov.remove(), (sel = p.uid), (canvas = null), refresh());
        bb.appendChild(btn("收下", "small blue", done));
        if (again && petState().eggs[kind] > 0) bb.appendChild(btn("再孵一颗", "small", () => (done(), hatch(kind))));
      }
    }, 420);
  };
  const hatch = (kind = "base") => {
    const p = hatchEgg(kind);
    if (p) reveal(p, true, kind);
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
  // ---- 图鉴: every kind with its 原色, each 异色 and 流彩; collected ones in colour
  const codex = () => {
    const st = petState(), ov = el("div", "wh-hatch wh-codex");
    let got = 0, all = 0;
    const rows = PET_ORDER.map((id) => {
      const have = st.dex[id]?.skins || [], cells = ["base", ...skinsOf(id)].map((k) => {
        all++;
        const own = have.includes(k);
        if (own) got++;
        return `<span class="wh-dx${own ? "" : " off"}${k === "flow" ? " rainbow" : ""}" data-id="${id}" data-k="${k}"><span class="wh-pic"></span><small class="o1">${k === "base" ? "原色" : PET_SKINS[k].name}</small></span>`;
      });
      return `<div class="wh-dxrow"><b class="outline" style="color:${PETS[id].color}">${PETS[id].name}</b><div>${cells.join("")}</div></div>`;
    });
    ov.innerHTML = `<div class="wh-dxhead"><b class="outline">宠物图鉴</b><span class="o1">已收集 ${got} / ${all}</span></div><div class="wh-dxbody">${rows.join("")}</div><div class="wh-btns"></div>`;
    $(".wh-panel").appendChild(ov);
    ov.querySelectorAll(".wh-dx").forEach((n) => portrait(n.querySelector(".wh-pic"), { id: n.dataset.id, stage: 3, skin: n.dataset.k === "base" ? null : n.dataset.k }));
    ov.querySelector(".wh-btns").appendChild(btn("返回", "small gray", () => ov.remove()));
  };
  refresh();
}
