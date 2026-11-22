// Loads images and prepares the sprite canvases the renderer draws from.
import { CHAR_ORDER, ELEM, CHARS, SPR_K } from "./data.js";

export const A = { girls: {}, critters: {}, portraits: {}, pets: null, mounts: {}, npc: null, ready: false };

function img(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("load " + src));
    i.src = src;
  });
}
const json = (src) => fetch(src).then((r) => r.json());

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
/** A copy of a canvas/image region with every opaque pixel set to one color. */
export function silhouette(src, color, sx = 0, sy = 0, w = src.width, h = src.height) {
  const c = canvas(w, h), g = c.getContext("2d");
  g.drawImage(src, sx, sy, w, h, 0, 0, w, h);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  return c;
}
function crop(src, sx, sy, w, h, flip = false) {
  const c = canvas(w, h), g = c.getContext("2d");
  if (flip) {
    g.translate(w, 0);
    g.scale(-1, 1);
  }
  g.drawImage(src, sx, sy, w, h, 0, 0, w, h);
  return c;
}
// tight vertical bounds so feet sit on the anchor
function bounds(c) {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let y0 = c.height, y1 = 0, x0 = c.width, x1 = 0;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (d[(y * c.width + x) * 4 + 3] > 10) {
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
  return { x0, y0, x1, y1 };
}

export async function loadAll(progress = () => {}) {
  const base = "assets/";
  const [gj0, gi0, cj, hj, hi] = await Promise.all([json(base + "girls.json"), img(base + "girls.png"), json(base + "critters/critters.json"),
    json(base + "girls_hd.json").catch(() => null), img(base + "girls_hd.png").catch(() => null)]);
  progress(0.3);
  for (const id of CHAR_ORDER) {
    // 192px frames (k=2) override a girl's 96px row when girls_hd has her: same world size, twice the detail
    const hd = hj && hi && hj.frames[id], gj = hd ? hj : gj0, gi = hd ? hi : gi0;
    const fr = gj.frames[id], views = {};
    for (const v of ["front", "back", "side"]) {
      const [x, y, w, h] = fr[v];
      views[v] = crop(gi, x, y, w, h);
      if (v === "side") views.sideL = crop(gi, x, y, w, h, true);
    }
    const b = bounds(views.front);
    const set = { w: gj.cw, h: gj.ch, foot: b.y1 + 1, top: b.y0, k: gj.k || SPR_K, views, white: {}, tint: {}, clips: {} };
    for (const v of ["front", "back", "side", "sideL"]) {
      set.white[v] = silhouette(views[v], "#ffffff");
      set.tint[v] = silhouette(views[v], ELEM[CHARS[id].elem].glow);
    }
    // animation clips (PixelLab frames): idle / run / attack in 3 directions (+ mirrored west)
    for (const [name, cells] of Object.entries((gj.clips && gj.clips[id]) || {})) {
      const list = [], flip = [];
      for (const [cx, cy] of cells) {
        list.push(crop(gi, cx, cy, gj.cw, gj.ch));
        flip.push(crop(gi, cx, cy, gj.cw, gj.ch, true));
      }
      set.clips[name] = list;
      set.clips[name + "L"] = flip;
    }
    A.girls[id] = set;
  }
  progress(0.5);
  const names = Object.keys(cj);
  const imgs = await Promise.all(names.map((n) => img(base + "critters/" + n + ".png")));
  names.forEach((n, i) => {
    const m = cj[n];
    A.critters[n] = { ...m, img: imgs[i], white: silhouette(imgs[i], "#ffffff"), red: silhouette(imgs[i], "#ff5050"), blue: silhouette(imgs[i], "#bfefff") };
  });
  // map residents: recoloured copies of the base critters (luminance mapped onto a 5-colour ramp)
  for (const [name, [base, ramp]] of Object.entries(VARIANTS)) {
    const b = A.critters[base];
    if (!b) continue;
    const im = recolor(b.img, ramp);
    A.critters[name] = { ...b, img: im, white: silhouette(im, "#ffffff"), red: silhouette(im, "#ff5050"), blue: silhouette(im, "#bfefff") };
  }
  progress(0.8);
  const ps = await Promise.all(CHAR_ORDER.map((id) => img(base + "portrait_" + id + ".png")));
  CHAR_ORDER.forEach((id, i) => (A.portraits[id] = ps[i]));
  const [petMeta, petImage] = await Promise.all([json(base + "pets/pets.json"), img(base + "pets/pets.png")]);
  const petImages=await Promise.all((petMeta.pages||[{file:'pets.png'}]).map((page,i)=>i===0?petImage:img(base+'pets/'+page.file)));
  A.pets = { meta: petMeta, image: petImage, images:petImages };
  await Promise.all(['fox','dragon','phoenix'].map(async id=>{
    const [meta,image,mask]=await Promise.all([json(base+'pets/'+id+'-mounted.json'),img(base+'pets/'+id+'-mounted.png'),img(base+'pets/'+id+'-mounted-mask.png').catch(()=>null)]);
    A.mounts[id]={meta,image,mask}; // mask: which pixels of a mounted frame are the pet (异色 recolour)
  }));
  // event visitors (梦境航线): one row of idle frames each
  try {
    const [meta, image] = await Promise.all([json(base + "npc/npc.json"), img(base + "npc/npc.png")]);
    // a visitor drawn in high resolution has its own strip (file, cell px, k = world px per source px)
    const files = [...new Set(Object.values(meta.npcs).map((m) => m.file).filter(Boolean))];
    const sheets = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await img(base + "npc/" + f)])));
    A.npc = { meta, image, sheets };
    // 宝箱怪 as a monster (诅咒宝箱's 宝箱怪 fate): the visitor's idle row as a critter strip
    const mm = meta.npcs.curse, cs = meta.cell;
    if (mm && mm.row != null) {
      const st = canvas(cs * mm.n, cs);
      st.getContext("2d").drawImage(image, 0, mm.row * cs, cs * mm.n, cs, 0, 0, cs * mm.n, cs);
      A.critters.mimic = { img: st, w: cs, h: cs, n: mm.n, fps: 8, ox: mm.ox, oy: mm.oy, white: silhouette(st, "#ffffff"), red: silhouette(st, "#ff5050"), blue: silhouette(st, "#bfefff") };
    }
  } catch {}
  try {
    await document.fonts.load("12px Cubic");
  } catch {}
  progress(1);
  A.ready = true;
}

