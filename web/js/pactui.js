// 噩梦契约 panel (lobby): pick the run's optional terms with steppers; shows the level, the 晶石 bonus, best
// clears per map and the one-time milestones.
import { PACTS, PACT_MAX, pactLevel, PACT_MILESTONES, MAPS, MAP_ORDER } from "./data.js";
import { load, save } from "./save.js";
import { el } from "./util.js";
import { sfx } from "./audio.js";
import { btn, uiRoot } from "./ui.js";

export function showPacts(onClose) {
  const m = load();
  m.pact = m.pact || {};
  const md = el("div", "modal pact-md");
  md.innerHTML = `<div class="pact-p"><div class="pact-head"><h2 class="outline">噩梦契约</h2><span class="pact-lv o1"></span><span class="pact-x"></span></div>
    <div class="pact-body"><div class="pact-list"></div><div class="pact-side"><div class="pact-sum"></div><div class="pact-best"></div><div class="pact-ms"></div></div></div></div>`;
  const list = md.querySelector(".pact-list");
  const draw = () => {
    const lv = pactLevel(m.pact);
    md.querySelector(".pact-lv").textContent = `等级 ${lv} / ${PACT_MAX}`;
    list.innerHTML = "";
    for (const q of PACTS) {
      const v = m.pact[q.id] || 0;
      const row = el("div", "pact-row" + (v ? " on" : ""), `<div class="pr-t"><b>${q.name}</b><small>${q.desc}${q.max > 1 ? " / 级" : ""}</small></div><div class="pr-pips">${Array.from({ length: q.max }, (_, i) => `<i class="${i < v ? "on" : ""}"></i>`).join("")}</div><span class="pr-pts o1">+${q.pts}</span>`);
      const minus = btn("−", "small gray pr-b", () => { if (v > 0) (m.pact[q.id] = v - 1), sfx("click"), save(), draw(); });
      const plus = btn("+", "small pr-b", () => { if (v < q.max) (m.pact[q.id] = v + 1), sfx("click"), save(), draw(); });
      if (!v) minus.classList.add("off");
      if (v >= q.max) plus.classList.add("off");
      row.append(minus, plus);
      list.appendChild(row);
    }
    md.querySelector(".pact-sum").innerHTML = `<div class="ps-big outline">${lv}</div><div class="ps-t o1">本局晶石 ×${(1 + 0.08 * lv).toFixed(2)}</div><div class="ps-s">只在单人闯关生效</div>`;
    const best = m.pactBest || {};
    md.querySelector(".pact-best").innerHTML = `<div class="pb-h">最高通关（无尽以第 10 层计）</div>` + [...MAP_ORDER.map((id) => [MAPS[id].name, best[id] || 0]), ["无尽回廊", best.endless || 0]].map(([n, b]) => `<div class="pb-r"><span>${n}</span><b>${b || "—"}</b></div>`).join("");
    const got = m.pactClaim || [];
    md.querySelector(".pact-ms").innerHTML = `<div class="pb-h">里程碑（首次以该等级通关）</div>` + PACT_MILESTONES.map((ms) => `<div class="pm-r${got.includes(ms.lv) ? " got" : lv >= ms.lv ? " ready" : ""}"><span class="pm-lv">${ms.lv}</span><span>${ms.name}</span><i>${got.includes(ms.lv) ? "已领" : ""}</i></div>`).join("");
  };
  md.querySelector(".pact-x").appendChild(btn("关闭", "blue", () => { md.remove(); onClose && onClose(); }));
  draw();
  uiRoot().appendChild(md);
  return md;
}
