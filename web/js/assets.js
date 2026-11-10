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
    const [meta,image]=await Promise.all([json(base+'pets/'+id+'-mounted.json'),img(base+'pets/'+id+'-mounted.png')]);
    A.mounts[id]={meta,image};
  }));
  // event visitors (梦境航线): one row of idle frames each
  try {
    const [meta, image] = await Promise.all([json(base + "npc/npc.json"), img(base + "npc/npc.png")]);
    A.npc = { meta, image };
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
