import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('pet-flight-wall');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8784/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false,pets:{owned:{phoenix:{stage:3,xp:1200}},equipped:'phoenix'}}))`});
 await p.wait(`!!document.querySelector('.lb-hero')`);
 const mechanics=await p.evaluate(`(async()=>{
  const {Game}=await import('./js/game.js'),{FxLayer}=await import('./js/fx.js'),P=await import('./js/pets.js'),M=await import('./js/map.js'),C=await import('./js/petcombat.js');
  const check=(v,m)=>{if(!v)throw Error(m)},make=(id)=>{const g=new Game({fx:new FxLayer(),seed:17}),p=g.addPlayer({id:1,cid:'claude',local:true,kit:{tal:{},eq:{},cards:[],pet:{id,stage:3}}});g.startRun();g.map.t.fill(0);g.map.crates={};g.enemies=[];g.phase='fight';g.waveDelay=999;p.x=320;p.y=272;p.face=0;p.input.aim=0;P.resetPet(g,p);P.toggleMount(g,p);return[g,p];};
  const [g,q]=make('dragon'),i=8*g.map.W+14,ci=8*g.map.W+15,out=14*g.map.W+14,bound=8*g.map.W;
  g.map.t[i]=g.map.t[out]=g.map.t[bound]=1;g.map.t[ci]=4;g.map.crates[ci]={hp:M.CRATE_HP};
  g.damageTile(i,999,q);g.explodeAt(464,272,60,0,999,q);check(g.map.t[i]===1&&!g.map.wallHp,'Ordinary damage and explosions cannot hurt walls');
  g.map.t[ci]=4;g.map.crates[ci]={hp:M.CRATE_HP};
  q.mounted=false;g.damageWall(i,99,q);check(!g.map.wallHp,'Unridden dragon cannot damage walls');q.mounted=true;
  const e=g.spawnEnemy('slime',550,272);e.spawnT=0;e.hp=e.maxHp=10000;q.ult=0;P.mountedUlt(g,q,0,null);
  P.updatePets(g,.35);P.updatePets(g,.25);
  check(M.DRAGON_WALL_HP===M.CRATE_HP*2&&g.map.wallHp[i]===16,'Wall HP 60 survives two 22-damage ticks');
  check(g.map.crates[ci].dead,'30 HP crate breaks before wall');check(e.hp<10000,'Breath reaches enemy behind intact wall');
  check(g.petFields[0].visibleLength===320,'No ray shortening at wall');
  P.updatePets(g,.25);check(g.map.t[i]===0&&g.map.groundDirty&&g.map.brokenWalls.includes(i),'Third tick removes wall and cached shadow');
  check(g.map.t[out]===1,'Out-of-cone wall intact');g.damageWall(bound,999,q);check(g.map.t[bound]===1,'Room boundary intact');check(q.ult===0,'Destroyed scenery does not recharge ultimate');
  const walker={x:14*32-12,y:272,r:10};M.moveCircle(g.map,walker,26,0);check(walker.x>14*32,'Destroyed wall opens collision');
  for(const id of ['fox','phoenix']){const [g,p]=make(id),i=8*g.map.W+14;g.map.t[i]=1;g.damageWall(i,999,p);P.mountedUlt(g,p,0,null);for(let n=0;n<20;n++)P.updatePets(g,.1);check(g.map.t[i]===1,'Only dragon ultimate destroys walls: '+id);}
  const [ig,ip]=make('phoenix');check(C.flightLift(ip)===0,'Original phoenix height restored');const h=P.mountedVisualHeight(ip);ip.mounted=false;check(C.flightLift(ip)===0,'No on-foot lift');ip.mounted=true;check(P.mountedVisualHeight(ip)===h,'Shield keeps restored original height');
  const samples=[];for(const ultimate of [false,true]){const c=document.createElement('canvas');c.width=c.height=300;const ctx=c.getContext('2d'),f={kind:'snow',x:150,y:150,r:100,ultimate,t:1,delay:.35,life:3,max:5.35};P.drawPetFields(ctx,{petFields:[f],fx:{lite:true}},1);if(ultimate)P.drawPetFields(ctx,{petFields:[f],fx:{lite:true}},1,'front');const data=ctx.getImageData(0,0,300,300).data;let sum=0;for(let n=3;n<data.length;n+=4)sum+=data[n];samples.push(sum);}check(samples[1]>samples[0]*1.4,'Ultimate storm visibly stronger than helper snow');
  window.flightTest={P,M,C};return{wallHP:M.DRAGON_WALL_HP,crateHP:M.CRATE_HP,exclusiveDragonUltimate:true,throughWallDamage:true,collisionOpens:true,boundaryPreserved:true,noUltSelfCharge:true,flightLiftRange:[0,0],stormAlphaRatio:samples[1]/samples[0]};
 })()`);
 await p.evaluate(`(async()=>{const {app}=await import('./js/main.js'),{makeKit}=await import('./js/save.js');window.a=app;app.begin({mode:'solo',seed:17,pvp:false,petTrial:'phoenix',players:[{id:1,cid:'claude',name:'飞行验收',local:true,kit:{...makeKit('claude'),pet:{id:'phoenix',stage:3}}}],myId:1,opt:{map:'grass',petTrial:true}});app.paused=true;const g=app.game,q=app.me;g.banner=null;g.map.t.fill(0);g.map.crates={};g.enemies=[];g.phase='fight';g.waveDelay=999;q.x=q.pet.x=g.map.center.x;q.y=q.pet.y=g.map.center.y;q.face=0;flightTest.P.resetPet(g,q);flightTest.P.toggleMount(g,q);const tx=Math.floor(q.x/32),ty=Math.floor(q.y/32);for(let y=ty;y<=ty+1;y++)for(let x=tx-1;x<=tx+1;x++)g.map.t[y*g.map.W+x]=1;g.ground=flightTest.M.renderGround(g.map);flightTest.P.mountedUlt(g,q,0,null);flightTest.P.updatePets(g,.8);})()`);
 const order=await p.evaluate(`(async()=>{const {Renderer}=await import('./js/render.js'),c=document.createElement('canvas');c.width=1608;c.height=720;const r=new Renderer(c,a.game.fx),calls=[],hero=r.drawHero.bind(r),lines=r.drawLines.bind(r),img=r.g.drawImage.bind(r.g),m=a.game.map,tx=Math.floor(a.me.x/32),ty=Math.floor(a.me.y/32),wall=flightTest.M.wallSprite(m.theme,flightTest.M.wallMask(m,tx,ty+1));r.drawHero=(...x)=>{calls.push('hero');hero(...x)};r.drawLines=(...x)=>{calls.push('frontfx');lines(...x)};r.g.drawImage=(...x)=>{if(x[0]===wall)calls.push('wall');img(...x)};r.follow(a.game,a.me,.016,true);r.draw(a.game,a.me,.016);return calls;})()`);
 assert(order.includes('wall')&&order.indexOf('hero')>order.lastIndexOf('wall')&&order.indexOf('hero')>order.indexOf('frontfx'),'Flying rider drawn after all scenery and front FX');
 await p.evaluate(`a.game.floaters=[]`);
 const layouts=[];
 await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:500,y:180}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 for(const [width,height] of [[804,360],[667,375]]){
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await sleep(150);
  const state=await p.evaluate(`(()=>{const b=document.querySelector('.pet-ride-btn'),z=document.querySelector('.pausebtn'),r=b.getBoundingClientRect(),s=z.getBoundingClientRect();return{touch:document.body.classList.contains('touchmode'),rHidden:getComputedStyle(b.querySelector('small')).display==='none',height:r.height,pauseHeight:s.height,top:r.top,pauseTop:s.top,shadow:getComputedStyle(z).boxShadow}})()`);
  assert(state.touch&&state.rHidden&&state.height===state.pauseHeight&&state.top===state.pauseTop&&state.shadow==='none',JSON.stringify(state));layouts.push({width,...state});await p.shot('phoenix-flight-storm-'+width);
 }
 await p.evaluate(`(async()=>{const {makeKit}=await import('./js/save.js');a.begin({mode:'solo',seed:17,pvp:false,petTrial:'dragon',players:[{id:1,cid:'claude',local:true,kit:{...makeKit('claude'),pet:{id:'dragon',stage:3}}}],myId:1,opt:{map:'grass',petTrial:true}});a.paused=true;const g=a.game,q=a.me;g.banner=null;g.map.t.fill(0);g.map.crates={};g.enemies=[];q.x=320;q.y=272;q.face=0;q.input.aim=0;flightTest.P.resetPet(g,q);flightTest.P.toggleMount(g,q);for(let y=5;y<=11;y++)g.map.t[y*g.map.W+14]=1;g.ground=flightTest.M.renderGround(g.map);flightTest.P.mountedUlt(g,q,0,null);flightTest.P.updatePets(g,.6);g.floaters=[];})()`);
 await sleep(150);await p.shot('dragon-through-intact-wall');await p.evaluate(`flightTest.P.updatePets(a.game,.25);flightTest.P.updatePets(a.game,.25)`);await sleep(150);await p.shot('dragon-wall-destroyed');
 assert.deepEqual(b.errors,[]);const result={...mechanics,flyingDrawOrder:order,layouts,pageErrors:b.errors};await writeFile(path.join(b.out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close();}
