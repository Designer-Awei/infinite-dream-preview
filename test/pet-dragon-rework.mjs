import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserSession} from './browser-session.mjs';
const b=await browserSession('pet-dragon-rework');
try{
 const page=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8791/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});
 await page.wait(`!!document.querySelector('.lb-hero')`);
 const report=await page.evaluate(`(async()=>{
 const {Game}=await import('./js/game.js'),{FxLayer}=await import('./js/fx.js'),P=await import('./js/pets.js'),{Renderer}=await import('./js/render.js'),{input}=await import('./js/input.js'),{CHAR_ORDER,CHARS}=await import('./js/data.js'),{DRAGON_BREATH:B}=await import('./js/petdata.js');
 const ok=(v,m)=>{if(!v)throw Error(m)},make=()=>{const g=new Game({fx:new FxLayer(),seed:17}),p=g.addPlayer({id:1,cid:'claude',local:true,kit:{tal:{},eq:{},cards:[],core:false,pet:{id:'dragon',stage:3}}});g.startRun();g.map.t.fill(0);g.map.crates={};g.enemies=[];g.phase='fight';g.waveDelay=999;p.x=320;p.y=272;P.resetPet(g,p);P.toggleMount(g,p);return[g,p]},spawn=(g,x,y)=>{const e=g.spawnEnemy('slime',x,y);e.spawnT=0;e.hp=e.maxHp=100000;return e};
 const [g,p]=make();P.mountedAttack(g,p,0,null);let flame=g.petFields[0];ok(flame.mountedBreath&&flame.length===128&&flame.damage===CHARS[p.cid].atk.dmg*.65&&!g.bullets.length,'Short weaker breath replaces projectiles');
 const ctx=document.createElement('canvas').getContext('2d');let origin;ctx.translate=(x,y)=>origin=[x,y];let poses=0;
 for(const cid of CHAR_ORDER)for(const a of [0,Math.PI])for(const t of [.1,.6,1.1]){p.cid=cid;p.face=p.pet.face=p.input.aim=a;p.pet.anim=t;P.updatePets(g,.001);const m=P.petMuzzle(p);ok(Math.hypot(flame.x-m.x,flame.y-m.y)<.001,'Moving mouth attachment '+cid);input.aim=a;Renderer.prototype.drawAim.call({},ctx,p);input.aim=null;ok(Math.hypot(origin[0]-m.x,origin[1]-m.y)<.001,'Guide mouth and mirror '+cid);poses++;}
 p.cid='claude';p.face=p.pet.face=p.input.aim=0;P.updatePets(g,.001);let m=P.petMuzzle(p);const e=spawn(g,m.x+60,m.y+12),hits=[];g.hit=(e,d,src)=>hits.push({t:g.time,d,ult:src.noUltGain});flame.tick=0;
 for(let i=0;i<120;i++){g.time+=.01;if(i%20===0)P.mountedAttack(g,p,0,null);P.updatePets(g,.01);}
 ok(hits.length===3&&hits.every(h=>h.d===flame.damage),'Breath ticks only every .55s despite repeated inputs');
 for(let i=0;i<80;i++)P.updatePets(g,.01);ok(!g.petFields.some(f=>f.mountedBreath),'Breath ends after release');
 const [u,up]=make();const enemies=[spawn(u,450,240),spawn(u,510,320),spawn(u,400,400)];P.mountedUlt(u,up,0,null);let ts=u.petFields.filter(f=>f.kind==='tornado');ok(ts.length===1&&ts[0].r===40,'One larger homing tornado');const old=ts.map(f=>Math.hypot(f.x-enemies.find(e=>e.id===f.targetId).x,f.y-enemies.find(e=>e.id===f.targetId).y));P.updatePets(u,.1);ok(ts.every((f,i)=>Math.hypot(f.x-enemies[i].x,f.y-enemies[i].y)<old[i]||Math.hypot(f.x-enemies.find(e=>e.id===f.targetId).x,f.y-enemies.find(e=>e.id===f.targetId).y)<old[i]),'Tornadoes move toward targets');enemies[0].dead=true;P.updatePets(u,.1);ok(ts.every(f=>f.targetId!==enemies[0].id),'Retarget after death');
 const ultHits=[];u.hit=(e,d,s)=>ultHits.push(s);for(let i=0;i<150;i++)P.updatePets(u,.01);ok(ultHits.length>0&&ultHits.every(s=>s.noUltGain&&s.noReact),'Tornado deals host damage without self charging');
 for(const lite of [false,true]){u.fx.setLite(lite);u.fx.clearAll();u.fx.syncPetFields(u);ok(u.fx.petFx.size===1&&u.fx.list.filter(f=>f.id==='fire/fire-tornado').length===1,'PixelFX single large funnel visible '+lite);u.fx.begin(0,0);ok(u.fx.hfront.color.some(v=>v!==0),'Real PixelFX tornado pixels');}
 const client=new Game({mode:'client',fx:new FxLayer()});client.players=[structuredClone({...up,target:null})];client.enemies=[];client.petFields=structuredClone(u.petFields);client.player=id=>client.players.find(p=>p.id===id);client.fx.syncPetFields(client);ok(client.fx.petFx.size===1,'Snapshot fields render without vfx events');client.petFields=[];client.fx.syncPetFields(client);ok(client.fx.petFx.size===0,'Snapshot removal stops visuals');
 up.mountCd=0;P.toggleMount(u,up);u.fx.syncPetFields(u);ok(!u.petFields.length&&u.fx.petFx.size===0,'Dismount clears attacks and effects');
 const [w,wp]=make();P.mountedUlt(w,wp,0,null);const f=w.petFields[0],tx=13,ty=8,i=ty*w.map.W+tx;f.x=tx*32+16;f.y=ty*32+16;f.a=0;w.map.t[i]=1;for(let n=0;n<6;n++){f.x=tx*32+16;f.y=ty*32+16;f.tick=0;P.updatePets(w,.001);}ok(w.map.t[i]===0,'Tornado destroys inner wall');w.map.t[0]=1;w.damageWall(0,999,wp);ok(w.map.t[0]===1,'Boundary remains');
 w.map.t[i]=3;f.x=tx*32+16;f.y=ty*32+16;f.tick=0;P.updatePets(w,.001);ok(w.map.t[i]===0,'Tornado burns grass');w.map.t[i]=4;w.map.crates[i]={hp:12,dead:false,flash:0};f.tick=0;P.updatePets(w,.001);ok(w.map.crates[i].dead&&w.pickups.length>0,'Crate destruction preserves loot');
 for(let n=0;n<500;n++)P.updatePets(w,.01);ok(!w.petFields.length,'Tornado expires without enemies');
 return{mouthPoses:poses,breathInterval:.55,breathHits:hits.length,oneLargeTargetingTornado:true,retarget:true,hostOnly:true,noUltCharge:true,pixelfxNormalAndLite:true,snapshotCleanup:true,innerWallGrassLoot:true};
 })()`);
 assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close();}
