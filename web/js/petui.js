import { PETS, PET_ORDER, PET_STAGES, PET_COST, PET_EVOLVE, petPortrait } from "./petdata.js";
import { petState, exchangePet, equipPet, evolvePet } from "./petsave.js";
import { load, mineState } from "./save.js";
import { uiRoot, btn, toast } from "./ui.js";
import { el } from "./util.js";
import { sfx } from "./audio.js";
import { petPreview, setPetPreview } from "./petpreview.js";
import { mountPetDemo } from "./petdemo.js";

// 梦境伙伴: left, one fixed preview stage as tall as the info column (pet chips + arrows switch pets with a short
// slide, stage badges along an evolution track switch 幼年/成长/终极); right, the pet's skills as icon + description
// rows — 跟随 普攻 / 大招 and 骑乘 普攻 / 大招. Picking a skill plays it on the stage as a small real fight (fixed
// camera, so the effects never move or rescale the pet); picking it again, a stage or another pet returns to the portrait.
// one line each: the row has room for a single line beside its icon
const SKILLS = {
  dragon: {
    atk: () => "自动索敌，每 1.1 秒吐出焰弹。",
    ult: (d) => `每 ${d.skillCd} 秒喷吐灼热龙息，灼烧一条直线。`,
    rideAtk: () => "每 0.5 秒一发大火球，命中爆炸溅射。",
    rideUlt: () => "火龙卷自动追敌 4.5 秒，可破墙烧草。",
  },
  fox: {
    atk: () => "自动索敌，每 0.7 秒射出雷针。",
    ult: (d, s) => `每 ${d.skillCd} 秒召雷，连锁劈中 ${2 + s} 个敌人。`,
    rideAtk: () => "电弧索敌或指向发射，最多弹射 3 次。",
    rideUlt: () => "化作雷影疾驰连斩附近敌人，最多 5 段。",
  },
  phoenix: {
    atk: () => "自动索敌，每 1.1 秒射出冰羽减速。",
    ult: (d) => `每 ${d.skillCd} 秒降下暴风雪，减速并冻结。`,
    rideAtk: () => "极寒冰锥可穿透 2 个敌人并减速。",
    rideUlt: () => "跟随自身的极寒风暴，持续 5 秒。",
  },
};
const ACTS = [
  ["atk", "atk", "跟随 · 普攻", (d) => d.attack],
  ["ult", "ult", "跟随 · 大招", (d) => d.skill],
  ["rideAtk", "rideatk", "骑乘 · 普攻", (d) => d.rideAttack],
  ["rideUlt", "rideult", "骑乘 · 大招", (d) => d.rideUlt],
];
const icon = (id, kind) => `assets/pets/icons/${id}_${kind}.png`;

