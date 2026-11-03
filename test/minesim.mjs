// Balance probe: runs many dives headless with a simple greedy digger and prints average yields per shovel / upgrade set.
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 804, height: 360 } });
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.goto("http://localhost:8775/index.html"); await p.waitForTimeout(2500);
const out = await p.evaluate(async () => {
  const { Dive } = await import("./js/mine.js");
  const { T, MT, ORES, HARD } = await import("./js/minedata.js");
  const run = (shovel, up, seed) => {
    const d = new Dive({ cid: "deepseek", shovel, up, fx: null, seed });
    let res = null;
    d.onEnd = (r) => (res = r);
    const dt = 1 / 30;
    let t = 0, side = 0, sideT = 0;
    while (!res && t < 600) {
      const p = d.p, c = Math.floor(p.x / MT), r = Math.floor((p.y - 10) / MT);
      const inp = { mx: 0, my: 0, atk: d.mobs.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < 140), bomb: false, beacon: false };
      const deep = Math.floor(p.y / MT);
      const want = d.bag.length >= d.bagCap || p.energy < p.maxE * 0.12 || p.hp <= 2 || deep >= d.maxDepth - 1;
      if (want && !p.beaconT) {
        if (p.beacons > 0) inp.beacon = true;
      } else {
        // ore or chest beside us? dig sideways toward it
        if (sideT <= 0) {
          side = 0;
          for (const dx of [1, -1, 2, -2]) {
            const tt = d.get(c + dx, r);
            if ((tt === T.ORE && (ORES[d.ore[d.idx(c + dx, r)]].v >= 2 || d.bag.length < 4)) || tt === T.CHEST) { side = Math.sign(dx); sideT = 1.2; break; }
          }
        }
        sideT -= dt;
        const below = d.get(c, Math.floor((p.y + 2) / MT)), hd = HARD[below];
        if (side) inp.mx = side;
        else if (hd && hd.need > d.drill) inp.mx = (Math.floor(t) % 6) < 3 ? 1 : -1; // go around hard rock
        else inp.my = 1;
      }
      d.update(dt, inp);
      t += dt;
    }
    return res || { how: "stuck", value: 0, stars: 0, depth: d.p.deepest, mats: 0 };
  };
  const sets = {
    base: {},
    mid: { drill: 1, battery: 2, bag: 2, armor: 1, radar: 1, beacon: 1, tank: 1 },
    max: { drill: 3, battery: 5, bag: 5, armor: 3, radar: 3, beacon: 2, tank: 3 },
  };
  const rows = [];
  for (const [name, up] of Object.entries(sets))
    for (const sh of ["cu", "ag", "au"]) {
      let v = 0, s = 0, m = 0, dep = 0, hows = {}, N = 24;
      for (let i = 0; i < N; i++) {
        const r = run(sh, up, 1000 + i * 77);
        v += r.value; s += r.stars; m += r.mats; dep += r.depth;
        hows[r.how] = (hows[r.how] || 0) + 1;
      }
      rows.push(`${name.padEnd(4)} ${sh}: 💎${(v / N).toFixed(0)} ★${(s / N).toFixed(1)} ⛏${(m / N).toFixed(0)} depth ${(dep / N).toFixed(0)} ${JSON.stringify(hows)}`);
    }
  return rows;
});
console.log(out.join("\n"));
await b.close();
