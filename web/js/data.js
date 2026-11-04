// All the game's numbers live here, so balance can be tuned in one place.
// Units: distance in world pixels (1 tile = 32 px), time in seconds, HP/shield in "points" (Soul Knight style:
// enemy hits deal 1, big boss hits 2), player damage in raw numbers.

export const T = 32; // tile size
export let VIEW_W = 640, VIEW_H = 360;
export let RS = 2; // render scale: the canvas has 2x the world resolution so the girls keep their detail
export function setRS(v) {
  RS = v;
}
export const SPR_K = 2; // hero sprites are drawn at 2x the world pixel size
export function setViewW(w) {
  VIEW_W = w;
}

export const BAL = {
  shieldDelay: 3.2, // s without damage before shield regenerates
  shieldTick: 1.0, // s per shield point
  hurtInvuln: 0.7,
  dashCd: 1.6, dashTime: 0.17, dashSpeed: 520, dashInvuln: 0.24,
  critMul: 1.8,
  markTime: 4, // element mark duration on enemies
  coop: { hp: 0.6, count: 0.35 }, // enemy HP / count multipliers per extra player
  roomHp: 0.18, // enemy hp growth per room index
};

// ---------------------------------------------------------------- elements & reactions
export const ELEM = {
  water: { name: "潮", color: "#3aa8ff", glow: "#7fd0ff", ramp: ["#04101e", "#0a2a4a", "#12507e", "#1e7fb8", "#3aa8ff", "#7fd0ff", "#c8f0ff", "#ffffff"] },
  thunder: { name: "雷", color: "#ffd84a", glow: "#fff2a0", ramp: ["#140e02", "#3a2a06", "#6e4e0a", "#b08414", "#e8c02a", "#ffe066", "#fff6b8", "#ffffff"] },
  sun: { name: "光", color: "#ff9a2e", glow: "#ffd28a", ramp: ["#1a0802", "#4a1c04", "#86380a", "#c45e12", "#ff9a2e", "#ffc46a", "#ffeab8", "#ffffff"] },
  dragon: { name: "焰", color: "#b48cff", glow: "#e0ccff", ramp: ["#0e0618", "#24103e", "#3e1e6e", "#6a3eb0", "#9b6cf0", "#c9a8ff", "#efe4ff", "#ffffff"] },
  bubble: { name: "泡", color: "#ff7cc8", glow: "#ffc2e6", ramp: ["#1a0612", "#3e0e2c", "#6e1a50", "#b02e80", "#ff5cb4", "#ff9ed6", "#ffd8ee", "#ffffff"] },
  ink: { name: "墨", color: "#7b6cff", glow: "#b8b0ff", ramp: ["#06050c", "#121022", "#221e3e", "#3a3366", "#5c52a0", "#8a80d8", "#c6c0f4", "#ffffff"] },
};
export const ELEM_KEYS = Object.keys(ELEM);

// key: two elements sorted alphabetically joined with "+"
export const REACTIONS = {
  "thunder+water": { name: "感电链", desc: "闪电在附近敌人间跳跃", dmg: 12, kind: "chain" },
  "dragon+water": { name: "蒸汽爆", desc: "范围蒸汽爆炸", dmg: 15, r: 52, kind: "blast", fx: "steam" },
  "dragon+ink": { name: "墨焰", desc: "持续燃烧并传染", dmg: 5, kind: "dot" },
  "ink+sun": { name: "日蚀", desc: "高额单体伤害并眩晕", dmg: 26, kind: "eclipse" },
  "sun+thunder": { name: "圣雷", desc: "天降雷光", dmg: 20, r: 36, kind: "strike" },
  "dragon+thunder": { name: "超载", desc: "爆炸并击退", dmg: 16, r: 48, kind: "blast", fx: "plasma" },
  "sun+water": { name: "虹光", desc: "为附近友方恢复1点护盾", dmg: 6, kind: "rainbow" },
  "ink+water": { name: "墨染", desc: "大幅减速并易伤", dmg: 6, kind: "soak" },
  "dragon+sun": { name: "炽日", desc: "日轮爆发", dmg: 15, r: 46, kind: "blast", fx: "sun" },
  "ink+thunder": { name: "雷符", desc: "落雷连击", dmg: 8, kind: "multi" },
  // bubble with anything: pops and spreads the other element
  bubble: { name: "元素泡爆", desc: "泡泡爆裂并把元素传染给周围敌人", dmg: 9, r: 44, kind: "spread" },
};
export function reactionKey(a, b) {
  if (a === b) return null;
  if (a === "bubble" || b === "bubble") return "bubble";
  return [a, b].sort().join("+");
}