const ICE = ["#0a1a30", "#1e4a7a", "#4a9ad8", "#a8e0ff", "#ffffff"];
const LAVA = ["#1a0600", "#7a1e06", "#d8481c", "#ffa030", "#fff0a0"];
/** recoloured critters for each map's own monsters and bosses */
const VARIANTS = {
  snake_vine: ["snake", ["#0e2a10", "#1f5a22", "#3a9a3a", "#7ad85a", "#d8ffb0"]],
  frog_big: ["frog", ["#20102a", "#5a2a7a", "#a050c8", "#e08aff", "#fff0ff"]],
  bat_ice: ["bat", ICE],
  eye_ice: ["eyeball", ICE],
  slime_frost: ["slime_blue", ["#0a1a30", "#3a7ab8", "#8ad0ff", "#e0f8ff", "#ffffff"]],
  slime_lava: ["slime", LAVA],
  bat_fire: ["bat", LAVA],
  skull_core: ["skull", ["#1a0400", "#8a1a0a", "#ff4a1a", "#ffb040", "#ffffe0"]],
  snake_lava: ["snake", ["#1a0804", "#5a1e10", "#9a3a1e", "#d8702e", "#ffd090"]], // red-brown, not the grass green
  snake_ice: ["snake", ICE],
  jelly_ice: ["jelly", ["#0a1a30", "#2a5a9a", "#6ab8f0", "#c8f0ff", "#ffffff"]],
  // V6 梦境大陆 · 外围三大陆
  snake_sand: ["snake", ["#1a1004", "#5a3e14", "#a8782a", "#e0b450", "#fff0b0"]],
  slime_sand: ["slime", ["#1e1206", "#7a5420", "#c8943e", "#f0cc78", "#fff6d8"]],
  bat_sand: ["bat", ["#1a0e04", "#6a4418", "#b07a30", "#e8b860", "#fff0c0"]],
  skull_sand: ["skull", ["#140c04", "#5a4220", "#a8884a", "#e8d098", "#fffbe8"]],
  beetle_sand: ["beetle", ["#0e0a20", "#2a3a8a", "#3a8ad0", "#ffc23a", "#fff4c0"]],
  mushroom_shadow: ["mushroom", ["#100620", "#3a1a60", "#7a3ab0", "#5ae8c8", "#e0fff8"]],
  spider_shadow: ["spider", ["#06040e", "#1a1430", "#3a2a60", "#6a4aa0", "#5af0d0"]],
  frog_bog: ["frog", ["#06140c", "#1e3a22", "#3a6a34", "#8ab04a", "#e0f0a0"]],
  wisp_shadow: ["wisp", ["#04100e", "#0e4a40", "#2ab8a0", "#8af0dc", "#ffffff"]],
  jelly_cloud: ["jelly", ["#1a1a34", "#6a7ab0", "#b0c4ec", "#eef4ff", "#ffffff"]],
  slime_cloud: ["slime", ["#1c1c34", "#7a82b8", "#c0c8ec", "#f0f4ff", "#ffffff"]],
  eye_cloud: ["eyeball", ["#101a3a", "#3a6ab8", "#8ac8ff", "#e8f6ff", "#ffffff"]],
  wisp_cloud: ["wisp", ["#141a40", "#3a5aff", "#8ac8ff", "#e8f4ff", "#ffffff"]],
  // the rare ones
  slime_gold: ["slime", ["#2a1600", "#8a5a00", "#e0a820", "#ffe070", "#ffffff"]],
  jelly_aurora: ["jelly", ["#0a1030", "#3a3ab0", "#5ad8e0", "#d0a0ff", "#ffffff"]],
  skull_obsidian: ["skull", ["#08040e", "#2a1640", "#6a3aa0", "#ffb040", "#fff0c0"]],
};
function recolor(src, ramp) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  const rgb = ramp.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const l = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255;
    if (l < 0.1) continue; // keep the dark outline
    const k = Math.min(rgb.length - 1, Math.max(0, Math.round(l * (rgb.length - 1) * 1.08)));
    px[i] = rgb[k][0];
    px[i + 1] = rgb[k][1];
    px[i + 2] = rgb[k][2];
  }
  g.putImageData(d, 0, 0);
  return c;
}
