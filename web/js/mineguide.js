// 梦境矿场 ❓ guide: each page runs a tiny scripted dive (real tiles, sprites and physics) in a mini canvas, muted,
// with one line saying what the element does. Swipe / arrows / dots to change page.
import { VIEW_W, VIEW_H } from "./data.js";
import { Dive, setMute } from "./mine.js";
import { MT, MW, T } from "./minedata.js";
import { el } from "./util.js";
import { sfx } from "./audio.js";
import { uiRoot } from "./ui.js";
import { load } from "./save.js";

const C = 24; // the column the demos happen around
/** wipe the generated level to plain dirt; then carve what the page needs */
function blank(d) {
  d.t.fill(T.DIRT);
  for (let y = 0; y < d.rows; y++) (d.t[y * MW] = T.BEDROCK), (d.t[y * MW + MW - 1] = T.BEDROCK);
  d.ore = {};
  d.chest = {};
  d.mobs = [];
  d.lifts = [];
  d.merchant = null;
  d.guardRoom = null;
  d.falling = [];
  d.clouds = [];
  d.bullets = [];
  d.bombs = [];
}
const air = (d, c0, c1, r0, r1) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) d.set(c, r, T.AIR);
};
const ore = (d, c, r, id) => (d.set(c, r, T.ORE), (d.ore[r * MW + c] = id));
const put = (d, col, row) => {
  d.p.x = col * MT + MT / 2;
  d.p.y = row * MT;
  d.p.vx = d.p.vy = 0;
  d.cam.x = d.p.x - VIEW_W / 1.3 / 2;
  d.cam.y = d.p.y - (VIEW_H / 1.3) * 0.5;
};
const idle = { mx: 0, my: 0, atk: false, bomb: false, beacon: false };

