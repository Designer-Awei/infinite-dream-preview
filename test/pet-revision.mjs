import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('pet-revision');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8781',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false,stash:100,mine:{stars:500}}))`});
 await p.wait(`!!document.querySelector('.lb-hero')`);
 assert(!await p.evaluate(`!!document.querySelector('.pet-entry')`),'No entrance before first exchange');
 const combat=await p.evaluate(`(async()=>{
 const {Game}=await import('./js/game.js'),{FxLayer}=await import('./js/fx.js'),P=await import('./js/pets.js'),C=await import('./js/petcombat.js'),{A}=await import('./js/assets.js');
 const check=(v,m)=>{if(!v)throw Error(m)},make=(id,stage=3)=>{const fx=new FxLayer(),g=new Game({fx,seed:17}),p=g.addPlayer({id:1,cid:'gpt',name:'回归',local:true,kit:{tal:{},eq:{},cards:[],pet:{id,stage}}});g.startRun();g.enemies=[];g.map.t.fill(0);g.map.mud.fill(0);g.map.crates={};g.phase='fight';g.waveDelay=999;p.x=320;p.y=272;p.invuln=0;P.resetPet(g,p);return[g,p,fx];},enemy=(g,x,y)=>{const e=g.spawnEnemy('slime',x,y);e.spawnT=0;e.hp=e.maxHp=10000;return e;};
 check(!A.mounts.dragon&&!A.mounts.phoenix&&A.mounts.fox,'Old reviewed materials only');
 const [fg,fp]=make('fox',1);fg.bullets=[{id:1,side:'e'},{id:2,side:'p'}];P.updatePets(fg,9.99);check(fg.bullets.length===2,'Aura not early');P.updatePets(fg,.02);check(fg.bullets.length===1&&fg.bullets[0].id===2,'10s clears enemies, preserves friendly');
 const [g,q]=make('fox');P.toggleMount(g,q);const near=enemy(g,400,272),splash=enemy(g,422,272),far=enemy(g,720,272);
 P.mountedAttack(g,q,Math.PI,far);check(near.hp<10000&&splash.hp<10000&&far.hp===10000&&!g.bullets.length,'Nearest-target area lightning, no projectile');
 const hit=g.hit.bind(g),times=[];let elapsed=0;g.hit=(e,d,s)=>{if(e.id===near.id&&s.noUltGain)times.push(elapsed);return hit(e,d,s);};q.ult=0;P.mountedUlt(g,q,0,far);
 for(let i=0;i<100;i++){elapsed=i*.01;check(!g.hurt(q,2,{}),'Invulnerable during 1s blink');g.time+=.01;P.updatePets(g,.01);}
 check(times.length===5&&times.at(-1)<1&&q.pet.blinkHits===5,'Five strikes within one second');check(q.ult===0,'No ult self charging');q.invuln=0;P.updatePets(g,.02);check(g.hurt(q,1,{}),'Invulnerability ends after blink');
 const [ig,ip]=make('phoenix');P.toggleMount(ig,ip);ig.map.t[8*ig.map.W+11]=1;ip.input.mx=1;ig.updatePlayer(ip,.8);check(ip.x>384,'Flying passes solid obstacle');
 ip.input.mx=0;ig.hazard='ice';ig.map.mud.fill(1);ip.ivx=100;const x=ip.x;ig.updatePlayer(ip,.2);check(ip.x===x&&ip.ivx===0,'No ice inertia');
 ig.hazard='lava';ig.zones=[{kind:'poison',fire:true,x:ip.x,y:ip.y,r:100}];const health=ip.hp+ip.shield;ip.buff.burn=5;
 for(let i=0;i<25;i++)ig.updatePlayer(ip,.1);ig.explodeAt(ip.x,ip.y,58,3,0,null);check(ip.hp+ip.shield===health&&!ip.buff.burn&&!ip.buff.poison,'Immune to lava, fire, poison, explosion');
 ip.invuln=0;check(ig.hurt(ip,1,{kind:'enemy'}),'Enemy direct damage remains');ip.invuln=0;
 ig.map.t[Math.floor(ip.y/32)*ig.map.W+Math.floor(ip.x/32)]=1;ip.mountCd=0;P.toggleMount(ig,ip);check(C.clearLanding(ig.map,ip.x,ip.y,ip.r),'Dismount finds safe floor');check(ig.hurt(ip,1,{groundHazard:true}),'Ground immunity stops on dismount');
 const [sg,sp]=make('phoenix');P.toggleMount(sg,sp);const se=enemy(sg,sp.x+30,sp.y);P.mountedAttack(sg,sp,0,se);check(sg.bullets.length===1&&sg.bullets[0].kind==='pet_phoenix','Single ice spike');sg.bullets=[];P.mountedUlt(sg,sp,0,se);sp.x+=70;sp.y+=20;P.updatePets(sg,.4);const snow=sg.petFields.find(f=>f.kind==='snow');check(snow.follow&&snow.x===sp.x&&snow.y===sp.y&&snow.r===124,'124 storm follows rider');check(se.hp<10000,'Moving storm damages');
 const put=(g,tx,ty,kind,hp=12)=>{const i=ty*g.map.W+tx;g.map.t[i]=kind;g.map.crates[i]={hp};return i;};
 const [dg,dp]=make('dragon');P.toggleMount(dg,dp);dp.input.aim=0;dp.face=0;const wood=put(dg,14,8,4),barrel=put(dg,16,8,5),outside=put(dg,18,14,4);enemy(dg,528,272);dp.ult=0;P.mountedUlt(dg,dp,0,null);
 for(let i=0;i<90;i++){dg.time+=1/60;P.updatePets(dg,1/60);}check(dg.map.crates[wood].dead&&dg.map.crates[barrel].dead&&!dg.map.crates[outside].dead,'Breath damages only in-range props');check(dg.pickups.length>0,'Destroyed wood retains loot');check(dp.ult===0,'Ultimate-triggered barrel chains cannot recharge ultimate');
 const f=dg.petFields.find(f=>f.kind==='fire');check(C.fireHalfWidth(f,f.visibleLength-1)<f.width*.3,'Rounded fire tip narrows');
 const [pg,pp]=make('phoenix');P.toggleMount(pg,pp);const frozen=put(pg,11,8,4);P.mountedUlt(pg,pp,0,null);for(let i=0;i<80;i++)P.updatePets(pg,1/60);check(pg.map.crates[frozen].dead,'Snow area damages props');
 for(const id of ['dragon','fox','phoenix']){const [g,p,fx]=make(id);P.toggleMount(g,p);const effect=fx.spawn('holy/divine-shield',p.x,p.y,{follow:p,life:5});check(!!effect,'Shield effect available');fx.update(.01);const h=P.mountedHeadHeight(p),cy=effect.options.y-22,r=effect.options.radius;check(cy-r<=p.y-h&&cy+r>=p.y,'Shield fits rider and body '+id);p.mountCd=0;P.toggleMount(g,p);fx.update(.01);check(effect.options.radius===29&&effect.options.y===p.y,'Shield restores on foot '+id);}
 window.revision={make,enemy,P};return{aura10s:true,nearestAOE:true,blinkHits:times.length,blinkTimes:times,blinkInvulnerability:true,flightAndSafeLanding:true,groundImmunityScoped:true,singleIceSpike:true,movingStormRadius:124,propDamageAndLoot:true,roundedBreath:true,mountedShield:true,oldMaterials:true};
 })()`);
 await p.evaluate(`(async()=>{const S=await import('./js/save.js'),PS=await import('./js/petsave.js'),L=await import('./js/lobby.js');PS.exchangePet('dragon','UR');L.showLobby();})()`);
 await p.wait(`!!document.querySelector('.lb-pet canvas')`);await sleep(250);
 assert(await p.evaluate(`!document.querySelector('.topbar .pet-entry')&&document.querySelector('.lb-pet').parentElement.classList.contains('lb-right')`));
 assert.equal(await p.evaluate(`document.querySelector('.lb-pet').textContent.trim()`),'','No visible companion label');
 const lobbyFrame=await p.evaluate(`document.querySelector('.lb-pet canvas').toDataURL()`);await sleep(450);assert.notEqual(await p.evaluate(`document.querySelector('.lb-pet canvas').toDataURL()`),lobbyFrame,'Lobby pet plays authored animation');
 await sleep(2000);await p.shot('lobby-804');await p.evaluate(`document.querySelector('.pet-entry').click()`);
 assert(!await p.evaluate(`document.querySelector('.pet-actions').textContent.includes('直升')`),'No direct final exchange');
 await p.evaluate(`(async()=>{const {load}=await import('./js/save.js');load().pets.owned.dragon={stage:1,xp:300};document.querySelector('.pet-choice').click();[...document.querySelectorAll('.pet-actions button')].find(b=>b.textContent==='进化').click()})()`);assert(await p.evaluate(`document.querySelector('[data-stage="2"]').classList.contains('chosen')`),'Evolution previews newly reached stage');
 const layouts=[];
 for(const [width,height] of [[804,360],[667,375]]){
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  for(const id of ['dragon','fox','phoenix']){
   await p.evaluate(`document.querySelectorAll('.pet-choice')[${['dragon','fox','phoenix'].indexOf(id)}].click()`);
   for(const ownedStage of [0,1,2,3]){
   await p.evaluate(`(async()=>{const {load}=await import('./js/save.js');const m=load();if(${ownedStage})m.pets.owned['${id}']={stage:${ownedStage},xp:1200};else delete m.pets.owned['${id}'];document.querySelectorAll('.pet-choice')[${['dragon','fox','phoenix'].indexOf(id)}].click()})()`);
   for(const stage of [1,2,3])for(const clip of ['idle','move','cast']){
    await p.evaluate(`document.querySelector('[data-stage="${stage}"]').click();document.querySelector('[data-clip="${clip}"]').click()`);
    const fit=await p.evaluate(`(()=>{const panel=document.querySelector('.pet-panel'),r=panel.getBoundingClientRect();const nodes=[panel,...panel.querySelectorAll('.pet-detail,.pet-summary,.pet-body,.pet-nav')];return{fit:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,scroll:nodes.filter(n=>n.scrollHeight>n.clientHeight+2).map(n=>[n.className,n.scrollHeight,n.clientHeight]),canvas:!!document.querySelector('.pet-choice.chosen canvas')}})()`);
    assert(fit.fit&&fit.canvas&&!fit.scroll.length,JSON.stringify({width,id,stage,clip,...fit}));
   }
   }
  }
  layouts.push(width);await sleep(2000);await p.shot('panel-'+width);
 }
 await p.evaluate(`(async()=>{const {app}=await import('./js/main.js'),{makeKit}=await import('./js/save.js'),{renderGround}=await import('./js/map.js');app.begin({mode:'solo',seed:17,pvp:false,petTrial:'fox',players:[{id:1,cid:'gpt',name:'护盾回归',local:true,kit:{...makeKit('gpt'),pet:{id:'fox',stage:3}}}],myId:1,opt:{map:'grass',petTrial:true}});app.paused=true;const g=app.game,q=app.me;g.banner=null;g.map.t.fill(0);g.map.crates={};g.ground=renderGround(g.map);g.enemies=[];q.x=g.map.center.x;q.y=g.map.center.y;revision.P.resetPet(g,q);revision.P.toggleMount(g,q);g.vfx('holy/divine-shield',q.x,q.y,{follow:q,life:5,palette:['#06101e','#10284a','#20508a','#4a90d0','#8ac8ff','#c0e4ff','#eef8ff','#ffffff']});g.fx.update(.3);})()`);await sleep(250);await p.shot('mounted-shield-and-button');
 const buttons=await p.evaluate(`(()=>{const r=document.querySelector('.pet-ride-btn').getBoundingClientRect(),s=document.querySelector('.pausebtn').getBoundingClientRect();return{adjacent:r.right<=s.left&&s.left-r.right<15,aligned:Math.abs((r.top+r.bottom)/2-(s.top+s.bottom)/2)<6}})()`);assert(buttons.adjacent&&buttons.aligned,'Mount button beside pause');
 assert.deepEqual(b.errors,[]);const result={...combat,entranceOwnershipGate:true,lobbyAnimatedNoLabel:true,stageAndClipPreviews:216,onePageWidths:layouts,pageErrors:b.errors};
 await writeFile(path.join(b.out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close();}
