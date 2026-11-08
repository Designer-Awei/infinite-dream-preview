import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('pet-shield-layer');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8786/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});
 await p.wait(`!!document.querySelector('.lb-hero')`);
 const report=await p.evaluate(`(async()=>{
  const {app}=await import('./js/main.js'),{makeKit}=await import('./js/save.js'),P=await import('./js/pets.js'),{Renderer}=await import('./js/render.js'),M=await import('./js/map.js'),{RS,VIEW_W,VIEW_H}=await import('./js/data.js');
  const check=(v,m)=>{if(!v)throw Error(m)},ids=['dragon','fox','phoenix'];app.begin({mode:'solo',seed:17,pvp:false,players:ids.map((id,i)=>({id:i+1,cid:'claude',local:i===0,name:id,kit:{...makeKit('claude'),pet:{id,stage:3}}})),myId:1,opt:{map:'grass'}});app.paused=true;window.shieldApp=app;
  const game=app.game,fx=game.fx;game.enemies=[];game.banner=null;game.floaters=[];game.map.t.fill(0);game.map.crates={};fx.clearAll();
  const effects=[];for(let i=0;i<3;i++){const q=game.players[i];q.x=220+i*150;q.y=272;q.face=0;P.resetPet(game,q);P.toggleMount(game,q);effects.push(fx.spawn('holy/divine-shield',q.x,q.y,{follow:q,life:5}));game.map.t[9*game.map.W+Math.floor(q.x/32)]=1;}
  game.ground=M.renderGround(game.map);fx.update(.3);const c=document.createElement('canvas');c.width=VIEW_W*RS;c.height=VIEW_H*RS;const r=new Renderer(c,fx),order=[],targets=[[],[],[]];
  effects.forEach((f,i)=>{const draw=f.draw.bind(f);f.draw=frame=>{targets[i].push(frame===fx.airShield?'air':frame===fx.front?'front':'other');draw(frame)};});
  const hero=r.drawHero.bind(r),bar=r.drawHeroBar.bind(r),front=fx.drawFront.bind(fx),air=fx.drawAirShields.bind(fx);r.drawHero=(g,q,...args)=>{order.push(q.pet.id);hero(g,q,...args)};r.drawHeroBar=(...args)=>{order.push('bar');bar(...args)};fx.drawFront=g=>{order.push('front');front(g)};
  let changed=0;fx.drawAirShields=g=>{order.push('shield');const before=g.getImageData(0,0,c.width,c.height).data;air(g);const after=g.getImageData(0,0,c.width,c.height).data;for(let i=0;i<before.length;i+=4)if(before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2])changed++;};
  r.follow(game,game.players[1],.016,true);r.draw(game,app.me,.016);
  check(targets[0].join()==='front'&&targets[1].join()==='front'&&targets[2].join()==='air','Each shield drawn once in correct plane');check(order.indexOf('front')<order.indexOf('phoenix')&&order.indexOf('phoenix')<order.indexOf('shield')&&order.indexOf('shield')<order.indexOf('bar'),'Body, shield shell, then bars');check(changed>100,'Shield visibly paints over final world image');
  // Existing effect follows a rider when changing mount state; it must not stay
  // in the aerial plane after dismount or leave the old bubble on the canvas.
  const q=game.players[2];q.mountCd=0;P.toggleMount(game,q);fx.update(.01);fx.begin(0,0);check(!fx.airShieldUsed,'Dismount restores ordinary effect plane');q.mountCd=0;P.toggleMount(game,q);fx.update(.01);fx.begin(0,0);check(fx.airShieldUsed,'Remount restores foreground shell');
  return{shieldTargets:targets.map(a=>a[0]),order,changedPixels:changed,drawnOnce:true,dismountRestores:true};
 })()`);
 await sleep(100);await p.shot('three-mounts-shields-fixed');assert.deepEqual(b.errors,[]);await writeFile(path.join(b.out,'report.json'),JSON.stringify({...report,pageErrors:b.errors},null,2));console.log(JSON.stringify(report));
}finally{await b.close();}
