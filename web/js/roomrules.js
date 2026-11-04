// Room layout rules: every generated room passes through these before it is used.
// Each rule either fixes the layout in place (fix) or rejects it so the generator rolls again (reject).
// All rules only look at a tile and its 8 neighbours, so the room's mirror symmetry is preserved.
import { F, WATER, BUSH, BARREL } from "./map.js";

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function near(m, x, y, test) {
  for (const [dx, dy] of N8) {
    const a = x + dx, b = y + dy;
    if (a >= 0 && b >= 0 && a < m.W && b < m.H && test(b * m.W + a, a, b)) return true;
  }
  return false;
}
const spikeAt = (m) => {
  const s = new Set();
  for (const p of m.spikes) s.add(p.y * m.W + p.x);
  return s;
};

export const RULES = [
  {
    id: "barrel-safe",
    text: "炸药桶不在岩浆/冰面/河道上，也不紧挨它们",
    check(m) {
      const bad = [];
      for (let i = 0; i < m.t.length; i++) if (m.t[i] === BARREL) {
        const x = i % m.W, y = (i / m.W) | 0;
        if (m.mud[i] || near(m, x, y, (j) => m.mud[j] || m.t[j] === WATER)) bad.push(i);
      }
      return bad;
    },
    fix(m, bad) {
      for (const i of bad) m.t[i] = F;
    },
  },
  {
    id: "hazard-floor-only",
    text: "地面危险地块只铺在空地上（不压墙、河道、箱子、草丛）",
    check(m) {
      const bad = [];
      for (let i = 0; i < m.t.length; i++) if (m.mud[i] && m.t[i] !== F) bad.push(i);
      return bad;
    },
    fix(m, bad) {
      for (const i of bad) m.mud[i] = 0;
    },
  },
  {
    id: "hazard-river-gap",
    text: "危险地块与河道之间至少留一格空地",
    check(m) {
      const bad = [];
      for (let i = 0; i < m.t.length; i++) if (m.mud[i] && near(m, i % m.W, (i / m.W) | 0, (j) => m.t[j] === WATER)) bad.push(i);
      return bad;
    },
    fix(m, bad) {
      for (const i of bad) m.mud[i] = 0;
    },
  },
  {
    id: "hazard-no-specks",
    text: "不留孤立的单格危险地块",
    check(m) {
      const bad = [];
      for (let i = 0; i < m.t.length; i++) if (m.mud[i]) {
        const x = i % m.W, y = (i / m.W) | 0;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.mud[(y + dy) * m.W + x + dx]);
        if (!n) bad.push(i);
      }
      return bad;
    },
    fix(m, bad) {
      for (const i of bad) m.mud[i] = 0;
    },
  },
  {
    id: "spike-safe",
    text: "地刺只在干净的空地上，不挨着危险地块、河道和炸药桶",
    check(m) {
      return m.spikes.filter((s) => {
        const i = s.y * m.W + s.x;
        return m.t[i] !== F || m.mud[i] || near(m, s.x, s.y, (j) => m.mud[j] || m.t[j] === WATER || m.t[j] === BARREL);
      });
    },
    fix(m, bad) {
      m.spikes = m.spikes.filter((s) => !bad.includes(s));
    },
  },
  {
    id: "barrel-spacing",
    text: "炸药桶不挨着地刺（避免开局连锁爆炸）",
    check(m) {
      const sp = spikeAt(m), bad = [];
      for (let i = 0; i < m.t.length; i++) if (m.t[i] === BARREL && near(m, i % m.W, (i / m.W) | 0, (j) => sp.has(j))) bad.push(i);
      return bad;
    },
    fix(m, bad) {
      for (const i of bad) m.t[i] = F;
    },
  },
  {
    id: "hazard-coverage",
    text: "危险地块不超过可走地面的 22%",
    check(m) {
      let open = 0, hz = 0;
      for (let i = 0; i < m.t.length; i++) if (m.t[i] === F || m.t[i] === BUSH) (open++, m.mud[i] && hz++);
      return hz > open * 0.22 ? [hz] : [];
    },
    reject: true,
  },
  {
    id: "safe-path",
    text: "出生点到房间中心（宝箱/传送门位置）有一条不踩危险地块的路",
    check(m) {
      const { W, H } = m, sx = m.spawnT.x, sy = m.spawnT.y, seen = new Uint8Array(W * H), q = [sy * W + sx];
      seen[q[0]] = 1;
      while (q.length) {
        const i = q.pop(), x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (y + dy) * W + x + dx;
          if (seen[j] || m.mud[j] || (m.t[j] !== F && m.t[j] !== BUSH)) continue;
          seen[j] = 1;
          q.push(j);
        }
      }
      return seen[m.centerT.y * W + m.centerT.x] ? [] : [1];
    },
    reject: true,
  },
];

/** Apply every rule. Returns false when the room must be regenerated. */
export function applyRoomRules(m) {
  for (const r of RULES) {
    const bad = r.check(m);
    if (!bad.length) continue;
    if (r.reject) return false;
    r.fix(m, bad);
  }
  return true;
}

/** List rule violations (used by tests; a valid room returns []). */
export function auditRoom(m) {
  const out = [];
  for (const r of RULES) {
    const bad = r.check(m);
    if (bad.length) out.push(r.id + ":" + bad.length);
  }
  return out;
}

/** Floor tiles well clear of hazards and the river: where items and poison clouds may go. */
export function isCalmTile(m, x, y) {
  const i = y * m.W + x;
  return m.t[i] === F && !m.mud[i] && !near(m, x, y, (j) => m.mud[j] || m.t[j] === WATER || m.t[j] === BARREL);
}