// ---------------------------------------------------------------- characters
// atk: dmg per bullet, rate shots/s, spd bullet speed, range lock-on radius
export const CHARS = {
  deepseek: {
    name: "DeepSeek 鲸鱼娘", short: "鲸鱼娘", title: "潮汐侍者", role: "潮汐法师 / 护盾辅助", elem: "water", color: "#3a8cff",
    hp: 6, shield: 5, speed: 112,
    atk: { name: "潮汐水弹", dmg: 4.2, rate: 3.6, spd: 300, range: 215, size: 4 },
    skill: { name: "深海回响", cd: 7, desc: "向前释放穿透水波：伤害、减速、击退，并为自身与附近队友回复2点护盾" },
    ult: { name: "鲸落潮域", need: 210, desc: "鲸影冲击目标区域造成范围伤害，留下持续伤害、周期回盾的潮域" },
    passive: "潮印：连续命中同一目标3次触发小范围水爆",
    lore: "温柔勤快，喜欢照顾同伴，偶尔一本正经地犯迷糊。",
  },
  gpt: {
    name: "GPT 小龙娘", short: "小龙娘", title: "白龙术士", role: "龙语法师 / 范围输出", elem: "dragon", color: "#a98cff",
    hp: 5, shield: 4, speed: 110,
    atk: { name: "灵光龙弹", dmg: 5.2, rate: 2.9, spd: 270, range: 205, size: 5, splash: 22, splashDmg: 2.2 },
    skill: { name: "灵感龙息", cd: 6, desc: "可移动施放的扇形龙息，多段伤害并附加灼印" },
    ult: { name: "白龙觉醒", need: 230, desc: "获得护盾并击退周围敌人，6秒内龙弹变为穿透龙束，可消耗灼印追加伤害" },
    passive: "龙弹命中产生小范围溅射",
    lore: "好奇博学，喜欢收集冒险故事，遇到新事物会主动探索。",
  },
  grok: {
    name: "Grok 娘", short: "Grok娘", title: "叛逆游侠", role: "游侠 / 机动射手", elem: "thunder", color: "#ffd84a",
    hp: 5, shield: 3, speed: 124,
    atk: { name: "叛逆连射", dmg: 2.5, rate: 6, spd: 360, range: 225, size: 3, ramp: 0.7 },
    skill: { name: "离轨弹幕", cd: 5, desc: "向移动方向冲刺（短暂无敌），并射出5枚弹射能量弹" },
    ult: { name: "越界时刻", need: 200, desc: "6秒内移速、射速大幅提升，普攻穿透并附带侧向散弹" },
    passive: "连续射击时射速逐渐提升，最高+70%",
    lore: "胆大敏捷，爱吐槽，面对危险时习惯先行动。",
  },
  claude: {
    name: "Claude 娘", short: "Claude娘", title: "日葵书记", role: "圣光法师 / 防御辅助", elem: "sun", color: "#ff9a2e",
    hp: 6, shield: 6, speed: 106,
    atk: { name: "日葵书签", dmg: 4.6, rate: 3.1, spd: 280, range: 215, size: 4 },
    skill: { name: "日光书页", cd: 8, desc: "为自身与附近队友展开屏障抵挡一次伤害，破裂或到期时射出光弹" },
    ult: { name: "盛昼圣典", need: 220, desc: "展开日光领域：范围伤害、周期光束、域内友方减伤40%，结束时引爆日光印记" },
    passive: "日光印记：叠满4层引爆并恢复1点护盾（2秒间隔）",
    lore: "耐心温和、讲究礼仪，珍惜藏书，喜欢认真听完同伴的故事。",
  },
  doubao: {
    name: "豆包", short: "豆包", title: "元气助手", role: "气泡术师 / 治疗辅助", elem: "bubble", color: "#ff7cc8",
    hp: 7, shield: 3, speed: 112,
    atk: { name: "元气泡泡", dmg: 3.6, rate: 3.6, spd: 250, range: 205, size: 5, pop: 6 },
    skill: { name: "补给气泡", cd: 8, desc: "投出补给气泡造成范围伤害，并留下可拾取的回复球（满血时转为护盾）" },
    ult: { name: "元气补给站", need: 210, desc: "部署补给站：持续攻击敌人，并为范围内友方缓慢回复生命" },
    passive: "泡泡附着：再次命中附着目标触发泡泡爆裂",
    lore: "亲切活泼，善于发现队友的需要，是队伍中的日常补给担当。",
  },
  glm: {
    name: "GLM 娘", short: "GLM娘", title: "玄墨学者", role: "阵法师 / 控制法师", elem: "ink", color: "#7b6cff",
    hp: 5, shield: 5, speed: 108,
    atk: { name: "玄墨飞符", dmg: 4.2, rate: 3, spd: 290, range: 220, size: 4, pierce: 2 },
    skill: { name: "墨阵推演", cd: 7, desc: "在目标处布下墨阵：持续伤害、减速并标记敌人，自身短暂加速" },
    ult: { name: "万象归卷", need: 230, desc: "展开大型书阵：牵引敌人、持续墨刃，结束时引爆所有标记" },
    passive: "墨标记：飞符命中被标记敌人附加一次墨伤",
    lore: "沉静、条理清晰，习惯先观察并记笔记，再选择行动。",
  },
};
export const CHAR_ORDER = ["deepseek", "gpt", "grok", "claude", "doubao", "glm"];
export const START_CHARS = ["deepseek", "gpt"];

