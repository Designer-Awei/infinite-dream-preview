// 宠物换皮（代码实现，不需要新美术）：
// 1) 重新上色：逐像素 HSL 改写。可整体转色相，也可只改某一色相段（例：火龙的红色鳞片变冰蓝，金色角和眼睛不动）。
//    每个 256px 动画帧第一次画到时改写一次并缓存。
// 2) 光环：取当前帧轮廓的上沿，每帧用代码画像素粒子（火焰 / 冰晶 / 电花 / 暗影烟），与精灵同一变换，自动跟随翻转和缩放。
// 皮肤定义只是数据，换皮 = 换一行配置。

/** rules: [{ from:[h0,h1], to?, shift?, sat?, light?, minS? }] — 色相 0~360；from 可跨 0（如 [330, 30]）；
 *  to = 改到某个色相，shift = 色相偏移，sat / light = 饱和度、明度倍数，minS = 低于该饱和度的灰白像素不改 */
export const PET_SKINS = {
  frost: { name: "霜鳞", rules: [{ from: [330, 40], to: 200, sat: 0.85, light: 1.05, minS: 0.25 }], aura: "frost" },
  ember: { name: "炎魂", rules: [{ from: [0, 360], shift: 0, sat: 1.15, light: 1.0 }], aura: "flame" },
  sakura: { name: "绯樱", rules: [{ from: [0, 360], to: 342, sat: 0.72, light: 1.1, minS: 0.15 }], aura: "petal" },
  gold: { name: "灿金", rules: [{ from: [0, 360], to: 43, sat: 0.95, light: 1.08, minS: 0.15 }], aura: "spark" },
  jade: { name: "翠玉", rules: [{ from: [0, 360], to: 140, sat: 0.8, light: 0.95, minS: 0.2 }], aura: null },
  blaze: { name: "焚羽", rules: [{ from: [170, 260], to: 18, sat: 1.1, light: 1.02, minS: 0.2 }], aura: "flame" },
  // 流彩：no fixed recolour; a rainbow drifting across the body is laid over each frame as it is drawn (flowFrame)
  flow: { name: "流彩", rules: [], flow: true, aura: "spark" },
};
// the old purple 暗影 skin reads as 绯樱 now
PET_SKINS.shadow = PET_SKINS.sakura;

const inHue = (h, [a, b]) => (a <= b ? h >= a && h <= b : h >= a || h <= b);
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
/** recolour an ImageData in place; memo = Map of rgb -> recoloured rgb shared by every frame of one skin
 *  (frames reuse the same colours, so most pixels are a lookup) */
export function recolorData(d, rules, memo = new Map()) {
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2], hit = memo.get(key);
    if (hit !== undefined) { px[i] = hit >> 16; px[i + 1] = (hit >> 8) & 255; px[i + 2] = hit & 255; continue; }
    let [h, s, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
    for (const r of rules) {
      if (s < (r.minS ?? 0) || !inHue(h, r.from)) continue;
      // to: move the band onto one hue, keeping a little of its original spread (circular distance from the band's
      // middle; a full-circle band has no middle, so no spread); shift: rotate the hue
      const span = ((r.from[1] - r.from[0]) + 360) % 360 || 360, mid = r.from[0] + span / 2;
      const dh = ((h - mid + 540) % 360) - 180;
      h = r.to != null ? r.to + (span >= 360 ? 0 : dh * 0.15) : h + (r.shift || 0);
      s = Math.min(1, s * (r.sat ?? 1));
      l = Math.min(1, l * (r.light ?? 1));
      break;
    }
    const [R, G, B] = hsl2rgb(h, s, l), out = (Math.round(R) << 16) | (Math.round(G) << 8) | Math.round(B);
    memo.set(key, out);
    px[i] = out >> 16; px[i + 1] = (out >> 8) & 255; px[i + 2] = out & 255;
  }
  return d;
}
const memos = new Map(); // skin id -> colour memo

// one recoloured cell per (skin, image, x, y): the frames are cut out of the atlas on first use
const cells = new Map();
export function skinnedCell(skinId, img, sx, sy, w, h) {
  const key = `${skinId}|${img.src || img.width}|${sx}|${sy}`;
  let c = cells.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  const skin = PET_SKINS[skinId];
  if (skin?.rules?.length) {
    if (!memos.has(skinId)) memos.set(skinId, new Map());
    g.putImageData(recolorData(g.getImageData(0, 0, w, h), skin.rules, memos.get(skinId)), 0, 0);
  }
  c.edges = topEdges(g.getImageData(0, 0, w, h));
  cells.set(key, c);
  return c;
}
/** a skinned frame ready to draw: the recoloured cell, or for 流彩 the cell with a moving rainbow laid over it
 *  (canvas "color" blend keeps each pixel's lightness, so outlines stay dark and highlights stay bright) */