const PAGES = [
  {
    title: "挖掘",
    text: "按住 S（或摇杆向下）往下挖；顶着墙走就是横挖。挖到矿物会自动装进背包，越深的矿越值钱。",
    dur: 5,
    build(d) {
      blank(d);
      air(d, C - 4, C + 4, -8, -1);
      ore(d, C, 2, "copper"), ore(d, C, 3, "iron"), ore(d, C + 1, 4, "silver"), ore(d, C + 2, 4, "silver");
      put(d, C, 0);
    },
    input: (d, t) => (t < 3 ? { ...idle, my: 1 } : { ...idle, mx: 1 }),
  },
  {
    title: "喷气缓冲",
    zoom: 1.3,
    text: "从高处直接掉下去会摔伤。下落时按住 W（或摇杆向上）喷气减速，喷气要耗电。",
    dur: 4.2,
    build(d) {
      blank(d);
      air(d, C - 3, C + 3, -8, 9);
      put(d, C, -6);
    },
    input: (d, t) => ({ ...idle, my: t > 0.35 && d.p.vy > 110 ? -1 : 0 }),
  },
  {
    title: "攻击怪物",
    text: "按 J（攻击键）会自动瞄准最近的怪物射击。被怪物碰到会掉血，血量清零只能带回 30% 的东西。",
    dur: 4,
    build(d) {
      blank(d);
      air(d, C - 6, C + 6, 2, 5);
      put(d, C - 4, 6);
      // tougher than usual so they stay on screen for the whole loop
      for (const m of [d.mkMob("bat", (C + 4) * MT, 3 * MT), d.mkMob("slime", (C + 2) * MT, 5 * MT + 12)]) (m.hp = m.maxHp = 70), (m.awake = true), d.mobs.push(m);
    },
    input: () => ({ ...idle, atk: true }),
  },
  {
    title: "炸药",
    text: "按 K 扔出炸药，一下炸开 3×3 的岩层（也会伤到自己，记得离远点）。",
    dur: 3.6,
    build(d) {
      blank(d);
      air(d, C - 5, C - 1, 3, 5);
      for (let r = 2; r <= 6; r++) for (let c = C; c <= C + 3; c++) d.set(c, r, T.STONE);
      ore(d, C + 1, 4, "silver"), ore(d, C + 2, 5, "amethyst");
      put(d, C - 4, 6);
      d.p.face = 1;
    },
    input: (d, t) => ({ ...idle, bomb: t > 0.4 && !d._bombed && (d._bombed = true), mx: t > 0.45 && t < 0.9 ? -1 : 0 }),
  },
  {
    title: "宝箱与遗物箱",
    text: "宝箱给矿物和星砂；紫色的遗物箱打开后三选一，获得只在本次下潜生效的增益。",
    dur: 4.5,
    build(d) {
      blank(d);
      air(d, C - 5, C + 1, 3, 5);
      d.set(C + 2, 5, T.CHEST), (d.chest[5 * MW + C + 2] = "plain");
      d.set(C + 4, 5, T.CHEST), (d.chest[5 * MW + C + 4] = "relic");
      put(d, C - 2, 6);
    },
    input: (d, t) => {
      if (d.choice && (d._ct = (d._ct || 0) + 1 / 60) > 0.6) d.takeRelic(d.choice[0]);
      return { ...idle, mx: 1 };
    },
  },
  {
    title: "落石与瓦斯",
    text: "头顶有松动的石块时，挖掉下面的支撑它就会砸下来；灰绿色的瓦斯岩挖开会冒毒气，离开毒云就安全。",
    dur: 4.5,
    build(d) {
      blank(d);
      air(d, C - 4, C + 4, 3, 5);
      d.set(C + 1, 2, T.BOULDER);
      d.set(C + 3, 5, T.GAS);
      put(d, C - 2, 6);
    },
    input: (d, t) => {
      if (t > 0.6 && !d._fell) (d._fell = true), d.checkFall(C + 1, 2);
      return { ...idle, mx: t > 0.3 && t < 3.6 ? 1 : 0 };
    },
  },
  {
    title: "撤离",
    text: "回到地面或走进撤离电梯站定 1 秒才算安全撤离，背包全部带出；信标可以随地撤离（按下后需确认）。",
    dur: 4.2,
    build(d) {
      blank(d);
      air(d, C - 5, C + 4, 3, 5);
      for (let c = C - 5; c <= C + 4; c++) d.set(c, 6, T.BRICK);
      d.set(C + 2, 5, T.LIFT);
      d.lifts.push({ c: C + 2, r: 5 });
      put(d, C - 3, 6);
    },
    input: (d) => ({ ...idle, mx: d.p.x < (C + 2) * MT + 10 ? 1 : 0 }),
  },
  {
    title: "宝藏鼹鼠",
    text: "发光的宝藏鼹鼠会逃跑、会钻土，二十多秒后钻走；追上打倒它能拿到一堆好矿和星砂。",
    dur: 4.5,
    build(d) {
      blank(d);
      air(d, C - 6, C + 7, 4, 5);
      put(d, C - 5, 6);
      const m = d.mkMob("mole", (C - 1) * MT, 5 * MT + 4);
      m.life = 22;
      d.mobs.push(m);
    },
    input: (d) => ({ ...idle, mx: 1, atk: true }),
  },
  {
    title: "地下商人",
    text: "洞穴里提灯的地下商人：站在旁边不动就能打开交易，用背包里的矿物换遗物、药水、电池和炸药。",
    dur: 3.5,
    build(d) {
      blank(d);
      air(d, C - 5, C + 4, 3, 5);
      for (let c = C - 5; c <= C + 4; c++) d.set(c, 6, T.BRICK);
      d.merchant = { x: (C + 2) * MT, y: 6 * MT, c0: C - 1, r: 5 };
      put(d, C - 4, 6);
    },
    input: (d) => {
      d.shop = false; // the demo only shows walking up to the stall
      return { ...idle, mx: d.p.x < (C + 1) * MT - 6 ? 1 : 0 };
    },
  },
  {
    title: "遗迹守护者",
    zoom: 1.15,
    focus: () => ({ x: C * MT, y: 6 * MT }),
    text: "金铲能挖到遗迹最深处的砖室。守护者会砸地（冲击波沿地面推开，跳起来躲）和投石，半血后狂暴；打倒它才能开星图宝箱。",
    dur: 6,
    build(d) {
      blank(d);
      const x0 = C - 9, x1 = C + 9, ty = 1, fy = 10;
      for (let y = ty; y <= fy; y++) for (let x = x0; x <= x1; x++) d.set(x, y, y === ty || y === fy || x === x0 || x === x1 ? T.BRICK : T.AIR);
      d.guardRoom = { x0, x1, ty, fy };
      const g = d.mkMob("golem", (C - 3) * MT, fy * MT - 35);
      g.hp = g.maxHp = 300;
      g.cd = 0.6;
      d.mobs.push(g);
      put(d, C + 4, fy);
      d.p.hp = d.p.maxHp = 99;
    },
    input: (d, t) => ({ ...idle, atk: true, my: d.mobs[0] && d.mobs[0].wave && d.p.ground ? -1 : 0 }),
  },
];

