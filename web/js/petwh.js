// 宠物仓库：从主页角色右上方的宠物入口进入。右侧是库存格子（第一格是宠物蛋，其后每只已孵化的宠物；上锁的排在前面），
// 左侧是选中宠物：动画（左上角上锁按钮）、名字旁的异色 / 品质标签、词条（数值与范围）、经验条，以及
// 出战 / 进化 / 注入经验 / 融合 / 详情 / 放生。孵蛋与融合在面板内揭晓：蛋摇晃、裂开、宠物现身。图鉴按种类列出原色与各异色。点面板外关闭。
import { PETS, PET_ORDER, PET_STAGES, PET_EVOLVE, PET_MAX_XP, TRAITS, QUALITY, FUSE, fuseOdds, EGGS, EGG_KINDS, PET_ITEMS, DEX_REWARDS, petQuality, petScore, petPortrait, skinsOf, rainbowChance, eggCount, traitCap, traitBand } from "./petdata.js";
import { PET_SKINS, skinnedFrame } from "./petskins.js";
import { petState, findPet, equipPet, injectXP, injectNext, toggleLock, releasePet, releaseXP, fusePets, spendable, itemFor, useItem, incubate, hatchNow, hatchNowCost, hatchSlot, slotLeft, dexCount, dexClaimable, claimDex } from "./petsave.js";
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
    // centred in the canvas (outline on rows 2..28), so a centred canvas shows a centred egg
    const u = (x + 0.5 - 12) / 10.5, v = (y + 0.5 - 15) / 12.5;
    return u * u + v * v * (v < 0 ? 1.15 : 0.92) < 1;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) {
      if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) (g.fillStyle = "#1a1020"), g.fillRect(x, y, 1, 1);
      continue;
    }
    const lit = (x - 8) * (x - 8) + (y - 8) * (y - 8) < 18, dark = x > 16 || y > 23;
    g.fillStyle = lit ? P[0] : dark ? P[2] : P[1];
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = P[3];
  for (const [x, y, w] of [[6, 12, 3], [14, 7, 2], [15, 16, 3], [9, 20, 2], [17, 11, 1], [11, 15, 1]]) g.fillRect(x, y, w, w > 1 ? 2 : 1);
  g.fillStyle = "#1a1020";
  const seg = [[[7, 10], [9, 12], [11, 10], [13, 12]], [[13, 12], [15, 10], [17, 12]], [[11, 10], [12, 7], [11, 5]]];
  for (let k = 0; k < Math.min(crack, seg.length); k++) {
    const pts = seg[k];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let t = 0; t <= n; t++) g.fillRect(Math.round(x0 + ((x1 - x0) * t) / n), Math.round(y0 + ((y1 - y0) * t) / n), 1, 1);
    }
  }
}
let lastScore = { uid: null, v: 0 }, scoreRaf = 0, injected = null;
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

/** sparse, uneven rays for the hatch reveal: 9~12 beams, each 3~11° wide with gaps of 14~42°, a little brighter or
 *  dimmer each (流彩: every beam its own colour) — a conic-gradient built fresh each time */
