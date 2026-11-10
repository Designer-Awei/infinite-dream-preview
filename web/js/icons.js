// Hand-built pixel-art icons (skills, cards, gacha items). Each icon is drawn on a 20x20 grid with a
// tiny pixel DSL, then gets an automatic 1px ink outline, so every icon shares one consistent style.
import { ELEM, CHARS } from "./data.js";

const N = 20, INK = "#1a1020";
const cache = new Map();

class PX {
  constructor() {
    this.p = new Array(N * N).fill(null);
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < N && y < N && c) this.p[y * N + x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < N && y < N ? this.p[y * N + x] : null;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** filled disc; c may be a function (x, y, dx, dy, r) => color for shading */
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, typeof c === "function" ? c(x, y, dx, dy, r) : c);
      }
  }
  ring(cx, cy, r, w, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r && d > r - w) this.set(x, y, typeof c === "function" ? c(x, y, d) : c);
      }
  }
  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2 || 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      if (w <= 1) this.set(x, y, c);
      else this.rect(Math.round(x - (w - 1) / 2), Math.round(y - (w - 1) / 2), w, w, c);
    }
  }
  poly(pts, c) {
    let minY = 99, maxY = -1;
    for (const [, y] of pts) (minY = Math.min(minY, y)), (maxY = Math.max(maxY, y));
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++)
      for (let x = 0; x < N; x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, typeof c === "function" ? c(x, y) : c);
      }
  }
  /** shading for a disc: light top-left, dark bottom-right */
  static shade(r, base, light, dark, hi) {
    return (x, y, dx, dy, rr) => {
      const k = (dx + dy) / (rr * 1.414);
      if (hi && dx < -rr * 0.35 && dy < -rr * 0.35 && dx > -rr * 0.75) return hi;
      return k > 0.42 ? dark : k < -0.25 ? light : base;
    };
  }
  canvas() {
    const c = document.createElement("canvas");
    c.width = c.height = N + 2;
    const g = c.getContext("2d");
    // ink outline around every filled pixel
    g.fillStyle = INK;
    for (let y = -1; y <= N; y++)
      for (let x = -1; x <= N; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) g.fillRect(x + 1, y + 1, 1, 1);
      }
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const c2 = this.p[y * N + x];
        if (c2) (g.fillStyle = c2), g.fillRect(x + 1, y + 1, 1, 1);
      }
    return c;
  }
}

const R = (e) => ELEM[e].ramp; // 8 steps dark -> white
const pal = (e) => {
  const r = R(e);
  return { deep: r[2], dark: r[3], base: r[4], light: r[5], hi: r[6], w: r[7] };
};
const GOLD = { dark: "#b0700a", base: "#f0b020", light: "#ffd84a", hi: "#fff2a0" };
const RED = { dark: "#a01830", base: "#e83a4a", light: "#ff7a8a", hi: "#ffd0d8" };
const BLUE = { dark: "#2a50b0", base: "#4a8aee", light: "#8ac0ff", hi: "#e0f0ff" };
const GREEN = { dark: "#1a8a3a", base: "#3ad06a", light: "#8af0a0", hi: "#e0ffe8" };
const STEEL = { dark: "#6a7890", base: "#b0bccc", light: "#e0e8f0", hi: "#ffffff" };
const VIOLET = { dark: "#5a2aa0", base: "#9a5ae8", light: "#c8a0ff", hi: "#f0e4ff" };