// unlock conditions (checked against meta stats)
export const UNLOCKS = {
  grok: { text: "累计击败 120 个敌人", stat: "kills", need: 120 },
  doubao: { text: "累计抽卡 10 次", stat: "pulls", need: 10 },
  claude: { text: "累计触发 40 次元素反应", stat: "reactions", need: 40 },
  glm: { text: "击败首领【幻觉之眼】", stat: "bossKills", need: 1 },
};

// ---------------------------------------------------------------- enemies
// ai: hop (slime), flit (bat), shooter (eyeball), ghost, caster (skull), leap (frog), pulse (jelly), kamikaze (wisp), snake
export const ENEMIES = {
  slime: { name: "缓存史莱姆", hp: 20, spd: 46, r: 12, ai: "hop", sprite: "slime", coin: [1, 2], touch: 1 },
  slime_blue: { name: "冷却史莱姆", hp: 24, spd: 50, r: 12, ai: "hop", sprite: "slime_blue", coin: [1, 2], touch: 1 },
  slime_purple: { name: "毒性史莱姆", hp: 26, spd: 42, r: 12, ai: "hop", sprite: "slime_purple", coin: [1, 2], touch: 1, puddle: true },
  bat: { name: "爬虫蝙蝠", hp: 12, spd: 104, r: 9, ai: "flit", sprite: "bat", coin: [0, 1], touch: 1, fly: true },
  eyeball: { name: "幻觉眼球", hp: 24, spd: 44, r: 11, ai: "shooter", sprite: "eyeball", coin: [1, 2], fly: true, shot: { cd: 1.5, spd: 165, n: 1 } },
  frog: { name: "跳转青蛙", hp: 26, spd: 40, r: 12, ai: "leap", sprite: "frog", coin: [1, 2], touch: 1 },
  ghost: { name: "过期缓存", hp: 30, spd: 38, r: 11, ai: "ghost", sprite: "ghost", coin: [1, 3], fly: true, phase: true, shot: { cd: 2.6, spd: 135, n: 3, spread: 0.32, slow: true } },
  skull: { name: "过热骷髅", hp: 40, spd: 34, r: 12, ai: "caster", sprite: "skull", coin: [2, 3], fly: true, shot: { cd: 2.6, spd: 135, n: 10, ring: true, burn: true } },
  jelly: { name: "漏电水母", hp: 34, spd: 36, r: 12, ai: "pulse", sprite: "jelly", coin: [1, 3], fly: true },
  wisp: { name: "游离进程", hp: 10, spd: 70, r: 8, ai: "kamikaze", sprite: "wisp", coin: [0, 1], fly: true },
  snake: { name: "死循环蛇", hp: 22, spd: 72, r: 10, ai: "snake", sprite: "snake", coin: [1, 2], touch: 1 },
  boss_eye: { name: "幻觉之眼", hp: 3000, spd: 40, r: 16, ai: "boss_eye", sprite: "eyeball", coin: [30, 30], fly: true, boss: true, scale: 2 },
  // map residents (recoloured critters) — 数据草原
  snake_vine: { name: "藤蔓蛇", hp: 26, spd: 70, r: 10, ai: "snake", sprite: "snake_vine", coin: [1, 2], touch: 1, chill: true },
  frog_big: { name: "巨型跳转蛙", hp: 80, spd: 44, r: 16, ai: "leap", sprite: "frog_big", coin: [3, 5], touch: 1, scale: 1.5 },
  // 显存冰原
  bat_ice: { name: "霜冻爬虫", hp: 14, spd: 100, r: 9, ai: "flit", sprite: "bat_ice", coin: [0, 1], touch: 1, fly: true, chill: true },
  eye_ice: { name: "冰晶眼球", hp: 28, spd: 42, r: 11, ai: "shooter", sprite: "eye_ice", coin: [1, 2], fly: true, shot: { cd: 1.6, spd: 150, n: 1, slow: true } },
  slime_frost: { name: "冰晶史莱姆", hp: 70, spd: 44, r: 15, ai: "hop", sprite: "slime_frost", coin: [3, 4], touch: 1, scale: 1.35, chill: true, split: "slime_blue" },
  // 算力熔炉
  slime_lava: { name: "熔岩史莱姆", hp: 30, spd: 44, r: 12, ai: "hop", sprite: "slime_lava", coin: [1, 2], touch: 1, lavaPuddle: true },
  bat_fire: { name: "炎蝠", hp: 14, spd: 108, r: 9, ai: "flit", sprite: "bat_fire", coin: [0, 1], touch: 1, fly: true, burnTouch: true },
  skull_core: { name: "熔核骷髅", hp: 80, spd: 30, r: 14, ai: "caster", sprite: "skull_core", coin: [3, 5], fly: true, scale: 1.3, shot: { cd: 2.1, spd: 140, n: 14, ring: true, burn: true } },
  // bosses of the other two maps
  boss_frost: { name: "冰封史莱姆王", hp: 3300, spd: 50, r: 22, ai: "boss_frost", sprite: "slime_frost", coin: [30, 30], boss: true, scale: 3 },
  boss_core: { name: "过热核心", hp: 3600, spd: 36, r: 18, ai: "boss_core", sprite: "skull_core", coin: [30, 30], fly: true, boss: true, scale: 2.4 },
};

