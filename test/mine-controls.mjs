import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out='.cache/mine-controls';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL || 'chrome'});
try {
 const ctx=await browser.newContext({viewport:{width:804,height:360},isMobile:true,hasTouch:true});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,chars:['gpt'],sel:'gpt',name:'矿场测试',sound:false,music:false})));
 await p.goto(process.env.TEST_URL || 'http://127.0.0.1:9877');await p.locator('.play-btn').waitFor();
 await p.evaluate(async()=>{const {mineState}=await import('./js/save.js');mineState().shovels.cu=10;__app.startDive({shovel:'cu'});document.body.classList.add('touchmode');__app.paused=true});
 for(const level of [0,1,2]) {
  await p.evaluate(l=>{__app.dive.up.beacon=l;__app.pause()},level);
  assert.equal(await p.locator('.pause-modal .red').textContent(),`放弃（带回${30+level*10}%）`);
  await p.screenshot({path:`${out}/pause-${level}.png`});
  await p.locator('.pause-modal .r2 button').last().click();await p.evaluate(()=>__app.paused=true);
  const actual=await p.evaluate(async()=>{const {Dive}=await import('./js/mine.js'),{ORES}=await import('./js/minedata.js');const d=new Dive({...__app.dive.o,up:{...__app.dive.up}});d.bag=Array(100).fill(Object.keys(ORES)[0]);d.finish('dead');return [d.ended.keep,d.ended.kept.length]});
  assert.deepEqual(actual,[(30+level*10)/100,30+level*10]);
 }
 // Shared controls must not inherit the combat ult cooldown filter, ring or count.
 for(const ready of [false,true]) {
  const state=await p.evaluate(async ready=>{const M=await import('./js/mineui.js'),node=document.querySelector('.b-ult');node.classList.toggle('ready',ready);node.classList.add('empty','ping');node.style.setProperty('--chg','15%');__app.dive.p.beacons=1;M.showMineHud(__app.dive);M.updateMineHud(__app.dive);return {filter:getComputedStyle(node.querySelector('.ico')).filter,empty:node.classList.contains('empty'),charge:node.style.getPropertyValue('--chg')}},ready);
  assert(!state.filter.includes('grayscale'));assert.equal(state.empty,false);assert.equal(state.charge,'');
 }
 await p.evaluate(async()=>{const M=await import('./js/mineui.js');const d=__app.dive;d.p.beacons=0;M.updateMineHud(d)});
 assert(await p.locator('.b-ult').evaluate(n=>n.classList.contains('empty')));
 await p.evaluate(async()=>{const M=await import('./js/mineui.js');__app.dive.p.beacons=2;M.updateMineHud(__app.dive)});
 assert(!(await p.locator('.b-ult').evaluate(n=>n.classList.contains('empty'))));
 // Boss reward and merchant modal round trips must not change availability presentation.
 await p.evaluate(async()=>{const M=await import('./js/mineui.js');const d=__app.dive;d.mobs.length=0;d.choice=['cell'];__app.relicOpen=false;__app.paused=false});
 await p.waitForTimeout(200);
 await p.locator('.relic-modal .card2').first().click();await p.waitForTimeout(600);
 await p.evaluate(async()=>{const M=await import('./js/mineui.js'),{ORES}=await import('./js/minedata.js');const d=__app.dive;__app.paused=true;d.bag=Array(100).fill(Object.keys(ORES).sort((a,b)=>ORES[b].v-ORES[a].v)[0]);d.shop=true;__app.shopOpen=true;M.showMerchant(d,()=>{__app.shopOpen=false});});
 await p.locator('.mshop-md button[data-k="bomb"]').click();
 await p.getByRole('button',{name:'离开',exact:true}).click();
 await p.evaluate(async()=>{const M=await import('./js/mineui.js');M.updateMineHud(__app.dive)});
 for(const [w,h] of [[804,360],[667,375],[1280,720]]) {
  await p.setViewportSize({width:w,height:h});
  await p.evaluate(async()=>{const M=await import('./js/mineui.js');M.confirmBeacon(__app.dive,()=>{},()=>{})});
  const widths=await p.locator('.bc-acts .btn').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().width));assert(Math.abs(widths[0]-widths[1])<1);
  assert(!(await p.locator('.b-ult .ico').evaluate(n=>getComputedStyle(n).filter)).includes('grayscale'));
  await p.screenshot({path:`${out}/confirm-${w}.png`});await p.getByRole('button',{name:'继续挖',exact:true}).click();
 }
 assert.deepEqual(errors,[]);console.log('PASS: 30/40/50% pause/settlement, combat-state reset, availability count, equal-width confirm buttons at three sizes');
} finally {await browser.close()}
