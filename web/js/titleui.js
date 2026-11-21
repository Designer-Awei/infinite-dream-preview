// 称号面板: the worn title big on the left (plate, rarity, effect, 卸下), every title on the right by source tab
// (冒险 / 矿场 / 宠物) — owned ones can be worn, locked ones show how to earn them and the progress. Plus the
// "获得称号" pop-up. All plates come from the one rarity template (titles.js titleHTML + .ttl CSS).
import { el } from "./util.js";
import { uiRoot, btn } from "./ui.js";
import { sfx } from "./audio.js";
import { TITLES, TITLE_ORDER, TITLE_RARITY, TITLE_TABS, titleState, equipTitle, checkTitles, titleHTML, drawTitlePlate } from "./titles.js";
import { A } from "./assets.js";
import { VIEW_W } from "./data.js";
import { load } from "./save.js";

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
    // the worn one, previewed the way it looks in a run: the selected girl on the floor, name and plate over her head
    const cur = md.querySelector(".ttl-cur"), T = TITLES[t.eq];
    cur.innerHTML = `<canvas class="tc-cv"></canvas><div class="tc-tag o1">局内预览</div><div class="tc-cap">${T ? T.fxText : "未佩戴称号"}</div>`;
    preview(cur.querySelector(".tc-cv"), t.eq, md);
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

/** the in-run look: grass floor, the selected girl breathing, her name and the worn plate (2× like the game) */
function preview(cv, id, md) {
  const cap = cv.parentElement.querySelector(".tc-cap"), g = cv.getContext("2d"), m = load(), set = A.girls[m.sel], t0 = performance.now();
  if (!set) return;
  const k = set.k || 1, W = set.w / k, H = set.foot / k, SH = set.h / k, clip = (set.clips || {}).idle_s;
  const draw = (now) => {
    if (!cv.isConnected) return;
    const t = Math.max(0, now - t0) / 1000; // a frame's stamp can be older than t0: never a negative clip index
    const dpr = devicePixelRatio || 1, cw = Math.max(1, Math.round(cv.clientWidth * dpr)), chh = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== cw || cv.height !== chh) (cv.width = cw), (cv.height = chh);
    const S = Math.max(1, innerWidth / VIEW_W) * dpr, LW = cw / S, LH = chh / S; // world px the size they are in a run
    g.setTransform(S, 0, 0, S, 0, 0);
    g.imageSmoothingEnabled = false;
    const ox = (LW / 2) % 32, oy = 0;
    for (let y = -32 + oy; y < LH; y += 16) for (let x = -32 + ox; x < LW; x += 16) {
      g.fillStyle = Math.round((x - ox + y - oy) / 16) % 2 ? "#7cc44c" : "#86cc54";
      g.fillRect(Math.round(x), Math.round(y), 16, 16);
    }
    const figH = (set.foot - (set.top || 0)) / k, capH = (cap.offsetHeight + 12) * dpr / S, need = figH + 26;
    const px = Math.round(LW / 2), py = Math.round(Math.max(need, (LH - capH - need) / 2 + need));
    g.fillStyle = "rgba(10,30,10,0.35)";
    g.beginPath();
    g.ellipse(px, py, 14, 5, 0, 0, Math.PI * 2);
    g.fill();
    const img = clip ? clip[Math.floor(t * 5) % clip.length] : set.views.front;
    g.drawImage(img, Math.round(px - W / 2), Math.round(py - H + 1), W, SH);
    const y = py - (set.foot - (set.top || 0)) / k - 8;
    // exactly the solo run's head: full life bar (green) with the shield line, the plate just above it (no name —
    // names only show when there are several players)
    const bw = 34, bx = px - bw / 2;
    g.fillStyle = "#14101c";
    g.fillRect(bx - 1, y - 1, bw + 2, 6);
    g.fillStyle = "#5dff7a";
    g.fillRect(bx, y, bw, 4);
    g.fillStyle = "#c8dcff";
    g.fillRect(bx, y + 4, bw, 1);
    if (id) drawTitlePlate(g, id, px, y - 10, t);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
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
