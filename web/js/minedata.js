// 梦境矿场: data for the side-view digging mode (搜 · 打 · 撤).
// A dive is a vertical slice: dig down through four zones, grab what you can carry, and get out alive.

export const MT = 24; // tile size (world px)
export const MW = 48; // columns (about two landscape screens wide)
export const MH = 122; // rows below the surface (0 = first ground row)

// tiles
export const T = {
  AIR: 0, DIRT: 1, STONE: 2, HARD: 3, GRANITE: 4, BRICK: 5, BEDROCK: 6, SEAL: 7, BOULDER: 8, GAS: 9, WATER: 10,
  ORE: 11, CHEST: 12, LIFT: 13, ROOT: 14,
};
export const SOLID = (t) => t !== T.AIR && t !== T.WATER && t !== T.LIFT;
/** hardness = seconds to dig at drill power 1, and energy spent. need = minimum drill level */
export const HARD = {
  [T.DIRT]: { h: 0.35, e: 1, need: 1 },
  [T.ROOT]: { h: 0.45, e: 1, need: 1 },
  [T.STONE]: { h: 0.7, e: 2, need: 1 },
  [T.GAS]: { h: 0.7, e: 2, need: 1 },
  [T.BOULDER]: { h: 0.9, e: 2, need: 1 },
  [T.ORE]: { h: 0.8, e: 2, need: 1 },
  [T.CHEST]: { h: 0.5, e: 1, need: 1 },
  [T.HARD]: { h: 1.2, e: 3, need: 2 },
  [T.BRICK]: { h: 1.4, e: 3, need: 2 },
  [T.GRANITE]: { h: 1.9, e: 4, need: 3 },
};

// zones by depth (rows). light = how far you can see (tiles) before upgrades
export const ZONES = [
  { id: "pit", name: "矿坑", from: 0, to: 30, light: 9, bg: ["#5a3e2a", "#4a3222"], dirt: ["#a8743e", "#8e5e30", "#c08a50"], stone: ["#7d7a82", "#66636c", "#9894a0"], fog: "#120a06" },
  { id: "cave", name: "洞穴", from: 30, to: 60, light: 7, bg: ["#2e2a46", "#25213a"], dirt: ["#6a5a7a", "#57496a", "#7e6e90"], stone: ["#5c5878", "#4a4664", "#726e92"], fog: "#07061a" },
  { id: "sea", name: "深海", from: 60, to: 90, light: 6, bg: ["#123a5a", "#0d2e4a"], dirt: ["#3e6a7a", "#30586a", "#4e8090"], stone: ["#2e5068", "#243f56", "#3c6684"], fog: "#020c1c" },
  { id: "ruin", name: "地底遗迹", from: 90, to: 122, light: 5, bg: ["#3a2a1e", "#2e2016"], dirt: ["#7a5e3e", "#644a30", "#8e7048"], stone: ["#6a5e4e", "#584c3e", "#807262"], fog: "#0c0604" },
];
export const zoneAt = (row) => ZONES.find((z) => row < z.to) || ZONES[ZONES.length - 1];

