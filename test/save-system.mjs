import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const root=path.resolve('.'),cache=path.join(root,'.cache/save-system');await mkdir(cache,{recursive:true});
await build({stdin:{contents:'export * from "./web/js/savemanager.js";export * from "./web/js/saveformat.js";export * from "./web/js/savemodules.js";export {CHAR_ORDER} from "./web/js/data.js";export {TITLE_ORDER} from "./web/js/titles.js";',resolveDir:root},bundle:true,format:'esm',platform:'node',outfile:cache+'/module.mjs'});
const M=await import(pathToFileURL(cache+'/module.mjs'));
const {SaveManager,SAVE_MODULES,encodeSave,decodeCode,validateSnapshot,canonical,digest,SAVE_LIMITS}=M;
const {gzipSync}=require('fflate');
class Storage {
  constructor(){this.data=new Map();this.fail=null;this.corrupt=null;}
  get length(){return this.data.size;}
  key(i){return [...this.data.keys()][i]??null;}
  getItem(k){const v=this.data.get(k)??null;return this.corrupt?.(k,v)??v;}
  setItem(k,v){if(this.fail?.(k,v))throw Error('injected quota/write failure');this.data.set(k,String(v));}
  removeItem(k){if(this.fail?.(k,null))throw Error('injected remove failure');this.data.delete(k);}
}
const fixture=(name='迁移测试🐉',count=3)=>({
  main:{name,chars:[...M.CHAR_ORDER],tokens:987654,stash:78,talents:{t_chain:3,t_rag:2},cards:['chain'],cores:{gpt:1},characterXP:{gpt:5300},loadout:{gpt:['t_chain',null]},maps:{grass:4,ice:2},stats:{kills:12578,pulls:360,bossKills:46,runs:77,best:7},codex:Object.fromEntries(Array.from({length:90},(_,i)=>[`mine:monster-${i}`,{seen:i*2+1,kills:i*3+2}])),daily:{last:'2026-11-26',streak:5,days:{'2026-11-26':{runs:2,win:true,best:7}}},titles:{own:Object.fromEntries(M.TITLE_ORDER.map(id=>[id,1700000000000])),eq:null,seen:[...M.TITLE_ORDER]},pets:{v:2,list:Array.from({length:count},(_,i)=>({uid:'p'+i.toString(36),id:['dragon','fox','phoenix'][i%3],stage:1+i%3,xp:(i*79)%1201,q:i%6,skin:i%6===5?'flow':null,traits:[['dmg',1+i%20],['rate',1+i%20]],lock:!!(i%2),t:1700000000000+i*23871})),equipped:'p0',eggs:{base:5,ur:3,hur:1},items:{ur:14,hur:7},slots:[],pool:2376,rb:44,dex:{dragon:{skins:['base','frost']}},dexClaim:[3,6],stats:{hatch:count,legend:Math.floor(count/3),rbKinds:['dragon']}}},
  world:{v:1,opened:[1,23,48],fog:Buffer.alloc(512,251).toString('base64'),x:500,y:700,chests:3,visits:11,gates:[1,2],bossDay:{dragon:'2026-11-26'},flag:{x:640,y:992},mats:[15,23,39,31,27,43,89],nodeDay:{'node:5':'2026-11-26'},miles:[1,2],cracked:[678,679],quests:{day:'2026-11-26',list:[{id:'x',n:3,got:true}]}},
  home:{v:1,lv:{farm:3,hut:2,store:3,spring:2,tower:3},slots:[{uid:'p1',mat:5,acc:27.5,t:1700000000000}]},
  run:{v:1,at:1700000000000,cfg:{mode:'solo',pvp:false,seed:3551,players:[{id:1,cid:'gpt',name}],myId:1,opt:{map:'grass'}},game:{roomIdx:3,route:[],runStats:{rooms:3}},player:{hp:7,maxHp:11,shield:3,maxShield:5,coins:95},riftLoot:null,petGranted:123},
});
const seed=(storage,f)=>{for(const m of SAVE_MODULES){if(f[m.id]==null)storage.removeItem(m.key);else storage.setItem(m.key,JSON.stringify(f[m.id]));}};
const manager=(s)=>new SaveManager({storage:s,version:'test.20261127',now:()=>1795708800000});
const oldCode=main=>{const b=Buffer.from(JSON.stringify(main)).toString('base64');let h=2166136261;for(const c of b)h=Math.imul(h^c.charCodeAt(0),16777619);return`IDSAVE1.${b}.${(h>>>0).toString(36)}`;};
const codeForBytes=b=>`IDSAVE2.${Buffer.from(b).toString('base64')}.${digest(b)}`;
const expectError=(fn,codes)=>assert.throws(fn,e=>codes.includes(e.code),`expected ${codes.join('/')}`);
const reports=[];
for(const [label,count] of [['normal',3],['high-progress',2500]]){
  const s=new Storage(),f=fixture(label,count);seed(s,f);s.setItem('updRemote','KEEP DEVICE CONFIG');s.setItem('other-game','KEEP OTHER GAME');
  const a=manager(s),artifact=a.export(),t=new Storage();seed(t,fixture('另一个玩家',5));t.setItem('updRemote','KEEP TARGET CONFIG');
  const b=manager(t),p=b.prepare(artifact.code);b.apply(p);
  for(const mod of SAVE_MODULES)assert.equal(canonical(JSON.parse(t.getItem(mod.key))),canonical(p.snapshot.modules[mod.id].data));
  assert.deepEqual(p.snapshot.modules.world.data,f.world);assert.deepEqual(p.snapshot.modules.home.data,f.home);assert.deepEqual(p.snapshot.modules.run.data,f.run);
  assert.equal(t.getItem('updRemote'),'KEEP TARGET CONFIG');assert.equal(s.getItem('other-game'),'KEEP OTHER GAME');
  const first=canonical(b.prepare(artifact.code).snapshot);b.apply(b.prepare(artifact.code));assert.equal(canonical(b.prepare(artifact.code).snapshot),first);
  assert.equal(JSON.parse(t.getItem(SAVE_MODULES[0].key)).tokens,987654);assert.deepEqual(JSON.parse(t.getItem(SAVE_MODULES[0].key)).pets.dexClaim,[3,6]);
  assert.equal(canonical(validateSnapshot(p.snapshot)),canonical(p.snapshot));
  const legacy=oldCode(f.main);expectError(()=>b.prepare(legacy),['VERSION']);
  if(count>1000)assert.throws(()=>String.fromCharCode(...new TextEncoder().encode(JSON.stringify(f.main))),RangeError);
  reports.push({label,jsonBytes:artifact.jsonBytes,gzipBytes:artifact.compressedBytes,codeChars:artifact.code.length,oldMainOnlyCodeChars:legacy.length,reductionPercent:+(100*(1-artifact.compressedBytes/artifact.jsonBytes)).toFixed(2)});
}
// Warehouse count excludes unhatched eggs, active incubation slots and lifetime hatch totals.
{
 const s=new Storage(),f=fixture();f.main.pets.eggs={base:100,ur:100,hur:100};f.main.pets.slots=[{kind:'base',at:1700000000000}];f.main.pets.stats.hatch=999;
 seed(s,f);const b=manager(s),out=b.export();assert.equal(out.summary.pets,3);assert.equal(b.prepare(out.code).summary.pets,3);
 f.main.pets.list=[];seed(s,f);assert.equal(b.export().summary.pets,0);
}
const baseStore=new Storage();seed(baseStore,fixture());const a=manager(baseStore),artifact=a.export(),parts=artifact.code.split('.');
for(const bad of ['IDSAVE2',artifact.code.slice(0,-10),parts.slice(0,2).join('.'),`IDSAVE2.${parts[1]}.`])expectError(()=>a.prepare(bad),['TRUNCATED']);
expectError(()=>a.prepare(`IDSAVE2.${parts[1].slice(0,20)}${parts[1][20]==='A'?'B':'A'}${parts[1].slice(21)}.${parts[2]}`),['CHECKSUM']);
expectError(()=>a.prepare('IDSAVE3.x.y'),['VERSION']);expectError(()=>a.prepare('{}'),['FORMAT']);
expectError(()=>a.prepare('x'.repeat(SAVE_LIMITS.text+1)),['LIMIT']);
for(const change of [s=>s.saveVersion++,s=>s.modules.world.version++,s=>s.modules.future={version:1,data:{}}]){
  const s=structuredClone(artifact.snapshot);change(s);
  const code=codeForBytes(gzipSync(Buffer.from(JSON.stringify(s))));expectError(()=>a.prepare(code),['VERSION']);
}
const noWorld=structuredClone(artifact.snapshot);delete noWorld.modules.world;expectError(()=>a.prepare(encodeSave(noWorld).code),['MODULE_MISSING']);
const badStructure=structuredClone(artifact.snapshot);badStructure.modules.main.data.tokens=-1;expectError(()=>a.prepare(encodeSave(badStructure).code),['STRUCTURE']);
const poison=JSON.parse(JSON.stringify(artifact.snapshot).replace('"modules":','"__proto__":{"polluted":true},"modules":'));expectError(()=>a.prepare(codeForBytes(gzipSync(Buffer.from(JSON.stringify(poison))))),['STRUCTURE']);assert.equal({}.polluted,undefined);
const compressed=Uint8Array.from(Buffer.from(parts[1],'base64'));
// Absence is explicit in a new full snapshot, too: never retain the destination player's optional modules.
{
  const source=new Storage();seed(source,{main:fixture('未进地图').main});const code=manager(source).export().code;
  const target=new Storage();seed(target,fixture('旧玩家'));const b=manager(target);b.apply(b.prepare(code));
  for(const mod of SAVE_MODULES.slice(1))assert.equal(target.getItem(mod.key),null);
}
const bomb=compressed.slice();new DataView(bomb.buffer).setUint32(bomb.length-4,SAVE_LIMITS.json+1,true);expectError(()=>a.prepare(codeForBytes(bomb)),['LIMIT']);
const forged=compressed.slice();new DataView(forged.buffer).setUint32(forged.length-4,1,true);expectError(()=>a.prepare(codeForBytes(forged)),['LIMIT']);
const badCRC=compressed.slice();badCRC[badCRC.length-8]^=1;expectError(()=>a.prepare(codeForBytes(badCRC)),['CORRUPT']);
expectError(()=>a.prepare(codeForBytes(compressed.slice(0,-3))),['CORRUPT','TRUNCATED','LIMIT']);
// A large literal-heavy block exercises fflate streaming boundaries, not only repetitive data.
let rand=123456789;const noisy=Array.from({length:180000},()=>{rand=(Math.imul(rand,1664525)+1013904223)>>>0;return String.fromCharCode(32+rand%90);}).join('');
const literal=structuredClone(artifact.snapshot);literal.modules.main.data.notes=noisy;assert.equal(decodeCode(encodeSave(literal).code).snapshot.modules.main.data.notes,noisy);
// Any synchronous write/readback failure restores all stores, without persistent backup keys.
for(const key of [...SAVE_MODULES.map(m=>m.key),'readback']){
  const s=new Storage();seed(s,fixture('目标'));const b=manager(s),before=b.readRaw();let fired=false,corruptNext=false;
  if(key==='readback'){
    const set=s.setItem.bind(s);s.setItem=(k,v)=>{set(k,v);if(!fired&&k===SAVE_MODULES[1].key){fired=true;corruptNext=true;}};
    s.corrupt=(k,v)=>{if(corruptNext&&k===SAVE_MODULES[1].key){corruptNext=false;return'{broken';}return v;};
  }else s.fail=(k,v)=>{if(k===key&&!fired){fired=true;return true;}return false;};
  expectError(()=>b.apply(b.prepare(artifact.code)),['ROLLED_BACK']);assert.deepEqual(b.readRaw(),before);assert.equal(s.length,4);
}
// Explicit null removes target-only world/home/run data; it must not inherit another player's map.
{
  const s=new Storage();seed(s,fixture('旧目标'));const b=manager(s),empty=structuredClone(artifact.snapshot);
  for(const id of ['world','home','run'])empty.modules[id].data=null;
  b.apply(b.prepare(encodeSave(empty).code));for(const m of SAVE_MODULES.slice(1))assert.equal(s.getItem(m.key),null);
}
await writeFile(cache+'/fixture.json',JSON.stringify(fixture('跨设备测试',8)));
const report={status:'PASS',reports,crossDeviceModules:4,writeFailureCases:5,noHistoryKeys:true,limits:true,sha256AndGzipCRC:true};
await writeFile(cache+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
