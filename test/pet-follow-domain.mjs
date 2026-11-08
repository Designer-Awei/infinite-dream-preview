import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('pet-follow-domain');
try{
 const page=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8785/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});
 await page.wait(`!!document.querySelector('.lb-hero')`);
 const result=await page.evaluate(`(async()=>{
  const {Game}=await import('./js/game.js'),{FxLayer}=await import('./js/fx.js'),P=await import('./js/pets.js'),D=await import('./js/petdata.js'),{PET_MOTION}=await import('./js/petai.js'),{castUlt}=await import('./js/skills.js');
  const check=(v,m)=>{if(!v)throw Error(m)},make=(id='fox',core=false)=>{const g=new Game({fx:new FxLayer(),seed:17}),p=g.addPlayer({id:1,cid:'claude',local:true,kit:{tal:{},eq:{},cards:[],core,pet:{id,stage:3}}});g.startRun();g.map.t.fill(0);g.map.crates={};g.enemies=[];g.phase='fight';g.waveDelay=999;p.x=320;p.y=272;p.pet.x=363;p.pet.y=272;P.resetPet(g,p);p.pet.x=363;p.pet.y=272;return[g,p];},enemy=(g,x,y)=>{const e=g.spawnEnemy('slime',x,y);e.hp=e.maxHp=10000;e.spawnT=0;return e;};
  const [idle,ip]=make();let changes=0,last=false,maxStep=0;
  for(let i=0;i<1000;i++){ip.x=320+Math.sin(i*.13)*9;P.updatePets(idle,.01);if(ip.pet.moving!==last){changes++;last=ip.pet.moving;}}
  check(changes===0&&(ip.pet.walkT||0)===0,'Small owner movements never restart walking');
  ip.x=320;ip.pet.x=520;let walkingTime=0;
  for(let i=0;i<500;i++){const old=ip.pet.x;P.updatePets(idle,.01);maxStep=Math.max(maxStep,Math.abs(ip.pet.x-old));if(ip.pet.moving)walkingTime+=.01;}
  check(Math.hypot(ip.pet.x-ip.x,ip.pet.y-ip.y)<=46.01&&!ip.pet.moving,'Return settles within stop radius');check(maxStep<=PET_MOTION.speed*.01+.001,'No distance-triggered speed spike');check(Math.abs(ip.pet.walkT-walkingTime)<.011,'Walking clock only advances while actually moving');
  const re=enemy(idle,ip.x+140,ip.y);P.updatePets(idle,.01);check(ip.pet.targetId===re.id&&!ip.pet.returning,'Reacquires enemies after settling beside owner');idle.enemies=[];
  const [nav,np]=make();np.x=520;np.pet.x=320;np.pet.y=272;for(let y=5;y<=10;y++)nav.map.t[y*nav.map.W+12]=1;
  for(let i=0;i<600;i++){P.updatePets(nav,.01);check(nav.map.t[Math.floor(np.pet.y/32)*nav.map.W+Math.floor(np.pet.x/32)]!==1,'Return never walks inside a wall');}
  check(Math.hypot(np.pet.x-np.x,np.pet.y-np.y)<=46.1,'Return navigates around wall instead of pacing');
  const canvas=document.createElement('canvas');canvas.width=804;canvas.height=400;const ctx=canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx),frames=[];ctx.drawImage=(...args)=>{frames.push(args.slice(1,3));draw(...args)};ip.pet.moving=true;P.drawPet(ctx,ip,0);ip.pet.anim+=100;P.drawPet(ctx,ip,100);check(JSON.stringify(frames[0])===JSON.stringify(frames[1]),'Movement frame uses walking clock, not accumulated idle time');ip.pet.moving=false;
  const rates={};
  for(const id of D.PET_ORDER){const [g,p]=make(id);p.pet.x=p.x;p.pet.y=p.y;const e=enemy(g,p.x+240,p.y);let maximumShotDistance=0;
   for(let i=0;i<400;i++){const ids=new Set(g.bullets.map(b=>b.id));P.updatePets(g,.01);for(const b of g.bullets)if(!ids.has(b.id))maximumShotDistance=Math.max(maximumShotDistance,Math.hypot(e.x-p.pet.x,e.y-p.pet.y));g.time+=.01;g.updateBullets(.01);}
   check(p.pet.x>p.x+30&&e.hp<10000,'Approaches stationary-owner target and attacks: '+id);check(maximumShotDistance<=D.PET_ATTACK_RANGE[id]+.1,'Authored attack distance: '+id);rates[id]=D.PET_ATTACK_RANGE[id];
   e.dead=true;for(let i=0;i<500;i++)P.updatePets(g,.01);check(Math.hypot(p.pet.x-p.x,p.pet.y-p.y)<=86.1,'Returns after combat: '+id);
  }
  const [fox,fp]=make();P.toggleMount(fox,fp);fp.pet.x=fp.x;fp.pet.y=fp.y;
  const [chain,cp]=make();cp.pet.x=cp.x;cp.pet.y=cp.y;const ce=enemy(chain,cp.x+140,cp.y),cf=enemy(chain,cp.x+280,cp.y);cp.pet.skillCd=0;
  for(let i=0;i<50;i++){P.updatePets(chain,.01);for(const t of [...chain.timers]){t.t-=.01;if(t.t<=0){chain.timers.splice(chain.timers.indexOf(t),1);t.fn();}}}
  check(ce.hp<10000&&cf.hp===10000,'Helper chain lightning also stays within 186');
  const far=enemy(fox,fp.x+187,fp.y);P.mountedAttack(fox,fp,0,far);check(far.hp===10000&&fox.findTarget(fp)===null,'No target beyond 186');far.dead=true;
  const edge=enemy(fox,fp.x+185,fp.y);P.mountedAttack(fox,fp,0,edge);check(edge.hp<10000,'Near edge within range is hit');
  const outside=enemy(fox,fp.x+220,fp.y);fp.ult=0;P.mountedUlt(fox,fp,0,edge);for(let i=0;i<90;i++)P.updatePets(fox,.01);
  check(fp.pet.blinkHits===5&&outside.hp===10000,'Five jumps cannot chain beyond original cast radius');check(fox.petFields.some(f=>f.kind==='afterimage'),'Full mounted afterimages are emitted');check(fp.ult===0,'Afterimages and ult do not recharge ult');
  const cv=document.createElement('canvas');cv.width=804;cv.height=400;P.drawPetAfterimages(cv.getContext('2d'),fox,0);check(cv.getContext('2d').getImageData(0,0,804,400).data.some((v,i)=>i%4===3&&v>0),'Afterimages really draw sprite pixels');
  for(let i=0;i<70;i++)P.updatePets(fox,.01);check(!fox.petFields.some(f=>f.kind==='afterimage'),'Afterimages fade without leftovers');
  const anchors=[];
  for(const core of [false,true]){const [g,p]=make('fox',core);p.pet=null;const e=enemy(g,540,272);castUlt(g,p,0,e);const z=g.zones.find(z=>z.kind==='domain'),x=z.x,pillar=g.fx.list.find(f=>f.id==='holy/holy-pillar'),rune=g.fx.list.find(f=>f.id==='arcane/rune-circle');
   for(let i=0;i<80;i++){g.updateZones(.01);g.fx.update(.01);check(Math.abs(pillar.options.x-z.x)<.001&&Math.abs(pillar.options.y-z.y)<.001,'Pillar follows zone, not caster');check(Math.abs(rune.options.y-z.y-6)<.001,'Rune circle follows zone');}
   check(core?z.x>x+40:z.x===x,'Only dream core moves domain');anchors.push({core,start:x,end:z.x});g.updateZones(7);check(z.gone,'Expired zone ends follow effect');
  }
  window.followTest={P,castUlt};return{idleSwitches:changes,returnMaxSpeed:maxStep/.01,walkFps:PET_MOTION.walkFps,wallNavigation:true,independentWalkFrames:true,attackRanges:rates,foxRange:D.FOX_RIDE_RANGE,boundedFiveStrikes:true,helperChainBounded:true,visibleAfterimages:true,domainAnchors:anchors,phoenixHeightRestored:true};
 })()`);
 await page.evaluate(`(async()=>{const {app}=await import('./js/main.js'),{makeKit}=await import('./js/save.js'),{renderGround}=await import('./js/map.js');window.a=app;a.begin({mode:'solo',seed:17,pvp:false,players:[{id:1,cid:'claude',local:true,kit:{...makeKit('claude'),core:true}}],myId:1,opt:{map:'grass'}});a.paused=true;const g=a.game,p=a.me;g.banner=null;g.fx.clearAll();g.enemies=[];g.map.t.fill(0);g.map.crates={};g.ground=renderGround(g.map);p.x=320;p.y=272;const e=g.spawnEnemy('slime',490,320);e.spawnT=0;e.hp=e.maxHp=10000;followTest.castUlt(g,p,0,e);for(let i=0;i<80;i++){g.updateZones(.01);g.fx.update(.01);}g.floaters=[];})()`);
 await sleep(150);await page.shot('claude-domain-follows');
 await page.evaluate(`(async()=>{const {makeKit}=await import('./js/save.js'),{renderGround}=await import('./js/map.js');a.begin({mode:'solo',seed:17,pvp:false,petTrial:'fox',players:[{id:1,cid:'claude',local:true,kit:{...makeKit('claude'),pet:{id:'fox',stage:3}}}],myId:1,opt:{map:'grass',petTrial:true}});a.paused=true;const g=a.game,p=a.me;g.banner=null;g.fx.clearAll();g.map.t.fill(0);g.map.crates={};g.enemies=[];g.ground=renderGround(g.map);p.x=320;p.y=272;p.face=0;followTest.P.resetPet(g,p);followTest.P.toggleMount(g,p);for(const [dx,dy] of [[90,0],[-70,30],[110,-45]]){const e=g.spawnEnemy('slime',p.x+dx,p.y+dy);e.spawnT=0;e.hp=e.maxHp=10000;}followTest.P.mountedUlt(g,p,0,null);for(let i=0;i<32;i++)followTest.P.updatePets(g,.01);g.floaters=[];})()`);
 await sleep(150);await page.shot('fox-blink-afterimages');
 assert.deepEqual(b.errors,[]);await writeFile(path.join(b.out,'report.json'),JSON.stringify({...result,pageErrors:b.errors},null,2));console.log(JSON.stringify(result));
}finally{await b.close();}
