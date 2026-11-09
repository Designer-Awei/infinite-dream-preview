import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('exchange-layout');
try{
 const rows=[];
 for(const [width,height] of [[804,360],[667,375]]){
  const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8795/web/',{width,height,source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false,mine:{cards:3}}))`});await p.wait(`!!document.querySelector('.lb-hero')`);
  await p.evaluate(`(async()=>{const S=await import('./js/save.js'),{GACHA}=await import('./js/data.js'),m=S.load();window.exchangeFixture={S,ssr:GACHA.pool.filter(x=>x.r==='SSR')};for(const it of exchangeFixture.ssr)m.talents[it.id]=it.max;const upgrade=exchangeFixture.ssr.find(x=>x.max>1),missing=exchangeFixture.ssr.at(-1);m.talents[upgrade.id]=upgrade.max-1;delete m.talents[missing.id];exchangeFixture.upgrade=upgrade;exchangeFixture.missing=missing;m.stash=0;S.mineState().cards=3;document.querySelector('.t-gacha').click();document.querySelector('.gp-exbtn').click()})()`);await sleep(350);
  const layout=await p.evaluate(`(()=>{const panel=document.querySelector('.ex-modal .pool-panel'),list=panel.querySelector('.pl-list'),cards=[...panel.querySelectorAll('.vc')],r=list.getBoundingClientRect(),first=cards[0].getBoundingClientRect(),second=cards[8].getBoundingClientRect(),feature=document.querySelector('.gp-feat .vc').getBoundingClientRect(),m=exchangeFixture.S.load(),expected=exchangeFixture.ssr.filter(x=>(m.talents[x.id]||0)<x.max).map(x=>x.id);return{width:innerWidth,panel:panel.getBoundingClientRect().height,card:first.height,feature:feature.height,partialSecondRow:second.top<r.bottom&&second.bottom>r.bottom,scrollable:list.scrollHeight>list.clientHeight,first:cards.slice(0,expected.length+1).map(x=>x.dataset.id),expected:[...expected,'cardgold']}})()`);
  assert(Math.abs(layout.panel-263.25)<1,'Original panel height retained');assert(Math.abs(layout.card-layout.feature)<1,'Row matches actual resident display card height');assert(layout.partialSecondRow&&layout.scrollable);assert.deepEqual(layout.first,layout.expected);
  assert(await p.evaluate(`getComputedStyle(document.querySelector('.ex-modal .pl-list')).scrollbarWidth==='none'&&getComputedStyle(document.querySelector('.ex-modal .pl-list'),'::-webkit-scrollbar').display==='none'`),'Scrollbar hidden while scrolling remains enabled');
  await p.shot('exchange-'+width);
  const touch=await p.evaluate(`(()=>{const r=document.querySelector('.ex-modal .pl-list').getBoundingClientRect();return{x:r.right-12,y:r.bottom-12,top:r.top+18}})()`);
  await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y,id:1}]});
  for(let i=1;i<=6;i++){await p.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x,y:touch.y+(touch.top-touch.y)*i/6,id:1}]});await sleep(25)}
  await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(150);
  assert(await p.evaluate(`document.querySelector('.ex-modal .pl-list').scrollTop>0`),'Touch swipe scrolls the actual card list');
  assert(await p.evaluate(`(()=>{const list=document.querySelector('.ex-modal .pl-list');list.scrollTop=list.scrollHeight;const r=list.getBoundingClientRect(),last=list.querySelector('.vc:last-child').getBoundingClientRect();return last.bottom<=r.bottom+1&&last.top>=r.top})()`),'Scroll reaches the complete last card');
  for(const type of ['missing','upgrade']){
   await p.evaluate(`document.querySelector('.ex-modal .vc[data-id="'+exchangeFixture.${type}.id+'"]').click();document.querySelector('.pvm-act').click()`);
   assert(await p.evaluate(`document.querySelector('.ex-modal .vc[data-id="'+exchangeFixture.${type}.id+'"]').classList.contains('no')`),'Redeemed max card moves behind available entries');
  }
  assert.equal(await p.evaluate(`document.querySelector('.ex-modal .vc').dataset.id`),'cardgold');
  await p.evaluate(`document.querySelector('.ex-modal .vc[data-id="cardgold"]').click();document.querySelector('.pvm-act').click()`);
  assert(await p.evaluate(`exchangeFixture.S.mineState().cards===0&&exchangeFixture.S.load().stash===1`),'Sorting does not change redemption cost or reward');
  assert(await p.evaluate(`Math.abs(parseFloat(getComputedStyle(document.querySelector('.ex-modal .pool-panel')).height)-263.25)<1`),'Redraw keeps panel height');
  if(width===804){await p.send('Emulation.setDeviceMetricsOverride',{width:667,height:375,deviceScaleFactor:1,mobile:true});await sleep(380);assert(await p.evaluate(`Math.abs(document.querySelector('.ex-modal .vc').getBoundingClientRect().height-document.querySelector('.gp-feat .vc').getBoundingClientRect().height)<1`),'Open panel adapts row height to resized gacha cards')}
  rows.push(layout);
 }
 assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify({layouts:rows,reorderAfterRedemption:true,noDoubleSpend:true,resize:true,pageErrors:b.errors},null,2));console.log(JSON.stringify({layouts:rows,reorderAfterRedemption:true,noDoubleSpend:true,resize:true,pageErrors:b.errors}));
}finally{await b.close()}
