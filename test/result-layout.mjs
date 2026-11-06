import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const out = path.resolve('tmp/result-layout');
const {mkdir} = await import('node:fs/promises'); await mkdir(out,{recursive:true});
const browser = await chromium.launchPersistentContext(path.resolve('../.cache/result-browser'), { channel:'chrome', headless:true, viewport:{width:804,height:360}, deviceScaleFactor:3 });
await browser.route('**/*', route => route.continue());
const errors=[];
try {
for(const [width,height] of [[804,360],[667,375],[877,393],[1280,720]]) {
 const page=await browser.newPage(); await page.setViewportSize({width,height}); page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,chars:['deepseek','gpt'],sel:'gpt'})));
 await page.goto('http://127.0.0.1:8775'); await page.locator('.play-btn').waitFor(); await page.evaluate(()=>document.fonts.ready);
 for(const count of [0,1,2,8]) {
 await page.evaluate(async count=>{
 const UI=await import('./js/ui.js'); UI.clear();
 const extras=[['地图加成','×1.35'],['⛏ 梦境矿场','获得银铲'],['📖 怪物图鉴','新收录 14 种'],['梦境藏品','不化的显存雪花'],['梦境裂隙','晶石999 · 矿石999 · 星砂999'],['🔓 新地图','算力熔炉'],['首通 显存冰原','+200'],['🔓 新角色解锁','大肥鱼、吉普缇、格洛克、克劳德、奶糖包、吉拉姆']].slice(0,count);
 UI.showResult({title:'通关！幻觉已破除',sub:'吉普缇 击败了显存冰原的幻觉之眼',cid:'gpt',win:true,tokens:504,extras,rows:[['清理房间','7 / 7'],['击败敌人',106],['精英',7],['元素反应',88],['造成伤害',15445],['承受伤害',52],['技能卡',12]]},()=>window.resultAction='again',()=>window.resultAction='lobby');
 },count);
 await page.waitForTimeout(600);
 const result=await page.evaluate(()=>{
 const panel=document.querySelector('.res2').getBoundingClientRect(); const left=document.querySelector('.res-l'); const hero=document.querySelector('.res-hero').getBoundingClientRect();
 const buttons=[...document.querySelectorAll('.res-r .btn')].map(n=>{const r=n.getBoundingClientRect();return r.bottom<=panel.bottom-4 && r.right<=panel.right-4 && r.top>=panel.top});
 return {buttons,hero:hero.height,chips:document.querySelectorAll('.res-extras .res-chip').length,leftOverflow:left.scrollHeight-left.clientHeight,panelBottom:panel.bottom,panelHeight:panel.height}; });
 console.log(width,height,count,JSON.stringify(result)); assert(result.buttons.every(Boolean)); assert(result.panelBottom<=height); assert(Math.abs(result.panelHeight-Math.min(460,height*.8))<1); assert.equal(result.hero,height<=420?110:150); assert(result.leftOverflow<=1); assert.equal(result.chips,Math.max(1,Math.min(2,count)));
 if(count===0) { assert((await page.locator(".res-extras").innerText()).includes("本局晶石")); assert.equal(await page.locator(".res-more").count(),0); }
 if(count===8){
 const alignment=await page.evaluate(()=>{const a=document.querySelector('.res-extras .res-chip').getBoundingClientRect(),b=document.querySelector('.res-more').getBoundingClientRect(),c=document.querySelectorAll('.res-extras .res-chip')[1].getBoundingClientRect();return {top:Math.abs(a.top-b.top),bottom:Math.abs(a.bottom-b.bottom),gap:b.left-a.right,right:Math.abs(b.right-c.right),text:document.querySelector('.res-more').textContent};});
 assert(alignment.top<1 && alignment.bottom<1 && alignment.right<1 && alignment.gap>0); assert(!alignment.text.includes('↑'));

 await page.screenshot({path:path.join(out,`${width}-${height}-collapsed.png`)});
 await page.locator('.res-more').click(); await page.waitForTimeout(300);
 assert.equal(await page.locator('.res-detail-list .res-chip').count(),8);
 const dialog=page.getByRole('dialog'); await dialog.screenshot({path:path.join(out,`${width}-${height}-details.png`)});
 await page.keyboard.press('Escape'); assert.equal(await dialog.count(),0); assert(await page.locator('.res-more').evaluate(n=>n===document.activeElement));
 await page.locator('.res-more').click(); await page.getByRole('button',{name:'收起 ↓'}).click(); assert.equal(await dialog.count(),0);
 }
 await page.getByRole('button',{name:'再来一局',exact:true}).click(); assert.equal(await page.evaluate(()=>window.resultAction),'again');
 await page.getByRole('button',{name:'返回大厅',exact:true}).click(); assert.equal(await page.evaluate(()=>window.resultAction),'lobby');
 }
 await page.close();
}
// Exercise the real app result path, including the rift timer callback.
for(const rift of [false,true]) {
 const page=await browser.newPage(); await page.setViewportSize({width:804,height:360}); page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,chars:['deepseek','gpt','grok','claude','doubao','glm'],seenUnlock:['deepseek','gpt','grok','claude','doubao','glm'],sel:'gpt'})));
 await page.goto('http://127.0.0.1:8775'); await page.locator('.play-btn').click(); await page.waitForTimeout(2500);
 await page.evaluate(()=>{__app.game.runStats.boss=true;__app.game.runStats.rooms=7;__app.game.runStats.shovel='ag';});
 if(rift){await page.evaluate(()=>__app.offerRift());await page.getByRole('button',{name:'进入裂隙',exact:true}).click();await page.waitForTimeout(500);await page.evaluate(()=>{__app.dive.lite.left=.1;});}
 else await page.evaluate(()=>__app.game.victory());
 await page.locator('.result').waitFor({timeout:10000}); await page.waitForTimeout(700);
 const labels=await page.locator('.res-extras').innerText(); console.log('actual',rift,labels);
 if(rift){ await page.locator('.res-more').click(); assert((await page.locator('.res-detail-list').innerText()).includes('梦境裂隙'));await page.keyboard.press('Escape'); }
 const safe=await page.locator('.res-r .acts').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight);assert(safe);
 await page.screenshot({path:path.join(out,rift?'actual-rift.png':'actual-boss.png')});await page.getByRole('button',{name:'返回大厅',exact:true}).click();await page.locator('.play-btn').waitFor();await page.close();
}
assert.deepEqual(errors,[]); console.log('PASS: layout, details, actions, boss and timed rift; no page errors');
} finally {await browser.close();}

