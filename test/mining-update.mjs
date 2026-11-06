import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('tmp/mining-update');await mkdir(out,{recursive:true});
const b=await chromium.launchPersistentContext(path.resolve('../.cache/mining-test-browser'),{channel:'chrome',headless:true,hasTouch:true,isMobile:true,viewport:{width:804,height:360}});
const errors=[];const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));
try {
await p.addInitScript(()=>localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,chars:['deepseek','gpt','grok','claude','doubao','glm'],seenUnlock:['deepseek','gpt','grok','claude','doubao','glm'],sel:'gpt'})));
await p.goto('http://127.0.0.1:8775');await p.waitForTimeout(1800);
const report=await p.evaluate(async()=>{
 const S=await import('./js/save.js'),Q=await import('./js/minequests.js'),D=await import('./js/minedata.js'),C=await import('./js/codex.js'),{Game}=await import('./js/game.js'),{Dive}=await import('./js/mine.js');
 const check=(v,msg)=>{if(!v)throw Error(msg)};const m=S.load(),ms=S.mineState();
 check(D.ORES.coinbag.name==='星砂金矿' && D.ORES.coinbag.v===6 && D.ORES.coinbag.s===4,'ore data');
 const dive=new Dive({cid:'gpt',shovel:'au',up:{...ms.up},fx:null,talents:{}});dive.addLoot('coinbag',100,100);dive.finish('extract');check(dive.ended.value===6 && dive.ended.stars===4,'ore extraction');
 ms.quests={day:new Date().toDateString(),list:[{k:'extract',n:3,prog:1,stars:1,claimed:false},{k:'kill',n:10,prog:10,stars:3,claimed:true},{k:'haul',n:1,prog:1,stars:4,claimed:true}]};ms.stars=8;
 const list=Q.todayQuests();check(list.reduce((a,q)=>a+q.stars,0)===60,'daily total');check(ms.stars===41 && list[0].prog===1,'old claimed topup');Q.todayQuests();check(ms.stars===41,'topup once');list[0].prog=3;check(Q.claimQuest(0).stars===20 && !Q.claimQuest(0),'claim once');check(ms.stars===61,'claim20');
 ms.quests=null;check(Q.todayQuests().reduce((a,q)=>a+q.stars,0)===60,'new day total');
 ms.mats=220;const before=ms.stars;check(S.refineOre(10) && S.refineOre(1),'repeat exchange');check(ms.mats===0 && ms.stars===before+11,'exchange balance');check(!S.refineOre(1) && !S.refineOre(-1) && !S.refineOre(.5),'exchange guard');ms.mats=1000;
 for(const lv of [0,1,2]){
  const d=new Dive({cid:'gpt',shovel:'au',up:{...ms.up,beacon:lv},fx:null,talents:{}});check(d.p.beacons===1,'single beacon');d.bag=Array(100).fill('copper');d.finish('dead');check(d.ended.keep===.3+.1*lv,'rescue retention');
  const a=new Dive({cid:'gpt',shovel:'au',up:{...ms.up,beacon:lv},fx:null,talents:{}});a.update(.01,{mx:0,my:0,beacon:true});check(Math.abs(a.p.beaconT-(1.5-.5*lv-.01))<.02,'beacon channel');
 }
 check(Object.values(C.CURIOS).every(c=>[...c.name].length>=3 && [...c.name].length<=5),'short names');
 m.curios=Object.fromEntries(Object.keys(C.CURIOS).map(id=>[id,99]));const kit=S.makeKit('gpt');
 const fxCalls=[];const fx={spawn(id,x,y){fxCalls.push({id,x,y})},clear(){},clearAll(){}};const game=new Game({fx,opt:{endless:true}});const me=game.addPlayer({id:1,cid:'gpt',kit});const pvp=new Game({fx,pvp:true});const neutral=pvp.addPlayer({id:1,cid:'gpt',kit});
 check(Math.abs(me.st.rate-1.1)<1e-8 && Math.abs(me.st.ultG-1.1)<1e-8 && Math.abs(me.st.cd-.97)<1e-8,'collection effect');check(neutral.st.rate===1 && neutral.st.ultG===1 && neutral.st.cd===1,'PVP isolation');
 m.curios={};
 const seen=[];const old=Math.random;try{Math.random=()=>0;for(const idx of [9,19,29,39,59]){game.roomIdx=idx;game.loadRoom(idx,game.roomDef(idx));game.bossDown({x:100,y:100});game.roomCleared();const n=game.runStats.shovels.length;game.dropShovel();check(game.runStats.shovels.length===n,'boss drop once per floor');seen.push(game.shovelItem.kind);} }finally{Math.random=old}
 check(seen.length===5 && game.runStats.shovels.length===5,'late endless shovels');check(game.curiosFound.length===5,'late endless collection');game.raresSeen=2;game.loadRoom(20,game.roomDef(20));check(game.raresSeen===0,'endless rare quota reset');check(!fxCalls.some(e=>e.id==='pickups/loot-beam' && e.x===game.map.center.x+46),'no sword effect at shovel');
 // Assets are fetchable and non-empty. Full shape hashes are verified outside browser.
 for(const id of Object.keys(C.CURIOS)){const img=new Image();img.src=C.curioIcon(id);await img.decode();check(img.naturalWidth===32 && img.naturalHeight===32,'sprite dimensions')}
 m.curios=Object.fromEntries(Object.keys(C.CURIOS).map(id=>[id,1]));ms.up.beacon=2;S.save();
 return {dailyTotal:60,oldRewardTopup:33,exchange:'20:1',lateBosses:seen.length,curios:game.curiosFound.length,rate:me.st.rate,pvpRate:neutral.st.rate};
});console.log('economy/combat',report);
await p.evaluate(async()=>{const S=await import('./js/save.js'),{Dive}=await import('./js/mine.js'),M=await import('./js/mineui.js');const d=new Dive({cid:'gpt',shovel:'au',up:S.mineState().up,fx:null,talents:{}});d.addLoot('coinbag',100,100);M.showBag(d);});
assert((await p.locator('.bg-it').innerText()).includes('星砂金矿'));assert((await p.locator('.bg-v').innerText()).includes('4'));await p.waitForTimeout(1900);await p.screenshot({path:path.join(out,'bag-gold.png')});await p.locator('.bg-close button').click();
for(const [width,height] of [[804,360],[667,375],[877,393],[1280,720]]){
 await p.setViewportSize({width,height});await p.evaluate(async()=>{(await import('./js/mineui.js')).showMineHub()});await p.getByRole('button',{name:'梦境工坊',exact:true}).click();
 await p.locator('.refine-b[data-n="10"]').click();await p.waitForTimeout(1900);await p.screenshot({path:path.join(out,`${width}-workshop.png`)});
 const safe=await p.locator('.refine-b').evaluateAll(ns=>ns.every(n=>{const r=n.getBoundingClientRect();return r.right<=innerWidth && r.bottom<=innerHeight}));assert(safe);
 await p.evaluate(async()=>{(await import('./js/ui.js')).clear();(await import('./js/codex.js')).showCodex()});await p.getByRole('button',{name:'梦境藏品',exact:true}).click();await p.waitForTimeout(300);
 assert.equal(await p.locator('.cdx-grid.curio .cdx-c').count(),9);await p.screenshot({path:path.join(out,`${width}-curios.png`)});
 const fit=await p.locator('.cdx-grid.curio .cdx-c b').evaluateAll(ns=>ns.every(n=>n.scrollWidth<=n.clientWidth+1));assert(fit,'name truncation');
 await p.getByRole('button',{name:'关闭',exact:true}).click();
}
await p.evaluate(async()=>{__app.toLobby();});await p.locator('.play-btn').click();await p.waitForTimeout(2600);
const hud=await p.evaluate(async()=>{const UI=await import('./js/ui.js');const me=__app.me;document.querySelectorAll('.b-skill,.b-ult').forEach(n=>n.classList.add('empty'));UI.showHud(__app.game,me);me.skillCd=.001;UI.updateHud(__app.game,me);me.skillCd=0;UI.updateHud(__app.game,me);return {empty:document.querySelectorAll('.b-skill.empty,.b-ult.empty').length,ready:document.querySelector('.b-skill').classList.contains('ready'),filter:getComputedStyle(document.querySelector('.b-skill')).filter};});assert.equal(hud.empty,0);assert(hud.ready);assert.equal(hud.filter,'none');await p.screenshot({path:path.join(out,'skill-ready.png')});
// Settlement pays all the shovels once, not only the last boss.
const settlement=await p.evaluate(async()=>{const S=await import('./js/save.js');const ms=S.mineState(),n=ms.shovels.cu;__app.game.runStats.shovels=['cu','cu','cu'];__app.game.runStats.boss=true;__app.endRun(false);__app.endRun(false);return ms.shovels.cu-n});assert.equal(settlement,3);
assert.deepEqual(errors,[]);console.log('PASS',JSON.stringify({hud,settlement,errors}));
const manifest=JSON.parse(await readFile('web/assets/curios/manifest.json','utf8'));assert.equal(Object.keys(manifest).length,9);assert.equal(new Set(Object.values(manifest).map(m=>m.sha256)).size,9);
}finally{await b.close()}