// rooms of one run: the core loop
export const RUN = [
  { kind: "combat", waves: [["slime", "slime", "slime", "bat", "bat"], ["slime", "bat", "bat", "slime", "eyeball", "eyeball"], ["slime_blue*", "slime", "slime", "bat", "eyeball"]], items: 2 },
  { kind: "combat", waves: [["frog", "eyeball", "slime", "slime", "bat", "bat"], ["slime_purple", "frog", "eyeball", "bat", "bat", "eyeball"], ["frog", "frog", "slime_purple", "eyeball*"]], items: 3 },
  { kind: "shop" },
  { kind: "combat", waves: [["ghost", "jelly", "slime", "bat", "bat", "eyeball"], ["skull*", "frog", "eyeball", "slime_purple", "bat", "bat"], ["wisp", "wisp", "wisp", "jelly", "ghost", "eyeball", "frog"]], items: 3 },
  { kind: "combat", waves: [["snake", "snake", "eyeball", "eyeball", "slime_purple", "wisp", "wisp"], ["skull", "jelly*", "wisp", "wisp", "frog", "eyeball"], ["ghost*", "snake", "bat", "bat", "bat", "eyeball", "skull"], ["frog*", "eyeball*", "wisp", "wisp", "wisp", "jelly"]], items: 4 },
  { kind: "shop" },
  { kind: "boss", boss: "boss_eye" },
];
export const ROOM_NAMES = { combat: "战斗", shop: "补给站", boss: "首领" };

