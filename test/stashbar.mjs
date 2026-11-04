// 积攒条始终可见：SSR 没集齐也显示（0 点），点开说明收集进度；集齐后照常显示积攒点
import { createRequire } from "module"; const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const PORT = process.argv[2] || 8775;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 904, height: 405 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(200);
const open = async (full) => {
  await p.evaluate(async (full) => {
    const { GACHA } = await import("./js/data.js"); const talents = { t_revive: 1, t_dmg: 1 };
    if (full) for (const it of GACHA.pool) talents[it.id] = it.max;
    localStorage.setItem("ai-girls-dungeon-v1", JSON.stringify({ tutorialSeen: true, tokens: 1194, chars: ["deepseek", "gpt", "grok", "claude", "doubao", "glm"], sel: "doubao", talents, stash: full ? 7 : 0 }));
  }, full);
  await p.reload(); await p.waitForTimeout(1300);
  await p.evaluate(async () => { const L = await import("./js/lobby.js"); L.showGacha(); }); await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const sb = document.querySelector(".stashbar"), gm = document.querySelector(".gm").getBoundingClientRect(); if (!sb) return null; const a = sb.getBoundingClientRect(), g = document.querySelector(".gp").getBoundingClientRect(); return { n: sb.querySelector(".sb-n").textContent, top: Math.round(a.top - gm.top), bottom: Math.round(a.bottom - gm.bottom), gapToPanel: Math.round(g.left - a.right) }; });
  await p.screenshot({ path: `/home/claude/infinite-dream-preview/tmp/g/stash_${full ? "full" : "partial"}.png` });
  await p.evaluate(() => document.querySelector(".stashbar").click()); await p.waitForTimeout(300);
  const sub = await p.evaluate(() => document.querySelector(".stash-md .st-sub").textContent);
  await p.screenshot({ path: `/home/claude/infinite-dream-preview/tmp/g/stash_md_${full ? "full" : "partial"}.png` });
  return { ...r, sub };
};
const a = await open(false), z = await open(true);
console.log("SSR not collected:", JSON.stringify(a));
console.log("all collected:", JSON.stringify(z));
console.log("errors:", JSON.stringify(errs));
await b.close();
process.exit(a && z && a.n.startsWith("0") && /收集进度/.test(a.sub) && !/收集进度/.test(z.sub) && a.top === 0 && a.bottom === 0 && !errs.length ? 0 : 1);