// ores: v = 晶石 value when brought out, m = 矿石 (upgrade material), w = spawn weight per zone
export const ORES = {
  copper: { name: "铜矿", v: 1, m: 1, col: ["#e08a4a", "#ffb878", "#a85428"], zones: { pit: 10, cave: 3 } },
  iron: { name: "铁矿", v: 2, m: 2, col: ["#c8c0b8", "#f0ece6", "#8a8078"], zones: { pit: 6, cave: 4, sea: 1 } },
  coinbag: { name: "星砂金矿", v: 6, s: 4, m: 0, col: ["#ffd84a", "#fff3a0", "#c08a10"], zones: { pit: 2, cave: 1 } },
  glow: { name: "荧光石", v: 4, m: 3, col: ["#7affc8", "#d0fff0", "#2aa880"], zones: { cave: 6, sea: 1 }, light: true },
  silver: { name: "银矿", v: 5, m: 3, col: ["#d8e4f4", "#ffffff", "#8a9ab8"], zones: { cave: 5, sea: 2 } },
  amethyst: { name: "紫晶", v: 8, m: 4, col: ["#b46aff", "#e8c8ff", "#6a2ab0"], s: 1, zones: { cave: 3, sea: 2, ruin: 1 } },
  pearl: { name: "珍珠", v: 10, m: 4, col: ["#fff6f0", "#ffffff", "#d8c0c8"], s: 1, zones: { sea: 5 } },
  coral: { name: "珊瑚", v: 7, m: 5, col: ["#ff7a8a", "#ffc0c8", "#c83a5a"], s: 1, zones: { sea: 5 } },
  seacrystal: { name: "海晶", v: 14, m: 6, col: ["#4ae0ff", "#c8f8ff", "#1a8ab8"], s: 2, zones: { sea: 2, ruin: 1 } },
  gear: { name: "古代齿轮", v: 16, m: 8, col: ["#d8a048", "#ffe08a", "#8a5a1a"], s: 2, zones: { ruin: 5 } },
  rune: { name: "符文石板", v: 24, m: 10, col: ["#5ad8ff", "#c8f4ff", "#2a6ab0"], s: 3, zones: { ruin: 3 } },
};
// 星砂: the mine's own rare currency (chests and deep ores), spent in 梦境工坊
export const STAR = { name: "星砂", col: ["#ffd84a", "#ffffff", "#ff7cc8"] };
export const CHEST_STARS = { pit: [1, 3], cave: [3, 5], sea: [6, 9], ruin: [10, 15], star: [30, 40] };
// reaching a zone pays 星砂 once you get out (scaled by how much of the haul survives)
export const DEPTH_STARS = { pit: 0, cave: 3, sea: 8, ruin: 15 };

// shovels = dive tickets. depth = deepest row you can dig (a seal blocks the rest)
export const SHOVELS = {
  cu: { name: "铜铲", depth: 60, col: "#e08a4a", desc: "可下潜到洞穴层（60m）" },
  ag: { name: "银铲", depth: 90, col: "#d8e4f4", desc: "可下潜到深海层（90m），星砂更多" },
  au: { name: "金铲", depth: MH, col: "#ffd84a", desc: "全部四层开放，遗迹中必定有一个星辉宝箱" },
};
export const FREE_SHOVEL_HOURS = 4, FREE_SHOVEL_CAP = 5;
// 梦境工坊: what 星砂 buys. 梦核 is the long goal (~5 hours of play): a third SSR slot and a boost for one girl
export const WORKSHOP = {
  ag: { name: "银铲", trade: "cu", n: 3, desc: "用 3 把铜铲合成" },
  au: { name: "金铲", trade: "ag", n: 3, desc: "用 3 把银铲合成" },
  dr: { name: "最终减伤", max: 2, cost: (l) => [120, 260][l], desc: "矿场里每次受到的伤害 -1" },
  card: { name: "SSR 兑换卡", cost: 160, desc: "任选 1 个未满级 SSR" },
  core: { name: "梦核", cost: 360, desc: "角色专属：强化这个角色的大招" },
};

// mine upgrades (养成): level 0 = base
export const UPGRADES = {
  drill: { name: "钻头", max: 3, label: "挖速", val: (l) => `×${(1 + 0.35 * l).toFixed(2)}`, unlock: (l) => (l === 1 ? " · 坚岩" : l === 2 ? " · 花岗岩" : ""), cost: (l) => ({ m: [20, 70, 180][l], v: [60, 150, 300][l] }) },
  battery: { name: "电池", max: 5, label: "电量", val: (l) => `${100 + 40 * l}`, cost: (l) => ({ m: [12, 30, 60, 100, 160][l], v: [30, 60, 100, 150, 220][l] }) },
  bag: { name: "背包", max: 5, label: "容量", val: (l) => `${12 + 6 * l} 格`, cost: (l) => ({ m: [10, 26, 50, 90, 140][l], v: [30, 60, 100, 150, 220][l] }) },
  armor: { name: "护甲", max: 3, label: "生命", val: (l) => `${5 + 2 * l}`, cost: (l) => ({ m: [16, 45, 100][l], v: [40, 100, 200][l] }) },
  radar: { name: "雷达", max: 3, label: "视野", val: (l) => `+${l}`, unlock: (l) => (l === 1 ? " · 透视瓦斯" : l === 2 ? " · 透视矿物" : ""), cost: (l) => ({ m: [15, 50, 120][l], v: [40, 120, 240][l] }) },
  beacon: { name: "救援信标", max: 2, label: "失利保留", val: (l) => `${30 + 10 * l}%`, unlock: (l) => ` · 撤离 ${1.5 - .5 * l} 秒`, cost: (l) => ({ m: [30, 90][l], v: [80, 200][l] }) },
  tank: { name: "氧气瓶", max: 3, label: "氧气", val: (l) => `${20 + 10 * l} 秒`, cost: (l) => ({ m: [20, 50, 110][l], v: [50, 120, 220][l] }) },
};
// one-line upgrade text: "挖速 ×1.00 → ×1.35 · 坚岩" (or just the current value when maxed)
for (const u of Object.values(UPGRADES)) {
  u.desc = (l) => `${u.label} ${u.val(l)}`;
  u.line = (l) => (l >= u.max ? `${u.label} ${u.val(l)}` : `${u.label} ${u.val(l)} → ${u.val(l + 1)}${u.unlock ? u.unlock(l + 1) : ""}`);
}