// ---------------------------------------------------------------- maps (chapters), endless, PVP rules
// theme: index into map.js THEMES. hazard: what the scattered floor patches do (mud slows / ice slides / lava burns)
// swap: some enemies of the base run are replaced by the map's residents [type, chance]
export const MAPS = {
  grass: { name: "数据草原", theme: 0, hazard: "mud", hazardText: "泥沼会减速 · 清除所有敌人", hp: 1, reward: 1, desc: "入门地图：泥沼减速，藤蔓蛇碰到会减速，首领是幻觉之眼。", need: null,
    swap: { snake: ["snake_vine", 0.7], bat: ["snake_vine", 0.15] }, elites: ["frog_big"], boss: "boss_eye" },
  ice: { name: "显存冰原", theme: 2, hazard: "ice", hazardText: "冰面会打滑 · 清除所有敌人", hp: 1.3, reward: 1.35, desc: "冰面会打滑；霜冻爬虫、冰晶眼球会让你减速，首领是冰封史莱姆王。", need: "grass",
    swap: { slime: ["slime_blue", 0.8], frog: ["ghost", 0.5], bat: ["bat_ice", 0.7], eyeball: ["eye_ice", 0.6], snake: ["bat_ice", 0.5] }, elites: ["slime_frost"], boss: "boss_frost" },
  lava: { name: "算力熔炉", theme: 3, hazard: "lava", hazardText: "熔岩会灼烧 · 清除所有敌人", hp: 1.6, reward: 1.7, desc: "熔岩地块持续灼烧（敌人也会）；熔岩史莱姆死后留下火池，炎蝠碰到会着火，首领是过热核心。", need: "ice",
    swap: { slime: ["slime_lava", 0.75], slime_purple: ["slime_lava", 0.6], eyeball: ["skull", 0.3], bat: ["bat_fire", 0.7], jelly: ["skull", 0.4], frog: ["slime_lava", 0.4] }, elites: ["skull_core"], boss: "boss_core" },
};
export const MAP_ORDER = ["grass", "ice", "lava"];
export const PVP_MODES = {
  brawl: { name: "自由混战", goal: 5, koScore: true, goalText: "先拿到 5 次击倒者获胜", desc: "击倒对手得 1 分，先到 5 分获胜。" },
  koth: { name: "算力据点", goal: 45, koScore: false, zone: 52, goalText: "独占中心据点每秒 +1 分，先到 45 分获胜", desc: "独自站在中心据点里每秒得 1 分；多人在里面时谁都不得分。" },
};
// endless corridor: shop every 5th floor, boss every 10th, then the next map's look; enemies get more and tougher
const ENDLESS_POOL = [
  ["slime", "slime_blue", "bat", "eyeball", "frog"],
  ["slime_purple", "frog", "eyeball", "bat", "ghost", "jelly"],
  ["ghost", "jelly", "wisp", "skull", "snake", "eyeball"],
  ["skull", "snake", "wisp", "jelly", "ghost", "frog", "eyeball"],
];
export function endlessRoom(i, seed) {
  if (i % 10 === 9) return { kind: "boss", boss: "boss_eye" };
  if (i % 5 === 4) return { kind: "shop" };
  let x = (seed ^ (i * 2654435761)) >>> 0;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  const tier = Math.min(ENDLESS_POOL.length - 1, Math.floor(i / 5));
  const pool = [...ENDLESS_POOL[tier], ...(tier > 0 ? ENDLESS_POOL[tier - 1] : [])];
  const nWaves = Math.min(5, 3 + Math.floor(i / 8));
  const perWave = Math.min(10, 5 + Math.floor(i / 4));
  const eliteP = Math.min(0.35, 0.06 + i * 0.012);
  const waves = [];
  for (let w = 0; w < nWaves; w++) {
    const wave = [];
    for (let k = 0; k < perWave; k++) wave.push(pool[Math.floor(rnd() * pool.length)] + (rnd() < eliteP ? "*" : ""));
    waves.push(wave);
  }
  return { kind: "combat", waves, items: 2 + (i % 3) };
}