const RAINBOW_COLS = ["#ff6a6a", "#ffd84a", "#6ee08a", "#5aa8ff", "#c27bff", "#ff8ad8"];
function rayBg(Q, alpha) {
  const stops = [];
  let a = Math.random() * 20, i = 0;
  while (a < 345) {
    const w = 3 + Math.random() * 8, col = Q.rainbow ? RAINBOW_COLS[i++ % RAINBOW_COLS.length] : Q.col, k = Math.round(alpha * (0.6 + Math.random() * 0.7) * 100);
    const c = `color-mix(in srgb, ${col} ${Math.min(60, k)}%, transparent)`;
    stops.push(`transparent ${a.toFixed(1)}deg`, `${c} ${a.toFixed(1)}deg`, `${c} ${(a + w).toFixed(1)}deg`, `transparent ${(a + w).toFixed(1)}deg`);
    a += w + 14 + Math.random() * 28;
  }
  return `conic-gradient(${stops.join(",")}, transparent 360deg)`;
}
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
    <header class="topbar wh-top"><div class="wh-tl"><button class="btn gray small back-btn">◀ 返回</button><h2 id="wh-title" class="outline">宠物仓库</h2><span class="wh-hbtn"></span></div><div class="wh-wallet o1"></div></header>
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
  // 图鉴: an icon button (a small code-drawn book), right-aligned with the preview area below
  {
    const b = el("button", "btn small tb-ico wh-dexbtn", "<canvas width=\"14\" height=\"14\"></canvas>");
    b.title = "宠物图鉴";
    b.setAttribute("aria-label", "宠物图鉴");
    const g = b.querySelector("canvas").getContext("2d"), r = (c, x, y, w, h) => ((g.fillStyle = c), g.fillRect(x, y, w, h));
    r("#1a1020", 1, 1, 12, 12); r("#ff8ad8", 2, 2, 5, 10); r("#c04a98", 7, 2, 1, 10); r("#ff8ad8", 8, 2, 4, 10); r("#fff2f8", 3, 3, 2, 1);
    r("#fffaf0", 9, 5, 2, 3); r("#fffaf0", 10, 4, 1, 1); r("#4ec0b0", 9, 6, 1, 1); r("#fffaf0", 3, 6, 3, 1); r("#fffaf0", 3, 8, 2, 1);
    b.onclick = () => (sfx("click"), codex());
    $(".wh-hbtn").appendChild(b);
  }

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
      egg.onclick = () => (n ? (sfx("click"), eggAsk(k)) : toast("击败首领、矿场撤离可获得宠物蛋，积攒也可兑换"));
      g.appendChild(egg);
    }
    const A = fuseA && findPet(fuseA, st);
    for (const p of order(st)) {
      const q = petQuality(p), mate = A && p !== A && spendable(p, st);
      const c = el("button", "wh-card" + (p.uid === sel ? " on" : "") + (p.skin ? (p.skin === "flow" ? " rainbow" : " shiny") : "") + (A ? (p === A ? " fuse-a" : mate ? " fuse-ok" : " fuse-no") : ""), `<span class="wh-pic"></span><i class="wh-q" style="background:${qBar(q)}"></i><span class="wh-st o1">${PET_STAGES[p.stage - 1]}</span>`);
      c.style.setProperty("--pc", PETS[p.id].color);
      c.dataset.uid = p.uid;
      portrait(c.querySelector(".wh-pic"), p);
      if (p.lock) c.insertAdjacentHTML("beforeend", `<i class="wh-lock">🔒</i>`);
      if (p.uid === st.equipped) c.insertAdjacentHTML("beforeend", `<i class="wh-on o1">出战</i>`);
      c.onclick = () => {
        if (A) {
          if (p === A) return cancelFuse();
          if (!mate) return toast("上锁或出战中的宠物不能融合");
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
    const d = PETS[p.id], q = petQuality(p), next = PET_EVOLVE[p.stage + 1], to = next ? next.xp : null, ms = mineState();
    if (!canvas || !canvas.isConnected) {
      box.innerHTML = `<div class="wh-view"><div class="wh-anim"></div><button class="wh-lockbtn" aria-label="上锁"></button><div class="wh-score"><i class="o1">评分</i><b class="outline"></b></div></div>
        <div class="wh-head" title="点击上方宠物查看技能详情"><b class="wh-name outline"></b><span class="wh-tags o1"></span></div>
        <div class="wh-traits o1"></div><div class="wh-xp"><u></u><span class="o1"></span></div><div class="wh-btns"></div>`;
      canvas = petPreview(box.querySelector(".wh-anim"), p.id, p.stage, "lobby", false, [640, 300], false, true, true);
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
    // 评分 top-right: counts up with a +N when the same pet's score rises (经验, 进化, 淬炼)
    {
      const sc = petScore(p), sb = box.querySelector(".wh-score"), num = sb.querySelector("b");
      sb.className = "wh-score" + (q === 5 ? " rb" : "");
      sb.style.setProperty("--qc", QUALITY[q].col);
      const was = lastScore.uid === p.uid ? lastScore.v : sc;
      lastScore = { uid: p.uid, v: sc };
      cancelAnimationFrame(scoreRaf);
      if (sc > was) {
        const t0 = performance.now(), step = (t) => {
          const k = Math.min(1, (t - t0) / 700);
          num.textContent = Math.round(was + (sc - was) * (1 - (1 - k) ** 3));
          if (k < 1) scoreRaf = requestAnimationFrame(step);
        };
        scoreRaf = requestAnimationFrame(step);
        const up = el("em", "wh-sup outline", `+${sc - was}`);
        sb.appendChild(up);
        setTimeout(() => up.remove(), 1200);
      } else num.textContent = sc;
    }
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
      // each tap moves up to 300 xp from the pool (幼年 → 终极 in four taps); after the first tap the label reads the step
      const nx = injectNext(p, st);
      const inj = btn(injected === p.uid && nx ? `+${nx}` : "注入经验", "small green wh-inj", () => {
        const r = injectXP(p.uid);
        if (!r.ok) return toast(r.reason);
        injected = p.uid;
        sfx(r.evolved ? "ssr" : "heal");
        if (r.evolved) toast(`${d.name}进化为${PET_STAGES[r.stage - 1]}！`);
        refresh();
      });
      inj.disabled = st.pool <= 0;
      inj.title = `从经验池注入，每次 ${nx || 300}`;
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
    fu.disabled = !spendable(p, st) || !st.list.some((o) => o !== p && spendable(o, st));
    fu.title = fu.disabled ? "需要另一只未上锁、未出战的宠物" : "以它为主宠，再选一只副宠融合";
    b.appendChild(fu);
    const gap = el("span", "wh-gap");
    b.appendChild(gap);
    // tap once: the label turns to 确定 (same width); tap again to release
    const rel = btn(confirmRelease ? "确定" : "放生", "small red wh-rel", () => {
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
    b.appendChild(rel);
  };
  // ---- 孵化槽: three slots above the grid; an egg counts down in real time, 加速 pays 星砂, a ready one hatches on tap
  const mmss = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  const slots = () => {
    const st = petState(), box = $(".wh-slots");
    box.replaceChildren();
    st.slots.forEach((sl, i) => {
      const left = slotLeft(sl), c = el("div", "wh-slot" + (!sl ? " empty" : left ? "" : " ready"));
      if (!sl) c.innerHTML = `<span class="o1">孵化槽</span>`;
      else {
        c.innerHTML = `<canvas></canvas><div class="wh-sl-t"><b class="o1">${left ? mmss(left) : "可孵化"}</b><i><u style="width:${Math.round((1 - left / sl.dur) * 100)}%"></u></i></div>`;
        drawEgg(c.querySelector("canvas"), left ? 0 : 1, sl.kind);
        if (!left) c.onclick = () => {
          const r = hatchSlot(i);
          if (r) reveal(r.pet, false, r.kind);
        };
      }
      box.appendChild(c);
    });
  };
  // tapping an egg in the grid: put it in a 孵化槽, or hatch it right away for 星砂
  const eggAsk = (k) => {
    const st = petState(), free = st.slots.some((x) => !x), cost = hatchNowCost(k), stars = mineState().stars, E = EGGS[k];
    const ov = el("div", "modal wh-ask");
    ov.innerHTML = `<div class="panel wh-askp"><canvas></canvas><div class="wh-askt"><b class="outline">${E.name}</b><span class="o1">孵化出${QUALITY[E.floor].name}或更高品质</span>
      <p class="o1">放入槽位：${E.min} 分钟后可孵化${free ? "" : "（孵化槽已满）"}</p><p class="o1">直接孵化：消耗星砂 ${cost}（当前 ${stars}）</p></div><div class="wh-btns"></div></div>`;
    drawEgg(ov.querySelector("canvas"), 0, k);
    ov.onclick = (e) => e.target === ov && ov.remove();
    const bb = ov.querySelector(".wh-btns");
    const put = btn("放入槽位", "small blue", () => {
      const r = incubate(k);
      if (!r.ok) return toast(r.reason);
      ov.remove();
      sfx("click");
      refresh();
    });
    put.disabled = !free;
    const now = btn("直接孵化", "small", () => {
      const r = hatchNow(k);
      if (!r.ok) return toast(r.reason);
      ov.remove();
      refresh();
      reveal(r.pet, false, k);
    });
    now.disabled = stars < cost;
    bb.append(put, now);
    md.appendChild(ov);
  };
  const tickSlots = setInterval(() => (md.isConnected ? petState().slots.some((x) => x) && slots() : clearInterval(tickSlots)), 1000);
  const refresh = () => (wallet(), slots(), grid(), detail(), dexDot());
  const dexDot = () => $(".wh-dexbtn")?.classList.toggle("dot", dexClaimable().length > 0);

  // ---- hatching / fusion, revealed over the panel: shake, three cracks, the pet appears (异色 gold, 流彩 rainbow)
  const reveal = (p, again, kind = "base") => {
    const q = petQuality(p), Q = QUALITY[q], ov = el("div", "wh-hatch" + (p.skin ? " shiny" : "") + (Q.rainbow ? " rainbow" : ""));
    // full-screen rays behind the reveal, in the quality's colour: brighter and faster the higher it is (流彩 rainbow)
    ov.style.setProperty("--rc", Q.col);
    ov.style.setProperty("--ra", [0.1, 0.14, 0.18, 0.24, 0.32, 0.36][q]);
    ov.style.setProperty("--rs", [26, 22, 18, 14, 10, 8][q] + "s");
    ov.innerHTML = `<i class="wh-rays2" style="background:${rayBg(Q, [0.1, 0.14, 0.18, 0.24, 0.32, 0.36][q])}"></i><div class="wh-hstage"><canvas class="wh-hegg"></canvas><div class="wh-hpet"></div></div><div class="wh-hinfo"></div><div class="wh-tap o1"></div>`;
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
        ov.querySelector(".wh-hinfo").innerHTML = `${head}<div class="wh-head"><b class="outline" style="color:${PETS[p.id].color}">${PETS[p.id].name}</b><span class="wh-tags o1">${tags(p)}</span><span class="wh-rscore${Q.rainbow ? " rb" : ""}" style="--qc:${Q.col}"><i>评分</i><b>${petScore(p)}</b></span></div><div class="wh-traits o1">${p.traits.map(traitLine(p)).join("")}</div>`;
        // tap anywhere to go back (after a short beat, so the tap that hatched it can't skip the reveal)
        const done = () => (ov.remove(), (sel = p.uid), (canvas = null), refresh());
        setTimeout(() => {
          if (!ov.isConnected) return;
          ov.querySelector(".wh-tap").textContent = "点击任意处返回";
          ov.onclick = () => (sfx("click"), done());
        }, 500);
      }
    }, 420);
  };
  // ---- fusion: the pet you press 融合 on is the 主宠, the next one picked in the grid the 副宠 (any kind); confirm, reveal
  const startFuse = (p) => {
    fuseA = p.uid;
    sfx("click");
    toast("选一只副宠（再点主宠取消）");
    md.classList.add("fusing");
    grid();
  };
  const cancelFuse = () => ((fuseA = null), md.classList.remove("fusing"), grid());
  const fuseConfirm = (A, B) => {
    const ov = el("div", "wh-hatch wh-fuse"), o = fuseOdds(A, B), pct = (x) => Math.round(x * 100) + "%";
    const kind = o.sameKind ? `${PETS[A.id].name}` : `${PETS[A.id].name} ${pct(FUSE.mainKind)} · ${PETS[B.id].name} ${pct(1 - FUSE.mainKind)}`;
    const qual = o.q === 5 ? "流彩" : `${QUALITY[o.q].name}${o.up ? `（${pct(o.up)} 升为${QUALITY[o.q + 1].name}）` : ""}`;
    ov.innerHTML = `<div class="wh-fpair"><span class="wh-pic a"><i class="wh-ftag o1">主宠</i></span><b class="outline">+</b><span class="wh-pic b"><i class="wh-ftag o1">副宠</i></span><b class="outline">→</b><canvas class="wh-fegg"></canvas></div>
      <div class="wh-hinfo o1">融合成一只幼年 ${kind}<br>品质 ${qual} · 异色 ${pct(o.shiny)} · 流彩 ${o.q === 5 ? "保留" : (rainbowChance(petState().rb) * 100).toFixed(2) + "%"}</div><div class="wh-btns"></div>`;
    $(".wh-panel").appendChild(ov);
    for (const [k, P] of [["a", A], ["b", B]]) {
      const box = ov.querySelector(".wh-pic." + k), tag = box.querySelector(".wh-ftag");
      portrait(box, P);
      box.appendChild(tag);
    }
    drawEgg(ov.querySelector(".wh-fegg"));
    const bb = ov.querySelector(".wh-btns");
    bb.appendChild(btn("取消", "small gray", () => (ov.remove(), cancelFuse())));
    bb.appendChild(btn("融合", "small pink", () => {
      const r = fusePets(A.uid, B.uid);
      ov.remove();
      fuseA = null;
      md.classList.remove("fusing");
      if (!r.ok) return toast(r.reason), refresh();
      if (r.up) toast(`品质提升为${QUALITY[r.pet.q].name}！`);
      reveal(r.pet, false);
    }));
  };
  // ---- 图鉴 (laid out like the monster codex): tabs 全部图鉴 / each kind / 收集奖励 on the left, static cards, an info line
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
        // static art (the 终极 portrait, recoloured for its 异色): dozens of live previews at once stutter
        const e = list[n];
        portrait(c.querySelector(".pdx-v"), { id: e.id, stage: 3, skin: e.k === "base" ? null : e.k });
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
