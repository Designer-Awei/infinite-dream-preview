// 每日梦境 panel (opened from the lobby's mode carousel): today's girl on today's map fills the left; the right
// lists the day's terms (two 噩梦契约 lines and the 梦境祝福), today's record, the 7-day check-in calendar, and
// 开始挑战. Finishing the run, win or lose, checks the day in (daily.js).
import { CHARS, MAPS, PACTS } from "./data.js";
import { dailyOf, dailyState, streakNow, todaySlot, checkedToday, DAILY_REWARDS, DAILY_CLEAR, BLESSINGS, dayKey } from "./daily.js";
import { btn, uiRoot } from "./ui.js";
import { el } from "./util.js";
import { sfx } from "./audio.js";

// 淬灵露 / 流彩晶 drawn as in 积攒兑换 (.st-ico), so an item looks the same everywhere
const rwIcon = (k) =>
  k === "dew" ? `<i class="st-ico ur"></i>` : k === "egg" ? `<i class="dl-egg"></i>` : k === "flow" ? `<i class="st-ico hur"></i>` : `<i class="cur gem"></i>`;

export function showDaily(onStart, mapPreview) {
  const dd = dailyOf(), c = CHARS[dd.cid], st = dailyState(), day = st.days[dd.key] || { runs: 0, best: 0, win: false };
  const done = checkedToday(), streak = streakNow(), slot = todaySlot();
  const [, mo, da] = dd.key.split("-").map(Number);
  const md = el("div", "modal");
  const b = BLESSINGS[dd.blessing];
  // calendar: the streak's week; days before today's slot are already checked in (this streak), today glows
  const cal = DAILY_REWARDS.map((rw, i) => {
    const got = i < slot || (i === slot && done), now = i === slot;
    return `<div class="dl-day${got ? " got" : ""}${now ? " now" : ""}"><span class="dl-n">第${i + 1}天</span><div class="dl-ic">${rwIcon(rw.icon)}</div><span class="dl-r">${rw.short || rw.text.replace(" ×", "×")}</span>${got ? `<i class="dl-stamp"></i>` : ""}</div>`;
  }).join("");
  md.innerHTML = `<div class="panel daily-p">
    <div class="dl-head"><img class="dl-logo" src="assets/ui/daily.png" alt=""><h2 class="outline">每日梦境</h2><span class="dl-date o1">${mo} 月 ${da} 日 · 所有人同一场梦</span></div>
    <div class="dl-body">
      <div class="dl-stage"><img class="dl-map" alt=""><img class="dl-hero" src="assets/portrait_${dd.cid}.png" alt=""><div class="dl-cap o1"><b>${c.short}</b><span>${MAPS[dd.map].name}</span></div></div>
      <div class="dl-side">
        <div class="dl-rules">
          <div class="dl-rule"><span class="dl-tag red o1">难度</span><b class="o1">噩梦全开 · 护盾照常回复</b><small>敌人生命 +75%、移速与弹速提升、受伤 +1、开箱两张卡等（固定难度）</small></div>
          <div class="dl-rule"><span class="dl-tag green o1">祝福</span><b class="o1">${b.name}</b><small>${b.desc}</small></div>
          <div class="dl-rule"><span class="dl-tag blue o1">纪录</span><b class="o1">${day.runs ? `已挑战 ${day.runs} 次 · 最远 ${day.best}/7${day.win ? " · 已通关" : ""}` : "今天还没挑战"}</b><small>${done ? "今日已打卡，再玩不再发奖励" : `完成一局即打卡（胜负都算），通关再 +${DAILY_CLEAR} 晶石`}</small></div>
        </div>
        <div class="dl-cal-h o1"><b>连续打卡 ${done ? streak : streak} 天</b><span>${done ? "明天继续" : streak ? "今天打卡领第 " + (slot + 1) + " 天奖励" : "断签后从第 1 天重新开始"}</span></div>
        <div class="dl-cal">${cal}</div>
      </div>
    </div>
  </div>`;
  const p = md.querySelector(".daily-p");
  const close = () => md.remove();
  md.querySelector(".dl-head").appendChild(btn("关闭", "blue small dl-x", close));
  md.querySelector(".dl-side").appendChild(el("div", "dl-acts"));
  md.querySelector(".dl-acts").appendChild(btn(day.runs ? "再次挑战" : "开始挑战", "", () => (close(), onStart())));
  const img = md.querySelector(".dl-map");
  img.src = mapPreview(dd.map);
  md.onclick = (e) => e.target === md && close();
  sfx("click");
  uiRoot().appendChild(md);
  return p;
}
export { dayKey };

/** 每日梦境 玩法说明 (the lobby's guide button when 每日 is chosen) */
export function showDailyHelp(app) {
  import("./ui.js").then(({ showGuide, helpH: H }) => showGuide("每日梦境说明", [
    ["每日梦境", `${H("每天一场梦")}所有人同一场：固定的角色（未解锁也能用）、地图、房间与路线，加一个梦境祝福；每天零点按日期换新。
      ${H("难度")}固定为“噩梦全开”：除护盾停转外所有噩梦契约拉满（敌人生命 +75%、移速与弹速提升、每次受伤 +1、开箱两张卡、金币减半等），护盾照常回复。
      ${H("打卡")}完成一局即打卡（胜负都算），按连续天数领 7 天循环奖励：${DAILY_REWARDS.map((r) => r.text).join(" / ")}；当天第一次通关再 +${DAILY_CLEAR} 晶石。每天只发一次奖励（可反复挑战刷纪录），断签一天从第 1 天重来。`],
], app));
}
