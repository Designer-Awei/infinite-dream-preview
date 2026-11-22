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
  thunder_judge: ["thunder-judge", {}],
  // V5: 梦貘 (第 8 位首领) and its sleep bubbles
  baku: ["baku", {}],
  dream_orb: ["dream-orb", {}],
  // V3 monsters and the 精英巢穴 nests (one module, three map palettes)
  spider: ["spider", {}],
  turtle: ["turtle", {}],
  snail: ["snail", {}],
  drone: ["drone", {}],
  nest_grass: ["nest", {}],
  nest_ice: ["nest", { palette: ["#060c18", "#122440", "#1e3e6a", "#346aa0", "#5e9ccc", "#a4d4f2"], glow: ["#1a5a8a", "#6ad8ff", "#e8ffff"], strand: "#d8f0ff" }],
  nest_lava: ["nest", { palette: ["#0c0606", "#1e1210", "#33201c", "#4c302a", "#6a4636", "#8e6248"], glow: ["#7a1a04", "#ff8a1a", "#fff0a0"], strand: "#ffb070" }],
  // V6 梦境大陆 · 外围三大陆: region monsters (流沙蝎 and its king, 影蛾 from pixelfx's butterfly, 风羽雀 from its bird), nests, bosses
  scorpion: ["scorpion", {}],
  scorpion_king: ["scorpion", { palette: ["#0e0406", "#2e0c10", "#5a1a1a", "#8a2a22", "#c44a2e", "#f08a4a"], sting: ["#5a3a04", "#ffc23a", "#fff4c0"], eye: ["#2a0404", "#ffe04a"] }],
  moth: ["butterfly", { palette: ["#0a0614", "#1a1030", "#2e1a52", "#4a2a80", "#7a4ab8", "#b890e8", "#f0e0ff"], spots: ["#063a34", "#1aa890", "#5af0d0", "#d0fff4"], still: 1 }],
  skylark: ["bird", { palette: ["#141a30", "#3a4a7a", "#6a80b8", "#9ab4e0", "#c8daf4", "#eef4ff", "#ffffff"], breast: ["#5a3a08", "#c8901a", "#ffd04a", "#fff0a0"] }],
  nest_sand: ["nest", { palette: ["#140a04", "#3a2210", "#5e3a1a", "#8a5a2a", "#b8843e", "#e0b468"], glow: ["#7a3a04", "#ffb03a", "#fff0b0"], strand: "#f0d8a0" }],
  nest_forest: ["nest", { palette: ["#040c08", "#0c2014", "#163420", "#224a2e", "#346a42", "#5a9064"], glow: ["#0a4a40", "#3af0c8", "#d8fff4"], strand: "#a8e8d0" }],
  nest_cloud: ["nest", { palette: ["#1a1830", "#3a3a62", "#5e6090", "#8a8eba", "#b8bce0", "#e8eafc"], glow: ["#2a4aa0", "#8ad0ff", "#ffffff"], strand: "#ffffff" }],
  sand_colossus: ["sand-colossus", {}],
  myco_mother: ["myco-mother", {}],
  tempest: ["tempest", {}],
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