// ------------------------------------------------------------------ shapes reused by many icons
function bolt(p, c, s = 1, ox = 0, oy = 0) {
  const P = [[11, 1], [4, 11], [9, 11], [7, 19], [16, 8], [11, 8], [14, 1]].map(([x, y]) => [ox + 10 + (x - 10) * s, oy + 10 + (y - 10) * s]);
  p.poly(P, (x, y) => (x + y < 16 * s + ox + oy ? c.light : c.base));
  p.line(P[0][0] + 0.5, P[0][1] + 1, P[1][0] + 2, P[1][1] - 1, c.hi);
}
function heart(p, c, ox = 0, oy = 0, s = 1) {
  const sh = PX.shade(4, c.base, c.light, c.dark, c.hi);
  p.disc(ox + 6.5 * s, oy + 7.5 * s, 4 * s, sh);
  p.disc(ox + 13.5 * s, oy + 7.5 * s, 4 * s, sh);
  p.poly([[ox + 2.6 * s, oy + 9 * s], [ox + 17.4 * s, oy + 9 * s], [ox + 10 * s, oy + 17.5 * s]], (x, y) => (x > ox + 11 * s ? c.dark : c.base));
  p.rect(ox + 4 * s, oy + 5 * s, 2, 2, c.hi);
}
function shield(p, c, ox = 0, oy = 0) {
  p.poly([[3 + ox, 3 + oy], [17 + ox, 3 + oy], [17 + ox, 10 + oy], [10 + ox, 18 + oy], [3 + ox, 10 + oy]], (x) => (x < 10 + ox ? c.light : c.base));
  p.poly([[6 + ox, 6 + oy], [14 + ox, 6 + oy], [14 + ox, 10 + oy], [10 + ox, 14.5 + oy], [6 + ox, 10 + oy]], (x) => (x < 10 + ox ? c.base : c.dark));
  p.rect(4 + ox, 4 + oy, 2, 3, c.hi);
}
function star(p, c, cx = 10, cy = 10, r1 = 8, r2 = 3.5, n = 4, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? r2 : r1;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  p.poly(pts, (x, y) => (x + y < cx + cy ? c.light : c.base));
  p.rect(cx - 1, cy - 1, 2, 2, c.hi);
}
function coin(p, c, cx = 10, cy = 10, r = 7) {
  p.disc(cx, cy, r, PX.shade(r, c.base, c.light, c.dark));
  p.ring(cx, cy, r - 2, 1, c.dark);
  p.rect(cx - 1, cy - 3, 2, 6, c.hi);
}
function arrowR(p, c, y, x0 = 2, x1 = 17) {
  p.line(x0, y, x1 - 3, y, c.base, 2);
  p.poly([[x1 - 5, y - 4], [x1 + 1, y + 0.5], [x1 - 5, y + 5]], c.light);
}
function flame(p, c) {
  p.poly([[10, 1], [15, 8], [16, 13], [13, 18], [7, 18], [4, 13], [5, 8], [7, 10], [8, 5]], (x, y) => (y > 13 ? c.dark : x > 11 ? c.base : c.light));
  p.poly([[10, 8], [13, 13], [11, 17], [9, 17], [7, 13]], c.hi);
}
function shovel(p, c) {
  p.line(5, 15, 13, 4, "#8a5a30", 2);
  p.rect(12, 2, 4, 2, "#5a3a1a");
  p.poly([[1, 14], [6, 10], [10, 14], [6, 19], [2, 18]], c.base);
  p.poly([[2, 14], [6, 11], [8, 13], [4, 15]], c.light);
  p.poly([[6, 19], [10, 14], [9, 17]], c.dark);
}
function card(p, c, inner) {
  p.rect(4, 2, 12, 16, c.light);
  p.rect(5, 3, 10, 14, c.base);
  p.rect(5, 3, 2, 14, c.light);
  if (inner) inner();
  else star(p, { light: "#ffffff", base: c.hi, hi: "#ffffff" }, 10, 10, 4.5, 2, 4);
}