// ---------------------------------------------------------------- map items and hazards
export const ITEMS = {
  cube: { name: "算力方块", desc: "本局伤害 +6%，每 2 个生命上限 +1", color: "#7dffb0", icon: "◆" },
  speed: { name: "极速饮料", desc: "6秒内移速+40%", color: "#4ae0ff", icon: "»", dur: 6 },
  rage: { name: "狂暴芯片", desc: "6秒内攻速+60%", color: "#ff5a4a", icon: "!", dur: 6 },
  shield: { name: "护盾泡", desc: "护盾立即回满", color: "#a8c8ff", icon: "◎" },
  heal: { name: "血包", desc: "恢复2点生命", color: "#ff5a7a", icon: "+" },
  star: { name: "无敌星", desc: "5秒无敌且伤害+30%", color: "#ffe14a", icon: "★", dur: 5 },
  freeze: { name: "冻结炸弹", desc: "冻结附近敌人2.5秒", color: "#bff0ff", icon: "❄" },
  infuse: { name: "元素灌注", desc: "12秒内普攻附带随机元素", color: "#ff9cf2", icon: "✦", dur: 12 },
};
export const ITEM_WEIGHTS = { cube: 3, speed: 2, rage: 2, shield: 2, heal: 2, star: 0.7, freeze: 1, infuse: 2 };
export const HAZARDS = {
  poison: { name: "毒雾", desc: "每1.2秒受到1点伤害（敌人也会受伤）" },
  mud: { name: "泥沼", desc: "移速-45%" },
  spikes: { name: "尖刺陷阱", desc: "周期弹出，造成1点伤害" },
  barrel: { name: "炸药桶", desc: "击破后爆炸，伤害周围所有单位" },
};
export const STATUS = {
  slow: { name: "减速", color: "#7fb4ff" },
  burn: { name: "灼烧", color: "#ff8a3a" },
  poison: { name: "中毒", color: "#9cff5a" },
  speed: { name: "极速", color: "#4ae0ff" },
  rage: { name: "狂暴", color: "#ff5a4a" },
  star: { name: "无敌", color: "#ffe14a" },
  infuse: { name: "灌注", color: "#ff9cf2" },
  ultOn: { name: "大招", color: "#ffffff" },
};