// monsters living in the mine (sprites from critters/)
// dmg = contact damage: 1 near the surface, 2 from the caves down, +1 more for anything in the ruins, 3 for the
// guardian, so 最终减伤 (-1 / -2 per hit) visibly matters deeper down
export const MOBS = {
  bat: { sprite: "bat", hp: 10, spd: 70, r: 8, sc: 0.36, fly: true, dmg: 1, zones: { pit: 1, cave: 4 } },
  slime: { sprite: "slime", hp: 16, spd: 30, r: 9, sc: 0.42, dmg: 1, zones: { pit: 3, cave: 1 } },
  slime_purple: { sprite: "slime_purple", hp: 20, spd: 30, r: 9, sc: 0.42, dmg: 2, zones: { cave: 2, ruin: 1 } },
  jelly: { sprite: "jelly", hp: 22, spd: 26, r: 10, sc: 0.32, fly: true, dmg: 2, swim: true, zones: { sea: 5 } },
  ghost: { sprite: "ghost", hp: 20, spd: 34, r: 9, sc: 0.5, fly: true, phase: true, dmg: 2, zones: { ruin: 3, sea: 1 } },
  mole: { draw: "mole", hp: 26, spd: 74, r: 8, sc: 1, dmg: 0, flee: true, zones: {} }, // 宝藏地鼠: runs away, burrows off after a while
  golem: { draw: "golem", hp: 300, spd: 30, r: 34, sc: 1, dmg: 3, boss: true, zones: {} }, // 遗迹守护者 (gold-shovel chamber)
  skull: { sprite: "skull", hp: 34, spd: 22, r: 10, sc: 0.3, fly: true, dmg: 2, shoot: 2.4, shotDmg: 2, zones: { ruin: 3 } },
};

// 梦境遗物: roguelike buffs found in relic chests (one per zone). Pick 1 of 3; they last for this dive only.
// max = how many times it can stack
export const RELICS = {
  drill: { name: "狂热钻头", icon: "overclock", desc: "挖掘速度 +40%", max: 2 },
  lamp: { name: "萤火矿灯", icon: "nova", desc: "视野 +2 格", max: 2 },
  cell: { name: "备用电池", icon: "battery", desc: "电量上限 +40 并回满", max: 3 },
  lucky: { name: "幸运十字镐", icon: "pick", desc: "挖到矿物时 30% 多得一块", max: 2 },
  pocket: { name: "次元口袋", icon: "bag", desc: "背包 +6 格", max: 2 },
  heart: { name: "守护之心", icon: "heart", desc: "生命上限 +1 并回满", max: 2 },
  feather: { name: "羽毛喷气", icon: "wing", desc: "喷气耗电 -50%", max: 1 },
  tnt: { name: "爆破专家", icon: "bomb", desc: "炸药 +3，爆炸范围扩大到 5×5", max: 1 },
  compass: { name: "星砂罗盘", icon: "target", desc: "本次获得的星砂 +50%", max: 1 },
  blade: { name: "矿工之刃", icon: "sword", desc: "攻击伤害 +60%", max: 2 },
  gill: { name: "人鱼之鳃", icon: "elem_bubble", desc: "水下氧气消耗 -60%", max: 1 },
  rock: { name: "坚岩之肤", icon: "shield", desc: "免疫落石、瓦斯与炸药伤害", max: 1 },
  beacon: { name: "应急信标", icon: "beacon", desc: "撤离信标 +1", max: 2 },
  greed: { name: "贪婪契约", icon: "coin", desc: "带出的晶石 +30%，但受到的伤害 +1", max: 1, curse: true },
};