// ------------------------------------------------------------------ the icon table
const DRAW = {
  // ---- DeepSeek (water)
  deepseek_atk(p) {
    const c = pal("water");
    p.poly([[10, 1.5], [4.5, 11], [15.5, 11]], (x) => (x < 10 ? c.light : c.base));
    p.disc(10, 12.5, 6, PX.shade(6, c.base, c.light, c.dark, c.w));
    p.rect(7, 9, 1, 3, c.w);
  },
  deepseek_skill(p) {
    const c = pal("water");
    for (let x = 1; x < 19; x++) {
      const top = Math.round(9 + 2.6 * Math.sin(x * 0.75));
      for (let y = top; y < 18; y++) p.set(x, y, y === top ? c.hi : y < top + 3 ? c.light : y < 15 ? c.base : c.dark);
      if (Math.sin(x * 0.75) < -0.85) p.set(x, top - 1, c.w);
    }
    p.disc(5, 4, 1.6, c.light);
    p.disc(15, 3, 1.2, c.light);
  },
  deepseek_ult(p) {
    const c = pal("water");
    p.rect(9, 9, 3, 8, c.base);
    p.poly([[10.5, 10], [1.5, 2.5], [1, 7], [5, 10.5]], (x, y) => (y < 6 ? c.light : c.base));
    p.poly([[10.5, 10], [19, 2.5], [19.5, 7], [16, 10.5]], (x, y) => (y < 6 ? c.base : c.dark));
    for (let x = 0; x < 20; x++) {
      const t = Math.round(16 + Math.sin(x * 0.9));
      for (let y = t; y < 20; y++) p.set(x, y, y === t ? c.hi : c.light);
    }
  },
  // ---- GPT (dragon)
  gpt_atk(p) {
    const c = pal("dragon");
    p.line(3, 17, 8, 12, c.light, 2);
    p.line(2, 14, 5, 12, c.base, 1);
    p.disc(11.5, 8.5, 6, PX.shade(6, c.base, c.light, c.dark, c.w));
    p.rect(9, 6, 2, 2, c.w);
  },
  gpt_skill(p) {
    const c = pal("dragon");
    p.poly([[2, 10], [18, 2], [16, 10], [18, 18]], (x, y) => {
      const j = (x + y * 3) % 5 === 0 && x > 14;
      if (j) return null;
      return x < 6 ? c.w : x < 10 ? c.hi : x < 14 ? c.light : c.base;
    });
    p.rect(1, 9, 2, 3, c.w);
  },
  gpt_ult(p) {
    const ivory = { light: "#fff8ea", base: "#e8dcc4", dark: "#b8a888" };
    p.poly([[5, 12], [1, 2], [7, 6], [8, 12]], (x) => (x < 4 ? ivory.light : ivory.base));
    p.poly([[15, 12], [19, 2], [13, 6], [12, 12]], (x) => (x > 16 ? ivory.dark : ivory.base));
    star(p, pal("dragon"), 10, 12, 7, 2.6, 4);
  },
  // ---- Grok (thunder)
  grok_atk(p) {
    const c = pal("thunder");
    bolt(p, c, 0.85, 2, 0);
    p.line(1, 6, 5, 6, c.light);
    p.line(0, 10, 4, 10, c.base);
    p.line(1, 14, 5, 14, c.light);
  },
  grok_skill(p) {
    const c = pal("thunder");
    p.poly([[2, 3], [9, 10], [2, 17], [5, 17], [12, 10], [5, 3]], c.base);
    p.poly([[8, 3], [15, 10], [8, 17], [11, 17], [18, 10], [11, 3]], c.light);
    p.line(9, 4, 15, 10, c.hi);
  },
  grok_ult(p) {
    const c = pal("thunder");
    p.ring(10, 10, 9.5, 2, (x, y) => (x + y < 20 ? c.light : c.dark));
    bolt(p, c, 0.75, 0, 0);
  },
  // ---- Claude (sun)
  claude_atk(p) {
    const c = pal("sun");
    p.poly([[6, 1], [14, 1], [14, 19], [10, 15], [6, 19]], (x) => (x < 8 ? c.light : x > 12 ? c.dark : c.base));
    p.disc(10, 5.5, 2, c.hi);
    p.rect(7, 10, 6, 1, c.dark);
  },
  claude_skill(p) {
    const page = { a: "#fff6e4", b: "#f0dcb8", c: "#d4b890" };
    const c = pal("sun");
    p.poly([[1, 6], [9.5, 8], [9.5, 18], [1, 16]], (x, y) => (y > 15 ? page.c : page.a));
    p.poly([[19, 6], [10.5, 8], [10.5, 18], [19, 16]], (x, y) => (y > 15 ? page.c : page.b));
    p.rect(9, 8, 2, 11, c.dark);
    for (let i = 0; i < 3; i++) p.line(3, 10 + i * 2, 7, 10.8 + i * 2, page.c), p.line(13, 10.8 + i * 2, 17, 10 + i * 2, page.c);
    p.ring(10, 7, 6.5, 1, (x, y) => (y < 6 ? c.light : null));
    p.disc(10, 3.5, 1.6, c.hi);
  },
  claude_ult(p) {
    const c = pal("sun");
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      p.line(10 + Math.cos(a) * 6, 10 + Math.sin(a) * 6, 10 + Math.cos(a) * 9, 10 + Math.sin(a) * 9, i % 2 ? c.light : c.hi, 2);
    }
    p.disc(10, 10, 5, PX.shade(5, c.base, c.light, c.dark, c.w));
  },
  // ---- Doubao (bubble)
  doubao_atk(p) {
    const c = pal("bubble");
    p.disc(10, 10, 8, (x, y, dx, dy) => (Math.hypot(dx, dy) > 6.6 ? c.base : dx + dy > 4 ? c.light : c.hi));
    p.rect(5, 5, 3, 2, "#ffffff");
    p.rect(5, 7, 2, 1, "#ffffff");
  },
  doubao_skill(p) {
    const c = pal("bubble");
    p.disc(10, 10, 8, PX.shade(8, c.base, c.light, c.dark, c.hi));
    p.rect(8, 5, 4, 10, "#ffffff");
    p.rect(5, 8, 10, 4, "#ffffff");
  },
  doubao_ult(p) {
    const c = pal("bubble");
    p.rect(3, 9, 14, 9, "#ffffff");
    p.rect(3, 15, 14, 3, "#e0d8ec");
    p.rect(3, 6, 14, 4, c.base);
    p.rect(3, 6, 14, 1, c.light);
    p.rect(9, 11, 2, 5, c.dark);
    p.rect(7.5, 12.5, 5, 2, c.dark);
    p.line(10, 6, 10, 3, "#d0c8e0");
    p.disc(10, 2.5, 2, c.light);
  },
  // ---- GLM (ink)
  glm_atk(p) {
    const c = pal("ink"), paper = "#f6eed6";
    p.poly([[6, 2], [15, 3], [14, 18], [5, 17]], (x) => (x < 7 ? "#ffffff" : paper));
    p.line(8, 6, 12, 6.5, c.deep, 1);
    p.line(12, 6.5, 8, 12, c.deep, 1);
    p.line(8, 12, 12, 12.5, c.deep, 1);
    p.rect(9, 14, 2, 2, "#e04050");
  },
  glm_skill(p) {
    const c = pal("ink");
    p.ring(10, 10, 9, 1.4, c.light);
    p.ring(10, 10, 6, 1, c.base);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      p.rect(10 + Math.cos(a) * 7.5 - 0.5, 10 + Math.sin(a) * 7.5 - 0.5, 1, 1, c.hi);
    }
    p.poly([[10, 6], [13, 12], [7, 12]], (x) => (x < 10 ? c.hi : c.light));
  },
  glm_ult(p) {
    const c = pal("ink");
    p.disc(10, 10, 9, (x, y, dx, dy) => {
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + d * 0.7;
      return Math.sin(a * 2) > 0.2 ? (d < 3.5 ? c.deep : c.base) : d < 5 ? INK : c.dark;
    });
    p.disc(10, 10, 2.2, "#0a0612");
    p.rect(4, 4, 2, 2, c.hi);
  },
  // ---- shared
  dash(p) {
    const c = GREEN;
    p.poly([[6, 4], [18, 10], [6, 16], [9, 10]], (x, y) => (y < 10 ? c.light : c.base));
    p.line(1, 7, 6, 7, c.hi);
    p.line(0, 10, 7, 10, c.light);
    p.line(1, 13, 6, 13, c.hi);
  },
  // attack: a diagonal sword (tip top-left) between two crescent slash arcs
  attack(p) {
    const SL = { out: "#ffb21e", mid: "#ffd84a", inn: "#fff6c0" };
    // moon-shaped slash: a disc minus the same disc shifted toward the blade
    const moon = (cx, cy, r, sx, sy) => {
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const d1 = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), d2 = Math.hypot(x + 0.5 - cx - sx, y + 0.5 - cy - sy);
          if (d1 <= r && d2 > r) p.set(x, y, d1 > r - 0.9 ? SL.out : d2 < r + 1.1 ? SL.inn : SL.mid);
        }
    };
    moon(13.6, 6.4, 6, -2.3, 2.3); // upper-right swoosh
    moon(6.4, 13.6, 6, 2.3, -2.3); // lower-left swoosh
    const r2 = Math.SQRT1_2;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const ux = x + 0.5 - 2.6, uy = y + 0.5 - 2.6;
        const s2 = (ux + uy) * r2, perp = (ux - uy) * r2, ap = Math.abs(perp);
        if (s2 >= 0 && s2 <= 13.4) {
          const hw = Math.min(1.9, 0.25 + s2 * 0.55);
          if (ap > hw) continue;
          let c = perp < -0.55 ? STEEL.hi : perp > 0.7 ? STEEL.dark : STEEL.base;
          if (ap < 0.5 && s2 > 3.2 && s2 < 11.2) c = "#ffffff";
          p.set(x, y, c);
        } else if (s2 > 13.4 && s2 <= 15.1 && ap <= 3.7) p.set(x, y, perp < 0 ? GOLD.light : GOLD.base);
        else if (s2 > 15.1 && s2 <= 19 && ap <= 1) p.set(x, y, s2 % 1.4 < 0.7 ? "#8a4a22" : "#5a2a12");
        else if (s2 > 19 && s2 <= 20.6 && ap <= 1.5) p.set(x, y, GOLD.base);
      }
  },
  // ---- element badges
  elem_water(p) { DRAW.deepseek_atk(p); },
  elem_dragon(p) { flame(p, { light: "#c9a8ff", base: "#9b6cf0", dark: "#5a2aa0", hi: "#f4ecff" }); },
  elem_thunder(p) { bolt(p, pal("thunder"), 1, 0, 0); },
  elem_sun(p) { DRAW.claude_ult(p); },
  elem_bubble(p) { DRAW.doubao_atk(p); },
  elem_ink(p) {
    const c = pal("ink");
    p.poly([[10, 1.5], [4.5, 11], [15.5, 11]], (x) => (x < 10 ? c.base : c.dark));
    p.disc(10, 12.5, 6, PX.shade(6, c.dark, c.base, c.deep, c.light));
    p.rect(7, 10, 2, 2, c.hi);
  },
  // ---- cards & talents
  sword(p) {
    p.line(5, 15, 16, 4, STEEL.light, 2);
    p.line(6, 15, 16, 5, STEEL.dark, 1);
    p.poly([[15, 3], [18, 2], [17, 5]], STEEL.hi);
    p.line(3, 11, 8, 16, GOLD.base, 2);
    p.line(2, 18, 5, 15, "#8a5020", 2);
    p.rect(1, 18, 2, 2, GOLD.light);
  },
  rate(p) {
    p.poly([[2, 3], [9, 10], [2, 17], [6, 17], [13, 10], [6, 3]], GOLD.base);
    p.poly([[8, 3], [15, 10], [8, 17], [12, 17], [19, 10], [12, 3]], GOLD.light);
  },
  hp(p) {
    heart(p, RED);
    p.rect(14, 1, 2, 6, "#ffffff");
    p.rect(12, 3, 6, 2, "#ffffff");
  },
  heart(p) {
    heart(p, RED);
  },
  shield(p) {
    shield(p, BLUE);
  },
  boot(p) {
    p.poly([[7, 2], [13, 2], [13, 11], [18, 13], [18, 17], [6, 17], [6, 11]], (x, y) => (y > 14 ? "#6a3a20" : x < 9 ? "#ff8a5a" : "#e05a2a"));
    p.rect(7, 4, 6, 2, "#ffffff");
    p.line(0, 9, 4, 9, GREEN.light);
    p.line(1, 13, 4, 13, GREEN.base);
  },
  target(p) {
    p.ring(10, 10, 8.5, 2, RED.base);
    p.ring(10, 10, 4.5, 2, "#ffffff");
    p.rect(9, 0, 2, 5, STEEL.light);
    p.rect(9, 15, 2, 5, STEEL.light);
    p.rect(0, 9, 5, 2, STEEL.light);
    p.rect(15, 9, 5, 2, STEEL.light);
    p.rect(9, 9, 2, 2, RED.dark);
  },
  bigorb(p) {
    p.disc(11, 11, 7.5, PX.shade(7.5, VIOLET.base, VIOLET.light, VIOLET.dark, VIOLET.hi));
    p.disc(3.5, 4, 2, VIOLET.light);
  },
  coin(p) {
    coin(p, GOLD);
  },
  bag(p) {
    p.disc(10, 12, 6.5, PX.shade(6.5, "#c08a50", "#e0b070", "#8a5a30"));
    p.poly([[7, 3], [13, 3], [11, 6], [9, 6]], "#c08a50");
    p.rect(8, 6, 4, 1, GOLD.base);
    coin(p, GOLD, 13.5, 14.5, 4);
  },
  multishot(p) {
    for (const [y, a] of [[4, -0.5], [10, 0], [16, 0.5]]) {
      p.line(2, 10, 2 + 13 * Math.cos(a), 10 + 13 * Math.sin(a) * 0.6 + (y - 10) * 0.3, STEEL.base, 1);
    }
    p.poly([[13, 1], [18, 3], [14, 6]], GOLD.light);
    p.poly([[14, 7], [19, 10], [14, 13]], GOLD.light);
    p.poly([[13, 14], [18, 17], [14, 19]], GOLD.light);
  },
  pierce(p) {
    p.rect(8, 3, 4, 14, "#a07850");
    p.rect(8, 3, 1, 14, "#c89a70");
    arrowR(p, { base: STEEL.light, light: GOLD.light }, 10);
  },
  bounce(p) {
    p.line(1, 15, 7, 5, STEEL.light, 2);
    p.line(7, 5, 12, 15, STEEL.light, 2);
    p.line(12, 15, 16, 7, STEEL.light, 2);
    p.poly([[13, 4], [19, 3], [17, 9]], GOLD.light);
    p.rect(6, 4, 2, 2, "#ffffff");
    p.rect(11, 14, 2, 2, "#ffffff");
  },
  crit(p) {
    star(p, { light: "#ffe36a", base: "#ff8a2a", hi: "#ffffff" }, 10, 10, 9.5, 4, 8, -Math.PI / 2);
    p.disc(10, 10, 3, RED.base);
    p.rect(9, 8, 2, 2, "#ffffff");
  },
  hourglass(p) {
    p.rect(3, 1, 14, 2, "#a07850");
    p.rect(3, 17, 14, 2, "#a07850");
    p.poly([[5, 3], [15, 3], [11, 10], [15, 17], [5, 17], [9, 10]], "#d8f0ff");
    p.poly([[7, 4], [13, 4], [10, 9]], GOLD.light);
    p.poly([[10, 12], [14, 17], [6, 17]], GOLD.base);
  },
  battery(p) {
    p.rect(2, 5, 15, 10, STEEL.dark);
    p.rect(17, 8, 2, 4, STEEL.dark);
    p.rect(3, 6, 13, 8, "#203040");
    p.rect(3, 6, 9, 8, GREEN.base);
    p.rect(3, 6, 9, 2, GREEN.light);
    bolt(p, GOLD, 0.45, 0, 0);
  },
  vamp(p) {
    heart(p, RED, 0, 1, 0.9);
    p.poly([[15, 0], [18, 5], [15, 7], [12, 5]], RED.light);
  },
  wing(p) {
    for (let i = 0; i < 4; i++) p.poly([[3, 4 + i * 3], [17 - i * 2, 2 + i * 3.4], [16 - i * 3, 6 + i * 3.4], [3, 8 + i * 3]], i % 2 ? "#e8f0ff" : "#ffffff");
    star(p, GOLD, 15, 15, 4, 1.6, 4);
  },
  flame(p) {
    flame(p, { light: "#ffb040", base: "#ff6020", dark: "#c02010", hi: "#fff0a0" });
  },
  bomb(p) {
    p.disc(9, 12, 7, PX.shade(7, "#40384a", "#6a6078", "#201a28", "#a098b0"));
    p.rect(11, 3, 3, 3, "#605870");
    p.line(13, 3, 16, 1, "#c09060");
    star(p, { light: "#fff6a0", base: "#ffb020", hi: "#ffffff" }, 17, 1.5, 3, 1.2, 4);
  },
  atom(p) {
    const c = VIOLET;
    for (const a of [0, Math.PI / 3, -Math.PI / 3])
      for (let t = 0; t < Math.PI * 2; t += 0.1) p.set(10 + Math.cos(t) * 8.5 * Math.cos(a) - Math.sin(t) * 3 * Math.sin(a), 10 + Math.cos(t) * 8.5 * Math.sin(a) + Math.sin(t) * 3 * Math.cos(a), c.light);
    p.disc(10, 10, 3, PX.shade(3, RED.base, RED.light, RED.dark));
  },
  spread(p) {
    p.disc(10, 10, 4, PX.shade(4, VIOLET.base, VIOLET.light, VIOLET.dark));
    const cols = [ELEM.water.color, ELEM.thunder.color, ELEM.sun.color, ELEM.bubble.color, ELEM.ink.color, ELEM.dragon.color];
    cols.forEach((col, i) => {
      const a = (i * Math.PI) / 3 - 0.3;
      p.disc(10 + Math.cos(a) * 7.5, 10 + Math.sin(a) * 7.5, 1.8, col);
    });
  },
  nova(p) {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      p.line(10 + Math.cos(a) * 7, 10 + Math.sin(a) * 7, 10 + Math.cos(a) * 9.5, 10 + Math.sin(a) * 9.5, BLUE.hi, 1);
    }
    shield(p, BLUE, 0, 0);
  },
  echo(p) {
    p.ring(6, 10, 4, 2, VIOLET.base);
    p.ring(6, 10, 8, 1.5, (x) => (x > 8 ? VIOLET.light : null));
    p.ring(6, 10, 12, 1.5, (x) => (x > 11 ? VIOLET.hi : null));
    p.disc(6, 10, 1.5, "#ffffff");
  },
  infinity(p) {
    p.ring(6, 10, 5, 2, GOLD.light);
    p.ring(14, 10, 5, 2, GOLD.base);
    p.rect(9, 9, 2, 2, GOLD.hi);
  },
  shovel_cu(p) { shovel(p, { light: "#ffb878", base: "#e08a4a", dark: "#a85428" }); },
  shovel_ag(p) { shovel(p, { light: "#ffffff", base: "#c8d4e8", dark: "#7a8aa8" }); },
  shovel_au(p) { shovel(p, { light: "#fff3a0", base: "#ffd84a", dark: "#c08a10" }); },
  beacon(p) {
    p.rect(9, 8, 2, 11, "#8a8a9a");
    p.rect(6, 17, 8, 2, "#5a5a6a");
    p.disc(10, 6, 3.4, "#7dffb0");
    p.rect(9, 5, 1, 1, "#ffffff");
    for (let t = -2.4; t < -0.7; t += 0.1) p.set(10 + Math.cos(t) * 7, 6 + Math.sin(t) * 7, "#7dffb0"), p.set(10 + Math.cos(t + Math.PI * 0) * 0, 6, "#7dffb0");
    for (let t = -2.4; t < -0.7; t += 0.08) p.set(10 + Math.cos(t) * 9.5, 6 + Math.sin(t) * 9.5, "#3ad07a");
  },
  pick(p) {
    p.line(4, 17, 13, 6, "#a8642e", 2);
    p.poly([[7, 2], [13, 3], [18, 8], [17, 10], [12, 6], [6, 4]], "#c8d0e0");
    p.poly([[12, 6], [17, 10], [16, 11], [11, 7]], "#7a8aa8");
  },
  ore(p) {
    p.poly([[4, 12], [8, 5], [14, 4], [17, 10], [13, 16], [6, 16]], "#7d7a82");
    p.poly([[7, 9], [10, 6], [13, 8], [11, 12]], "#e08a4a");
    p.poly([[11, 12], [14, 10], [15, 13]], "#b46aff");
  },
  revive(p) {
    heart(p, RED, 2, 2, 0.8);
    for (let t = -0.4; t < 4.6; t += 0.12) p.set(10 + Math.cos(t) * 9, 10 + Math.sin(t) * 9, GREEN.light);
    p.poly([[15, 1], [19, 3], [16, 6]], GREEN.light);
  },
  scroll(p) {
    p.rect(4, 3, 12, 14, "#f6eed6");
    p.rect(3, 2, 14, 3, "#c09060");
    p.rect(3, 15, 14, 3, "#c09060");
    for (let i = 0; i < 3; i++) p.rect(6, 7 + i * 2.5, 8 - (i % 2) * 3, 1, "#a08060");
  },
  cardicon(p) {
    card(p, VIOLET);
  },
  cardgold(p) {
    card(p, GOLD);
  },
  overclock(p) {
    // a CPU chip with a lightning bolt
    for (let i = 0; i < 4; i++) p.rect(5 + i * 3, 1, 1, 3, STEEL.base), p.rect(5 + i * 3, 16, 1, 3, STEEL.base), p.rect(1, 5 + i * 3, 3, 1, STEEL.base), p.rect(16, 5 + i * 3, 3, 1, STEEL.base);
    p.rect(4, 4, 12, 12, "#3a3a5a");
    p.rect(5, 5, 10, 10, "#5a5a8a");
    bolt(p, GOLD, 0.62, 0, 0);
  },
  firewall(p) {
    shield(p, VIOLET);
    p.poly([[10, 6], [13, 10], [12, 13], [10, 14], [8, 13], [7, 10]], "#ff8a3a");
    p.poly([[10, 9], [11.6, 11.4], [10, 13], [8.4, 11.4]], "#ffe36a");
  },
  ensemble(p) {
    for (const [dy, c] of [[-6, BLUE], [0, GOLD], [6, GREEN]]) {
      p.line(2, 10, 15, 10 + dy, c.base, 2);
      p.poly([[13, 7 + dy], [19, 10 + dy], [13, 13 + dy]], c.light);
    }
    p.disc(3, 10, 2.4, "#ffffff");
  },
  pool(p) {
    // fanned stack of cards (gacha pool)
    p.poly([[2, 6], [9, 3], [12, 15], [5, 18]], "#8a6ad8");
    p.poly([[3.4, 7], [8.4, 4.8], [10.8, 14.4], [5.8, 16.6]], "#c8b0ff");
    p.rect(8, 2, 9, 14, "#ffd84a");
    p.rect(9, 3, 7, 12, "#fff3b0");
    star(p, { light: "#ffb04a", base: "#ff7a2e", hi: "#fff" }, 12.5, 9, 3.8, 1.6, 4);
  },
  // ---- 11/04 new gacha cards
  magnet(p) {
    // horseshoe magnet pulling a coin
    p.ring(8, 9, 7, 3, (x, y) => (y > 9 ? null : RED.base));
    p.rect(1, 9, 3, 6, RED.base);
    p.rect(12, 9, 3, 6, RED.base);
    p.rect(1, 13, 3, 3, STEEL.light);
    p.rect(12, 13, 3, 3, STEEL.light);
    p.rect(2, 5, 2, 2, RED.light);
    coin(p, GOLD, 16, 16, 3.5);
  },
  elite(p) {
    // a crowned skull in a red crosshair
    p.ring(10, 11, 8.5, 1.6, RED.base);
    p.disc(10, 11, 5, PX.shade(5, STEEL.base, STEEL.light, STEEL.dark));
    p.rect(7, 10, 2, 2, "#1a1020");
    p.rect(11, 10, 2, 2, "#1a1020");
    p.rect(8, 14, 4, 1, STEEL.dark);
    p.poly([[5, 6], [7, 2], [10, 5], [13, 2], [15, 6]], GOLD.light);
    p.rect(5, 5, 10, 2, GOLD.base);
  },
  shield2(p) {
    shield(p, BLUE, -2, 1);
    p.poly([[9, 2], [19, 2], [19, 8], [14, 14], [9, 8]], (x) => (x < 14 ? VIOLET.light : VIOLET.base));
    p.rect(13, 4, 2, 6, "#ffffff");
    p.rect(11, 6, 6, 2, "#ffffff");
  },
  replay(p) {
    // circular arrow around a small bolt (charge gained back)
    for (let t = 0.3; t < 5.4; t += 0.1) p.set(10 + Math.cos(t) * 8, 10 + Math.sin(t) * 8, GREEN.light), p.set(10 + Math.cos(t) * 7, 10 + Math.sin(t) * 7, GREEN.base);
    p.poly([[13, 0], [19, 4], [13, 7]], GREEN.light);
    bolt(p, GOLD, 0.55, 0, 0);
  },
  chain(p) {
    // a zig-zag bolt touching three nodes
    p.line(2, 4, 9, 10, "#bfe8ff", 2);
    p.line(9, 10, 14, 5, "#bfe8ff", 2);
    p.line(14, 5, 17, 16, "#bfe8ff", 2);
    for (const [x, y] of [[2, 4], [9, 10], [14, 5], [17, 16]]) p.disc(x, y, 2.4, PX.shade(2.4, VIOLET.base, VIOLET.light, VIOLET.dark));
    p.line(3, 4, 8, 9, "#ffffff");
  },
  rag(p) {
    // an open book under a magnifying glass
    p.poly([[1, 8], [10, 10], [10, 19], [1, 17]], "#f6eed6");
    p.poly([[19, 8], [10, 10], [10, 19], [19, 17]], "#e0d4b8");
    for (let i = 0; i < 3; i++) p.line(3, 11 + i * 2, 8, 12 + i * 2, "#a08060");
    p.ring(12, 6, 5, 2, STEEL.dark);
    p.disc(12, 6, 3, "#c8f0ff");
    p.rect(10, 4, 2, 2, "#ffffff");
    p.line(15.5, 9.5, 18.5, 12.5, "#8a5a30", 2);
  },
  moe(p) {
    // four expert blocks, one lit, around a router dot
    const cs = [BLUE, GREEN, GOLD, RED];
    [[2, 2], [11, 2], [2, 11], [11, 11]].forEach(([x, y], i) => {
      p.rect(x, y, 7, 7, i === 3 ? cs[i].light : cs[i].base);
      p.rect(x, y, 7, 2, cs[i].light);
    });
    p.disc(10, 10, 2.6, "#ffffff");
    p.rect(13, 13, 3, 3, "#ffffff");
  },
  links(p) {
    p.ring(7, 10, 5.5, 2, GOLD.light);
    p.ring(13, 10, 5.5, 2, VIOLET.light);
    p.set(10, 6, GOLD.light);
  },
};