const flowBuf = document.createElement("canvas");
export function skinnedFrame(skinId, img, sx, sy, w, h, t = 0) {
  const cell = skinnedCell(skinId, img, sx, sy, w, h);
  if (!PET_SKINS[skinId]?.flow) return cell;
  if (flowBuf.width !== w || flowBuf.height !== h) (flowBuf.width = w), (flowBuf.height = h);
  // two full hue cycles across the cell's diagonal, drifting with time, so even a small pet shows the whole rainbow
  const g = flowBuf.getContext("2d"), grad = g.createLinearGradient(w * 0.2, h * 0.2, w * 0.8, h * 0.8), o = (t * 90) % 360;
  for (let i = 0; i <= 12; i++) grad.addColorStop(i / 12, `hsl(${(o + i * 60) % 360} 95% 60%)`);
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, w, h);
  g.drawImage(cell, 0, 0);
  g.globalCompositeOperation = "color";
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(cell, 0, 0);
  g.globalCompositeOperation = "source-over";
  flowBuf.edges = cell.edges;
  return flowBuf;
}
/** silhouette points whose pixel above is empty: where flames / frost / sparks rise from (at most 28, evenly spread) */
function topEdges(d) {
  const { width: w, height: h, data } = d, all = [];
  for (let x = 0; x < w; x += 3) for (let y = 1; y < h; y++) {
    if (data[(y * w + x) * 4 + 3] > 120 && data[((y - 1) * w + x) * 4 + 3] < 40) { all.push([x, y]); y += 18; }
  }
  const n = Math.min(28, all.length), out = [];
  for (let i = 0; i < n; i++) out.push(all.at(Math.floor((i * all.length) / n)));
  return out;
}

// ---------------------------------------------------------------------------------------------- auras
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const RAMP = {
  flame: ["#fff3a6", "#ffd23d", "#ff8a2a", "#f2561d", "#c9281f", "#5a1a14"],
  frost: ["#ffffff", "#d8f6ff", "#9ee4ff", "#5ab8f0", "#2a78c8"],
  spark: ["#ffffff", "#fff3a6", "#ffd84a", "#e0a020"],
  shadow: ["#c8a0ff", "#8a5ad0", "#5a2a9a", "#2a1440", "#140a20"],
  petal: ["#ffffff", "#ffe0ec", "#ff9ac0", "#e06090"],
};
/** draw the aura for one frame: called in the sprite's own transform (origin = anchor, k = world px per cell px).
 *  Draws are grouped by colour / opacity so the fill style changes only a few times per pet. */
export function drawAura(ctx, kind, cell, anchor, k, t) {
  const pts = cell?.edges, ramp = RAMP[kind];
  if (!pts || !ramp) return;
  const n = pts.length, X = (i) => (pts[i][0] - anchor[0]) * k, Y = (i) => (pts[i][1] - anchor[1]) * k;
  if (kind === "flame") {
    // each tongue = ramp.length stacked segments (white-hot base -> dark tip), 4~9 px high, swaying more near the tip
    const L = ramp.length;
    for (let c = 0; c < L; c++) {
      ctx.fillStyle = ramp[c];
      for (let i = 0; i < n; i++) {
        const r = hash(i), hgt = 4 + 5 * (0.5 + 0.5 * Math.sin(t * 9 + r * 20)) * (0.6 + 0.4 * r), seg = hgt / L;
        const sway = Math.round(Math.sin(t * 7 + i + c * 0.9) * (c / L) * 1.6);
        ctx.fillRect(Math.round(X(i) + sway), Math.round(Y(i) - (c + 1) * seg), 1, Math.max(1, Math.round(seg)));
        if (c === 2 && r > 0.55) { const e = (t * 0.9 + r) % 1; ctx.fillRect(Math.round(X(i) + Math.sin(t * 3 + i) * 2), Math.round(Y(i) - 6 - e * 14), 1, 1); } // an ember
      }
    }
  } else if (kind === "frost" || kind === "shadow") {
    // motes / smoke that rise and fade: four opacity bands, each drawn in one pass
    const speed = kind === "frost" ? 0.45 : 0.35, rise = kind === "frost" ? 12 : 16;
    for (let band = 0; band < 4; band++) {
      ctx.globalAlpha = (kind === "frost" ? 1 : 0.85) * (1 - band / 4);
      ctx.fillStyle = ramp[1 + Math.min(ramp.length - 2, band)];
      for (let i = 0; i < n; i++) {
        const r = hash(i), e = (t * speed + r) % 1;
        if (Math.floor(e * 4) !== band) continue;
        const x = X(i) + Math.sin(t * 2 + i * 0.7) * (kind === "frost" ? 2 : 1 + e * 3), y = Y(i) - 2 - e * rise, sz = kind === "shadow" ? 1 + band % 2 : 1;
        ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
      }
    }
    ctx.globalAlpha = 1;
    if (kind === "frost") { ctx.fillStyle = ramp[0]; for (let i = 0; i < n; i++) if (Math.sin(t * 4 + hash(i) * 30) > 0.93) { ctx.fillRect(Math.round(X(i)) - 1, Math.round(Y(i) - 3), 3, 1); ctx.fillRect(Math.round(X(i)), Math.round(Y(i) - 4), 1, 3); } }
  } else if (kind === "spark" || kind === "petal") {
    // short gold glints that blink on and off along the outline
    for (const hot of [false, true]) {
      ctx.fillStyle = ramp[hot ? 0 : 2];
      for (let i = 0; i < n; i++) {
        const on = Math.sin(t * 6 + hash(i) * 40);
        if (on <= 0.7 || (on > 0.9) !== hot) continue;
        ctx.fillRect(Math.round(X(i)) - 1, Math.round(Y(i) - 2), 3, 1); ctx.fillRect(Math.round(X(i)), Math.round(Y(i) - 3), 1, 3);
      }
    }
  }
}

/** recolour every frame of one pet form ahead of use, a few frames per idle slice, so battle never waits on it.
 *  cells: [[img, sx, sy, w, h], …] (all clip frames of the form) */
export function warmSkin(skinId, cells, perSlice = 3) {
  let i = 0;
  const step = () => {
    for (let n = 0; n < perSlice && i < cells.length; n++, i++) skinnedCell(skinId, ...cells.at(i));
    if (i < cells.length) (window.requestIdleCallback || setTimeout)(step);
  };
  step();
}