// ---------------------------------------------------------------- skill cards (in-run)
// rarity weights in the in-run pool
export const RARITY = {
  N: { name: "N", color: "#b8c4d6", w: 50 },
  R: { name: "R", color: "#5fb4ff", w: 32 },
  SR: { name: "SR", color: "#c27bff", w: 14 },
  SSR: { name: "SSR", color: "#ffc93a", w: 4 },
};
// tag: what kind of card (shown as chip)
export const CARDS = [
  { id: "atk_up", r: "N", tag: "提示词", name: "思维链", desc: "伤害 +18%", max: 5 },
  { id: "rate_up", r: "N", tag: "提示词", name: "并行推理", desc: "攻速 +16%", max: 5 },
  { id: "hp_up", r: "N", tag: "提示词", name: "冗余参数", desc: "生命上限 +2，并回复2点", max: 3 },
  { id: "shield_up", r: "N", tag: "提示词", name: "安全对齐", desc: "护盾上限 +2", max: 3 },
  { id: "speed_up", r: "N", tag: "提示词", name: "轻量化", desc: "移速 +12%", max: 3 },
  { id: "range_up", r: "N", tag: "提示词", name: "长上下文", desc: "锁敌范围 +18%，弹速 +20%", max: 2 },
  { id: "big_bullet", r: "N", tag: "提示词", name: "大模型", desc: "弹体变大，伤害 +12%", max: 2 },
  { id: "coin_up", r: "N", tag: "提示词", name: "Token节约", desc: "金币获取 +35%，拾取范围增大", max: 2 },
  { id: "multishot", r: "R", tag: "提示词", name: "多头注意力", desc: "普攻 +1 弹道（每道伤害 ×0.8）", max: 2 },
  { id: "pierce", r: "R", tag: "提示词", name: "残差连接", desc: "普攻穿透 +1", max: 2 },
  { id: "bounce", r: "R", tag: "提示词", name: "反向传播", desc: "普攻命中后弹射至附近敌人 +1 次", max: 2 },
  { id: "crit", r: "R", tag: "提示词", name: "温度系数", desc: "暴击率 +12%", max: 3 },
  { id: "cd_down", r: "R", tag: "提示词", name: "推理加速", desc: "小技能冷却 -20%", max: 2 },
  { id: "ult_charge", r: "R", tag: "提示词", name: "梯度累积", desc: "大招充能速度 +30%", max: 2 },
  { id: "vamp", r: "R", tag: "提示词", name: "自我修复", desc: "击杀时 8% 概率恢复1点生命", max: 2 },
  { id: "dodge_crit", r: "R", tag: "提示词", name: "随机失活", desc: "闪避后 2.5 秒内必定暴击", max: 1 },
  { id: "low_rage", r: "R", tag: "提示词", name: "背水一战", desc: "生命 ≤ 2 时伤害 +60%", max: 1 },
  { id: "kill_boom", r: "SR", tag: "机制", name: "连锁崩溃", desc: "敌人死亡时爆炸，造成 10 点范围伤害", max: 2, locked: true },
  { id: "reaction_amp", r: "SR", tag: "反应", name: "跨模态融合", desc: "元素反应伤害 +60%", max: 2, locked: true },
  { id: "element_spread", r: "SR", tag: "反应", name: "知识蒸馏", desc: "元素印记命中时 25% 概率传染给附近敌人", max: 1, locked: true },
  { id: "shield_nova", r: "SR", tag: "机制", name: "防御反制", desc: "护盾破碎时释放冲击波（18伤害并击退）", max: 1, locked: true },
  { id: "echo", r: "SSR", tag: "机制", name: "自洽回声", desc: "小技能有 35% 概率再释放一次", max: 1, locked: true },
  { id: "second_ult", r: "SSR", tag: "机制", name: "持续学习", desc: "释放大招后立即返还 40% 充能", max: 1, locked: true },
];
// fusion cards are generated per character (the "技能混搭" core): every 3rd attack also fires that girl's bullet,
// and "skill link" makes your skill also cast hers at reduced power.
export function fusionCards(selfId) {
  const out = [];
  for (const id of CHAR_ORDER) {
    if (id === selfId) continue;
    const c = CHARS[id];
    out.push({ id: "fa_" + id, r: "SR", tag: "混搭", fuse: id, kind: "atk", name: `融合·${c.atk.name}`, desc: `每第3次普攻额外射出${c.short}的【${c.atk.name}】（${ELEM[c.elem].name}元素）`, max: 1 });
    out.push({ id: "fs_" + id, r: "SSR", tag: "混搭", fuse: id, kind: "skill", name: `联动·${c.skill.name}`, desc: `释放小技能时，同时释放${c.short}的【${c.skill.name}】（70%效果）`, max: 1, locked: true });
  }
  return out;
}

