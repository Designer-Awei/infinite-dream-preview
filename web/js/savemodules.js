// Registry of player-owned stores. Updater caches and backup/transaction metadata are deliberately excluded.
import {START_CHARS, CHAR_ORDER, GACHA, LOADOUT_SLOTS} from './data.js';
import {normalizePets} from './petdata.js';
import {SAVE_VERSION, clone, fail, isObject, safeData} from './saveformat.js';
const object=(v,label)=>{if(!isObject(v))fail('STRUCTURE',`${label}结构无效`);return v;};
const list=(v,label)=>{if(!Array.isArray(v))fail('STRUCTURE',`${label}应为列表`);return v;};
const nonnegative=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0)fail('STRUCTURE',`${label}数值无效`);};
const numberMap=(v,label)=>{object(v,label);for(const n of Object.values(v))nonnegative(n,label);};
export const freshWorld=()=>({v:1,opened:[],fog:'',x:null,y:null,chests:0,visits:0,gates:[],bossDay:{},flag:null,mats:[0,0,0,0,0,0,0],nodeDay:{},miles:[],cracked:[]});
export const freshHome=()=>({v:1,lv:{farm:1,hut:0,store:0,spring:0,tower:0},slots:[]});
export function migrateMain(value){
  const m=clone(object(value,'主存档'));safeData(m);
  list(m.chars,'角色');if(m.chars.some(id=>!CHAR_ORDER.includes(id)))fail('VERSION','存档含本版未支持的角色，请更新游戏');
  if(m.tokens!==undefined)nonnegative(m.tokens,'晶石');
  if(m.talents!==undefined)numberMap(m.talents,'天赋');
  if(m.cards!==undefined&&list(m.cards,'卡牌').some(id=>typeof id!=='string'))fail('STRUCTURE','卡牌内容无效');
  if(m.stats!==undefined)numberMap(m.stats,'统计');
  for(const k of ['maps','cores','characterXP'])if(m[k]!==undefined)numberMap(m[k],k);
  for(const k of ['pity','pity10','stash','renamed'])if(m[k]!==undefined)nonnegative(m[k],k);
  if(m.name!==undefined&&(typeof m.name!=='string'||m.name.length>100||/[<>]/.test(m.name)))fail('STRUCTURE','玩家名称无效');
  if(m.mine!==undefined){object(m.mine,'矿场');for(const k of ['shovels','up'])if(m.mine[k]!==undefined)numberMap(m.mine[k],'矿场升级');}
  if(m.loadout!=null){object(m.loadout,'装配');for(const p of Object.values(m.loadout))if(list(p,'装配页').some(v=>v!==null&&typeof v!=='string'))fail('STRUCTURE','装配内容无效');}
  if(m.pets!=null)object(m.pets,'宠物');
  if(m.pets?.v!=null&&(!Number.isInteger(m.pets.v)||m.pets.v<0||m.pets.v>2))fail('VERSION','宠物数据版本较新，请更新游戏');
  m.chars=[...new Set([...START_CHARS,...m.chars])];
  m.tokens??=0;m.talents??={};m.cards??=[];m.pity??=0;m.pity10??=0;m.name??='玩家';m.sound??=true;m.music??=true;m.seenUnlock??=[];m.maps??={};
  m.stats={kills:0,pulls:0,reactions:0,bossKills:0,runs:0,best:0,...m.stats};
  if(!m.loadout){
    const own=GACHA.pool.filter(it=>it.eq&&m.talents[it.id]).map(it=>it.id).slice(0,LOADOUT_SLOTS);
    m.loadout=Object.fromEntries(CHAR_ORDER.map(id=>[id,[...own,null,null].slice(0,LOADOUT_SLOTS)]));
    if(m.stats.bossKills&&!m.maps.grass)m.maps.grass=m.stats.bossKills;
  }
  if(!m.chars.includes(m.sel))m.sel=m.chars[0];
  // Existing deterministic pet migration; no reward functions, currency grants or calendar advancement.
  if(m.pets?.v!==2)m.pets=JSON.parse(JSON.stringify(normalizePets(m.pets)));
  return m;
}
function migrateWorld(v){
  if(v===null)return null;object(v,'世界地图');if(v.v!==1)fail('VERSION','地图模块版本不受支持');
  const w={...freshWorld(),...clone(v)};
  for(const k of ['opened','gates','miles','cracked'])if(list(w[k],k).some(x=>typeof x!=='string'&&(typeof x!=='number'||!Number.isFinite(x))))fail('STRUCTURE','地图索引无效');
  for(const k of ['bossDay','nodeDay'])object(w[k],k);
  for(const k of ['chests','visits'])nonnegative(w[k],k);
  for(const k of ['x','y'])if(w[k]!==null&&(typeof w[k]!=='number'||!Number.isFinite(w[k])))fail('STRUCTURE','地图坐标无效');
  if(typeof w.fog!=='string'||w.fog.length>684)fail('STRUCTURE','地图迷雾数据无效');
  if(w.fog){try{if(!/^[A-Za-z0-9+/]+={0,2}$/.test(w.fog)||atob(w.fog).length!==512)throw Error();}catch{fail('STRUCTURE','地图迷雾数据损坏');}}
  list(w.mats,'地图材料');if(w.mats.length>7)fail('VERSION','地图材料种类超出本版支持');w.mats.forEach(n=>nonnegative(n,'材料'));while(w.mats.length<7)w.mats.push(0);
  return w;
}
function migrateHome(v){
  if(v===null)return null;object(v,'家园');if(v.v!==1)fail('VERSION','家园模块版本不受支持');
  const h={...clone(v),v:1,lv:{...freshHome().lv,...object(v.lv||{},'家园等级')},slots:clone(v.slots||[])};
  for(const [id,max] of Object.entries({farm:4,hut:3,store:3,spring:2,tower:3}))if(!Number.isInteger(h.lv[id])||h.lv[id]<(id==='farm'?1:0)||h.lv[id]>max)fail('VERSION','家园建筑等级不受支持');
  for(const s of list(h.slots,'派遣')){object(s,'派遣');if(typeof s.uid!=='string'||!Number.isInteger(s.mat)||s.mat<0||s.mat>6)fail('STRUCTURE','派遣内容无效');for(const k of ['t','acc'])if(s[k]!==undefined)nonnegative(s[k],'派遣');}
  return h;
}
function migrateRun(v){
  if(v===null)return null;object(v,'冒险续玩');if(v.v!==1)fail('VERSION','续玩模块版本不受支持');
  object(v.cfg,'续玩配置');object(v.game,'续玩关卡');object(v.player,'续玩玩家');
  if(v.cfg.mode!=='solo'||v.cfg.pvp||!list(v.cfg.players,'续玩角色').length||v.cfg.players.some(p=>!isObject(p)||!CHAR_ORDER.includes(p.cid))||!v.cfg.players.some(p=>p.id===v.cfg.myId))fail('STRUCTURE','续玩角色配置无效');
  if(!Number.isInteger(v.game.roomIdx)||v.game.roomIdx<0)fail('STRUCTURE','续玩关卡索引无效');
  for(const k of ['hp','maxHp','shield','maxShield'])if(v.player[k]!==undefined)nonnegative(v.player[k],'续玩生命');
  return clone(v);
}
export const SAVE_MODULES=Object.freeze([
  {id:'main',key:'ai-girls-dungeon-v1',version:1,name:'角色与资产',migrate:migrateMain},
  {id:'world',key:'ai-girls-dungeon-world-v1',version:1,name:'世界地图',migrate:migrateWorld},
  {id:'home',key:'ai-girls-dungeon-home-v1',version:1,name:'家园与派遣',migrate:migrateHome},
  {id:'run',key:'ai-girls-dungeon-run-v1',version:1,name:'冒险续玩',migrate:migrateRun},
]);
export function migrateSave(input){
  safeData(input);const s=clone(input),warnings=[];
  if(!Number.isInteger(s.saveVersion)||s.saveVersion<0||s.saveVersion>SAVE_VERSION)fail('VERSION','玩家数据版本不受支持');
  object(s.modules,'模块清单');
  for(const id of Object.keys(s.modules))if(!SAVE_MODULES.some(m=>m.id===id))fail('VERSION',`存档含本版未支持的模块：${id}`);
  for(const m of SAVE_MODULES){
    const part=s.modules[m.id];
    if(!part){if(s.saveVersion!==0||m.id==='main')fail('MODULE_MISSING',`完整存档缺少「${m.name}」模块，已拒绝导入`);s.modules[m.id]={version:m.version,data:null};continue;}
    object(part,m.name);if(!Number.isInteger(part.version)||part.version<0||part.version>m.version)fail('VERSION',`${m.name}模块版本不受支持`);
    if(!Object.hasOwn(part,'data'))fail('STRUCTURE',`${m.name}模块缺少数据`);
    if(m.id==='main'&&part.data===null)fail('MODULE_MISSING','完整存档缺少主存档');
    s.modules[m.id]={version:m.version,data:m.migrate(part.data)};
  }
  if(input.saveVersion===0)warnings.push('旧版存档只有主进度：导入后地图、家园与派遣、冒险续玩将从初始状态开始，不继承本机其他玩家的数据。');
  s.saveVersion=SAVE_VERSION;
  return{snapshot:s,warnings};
}
export function saveSummary(s){
  const m=s.modules.main.data,w=s.modules.world.data,h=s.modules.home.data;
  return{name:m.name||'玩家',tokens:m.tokens||0,characters:m.chars.length,bossKills:m.stats?.bossKills||0,world:!!w,chests:w?.opened?.length||0,gates:w?.gates?.length||0,home:!!h,dispatches:h?.slots?.length||0,run:!!s.modules.run.data};
}