// 补给: bought with 💎 in the hub, applied at the start of every dive while selected
export const SUPPLIES = {
  bomb: { name: "炸药包", icon: "bomb", desc: "炸药 +2", cost: 15 },
  cell: { name: "便携电池", icon: "battery", desc: "电量 +50", cost: 20 },
  plate: { name: "护甲片", icon: "shield", desc: "生命 +2", cost: 25 },
  flare: { name: "备用信标", icon: "beacon", desc: "撤离信标 +1", cost: 30 },
};
// 地下商人: pays with ore from the bag (cheapest first). price grows 50% per purchase
export const SHOP = {
  relic: { name: "神秘遗物", icon: "scroll", desc: "遗物三选一", base: 14, max: 2 },
  heal: { name: "治疗药水", icon: "heart", desc: "生命回满", base: 8, max: 3 },
  cell: { name: "电池组", icon: "battery", desc: "电量回满", base: 6, max: 3 },
  bomb: { name: "炸药", icon: "bomb", desc: "炸药 +2", base: 5, max: 3 },
};

// 每日委托: three a day, progress adds up over the day's dives
export const QUESTS = {
  ore: { w: 3 }, // 带出 N 个某种矿
  depth: { w: 2 }, // 到达某深度
  kill: { w: 2 }, // 击败怪物（累计）
  mole: { w: 1 }, // 抓到宝藏地鼠
  relic: { w: 2 }, // 打开遗物箱（累计）
  haul: { w: 2 }, // 单次带出 💎 ≥ V
  extract: { w: 2 }, // 安全撤离（累计）
};

// ---------------------------------------------------------------- small icons (UI only; need a DOM)
/** a little pixel nugget icon for an ore (cached data URL) */
const oreIcons = {};
export function oreIcon(id) {
  if (oreIcons[id]) return oreIcons[id];
  const o = id === "star" ? STAR : ORES[id];
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d");
  const P = [[3, 8], [7, 3], [12, 4], [14, 9], [10, 14], [4, 13]];
  g.fillStyle = "#1a1020";
  g.beginPath();
  P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.fillStyle = o.col[0];
  g.beginPath();
  P.forEach(([x, y], i) => (i ? g.lineTo(x + (8 - x) * 0.18, y + (9 - y) * 0.18) : g.moveTo(x + (8 - x) * 0.18, y + (9 - y) * 0.18)));
  g.closePath();
  g.fill();
  g.fillStyle = o.col[1];
  g.fillRect(6, 5, 3, 2);
  g.fillRect(5, 7, 2, 2);
  g.fillStyle = o.col[2];
  g.fillRect(9, 11, 3, 2);
  return (oreIcons[id] = c.toDataURL());
}
/** a little pixel chest: plain (wood), star (gold), relic (violet) */
const chestIcons = {};
export function chestIcon(kind) {
  if (chestIcons[kind]) return chestIcons[kind];
  const col = { plain: ["#a8743e", "#e0a860", "#6a4420"], star: ["#ffd84a", "#fff3a0", "#c08a10"], relic: ["#9a5ae8", "#d8b0ff", "#5a2aa0"] }[kind];
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d");
  // 12 px tall box centred in the 16 px icon (rows 2..13), so it lines up with text beside it
  g.fillStyle = "#1a1020";
  g.fillRect(1, 2, 14, 12);
  g.fillStyle = col[0];
  g.fillRect(2, 3, 12, 10);
  g.fillStyle = col[1];
  g.fillRect(2, 3, 12, 3);
  g.fillStyle = col[2];
  g.fillRect(2, 6, 12, 1);
  g.fillStyle = kind === "plain" ? "#ffd84a" : "#ffffff";
  g.fillRect(7, 6, 2, 3);
  return (chestIcons[kind] = c.toDataURL());
}
