// 冒险续玩 (like 元气骑士): a solo PVE run is checkpointed whenever a room is entered (from the 2nd room on). Closing
// the app, or 「保存退出」 in the pause menu, leaves the checkpoint; the lobby then offers to continue it from the start
// of that room. A finished run (win, loss or 放弃本局) clears it. Kept in its own localStorage key, apart from the save.
import { MAPS, CHARS } from "./data.js";
import { el } from "./util.js";
import { uiRoot, btn } from "./ui.js";

const KEY = "ai-girls-dungeon-run-v1";
// what is carried over: the run's own state on the game and on the player (everything else is rebuilt by the room)
const G_KEYS = ["roomIdx", "route", "runStats", "seen", "killedTypes", "curiosFound", "raresSeen", "curseHp", "curses", "time"];
const P_KEYS = ["hp", "maxHp", "shield", "maxShield", "core", "st", "cards", "fusions", "links", "coins", "cubes", "ult", "revives", "kills", "reactions", "orbs", "barrier", "startCards"];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** may this run be checkpointed? (solo PVE only: not online, the arena or the pet trial) */
export function canCheckpoint(app) {
  const g = app.game;
  return !!(g && g.mode === "solo" && !g.pvp && !g.petTrial && !app.ended && app.cfg && g.roomIdx >= 1);
}
export function saveRun(app) {
  if (!canCheckpoint(app)) return;
  const g = app.game, p = app.me;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: 1, at: Date.now(),
      cfg: { mode: "solo", pvp: false, seed: app.cfg.seed, players: app.cfg.players, myId: app.cfg.myId, opt: app.cfg.opt || {} },
      game: pick(g, G_KEYS), player: pick(p, P_KEYS), riftLoot: app.riftLoot || null, petGranted: app.petGranted || 0,
    }));
  } catch {}
}
export function loadRun() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    return d && d.v === 1 && d.cfg && d.game ? d : null;
  } catch {
    return null;
  }
}
export function clearRun() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
/** put a checkpoint back onto a freshly built game (players added, before any room is loaded) */
export function restoreRun(app, d) {
  const g = app.game, p = app.me;
  Object.assign(g, JSON.parse(JSON.stringify(d.game)));
  Object.assign(p, JSON.parse(JSON.stringify(d.player)));
  app.riftLoot = d.riftLoot || null;
  app.petGranted = d.petGranted || 0;
  const idx = g.roomIdx;
  g.loadRoom(idx, g.roomDef(idx));
}
/** lobby: "continue the unfinished run?" (继续 / 放弃) */
export function offerResume(app, onDrop) {
  const d = loadRun();
  if (!d || document.querySelector(".resume-md")) return;
  const o = d.cfg.opt || {}, floor = (d.game.roomIdx || 0) + 1, me = d.cfg.players.find((q) => q.id === d.cfg.myId) || d.cfg.players[0];
  const where = o.endless ? `无尽回廊 · 第 ${floor} 层` : `${(MAPS[o.map] || MAPS.grass).name} · 第 ${floor} / 7 层`;
  const cards = Object.values(d.player.cards || {}).reduce((a, n) => a + n, 0);
  const md = el("div", "modal resume-md");
  md.addEventListener("pointerdown", (e) => e.target === md && md.remove());
  md.innerHTML = `<div class="panel resume-p"><h2 class="outline">继续冒险</h2>
    <div class="rs-where o1">${where}</div>
    <div class="rs-info"><span>${CHARS[me.cid]?.name || ""}</span><span>生命 ${d.player.hp}/${d.player.maxHp}</span><span>金币 ${d.player.coins || 0}</span><span>技能卡 ${cards}</span></div>
    <div class="rs-tip">从这一层的开头继续；放弃则这局不结算</div><div class="row rs-acts"></div></div>`;
  md.querySelector(".rs-acts").append(
    btn("放弃", "gray", () => {
      clearRun();
      md.remove();
      onDrop && onDrop();
    }),
    btn("继续", "", () => {
      md.remove();
      app.resumeRun(d);
    }),
  );
  uiRoot().appendChild(md);
}
