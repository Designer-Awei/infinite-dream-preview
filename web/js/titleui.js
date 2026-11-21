// 称号面板: the worn title big on the left (plate, rarity, effect, 卸下), every title on the right by source tab
// (冒险 / 矿场 / 宠物) — owned ones can be worn, locked ones show how to earn them and the progress. Plus the
// "获得称号" pop-up. All plates come from the one rarity template (titles.js titleHTML + .ttl CSS).
import { el } from "./util.js";
import { uiRoot, btn } from "./ui.js";
import { sfx } from "./audio.js";
import { TITLES, TITLE_ORDER, TITLE_RARITY, TITLE_TABS, titleState, equipTitle, checkTitles, titleHTML } from "./titles.js";

export function showTitles(tab = "adv", onClose = null) {
  checkTitles();
  const md = el("div", "modal ttl-md");
  md.innerHTML = `<div class="ttl-p"><div class="ttl-head"><h2 class="outline">称号</h2><span class="ttl-n o1"></span><div class="ttl-tabs"></div><span class="ttl-x"></span></div>
    <div class="ttl-body"><div class="ttl-cur"></div><div class="ttl-list"></div></div></div>`;
  const tabs = md.querySelector(".ttl-tabs");
  for (const [k, name] of TITLE_TABS) {
    const b = el("button", "ttl-tab" + (k === tab ? " on" : ""), name);
    b.onclick = () => ((tab = k), sfx("click"), draw());
    b.dataset.k = k;
    tabs.appendChild(b);
  }
  const draw = () => {
    const t = titleState(), own = Object.keys(t.own).filter((id) => TITLES[id]);
    md.querySelector(".ttl-n").textContent = `已获得 ${own.length} / ${TITLE_ORDER.length}`;
    tabs.querySelectorAll(".ttl-tab").forEach((b) => b.classList.toggle("on", b.dataset.k === tab));
    // the worn one
    const cur = md.querySelector(".ttl-cur"), T = TITLES[t.eq];
    cur.innerHTML = T
      ? `<div class="tc-h o1">佩戴中</div><div class="tc-plate">${titleHTML(t.eq, "big")}</div><div class="tc-r" style="color:${TITLE_RARITY[T.r].col}">${TITLE_RARITY[T.r].name}称号</div><div class="tc-fx">${T.fxText}</div><div class="tc-s">局内头顶显示，联机队友可见；效果仅在闯关中生效</div>`
      : `<div class="tc-h o1">佩戴中</div><div class="tc-plate tc-none">未佩戴</div><div class="tc-s">获得称号后点「佩戴」，局内头顶显示并获得它的效果</div>`;
    if (T) cur.appendChild(btn("卸下", "gray small tc-off", () => (equipTitle(null), sfx("click"), draw())));
    // the tab's titles: owned first, then by rarity
    const ro = Object.keys(TITLE_RARITY);
    const ids = TITLE_ORDER.filter((id) => TITLES[id].tab === tab).sort((a, b) => (!!t.own[b] - !!t.own[a]) || ro.indexOf(TITLES[a].r) - ro.indexOf(TITLES[b].r));
    const list = md.querySelector(".ttl-list");
    list.innerHTML = "";
    for (const id of ids) {
      const T2 = TITLES[id], got = !!t.own[id];
      let [have, need] = [0, 1];
      try {
        [have, need] = T2.prog();
      } catch {}
      const row = el("div", "ttl-row" + (got ? " got" : "") + (t.eq === id ? " worn" : ""), `<div class="tr-plate">${titleHTML(id, got ? "" : "locked")}</div>
        <div class="tr-t"><b>${T2.fxText}</b><small>${got ? "已获得 · " + T2.how : T2.how}</small>${got ? "" : `<div class="tr-bar"><i style="width:${Math.min(100, (have / need) * 100)}%"></i><em>${Math.min(have, need)}/${need}</em></div>`}</div>`);
      if (got) row.appendChild(t.eq === id ? el("span", "tr-on o1", "佩戴中") : btn("佩戴", "small tr-b", () => (equipTitle(id), sfx("click"), draw(), onClose && onClose(true))));
      list.appendChild(row);
    }
  };
  md.querySelector(".ttl-x").appendChild(btn("关闭", "blue", () => (md.remove(), onClose && onClose(false))));
  draw();
  uiRoot().appendChild(md);
  return md;
}

/** announce titles just earned (one pop-up listing them; 去佩戴 opens the panel on the first one's tab) */
export function announceTitles(ids, onWear) {
  const t = titleState(), fresh = ids.filter((id) => TITLES[id] && !t.seen.includes(id));
  if (!fresh.length) return;
  t.seen.push(...fresh);
  import("./save.js").then((S) => S.save());
  const md = el("div", "modal ttl-new");
  md.innerHTML = `<div class="panel ttl-np"><div class="tn-rays"></div><h2 class="outline">获得称号</h2><div class="tn-list">${fresh.map((id) => `<div class="tn-i">${titleHTML(id, "big")}<small>${TITLES[id].fxText}</small></div>`).join("")}</div><div class="row tn-acts"></div></div>`;
  md.querySelector(".tn-acts").append(
    btn("好的", "gray", () => md.remove()),
    btn("去佩戴", "", () => {
      md.remove();
      showTitles(TITLES[fresh[0]].tab, onWear);
    }),
  );
  sfx("ssr");
  uiRoot().appendChild(md);
}
