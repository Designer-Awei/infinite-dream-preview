import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession();
try{
  const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8775',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sel:'deepseek',chars:['deepseek','gpt','grok','claude','doubao','glm'],seenUnlock:['deepseek','gpt','grok','claude','doubao','glm'],name:'伙伴回归',sound:false,music:false,tokens:521,stash:60,mine:{stars:200},characterXP:{deepseek:560}}))`});
  await p.wait(`!!document.querySelector('.lb-hero')`);await p.evaluate(`document.fonts.ready`);
  const report=await p.evaluate(`(async()=>{
    const {app}=await import('./js/main.js'),S=await import('./js/save.js'),PS=await import('./js/petsave.js'),PD=await import('./js/petdata.js'),P=await import('./js/pets.js'),UI=await import('./js/ui.js'),{Game}=await import('./js/game.js'),{A}=await import('./js/assets.js'),{FxLayer}=await import('./js/fx.js'),{fireAttack,castUlt}=await import('./js/skills.js');
    const check=(v,m)=>{if(!v)throw Error(m)},m=S.load(),results={};
    check(['fox','dragon','phoenix'].every(id=>Object.keys(A.mounts[id].meta.actors).length===6&&A.mounts[id].image.complete),'Three full composite mounts load all six riders');
    results.completeRiders=6;results.farLegLayer=true;
    check(Object.keys(m.pets.owned).length===0 && m.characterXP.deepseek===560 && m.tokens===521,'Old save migrated without changing progress');
    check(!PS.exchangePet('bad','UR').ok && !PS.exchangePet('dragon','BAD').ok,'Invalid exchange refused');
    check(PS.exchangePet('dragon','UR').ok && m.stash===50 && m.pets.equipped==='dragon','UR costs10 and auto equips first pet');
    check(!PS.exchangePet('dragon','UR').ok && m.stash===50,'Duplicate exchange does not charge');
    check(!PS.evolvePet('dragon').ok && S.mineState().stars===200,'Insufficient XP blocks evolution');
    check(PS.grantPetXP('dragon',300)===300 && PS.evolvePet('dragon').stage===2 && S.mineState().stars===160,'Growth evolution consumes40 stars');
    PS.grantPetXP('dragon',10000);check(PS.evolvePet('dragon').stage===3 && S.mineState().stars===40,'Final evolution capsXP1200 and consumes120stars');
    check(PS.grantPetXP('dragon',1)===0 && !PS.evolvePet('dragon').ok,'Final capped, no repeated charge');
    check(!PS.exchangePet('fox','HUR').ok && m.stash===50,'HUR direct exchange disabled without charging');check(PS.exchangePet('fox','UR').stage===1 && m.stash===40,'UR only grants young pet');S.mineState().stars+=160;PS.grantPetXP('fox',1200);check(PS.evolvePet('fox').stage===2 && PS.evolvePet('fox').stage===3,'Final form only through two evolutions');
    check(PS.exchangePet('phoenix','UR').stage===1 && m.stash===30,'All3 family young exchange');
    check(!PS.equipPet('unknown') && PS.equipPet(null) && !S.makeKit('deepseek').pet,'Unequip prevents combat spawn');
    PS.equipPet('fox');const code=S.exportSave();S.importSave(code);check(S.makeKit('deepseek').pet.id==='fox' && S.load().characterXP.deepseek===560,'Export/import retains pets and existing XP');
    const meta=S.load();meta.stash=0;check(!PS.exchangePet('dragon','HUR').ok && meta.stash===0,'No currency below zero');
    results.saveAndEvolution=true;
    const make=(id,stage=3,pvp=false)=>{const fx=new FxLayer(804,360),g=new Game({mode:'solo',pvp,seed:17,fx});const q=g.addPlayer({id:1,cid:'deepseek',local:true,name:'回归',kit:{tal:{},eq:{},cards:[],pet:{id,stage}}});g.startRun();g.enemies=[];g.phase='fight';g.map.t.fill(0);g.map.mud.fill(0);q.x=320;q.y=270;q.invuln=999;P.resetPet(g,q);return[g,q,fx];};
    const damage={};
    for(const id of PD.PET_ORDER){
      const [g,q]=make(id);const plain=make(id,3,true)[1];check(!plain.pet && !plain.mounted,'PVP never spawns companions');
      check(q.st[PD.PETS[id].stat]>plain.st[PD.PETS[id].stat],'Passive applies once in PVE');
      const e=g.spawnEnemy('slime',q.x+110,q.y);e.hp=e.maxHp=10000;e.spawnT=0;g.enemies=[e];q.pet.skillCd=0;
      for(let i=0;i<150;i++){g.time+=1/60;P.updatePets(g,1/60);for(const t of [...g.timers]){t.t-=1/60;if(t.t<=0){g.timers.splice(g.timers.indexOf(t),1);t.fn();}}}
      check(e.hp<10000,id+' auto skill actually damages enemies');damage[id]=10000-e.hp;
      q.pet.castT=0;q.pet.skillCd=99;q.pet.attackCd=0;P.updatePets(g,.02);check(g.bullets.some(b=>b.kind==='pet_'+id),id+' auto basic attack');g.bullets=[];
      check(P.toggleMount(g,q) && q.mounted,'Final form mounts');check(!P.toggleMount(g,q),'Debounce rapid mount');
      const beforeShot=e.hp;fireAttack(g,q,0,e);if(id==='fox')check(!g.bullets.length&&e.hp<beforeShot,'Fox mounted nearest-target area strike');else{check(g.bullets.length===1&&g.bullets[0].kind==='pet_'+id,'Single mounted projectile');for(let i=0;i<60;i++)g.updateBullets(1/60);check(e.hp<beforeShot,id+' mounted auto-aim hits from actual pet muzzle height');}
      const ult=q.ult;castUlt(g,q,0,e);check(q.pet.castT>0 && (id==='fox'?q.pet.blinkT>0:g.petFields.some(f=>f.ultimate)),'Mounted ult replaced');
      q.ult=0;e.marks.water=g.time+10;
      for(let i=0;i<60;i++){g.time+=1/60;P.updatePets(g,1/60);for(const t of [...g.timers]){t.t-=1/60;if(t.t<=0){g.timers.splice(g.timers.indexOf(t),1);t.fn();}}}
      check(q.ult===0,'Mounted ult and secondary reactions cannot recharge itself');
      q.mountCd=0;P.toggleMount(g,q);check(!q.mounted && !g.petFields.length,'Dismount returns to follow and cancels channel');
      for(const stage of [1,2]){q.pet.stage=stage;q.mountCd=0;check(!P.toggleMount(g,q),'Only final stage can mount, rejected stage '+stage);}q.pet.stage=3;
      g.enemies=[];q.pet.targetId=null;q.pet.state='idle';q.pet.returning=false;q.pet.castT=0;q.pet.x=170;q.pet.y=270;q.pet.room=g.roomIdx;q.x=400;q.y=270;
      for(let i=0;i<120;i++)P.updatePets(g,1/60);check(Math.hypot(q.pet.x-q.x,q.pet.y-q.y)<50,'Follower catches up');
      q.pet.x=-500;P.updatePets(g,.02);check(Math.hypot(q.pet.x-q.x,q.pet.y-q.y)<30,'Lost follower safely recovers');
      q.downed=true;P.updatePets(g,.02);check(!q.mounted&&!q.pet.moving&&!q.pet.castT,'Downed owner hides/disables pet');
      q.downed=false;g.petFields=[{owner:q.id,kind:'snow',life:2,t:0}];g.nextRoom();check(!g.petFields.length && q.pet.room===g.roomIdx,'Room transition clears effects and resets follower');
    }
    results.autoSkillDamage=damage;results.mountAndFollow=true;
    // The pet never counts as a player, a portal occupant, or an enemy collision body.
    const [g,q]=make('dragon');check(g.alivePlayers().length===1 && g.players.length===1,'Companion never changes party size');
      // Helper AI keeps line of sight; only mounted dragon ultimate burns through walls.
    const e=g.spawnEnemy('slime',q.x+150,q.y);e.hp=e.maxHp=10000;e.spawnT=0;g.enemies=[e];
    for(let y=0;y<g.map.H;y++)g.map.t[y*g.map.W+12]=1;
    q.pet.skillCd=0;for(let i=0;i<180;i++)P.updatePets(g,1/60);check(e.hp===10000,'Companion does not acquire target through walls');
    q.mountCd=0;P.toggleMount(g,q);q.face=0;castUlt(g,q,0,e);
    for(let i=0;i<90;i++)P.updatePets(g,1/60);
      check(e.hp<10000 && g.petFields[0].visibleLength===g.petFields[0].length,'Mounted dragon ultimate reaches through walls');
      for(let y=0;y<g.map.H;y++)g.map.t[y*g.map.W+12]=1;
    q.mountCd=0;P.toggleMount(g,q);q.pet.castT=0;q.pet.x=350;q.pet.y=270;q.pet.route=[];q.x=430;q.y=270;
    for(let i=0;i<50;i++)P.updatePets(g,1/60);check(q.pet.x<384,'Follower collision respects wall before recovery fallback');
    results.wallAndParty=true;
    // A playable trial borrows final forms, and cannot grant persistent rewards.
    app.begin({mode:'solo',pvp:false,seed:17,petTrial:'dragon',players:[{id:1,cid:'deepseek',local:true,name:meta.name,kit:{...S.makeKit('deepseek'),pet:{id:'dragon',stage:3}}}],myId:1,opt:{map:'grass',petTrial:true}});app.paused=true;
    const before=JSON.stringify(S.load());app.game.runStats={...app.game.runStats,kills:80,rooms:7,xpRooms:7,xpBosses:1,boss:true,dmg:10000};app.progressSession.seconds=400;app.endRun(true);app.endRun(true);check(JSON.stringify(S.load())===before,'Trial and duplicate settlement preserve all save fields');
    results.trialNoRewards=true;
    // A regular six-minute run persists companion growth exactly once.
    S.load().pets.owned.dragon={stage:1,xp:0};PS.equipPet('dragon');
    app.begin({mode:'solo',pvp:false,seed:17,players:[{id:1,cid:'deepseek',local:true,name:meta.name,kit:S.makeKit('deepseek')}],myId:1,opt:{map:'grass'}});app.paused=true;
    app.game.runStats={...app.game.runStats,kills:20,rooms:3,xpRooms:3,xpBosses:1,boss:true};app.progressSession.seconds=360;
    app.endRun(false);check(S.load().pets.owned.dragon.xp===80,'Regular run persists 6-minute/3-room/1-boss companion XP');
    app.endRun(false);check(S.load().pets.owned.dragon.xp===80,'Duplicate settlement never grants extra companion XP');PS.equipPet('fox');
    results.regularSettlementXP=80;
    window.petTest={app,S,PS,PD,P,UI,make};return results;
  })()`);
  await p.evaluate(`(async()=>{const {showPets}=await import('./js/petui.js');petTest.app.toLobby();showPets()})()`);await p.shot('pet-menu-804');
  const fit=await p.evaluate(`(()=>{const a=document.querySelector('.pet-panel').getBoundingClientRect();return {x:a.x,y:a.y,right:a.right,bottom:a.bottom,bodyWidth:document.body.scrollWidth}})()`);assert(fit.x>=0&&fit.y>=0&&fit.right<=805&&fit.bottom<=361,'804 phone panel fits');
  await p.send('Emulation.setDeviceMetricsOverride',{width:667,height:375,deviceScaleFactor:1,mobile:true});await sleep(150);await p.shot('pet-menu-667');
  const small=await p.evaluate(`(()=>{const a=document.querySelector('.pet-panel').getBoundingClientRect();return a.x>=0&&a.y>=0&&a.right<=668&&a.bottom<=376})()`);assert(small,'667 phone panel fits');
  await p.send('Emulation.setDeviceMetricsOverride',{width:804,height:360,deviceScaleFactor:1,mobile:true});
  for(const id of ['dragon','fox','phoenix']){
    await p.evaluate(`(()=>{const {app,S,P}=petTest;document.querySelector('.pet-modal')?.remove();app.begin({mode:'solo',pvp:false,seed:17,petTrial:'${id}',players:[{id:1,cid:'deepseek',local:true,name:'伙伴试用',kit:{...S.makeKit('deepseek'),pet:{id:'${id}',stage:3}}}],myId:1,opt:{map:'grass',petTrial:true}});app.paused=true;app.game.banner=null;app.me.face=0;app.me.pet.x=app.me.x+58;app.me.pet.y=app.me.y+8;app.me.pet.face=0;})()`);await sleep(150);await p.shot(id+'-follow');
    const ridePoint=await p.evaluate(`petTest.app.paused=false;document.body.classList.add('touchmode');(()=>{const r=document.querySelector('.pet-ride-btn').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ridePoint.x,y:ridePoint.y}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await p.wait('petTest.app.me.mounted');await p.evaluate('petTest.app.paused=true');await p.shot(id+'-ride');
    await p.evaluate(`(()=>{const {app}=petTest;app.game.map.t.fill(0);app.game.enemies=[];app.me.face=0;app.me.input.ult=true;app.me.ult=1;app.game.update(.02);for(let i=0;i<35;i++)app.game.update(.02);})()`);await p.shot(id+'-ult');
  }
  assert.deepEqual(b.errors,[],'No runtime errors');
  report.phoneLayouts=[804,667];report.pageErrors=b.errors;await writeFile(path.join(b.out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close();}
