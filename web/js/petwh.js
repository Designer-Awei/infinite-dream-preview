// 伙伴仓库：从主页角色右上方的伙伴入口进入。右侧是库存格子（第一格是伙伴蛋，其后每只已孵化的伙伴；上锁的排在前面），
// 左侧是选中伙伴：异色动画、品质、两条词条（数值与范围）、经验条，以及 出战 / 进化 / 注入经验 / 详情 / 上锁 / 放生。
// 孵蛋在面板内播放：蛋摇晃、裂开、闪光，伙伴现身（异色多一圈金光）。点面板外关闭。
import { PETS, PET_STAGES, PET_EVOLVE, PET_MAX_XP, TRAITS, QUALITY, RELEASE_XP, petQuality, petPortrait } from "./petdata.js";
import { PET_SKINS, skinnedCell } from "./petskins.js";
import { petState, findPet, hatchEgg, equipPet, evolvePet, injectXP, injectTarget, toggleLock, releasePet } from "./petsave.js";
import { mineState } from "./save.js";
import { uiRoot, btn, toast } from "./ui.js";
import { el } from "./util.js";
import { sfx } from "./audio.js";
import { petPreview, setPetPreview } from "./petpreview.js";
import { showPetDetail } from "./petui.js";

/** a code-drawn pixel egg (24 x 30) with teal spots; crack 0..3 draws that many crack segments */
export function drawEgg(c, crack = 0) {
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
    g.fillStyle = lit ? "#fffaf0" : dark ? "#d8c8a8" : "#f4ead4";
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = "#4ec0b0";
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
    const cell = skinnedCell(p.skin, im, 0, 0, im.naturalWidth, im.naturalHeight);
    c.width = cell.width;
    c.height = cell.height;
    c.getContext("2d").drawImage(cell, 0, 0);
  };
  im.complete && im.naturalWidth ? go() : (im.onload = go);
}
const order = (st) => [...st.list].sort((a, b) => (b.lock - a.lock) || ((b.uid === st.equipped) - (a.uid === st.equipped)) || (!!b.skin - !!a.skin) || (b.stage - a.stage) || (petQuality(b) - petQuality(a)) || (b.t - a.t));
const traitLine = ([k, v]) => {
  const t = TRAITS[k], pos = (v - t.min) / (t.max - t.min);
  return `<div class="wh-tr"><b>${t.name}</b><span class="wh-td">${t.desc} ${t.minus ? "-" : "+"}${v}%</span><i class="wh-tb"><u style="width:${Math.round(8 + pos * 92)}%"></u></i><small>${t.min}~${t.max}%</small></div>`;
};

