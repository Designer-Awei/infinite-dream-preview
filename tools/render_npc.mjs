// Render code-drawn event visitors (pixelfx critter modules kept in tools/npcfx/) into a square-cell strip and register
// it in web/assets/npc/npc.json as a "file" entry (other entries are left untouched). The game draws its own shadow,
// so only the front layer is rendered.
// usage: node tools/render_npc.mjs <pixelfx checkout> [name ...]
import { writeFileSync, readFileSync, copyFileSync } from "node:fs";
const PFX = process.argv[2], OUT = new URL("../web/assets/npc/", import.meta.url).pathname;
const core = await import(PFX + "/src/core/index.js");
const { encodePNG } = await import(PFX + "/tools/lib/png.mjs");
const { createFrame, clearFrame, createFx, composite } = core;
// npc id -> [module file in tools/npcfx, entry fields]
const LIST = {
  slot: ["slot-machine", { h: 84, face: [8, 2, 80] }],
};
const want = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(LIST);
const manifest = JSON.parse(readFileSync(OUT + "npc.json", "utf8"));
for (const name of want) {
  const [file, extra] = LIST[name];
  copyFileSync(new URL(`./npcfx/${file}.js`, import.meta.url).pathname, `${PFX}/src/fx/critters/${file}.js`);
  const mod = await import(`${PFX}/src/fx/critters/${file}.js?v=${Date.now()}`);
  const m = mod.meta, [W, H] = m.size, [ox, oy] = m.origin, fps = manifest.fps, n = Math.max(1, Math.round(m.duration * fps));
  const fx = createFx(mod, { x: ox, y: oy, seed: 1 });
  const f = createFrame(W, H), out = new Uint8ClampedArray(W * n * H * 4);
  for (let i = 0; i < n; i++) {
    clearFrame(f);
    fx.draw(f, "front");
    for (let k = 0; k < W * H; k++) {
      const c = f.color[k] >>> 24, l = f.light[k], lm = Math.max(l & 255, (l >>> 8) & 255, (l >>> 16) & 255);
      if (c === 0 && lm < 110) f.light[k] = 0;
    }
    const px = new Uint8ClampedArray(W * H * 4);
    composite(f, px, null, 0.8);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 4, d = (y * W * n + i * W + x) * 4;
      out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
    }
    fx.update(1 / fps);
  }
  writeFileSync(`${OUT}${name}.png`, encodePNG(W * n, H, out));
  manifest.npcs[name] = { file: `${name}.png`, cell: W, k: 1, n, ox, oy, ...extra };
  console.log(name, W, H, n);
}
writeFileSync(OUT + "npc.json", JSON.stringify(manifest, null, 1) + "\n");