// what each id draws
const MAP = {
  atk_up: "sword", rate_up: "rate", hp_up: "hp", shield_up: "shield", speed_up: "boot", range_up: "target", big_bullet: "bigorb", coin_up: "coin",
  multishot: "multishot", pierce: "pierce", bounce: "bounce", crit: "crit", cd_down: "hourglass", ult_charge: "battery", vamp: "vamp", dodge_crit: "wing", low_rage: "flame",
  kill_boom: "bomb", reaction_amp: "atom", element_spread: "spread", shield_nova: "nova", echo: "echo", second_ult: "infinity",
  t_dmg: "sword", t_hp: "heart", t_shield: "shield", t_speed: "boot", t_coin: "coin", t_start_coin: "bag", t_crit: "crit", t_ult: "battery", t_revive: "revive", t_startcard: "scroll", t_overclock: "overclock", t_firewall: "firewall", t_ensemble: "ensemble",
  t_rate: "rate", t_range: "target", t_magnet: "magnet", t_cd: "hourglass", t_elite: "elite", t_shield2: "shield2", t_replay: "replay", t_chain: "chain", t_rag: "rag", t_moe: "moe",
  u_kill_boom: "bomb", u_reaction_amp: "atom", u_element_spread: "spread", u_shield_nova: "nova", u_echo: "echo", u_second_ult: "infinity", u_links: "links",
};

