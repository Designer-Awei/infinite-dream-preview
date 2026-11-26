// Add a store here to include it in transfer, without coupling gameplay modules to each other.
import {fail,isObject,safeData,SAVE_VERSION} from './saveformat.js';
export const SAVE_MODULES=Object.freeze([
  {id:'main',key:'ai-girls-dungeon-v1',version:1,name:'角色与资产'},
  {id:'world',key:'ai-girls-dungeon-world-v1',version:1,name:'世界地图'},
  {id:'home',key:'ai-girls-dungeon-home-v1',version:1,name:'家园与派遣'},
  {id:'run',key:'ai-girls-dungeon-run-v1',version:1,name:'冒险续玩'},
]);
export function validateSnapshot(s){
  safeData(s);
  if(s.saveVersion!==SAVE_VERSION)fail('VERSION','玩家数据版本不受支持，请重新导出最新存档');
  if(!isObject(s.modules))fail('STRUCTURE','存档模块清单无效');
  for(const id of Object.keys(s.modules))if(!SAVE_MODULES.some(m=>m.id===id))fail('VERSION',`存档含本版未支持的模块：${id}`);
  for(const m of SAVE_MODULES){
    const p=s.modules[m.id];
    if(!isObject(p)||!Object.hasOwn(p,'data'))fail('MODULE_MISSING',`完整存档缺少「${m.name}」模块`);
    if(p.version!==m.version)fail('VERSION',`${m.name}模块版本不受支持`);
    if(p.data===null){if(m.id==='main')fail('MODULE_MISSING','完整存档缺少主进度');continue;}
    if(!isObject(p.data))fail('STRUCTURE',`${m.name}结构无效`);
    const d=p.data;
    if(m.id==='main'&&(!Array.isArray(d.chars)||typeof d.tokens!=='number'||!Number.isFinite(d.tokens)||d.tokens<0))fail('STRUCTURE','主存档角色或资产无效');
    if(m.id!=='main'&&d.v!==1)fail('VERSION',`${m.name}数据版本不受支持`);
    if(m.id==='world'){
      if(!Array.isArray(d.opened)||!Array.isArray(d.gates)||!Array.isArray(d.mats)||typeof d.fog!=='string')fail('STRUCTURE','地图数据不完整');
      if(d.fog)try{if(d.fog.length!==684||!/^[A-Za-z0-9+/]+={0,2}$/.test(d.fog)||atob(d.fog).length!==512)throw Error();}catch{fail('STRUCTURE','地图迷雾数据损坏');}
    }
    if(m.id==='home'&&(!isObject(d.lv)||!Array.isArray(d.slots)))fail('STRUCTURE','家园派遣数据无效');
    if(m.id==='run'&&(!isObject(d.cfg)||!isObject(d.game)||!isObject(d.player)))fail('STRUCTURE','冒险续玩数据无效');
  }
  // Validate only: preserve every player's field exactly. Runtime loaders keep their existing migrations.
  return s;
}
export function saveSummary(s){
  const m=s.modules.main.data,w=s.modules.world.data,h=s.modules.home.data;
  return{name:m.name||'玩家',tokens:m.tokens,characters:m.chars.length,pets:Array.isArray(m.pets?.list)?m.pets.list.length:0,bossKills:m.stats?.bossKills||0,world:!!w,chests:w?.opened?.length||0,gates:w?.gates?.length||0,home:!!h,dispatches:h?.slots?.length||0,run:!!s.modules.run.data};
}
