// 梦境航线界面：选路面板（7 列节点 + 连线，走过的路径高亮，可去的节点可点）与事件选择面板。
import { el } from "./util.js";
import { uiRoot, btn } from "./ui.js";
import { NODE, CHALLENGES, EVENTS, STEPS } from "./route.js";
import { sfx } from "./audio.js";

const label = (n) => (n.kind === "challenge" ? `挑战` : NODE[n.kind].name);
const sub = (n) => (n.kind === "challenge" ? CHALLENGES[n.challenge].name : "");

/** the route map; onPick(j) with j = index of the chosen node in the next column */
export function showRoute(game, onPick) {
  const R = game.route, md = el("div", "modal route-modal");
  const W = 100 / STEPS, rowsOf = (c) => R.cols[c].length;
  const pos = (c, i) => ({ x: W * (c + 0.5), y: ((i + 0.5) / rowsOf(c)) * 100 });
  const here = R.cols[R.step][R.at], next = here.next || [];
  // lines first (an svg in % units), then the node chips on top
  let lines = "";
  R.cols.forEach((col, c) => col.forEach((n, i) => (n.next || []).forEach((j) => {
    const a = pos(c, i), b = pos(c + 1, j), walked = R.path.at(c) === i && R.path.at(c + 1) === j, open = c === R.step && i === R.at;
    lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${walked ? "walked" : open ? "open" : ""}"/>`;
  })));
  const chips = R.cols.map((col, c) => col.map((n, i) => {
    const p = pos(c, i), done = c <= R.step && R.path.at(c) === i, can = c === R.step + 1 && next.includes(i);
    const cls = ["rt-node", `k-${n.kind}`, done ? "done" : "", c === R.step && i === R.at ? "here" : "", can ? "can" : "", c > R.step + 1 || (c === R.step + 1 && !can) ? "far" : ""].join(" ");
    return `<button class="${cls}" data-c="${c}" data-i="${i}" style="left:${p.x}%;top:${p.y}%;--nc:${NODE[n.kind].col}"${can ? "" : " disabled"}><b>${label(n)}</b>${sub(n) ? `<small>${sub(n)}</small>` : ""}</button>`;
  }).join("")).join("");
  md.innerHTML = `<div class="panel route-panel"><div class="rt-head"><h2 class="outline">梦境航线</h2><span class="o1">第 ${R.step + 1} / ${STEPS} 层 · 选择下一个房间</span></div>
    <div class="rt-map"><svg class="rt-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${chips}</div>
    <div class="rt-tip o1">挑战：清场额外选一次卡 · 事件：一次有代价的选择 · 宝藏：必出稀有怪</div></div>`;
  let done = false;
  md.querySelectorAll(".rt-node.can").forEach((b) => b.addEventListener("click", () => {
    if (done) return;
    done = true;
    sfx("click");
    md.remove();
    onPick(+b.dataset.i);
  }));
  uiRoot().appendChild(md);
  return md;
}

/** an event room's choice; onPick(k) with k = option index */
export function showEvent(game, onPick) {
  const ev = EVENTS[game.room.event], md = el("div", "modal event-modal");
  md.innerHTML = `<div class="panel event-panel"><h2 class="outline">${ev.name}</h2><p class="o1">${ev.text}</p><div class="ev-opts"></div></div>`;
  const box = md.querySelector(".ev-opts");
  let done = false;
  ev.options.forEach((o, k) => box.appendChild(btn(o.label, k === ev.options.length - 1 && o.label === "离开" ? "gray" : "", () => {
    if (done) return;
    done = true;
    md.remove();
    onPick(k);
  })));
  uiRoot().appendChild(md);
  return md;
}