export function showWarehouse(onClose) {
  document.querySelector(".wh-modal")?.remove();
  const md = el("div", "modal pet-modal wh-modal");
  md.innerHTML = `<section class="panel pet-panel wh-panel" role="dialog" aria-modal="true" aria-labelledby="wh-title">
    <header><h2 id="wh-title">伙伴仓库</h2><div class="wh-wallet o1"></div></header>
    <div class="wh-body">
      <div class="wh-detail"></div>
      <div class="wh-grid"></div>
    </div></section>`;
  const $ = (s) => md.querySelector(s);
  const close = () => (md.remove(), onClose?.());
  md.onclick = (e) => e.target === md && close();
  md.onkeydown = (e) => e.key === "Escape" && (e.stopPropagation(), close());
  uiRoot().appendChild(md);
  let sel = petState().equipped || order(petState())[0]?.uid || null, confirmRelease = false, canvas = null;

  const wallet = () => {
    const st = petState();
    $(".wh-wallet").innerHTML = `<span>伙伴蛋 <b>${st.eggs}</b></span><span>经验池 <b>${st.pool}</b></span><span>星砂 <b>${mineState().stars}</b></span><span>伙伴 <b>${st.list.length}</b></span>`;
  };
  const grid = () => {
    const st = petState(), g = $(".wh-grid");
    g.replaceChildren();
    const egg = el("button", "wh-card wh-egg" + (st.eggs ? "" : " none"), `<canvas></canvas><b class="o1">孵化</b><i class="wh-n o1">×${st.eggs}</i>`);
    drawEgg(egg.querySelector("canvas"));
    egg.title = st.eggs ? "孵化一颗伙伴蛋" : "击败首领可获得伙伴蛋";
    egg.onclick = () => (st.eggs ? hatch() : toast("击败首领可获得伙伴蛋"));
    g.appendChild(egg);
    for (const p of order(st)) {
      const q = petQuality(p), c = el("button", "wh-card" + (p.uid === sel ? " on" : "") + (p.skin ? " shiny" : ""), `<span class="wh-pic"></span><i class="wh-q" style="background:${QUALITY[q].col}"></i><span class="wh-st o1">${PET_STAGES[p.stage - 1]}</span>`);
      c.style.setProperty("--pc", PETS[p.id].color);
      portrait(c.querySelector(".wh-pic"), p);
      if (p.lock) c.insertAdjacentHTML("beforeend", `<i class="wh-lock">🔒</i>`);
      if (p.uid === st.equipped) c.insertAdjacentHTML("beforeend", `<i class="wh-on o1">出战</i>`);
      if (p.skin) c.insertAdjacentHTML("beforeend", `<i class="wh-sh o1">异色</i>`);
      c.onclick = () => {
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
      box.innerHTML = `<div class="wh-empty o1"><canvas></canvas><p>${st.eggs ? "点右侧的伙伴蛋孵化你的第一只伙伴。" : "还没有伙伴。击败首领可获得伙伴蛋，也可以在图鉴里用积攒兑换。"}</p><div class="wh-btns"></div></div>`;
      drawEgg(box.querySelector("canvas"));
      box.querySelector(".wh-btns").appendChild(btn("图鉴", "small", () => (md.remove(), showPetDetail(null, () => showWarehouse(onClose)))));
      return;
    }
    const d = PETS[p.id], q = petQuality(p), to = injectTarget(p), next = PET_EVOLVE[p.stage + 1], ms = mineState();
    if (!canvas || !canvas.isConnected) {
      box.innerHTML = `<div class="wh-view"><div class="wh-anim"></div><span class="wh-tag o1"></span></div>
        <div class="wh-head"><b class="wh-name outline"></b><span class="wh-sub o1"></span><button class="wh-lockbtn" aria-label="上锁"></button></div>
        <div class="wh-traits o1"></div><div class="wh-xp o1"><i><u></u></i><span></span></div><div class="wh-btns"></div>`;
      canvas = petPreview(box.querySelector(".wh-anim"), p.id, p.stage, "lobby", false, [320, 220], false, true);
    }
    setPetPreview(canvas, { id: p.id, stage: p.stage, skin: p.skin });
    box.style.setProperty("--pc", d.color);
    const tag = box.querySelector(".wh-tag");
    tag.textContent = p.skin ? `异色 · ${PET_SKINS[p.skin].name}` : "";
    tag.style.display = p.skin ? "" : "none";
    box.querySelector(".wh-name").textContent = d.name;
    box.querySelector(".wh-name").style.color = d.color;
    box.querySelector(".wh-sub").innerHTML = `${PET_STAGES[p.stage - 1]} · <b style="color:${QUALITY[q].col}">${QUALITY[q].name}</b>`;
    const lk = box.querySelector(".wh-lockbtn");
    lk.textContent = p.lock ? "🔒" : "🔓";
    lk.classList.toggle("on", p.lock);
    lk.title = p.lock ? "已上锁：不能放生（点击解锁）" : "上锁：防止误放生，排在前面";
    lk.onclick = () => (sfx("click"), toast(toggleLock(p.uid) ? "已上锁" : "已解锁"), (confirmRelease = false), refresh());
    box.querySelector(".wh-traits").innerHTML = p.traits.map(traitLine).join("");
    const need = to || PET_MAX_XP, prev = p.stage >= 2 ? PET_EVOLVE[2].xp : 0;
    box.querySelector(".wh-xp u").style.width = Math.round(Math.min(1, to ? (p.xp - (to === PET_EVOLVE[3].xp ? prev : 0)) / (to - (to === PET_EVOLVE[3].xp ? prev : 0)) : 1) * 100) + "%";
    box.querySelector(".wh-xp span").textContent = to ? `经验 ${p.xp}/${need}` + (next && p.xp >= next.xp ? ` · 进化需 ${next.stars} 星砂` : "") : next ? `经验已满 · 进化需 ${next.stars} 星砂` : "经验已满";
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
    const gap = el("span", "wh-gap");
    b.appendChild(gap);
    b.appendChild(btn("详情", "small gray", () => (md.remove(), showPetDetail(p.uid, () => showWarehouse(onClose)))));
    const rel = btn(confirmRelease ? "确认放生" : "放生", "small red", () => {
      if (p.lock) return toast("已上锁，先解锁");
      if (carried) return toast("出战中的伙伴不能放生");
      if (!confirmRelease) return (confirmRelease = true), sfx("click"), detail();
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
    rel.title = p.lock ? "已上锁" : carried ? "出战中" : `放生后经验池 +${RELEASE_XP}`;
    b.appendChild(rel);
  };
  const refresh = () => (wallet(), grid(), detail());

  // ---- hatching, played over the panel: shake, three cracks, a flash, the pet appears
  const hatch = () => {
    const p = hatchEgg();
    if (!p) return;
    const q = petQuality(p), ov = el("div", "wh-hatch" + (p.skin ? " shiny" : ""));
    ov.innerHTML = `<div class="wh-hstage"><i class="wh-rays"></i><canvas class="wh-hegg"></canvas><div class="wh-hpet"></div></div><div class="wh-hinfo"></div><div class="wh-btns"></div>`;
    $(".wh-panel").appendChild(ov);
    const eggC = ov.querySelector(".wh-hegg");
    drawEgg(eggC);
    sfx("click");
    let k = 0;
    const tick = setInterval(() => {
      k++;
      if (!ov.isConnected) return clearInterval(tick);
      if (k <= 3) (drawEgg(eggC, k), sfx("hit"), eggC.classList.remove("shake"), void eggC.offsetWidth, eggC.classList.add("shake"));
      else {
        clearInterval(tick);
        ov.classList.add("open");
        sfx(p.skin ? "ssr" : "card");
        const c = petPreview(ov.querySelector(".wh-hpet"), p.id, p.stage, "lobby", false, [280, 200], false, true);
        setPetPreview(c, { skin: p.skin });
        ov.querySelector(".wh-hinfo").innerHTML = `${p.skin ? `<div class="wh-shiny outline">异色 · ${PET_SKINS[p.skin].name}！</div>` : ""}<b class="outline" style="color:${PETS[p.id].color}">${PETS[p.id].name}</b> <span class="o1">幼年 · <b style="color:${QUALITY[q].col}">${QUALITY[q].name}</b></span><div class="wh-traits o1">${p.traits.map(traitLine).join("")}</div>`;
        const bb = ov.querySelector(".wh-btns"), done = () => (ov.remove(), (sel = p.uid), (canvas = null), refresh());
        bb.appendChild(btn("收下", "small blue", done));
        if (petState().eggs > 0) bb.appendChild(btn("再孵一颗", "small", () => (done(), hatch())));
      }
    }, 420);
  };
  refresh();
}