export function showMineGuide() {
  const md = el("div", "modal mg-md");
  md.innerHTML = `<div class="panel mg-p"><div class="mg-h"><h2 class="outline">矿场玩法说明</h2><span class="mg-n o1"></span><button class="btn gray small mg-x">关闭</button></div>
    <div class="mg-body"><button class="mg-arw l" aria-label="上一页"><svg viewBox="0 0 24 40" width="100%" height="100%"><polyline points="18,6 6,20 18,34" fill="none" stroke="#1a1020" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><polyline points="18,6 6,20 18,34" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="mg-stage"><canvas></canvas><div class="mg-t outline"></div></div><button class="mg-arw r" aria-label="下一页"><svg viewBox="0 0 24 40" width="100%" height="100%"><polyline points="6,6 18,20 6,34" fill="none" stroke="#1a1020" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><polyline points="6,6 18,20 6,34" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    <p class="mg-text o1"></p><div class="mg-dots"></div></div>`;
  uiRoot().appendChild(md);
  const cvs = md.querySelector("canvas"), K = 0.6;
  cvs.width = Math.round(VIEW_W * K);
  cvs.height = Math.round(VIEW_H * K);
  const g = cvs.getContext("2d");
  const dots = md.querySelector(".mg-dots");
  dots.innerHTML = PAGES.map((_, i) => `<i data-i="${i}"></i>`).join("");
  let page = 0, d = null, t = 0, alive = true, last = performance.now();
  const cid = (load().sel) || "deepseek";
  const open = (i) => {
    page = (i + PAGES.length) % PAGES.length;
    const P = PAGES[page];
    d = new Dive({ cid, shovel: "au", up: {}, fx: null, seed: 7 + page, lite: { rows: 12, time: 9999 } });
    d.onEnd = () => {};
    P.build(d);
    t = 0;
    md.querySelector(".mg-t").textContent = P.title;
    md.querySelector(".mg-text").textContent = P.text;
    md.querySelector(".mg-n").textContent = `${page + 1} / ${PAGES.length}`;
    dots.querySelectorAll("i").forEach((n, k) => n.classList.toggle("on", k === page));
  };
  const loop = (now) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    setMute(true);
    try {
      const P = PAGES[page];
      t += dt;
      if (t > P.dur || d.ended) open(page);
      else {
        d.update(dt, P.input(d, t));
        if (d.lite) d.lite.left = 9999;
        // zoom in on the action: the demo camera is closer than the game's
        const ZM = P.zoom || 1.8, vwW = VIEW_W / 1.3, vhW = VIEW_H / 1.3, f = P.focus ? P.focus(d) : { x: d.p.x, y: d.p.y - 30 };
        d.cam.x = f.x - vwW / ZM / 2;
        d.cam.y = f.y - vhW / ZM / 2;
        d.draw(g, K * ZM);
      }
    } finally {
      setMute(false);
    }
    requestAnimationFrame(loop);
  };
  const close = () => {
    alive = false;
    md.remove();
  };
  md.querySelector(".mg-x").onclick = close;
  md.addEventListener("click", (e) => e.target === md && close());
  md.querySelector(".mg-arw.l").onclick = () => (sfx("click"), open(page - 1));
  md.querySelector(".mg-arw.r").onclick = () => (sfx("click"), open(page + 1));
  dots.onclick = (e) => e.target.dataset.i != null && (sfx("click"), open(+e.target.dataset.i));
  // swipe
  let sx = null;
  const stage = md.querySelector(".mg-stage");
  stage.addEventListener("pointerdown", (e) => (sx = e.clientX));
  stage.addEventListener("pointerup", (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 40) open(page + (dx < 0 ? 1 : -1));
  });
  open(0);
  requestAnimationFrame(loop);
  sfx("card");
}
