// Render the boss critters (authored as pixelfx critter modules, sources kept in tools/bossfx/) into trimmed
// sprite strips and merge them into web/assets/critters/critters.json (other entries are left untouched).
// usage: node tools/render_bosses.mjs <pixelfx checkout> [name ...]
// The module files must be copied to <pixelfx>/src/fx/critters/ (they import ../../core/index.js).
import { writeFileSync, readFileSync, copyFileSync } from "node:fs";
const PFX = process.argv[2], OUT = new URL("../web/assets/critters/", import.meta.url).pathname;
const core = await import(PFX + "/src/core/index.js");
const { encodePNG } = await import(PFX + "/tools/lib/png.mjs");
const { createFrame, clearFrame, createFx, composite } = core;
// sprite name -> module file in tools/bossfx (and options)
const LIST = {
  root_heart: ["root-heart", {}],
  frost_witch: ["frost-witch", {}],
  frost_witch_clone: ["frost-witch", { noShadow: true }],
  lava_worm: ["lava-worm", {}],
};
const want = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(LIST);
const manifest = JSON.parse(readFileSync(OUT + "critters.json", "utf8"));
for (const name of want) {
  const [file, opts] = LIST[name];
  copyFileSync(new URL(`./bossfx/${file}.js`, import.meta.url).pathname, `${PFX}/src/fx/critters/${file}.js`);
  const mod = await import(`${PFX}/src/fx/critters/${file}.js?v=${Date.now()}`);
  const m = mod.meta, [W, H] = m.size, [ox, oy] = m.origin;
  const fps = 12, n = Math.max(1, Math.round(m.duration * fps));
  const fx = createFx(mod, { x: ox, y: oy, seed: 1, ...opts });
  const f = createFrame(W, H), frames = [];
  for (let i = 0; i < n; i++) {
    clearFrame(f);
    fx.draw(f, "back");
    fx.draw(f, "front");
    const px = new Uint8ClampedArray(W * H * 4);
    for (let k = 0; k < W * H; k++) {
      const c = f.color[k] >>> 24, l = f.light[k], lm = Math.max(l & 255, (l >>> 8) & 255, (l >>> 16) & 255);
      if (c === 0 && lm < 110) f.light[k] = 0;
    }
    composite(f, px, null, 0.8);
    frames.push(px);
    fx.update(1 / fps);
  }
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const px of frames) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (px[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = new Uint8ClampedArray(cw * n * ch * 4);
  frames.forEach((px, i) => {
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const s = ((y + y0) * W + x + x0) * 4, d = (y * cw * n + i * cw + x) * 4;
      out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
    }
  });
  writeFileSync(`${OUT}${name}.png`, encodePNG(cw * n, ch, out));
  manifest[name] = { w: cw, h: ch, n, fps, ox: ox - x0, oy: oy - y0 };
  console.log(name, cw, ch, n);
}
writeFileSync(OUT + "critters.json", JSON.stringify(manifest));