export function showPets(onClose) {
  document.querySelector(".pet-modal")?.remove();
  const start = petState();
  let selected = start.equipped || PET_ORDER.find((id) => start.owned[id]) || PET_ORDER[0];
  let stage = start.owned[selected]?.stage || 1, act = null, demo = null, busy = 0;
  const md = el("div", "modal pet-modal");
  md.innerHTML = `<section class="panel pet-panel pp" role="dialog" aria-modal="true" aria-labelledby="pet-title">
    <header><h2 id="pet-title">梦境伙伴</h2><div class="pet-wallet o1"></div></header>
    <div class="pp-body">
      <div class="pp-stage">
        <div class="pp-top"><div class="pp-pets">${PET_ORDER.map((id) => `<button class="pp-pick" data-id="${id}" style="--pc:${PETS[id].color}" aria-label="${PETS[id].name}"><img alt=""></button>`).join("")}</div><span class="pp-tag"></span></div>
        <div class="pp-view"><div class="pp-anim"></div><div class="pp-demo"></div><span class="pp-cap"></span>
          <button class="pp-arw l" aria-label="上一只"><svg viewBox="0 0 24 40" width="100%" height="100%"><polyline points="18,6 6,20 18,34" fill="none" stroke="#1a1020" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><polyline points="18,6 6,20 18,34" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="pp-arw r" aria-label="下一只"><svg viewBox="0 0 24 40" width="100%" height="100%"><polyline points="6,6 18,20 6,34" fill="none" stroke="#1a1020" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><polyline points="6,6 18,20 6,34" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
        <div class="pp-evo">${[1, 2, 3].map((s) => `${s > 1 ? `<span class="pp-link" data-to="${s}"><i></i><small></small></span>` : ""}<button class="pp-badge" data-stage="${s}"><img alt=""><b>${PET_STAGES[s - 1]}</b></button>`).join("")}</div>
      </div>
      <div class="pp-info"><div class="pp-fade">
        <div class="pp-head"><h3 class="pp-name"></h3><small class="pp-rar"></small><span class="pp-bonus"></span></div>
        <p class="pp-trait"><img alt=""><b>特性</b><span></span></p>
        <div class="pp-acts">${ACTS.map(([a, , label]) => `<button class="pp-act" data-act="${a}"><img alt=""><span class="pp-at"><b></b><em>${label}</em></span><span class="pp-ad"></span></button>`).join("")}</div></div>
        <div class="pp-btns"><span class="pp-own"></span><span class="pet-trial"></span></div>
      </div>
    </div></section>`;
  const close = () => (demo?.stop(), md.remove(), onClose?.());
  md.querySelector("header").appendChild(btn("关闭", "gray small", close));
  md.onclick = (e) => e.target === md && close();
  md.onkeydown = (e) => {
    if (e.key === "Escape") (e.stopPropagation(), close());
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") go(PET_ORDER.indexOf(selected) + (e.key === "ArrowLeft" ? -1 : 1));
  };
  const $ = (s) => md.querySelector(s), all = (s) => [...md.querySelectorAll(s)];
  const view = $(".pp-view");
  uiRoot().appendChild(md);
  // the one portrait canvas: idle with an occasional cast, one framing for every pose, so it never rescales
  const canvas = petPreview($(".pp-anim"), selected, stage, "lobby", false, [480, 300], false, true);
  // ---- the skill demo (a real fight) replaces the portrait while a skill row is picked
  const showDemo = () => {
    view.classList.toggle("demo", !!act);
    const d = PETS[selected], row = ACTS.find((a) => a[0] === act);
    $(".pp-cap").textContent = row ? `${row[2]} · ${row[3](d)}` : "";
    if (!act) return demo?.pause();
    const cfg = { id: selected, stage, act, cid: load().sel };
    if (demo) demo.set(cfg);
    else demo = mountPetDemo($(".pp-demo"), cfg);
  };
  // ---- left stage: chips, tag, badges and the evolution track
  const stageUI = () => {
    const st = petState(), own = st.owned[selected], d = PETS[selected];
    view.parentElement.style.setProperty("--pc", d.color);
    all(".pp-pick").forEach((b) => {
      const id = b.dataset.id, o = st.owned[id];
      b.querySelector("img").src = petPortrait(id, o?.stage || 1);
      b.classList.toggle("on", id === selected);
      b.classList.toggle("owned", !!o);
      b.classList.toggle("carried", st.equipped === id);
    });
    const tag = $(".pp-tag");
    tag.textContent = st.equipped === selected ? "已携带" : own ? "已拥有" : "未拥有";
    tag.className = "pp-tag" + (st.equipped === selected ? " carried" : own ? "" : " locked");
    view.classList.toggle("unowned", !own);
    all(".pp-badge").forEach((b) => {
      const s = +b.dataset.stage;
      b.querySelector("img").src = petPortrait(selected, s);
      b.classList.toggle("on", s === stage);
      b.classList.toggle("got", !!own && own.stage >= s);
    });
    all(".pp-link").forEach((l) => {
      const to = +l.dataset.to, need = PET_EVOLVE[to].xp, prev = PET_EVOLVE[to - 1]?.xp || 0;
      const k = !own ? 0 : own.stage >= to ? 1 : own.stage === to - 1 ? Math.min(1, Math.max(0, (own.xp - prev) / (need - prev))) : 0;
      l.querySelector("i").style.width = Math.round(k * 100) + "%";
      l.querySelector("small").textContent = own && own.stage === to - 1 ? `${own.xp}/${need}` : "";
      l.classList.toggle("full", k >= 1);
    });
    const i = PET_ORDER.indexOf(selected);
    $(".pp-arw.l").disabled = i === 0;
    $(".pp-arw.r").disabled = i === PET_ORDER.length - 1;
  };
  // ---- right column (text swapped in place; a short fade when the pet changes)
  const info = () => {
    const st = petState(), meta = load(), ms = mineState(), d = PETS[selected], own = st.owned[selected];
    $(".pet-wallet").textContent = `积攒 ${meta.stash || 0} · 星砂 ${ms.stars}`;
    $(".pp-name").textContent = d.name;
    $(".pp-name").style.color = d.color;
    $(".pp-rar").textContent = `${stage === 3 ? "HUR" : "UR"} · ${PET_STAGES[stage - 1]}${own ? (own.stage >= stage ? "" : " · 未解锁") : " · 预览"}`;
    $(".pp-bonus").innerHTML = `携带加成 <b>${d.passive} +${Math.round(d.bonus[stage - 1] * 100)}%</b>`;
    $(".pp-trait img").src = icon(selected, "trait");
    $(".pp-trait span").textContent = d.trait;
    $(".pp-info").style.setProperty("--pc", d.color);
    all(".pp-act").forEach((b, k) => {
      const [a, kind, , name] = ACTS[k];
      b.querySelector("img").src = icon(selected, kind);
      b.querySelector("b").textContent = name(d);
      b.querySelector(".pp-ad").textContent = SKILLS[selected][a](d, stage);
      b.classList.toggle("on", a === act);
    });
    buttons(st, meta, ms, d, own);
  };
  const buttons = (st, meta, ms, d, own) => {
    const a = $(".pp-own");
    a.replaceChildren();
    if (own) {
      a.appendChild(btn(st.equipped === selected ? "取消携带" : "携带出战", "small blue", () => (equipPet(st.equipped === selected ? null : selected), sfx("click"), refresh())));
      if (own.stage < 3) {
        const next = PET_EVOLVE[own.stage + 1];
        const b = btn(`进化 · 星砂 ${next.stars}`, "small", () => {
          const r = evolvePet(selected);
          if (!r.ok) return toast(r.reason);
          sfx("ssr");
          toast(`${d.name}进化为${PET_STAGES[r.stage - 1]}！`);
          stage = r.stage;
          act = null;
          view.classList.remove("evolved");
          void view.offsetWidth;
          view.classList.add("evolved");
          setPetPreview(canvas, { stage });
          showDemo();
          refresh();
        });
        b.title = `成长 ${own.xp}/${next.xp}，需 ${next.stars} 星砂`;
        b.disabled = own.xp < next.xp || ms.stars < next.stars;
        a.appendChild(b);
      }
    } else {
      const b = btn(`UR兑换 · ${PET_COST.UR} 积攒`, "small", () => {
        const r = exchangePet(selected, "UR");
        if (!r.ok) return toast(r.reason);
        sfx("ssr");
        toast(`获得${d.name}，已解锁伙伴出战！`);
        stage = r.stage;
        setPetPreview(canvas, { stage });
        refresh();
      });
      b.disabled = (meta.stash || 0) < PET_COST.UR;
      a.appendChild(b);
    }
    const tb = btn("免费试用 · 终极骑乘", "small green", () => (demo?.stop(), md.remove(), import("./main.js").then(({ app }) => app.startPetTrial(selected))));
    tb.innerHTML = `<span class="pp-long">免费试用 · 终极骑乘</span><span class="pp-short">试用 · 终极骑乘</span>`; // narrow screens drop 免费
    $(".pet-trial").replaceChildren(tb);
  };
  const refresh = () => (stageUI(), info());
  // ---- switching: pets slide in from the side they come from; stages and skills swap in place
  const choose = (id) => {
    if (id === selected || busy) return;
    const dir = PET_ORDER.indexOf(id) > PET_ORDER.indexOf(selected) ? 1 : -1;
    selected = id;
    stage = petState().owned[id]?.stage || 1;
    act = null;
    sfx("card");
    busy = 1;
    view.style.setProperty("--dx", `${-dir * 34}px`);
    view.classList.add("out");
    $(".pp-fade").classList.add("out");
    setTimeout(() => {
      setPetPreview(canvas, { id, stage });
      showDemo();
      refresh();
      view.style.setProperty("--dx", `${dir * 34}px`);
      view.classList.replace("out", "in");
      $(".pp-fade").classList.remove("out");
      requestAnimationFrame(() => requestAnimationFrame(() => (view.classList.remove("in"), (busy = 0))));
    }, 130);
  };
  const go = (k) => choose(PET_ORDER[Math.max(0, Math.min(PET_ORDER.length - 1, k))]);
  all(".pp-pick").forEach((b) => (b.onclick = () => choose(b.dataset.id)));
  $(".pp-arw.l").onclick = () => go(PET_ORDER.indexOf(selected) - 1);
  $(".pp-arw.r").onclick = () => go(PET_ORDER.indexOf(selected) + 1);
  // horizontal swipe on the stage switches pets too
  let sw = null;
  view.addEventListener("pointerdown", (e) => (sw = { x: e.clientX, y: e.clientY }));
  view.addEventListener("pointerup", (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    sw = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) go(PET_ORDER.indexOf(selected) + (dx < 0 ? 1 : -1));
  });
  all(".pp-badge").forEach((b) => (b.onclick = () => {
    stage = +b.dataset.stage;
    act = null;
    setPetPreview(canvas, { stage });
    showDemo();
    sfx("click");
    refresh();
  }));
  all(".pp-act").forEach((b) => (b.onclick = () => {
    act = act === b.dataset.act ? null : b.dataset.act;
    sfx("click");
    // riding needs the 终极 form: a ride skill switches the stage badges (and the portrait behind) to 终极 too
    if (act?.startsWith("ride") && stage !== 3) {
      stage = 3;
      setPetPreview(canvas, { stage });
      refresh();
    }
    showDemo();
    all(".pp-act").forEach((x) => x.classList.toggle("on", x.dataset.act === act));
  }));
  refresh();
  md.querySelector("header button").focus();
}