/** a 22x22 pixel canvas for an icon name or a card/talent id */
export function icon(name) {
  const key = MAP[name] || name;
  if (cache.has(key)) return cache.get(key);
  const fn = DRAW[key] || DRAW.cardicon;
  const p = new PX();
  fn(p);
  const c = p.canvas();
  cache.set(key, c);
  return c;
}
/** data URL at an integer upscale, for <img> in HTML */
const urls = new Map();
// PixelLab-drawn 64×64 skill icons (闪避 + every girl's 小技能 / 大招) replace the hand-built ones wherever an <img> shows them
const PNG_ICONS = new Set(["dash", ...Object.keys(CHARS).flatMap((c) => [c + "_skill", c + "_ult"])]);
// traced to vector (smooth at any button size, no resampling fringes)
const SVG_ICONS = new Set(["dash"]);
export function iconURL(name, scale = 4) {
  if (PNG_ICONS.has(name)) return `assets/skills/${name}.${SVG_ICONS.has(name) ? "svg" : "png"}`;
  const k = name + "@" + scale;
  if (urls.has(k)) return urls.get(k);
  const src = icon(name), c = document.createElement("canvas");
  c.width = c.height = src.width * scale;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  const u = c.toDataURL();
  urls.set(k, u);
  return u;
}
export const skillIcon = (cid, slot) => (slot === "dash" ? "dash" : slot === "atk" ? "attack" : `${cid}_${slot}`);
export function elemOf(cid) {
  return ELEM[CHARS[cid].elem];
}