// ---------------------------------------------------------------- meta gacha (lobby)
export const GACHA = {
  cost1: 100, cost10: 900, pity: 50,
  rates: { N: 0.5, R: 0.33, SR: 0.14, SSR: 0.03 },
  refund: { N: 12, R: 25, SR: 60, SSR: 200 },
  pool: [
    { id: "t_dmg", r: "R", name: "算力超频", desc: "全角色伤害 +4%", max: 5 },
    { id: "t_hp", r: "SR", name: "冗余备份", desc: "全角色生命上限 +1", max: 3 },
    { id: "t_shield", r: "N", name: "防火墙", desc: "护盾回复速度 +10%", max: 5 },
    { id: "t_speed", r: "N", name: "低延迟", desc: "移速 +3%", max: 3 },
    { id: "t_coin", r: "N", name: "Token节流", desc: "局内金币 +12%", max: 5 },
    { id: "t_start_coin", r: "N", name: "预训练", desc: "开局金币 +15", max: 5 },
    { id: "t_crit", r: "R", name: "高温采样", desc: "暴击率 +3%", max: 5 },
    { id: "t_ult", r: "SR", name: "预热缓存", desc: "开局大招充能 +30%", max: 2 },
    { id: "t_revive", r: "SSR", name: "断点续训", desc: "每局一次：倒下时原地满血复活", max: 1, eq: 1 },
    { id: "t_startcard", r: "SSR", name: "先验知识", desc: "开局额外获得技能卡（每级 1 张；PVE 三选一，PVP 随机）", max: 2, eq: 1 },
    { id: "t_overclock", r: "SSR", name: "超频推理", desc: "大招充能速度 +30%，开局大招 50%", max: 1, eq: 1 },
    { id: "t_firewall", r: "SSR", name: "零信任防火墙", desc: "护盾被打破时释放冲击波：伤害并击退周围敌人（8秒冷却）", max: 1, eq: 1 },
    { id: "t_ensemble", r: "SSR", name: "模型集成", desc: "每第 4 次普攻额外射出 3 发散射弹（每发 40% 伤害）", max: 1, eq: 1 },
    // 11/04 新卡
    { id: "t_rate", r: "N", name: "批处理", desc: "攻速 +2%", max: 5 },
    { id: "t_range", r: "N", name: "长上下文", desc: "攻击射程 +3%", max: 5 },
    { id: "t_magnet", r: "N", name: "缓存命中", desc: "金币吸取范围 +15%", max: 3 },
    { id: "t_cd", r: "R", name: "参数共享", desc: "小技能冷却 -4%", max: 5 },
    { id: "t_elite", r: "R", name: "对抗训练", desc: "对精英和首领的伤害 +5%", max: 5 },
    { id: "t_shield2", r: "SR", name: "冗余存储", desc: "护盾上限 +1", max: 2 },
    { id: "t_replay", r: "SR", name: "经验回放", desc: "击败精英或首领时大招充能 +10%", max: 3 },
    { id: "t_chain", r: "SSR", name: "思维链", desc: "每第 5 次普攻额外放出一道闪电，在最多 4 个敌人之间弹跳（每跳 60% 伤害）", max: 1, eq: 1 },
    { id: "t_rag", r: "SSR", name: "检索增强", desc: "每进入一个战斗房间，身边掉落 1 个随机道具（竞技场无效）", max: 1, eq: 1 },
    { id: "t_moe", r: "SSR", name: "混合专家", desc: "生命不高于一半时：伤害 +30%、移速 +15%", max: 1, eq: 1 },
    { id: "u_kill_boom", r: "SR", name: "卡牌·连锁崩溃", desc: "解锁技能卡【连锁崩溃】", max: 1, card: "kill_boom" },
    { id: "u_reaction_amp", r: "SR", name: "卡牌·模态融合", desc: "解锁技能卡【跨模态融合】", max: 1, card: "reaction_amp" },
    { id: "u_element_spread", r: "SR", name: "卡牌·知识蒸馏", desc: "解锁技能卡【知识蒸馏】", max: 1, card: "element_spread" },
    { id: "u_shield_nova", r: "SR", name: "卡牌·防御反制", desc: "解锁技能卡【防御反制】", max: 1, card: "shield_nova" },
    { id: "u_echo", r: "SSR", name: "卡牌·自洽回声", desc: "解锁技能卡【自洽回声】；装配后开局自带（小技能 35% 再释放一次）", max: 1, card: "echo", eq: 1 },
    { id: "u_second_ult", r: "SSR", name: "卡牌·持续学习", desc: "解锁技能卡【持续学习】；装配后开局自带（放大招返还 40% 充能）", max: 1, card: "second_ult", eq: 1 },
    { id: "u_links", r: "SSR", name: "卡牌·技能联动", desc: "解锁全部【联动】技能卡；装配后开局随机自带 1 张联动卡", max: 1, card: "links", eq: 1 },
  ],
};

// out-of-run talent loadout: every character has one page with this many SSR slots (works in PVE and PVP)
export const LOADOUT_SLOTS = 2;

// tokens earned per run
export const REWARD = { room: 15, kill: 1, elite: 6, boss: 120, firstBoss: 200 };
export const START_TOKENS = 300;

/** 梦核 (from 梦境工坊): each girl's ult gets stronger in its own way */
export const CORE_FX = {
  deepseek: "大招持续 8 秒、范围更大",
  gpt: "大招持续 9 秒、冲击更广",
  grok: "大招散射收束、副弹更痛",
  claude: "大招领域自动追向敌人",
  doubao: "补给站射速与回血更快",
  glm: "大招持续 5 秒、牵引更强",
};
