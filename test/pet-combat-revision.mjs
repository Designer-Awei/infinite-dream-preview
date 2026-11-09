import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserSession} from './browser-session.mjs';
const b=await browserSession('pet-combat-revision');
try{
 const page=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8785/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});
 await page.wait(`!!document.querySelector('.lb-hero')`);
 const report=await page.evaluate(`(async()=>{
 const {Game}=await import('./js/game.js'),{FxLayer}=await import('./js/fx.js'),P=await import('./js/pets.js'),{A}=await import('./js/assets.js'),{Renderer}=await import('./js/render.js'),{input}=await import('./js/input.js');
 const ok=(v,m)=>{if(!v)throw Error(m)},make=(id)=>{const g=new Game({fx:new FxLayer(),seed:17}),p=g.addPlayer({id:1,cid:'claude',local:true,kit:{tal:{},eq:{},cards:[],core:false,pet:{id,stage:3}}});g.startRun();g.map.t.fill(0);g.map.crates={};g.enemies=[];g.phase='fight';g.waveDelay=999;p.x=320;p.y=272;P.resetPet(g,p);P.toggleMount(g,p);return[g,p]},enemy=(g,x,y,hp=1000)=>{const e=g.spawnEnemy('slime',x,y);e.spawnT=0;e.hp=e.maxHp=hp;return e},prop=(g,tx,ty,kind=4)=>{const i=ty*g.map.W+tx;g.map.t[i]=kind;g.map.crates[i]={hp:kind===4?30:12,dead:false,flash:0};return i};
 // An empty ultimate must never freeze movement, including after the last target dies.
 const [f,p]=make('fox');p.input.mx=1;P.mountedUlt(f,p,0,null);const x=p.x;f.updatePlayer(p,.05);ok(!p.pet.blinkT&&p.x>x,'Empty fox ult allows movement');
 const e=enemy(f,p.x+60,p.y);P.mountedUlt(f,p,0,e);e.dead=true;const x1=p.x;f.updatePlayer(p,.05);ok(p.pet.blinkT===0&&p.x>x1,'Last target gone releases before movement');
 const last=enemy(f,p.x+50,p.y,1);P.mountedUlt(f,p,0,last);P.updatePets(f,.01);ok(last.dead&&p.pet.blinkT===0,'Lethal first blink ends immediately');
 // Direct arc can strike exactly four unique targets (initial + up to three bounces).
 const [arc,ap]=make('fox');const hits=[];arc.hit=(e,d)=>{e.hp-=d;hits.push(e.id)};const line=[];arc.line=(...a)=>line.push(a);
 for(const [dx,dy] of [[60,0],[90,25],[120,0],[150,25],[175,0]])enemy(arc,ap.x+dx,ap.y+dy);
 P.mountedAttack(arc,ap,0,null);ok(hits.length===4&&new Set(hits).size===4&&line.length===4,'Initial arc plus three distinct bounces');
 const [cover,cp]=make('fox');const ci=prop(cover,12,8);P.mountedAttack(cover,cp,0,null);ok(cover.map.crates[ci].hp<30,'Directional arc damages crate without enemies');
 const bi=prop(cover,12,8,5);for(let j=0;j<3;j++)P.mountedAttack(cover,cp,0,null);ok(cover.map.crates[bi].dead,'Directional arc detonates barrel');
 const [blocked,bp]=make('fox');const behind=enemy(blocked,bp.x+120,bp.y);blocked.map.t[8*blocked.map.W+12]=1;P.mountedAttack(blocked,bp,0,null);ok(behind.hp===1000,'Arc cannot shoot through walls');
 // Normal mounted dragon fireballs break only internal walls.
 const [d,dp]=make('dragon');const dm=P.mountedAttackOrigin(dp),wi=Math.floor((dm.y+14)/32)*d.map.W+12;d.map.t[wi]=1;for(let n=0;n<80;n++){P.mountedAttack(d,dp,0,null);for(let i=0;i<30;i++)d.updateBullets(.01);}ok(d.map.t[wi]===0,'Dragon fireball destroys wall');
 d.map.t[0]=1;d.damageWall(0,999,dp);ok(d.map.t[0]===1,'Outer boundary preserved');const [other,op]=make('phoenix');const oi=8*other.map.W+12;other.map.t[oi]=1;other.damageWall(oi,999,op);ok(other.map.t[oi]===1,'Other mounts cannot break walls');
 P.mountedUlt(d,dp,0,null);ok(d.petFields.filter(f=>f.kind==='tornado').length===1,'One automatic large tornado');const count=d.bullets.length;P.mountedAttack(d,dp,Math.PI/2,null);ok(d.bullets.length===count+1,'Normal attack emits one fireball');const ball=d.bullets.at(-1),mouth=P.mountedAttackOrigin(dp);ok(Math.hypot(ball.x-mouth.x,ball.y-mouth.y)<1,'Fireball leaves mouth');
 const ctx=document.createElement('canvas').getContext('2d');let translated;ctx.translate=(x,y)=>translated=[x,y];input.aim=.7;Renderer.prototype.drawAim.call({},ctx,dp);input.aim=null;ok(Math.abs(translated[0]-mouth.x)<.001&&Math.abs(translated[1]-mouth.y)<.001,'Aim guide shares mouth pivot');
 const clips={};for(const id of ['dragon','phoenix']){const [g,p]=make(id);P.mountedUlt(g,p,0,null);p.pet.moving=true;const calls=[];ctx.drawImage=(...a)=>calls.push(a.slice(1,3));for(const t of [.1,.6,1.1]){p.pet.walkT=p.pet.anim=t;P.drawMountedPet(ctx,p,t,false);}ok(new Set(calls.map(x=>x.join(','))).size>1,'Moving ult cycles body frames '+id);clips[id]=calls;}
 return{emptyUltMovement:true,earlyBlinkRelease:true,threeBounces:true,manualCrateAndBarrel:true,wallCover:true,normalDragonWall:true,borderSafe:true,oneLargeTornado:true,sharedMouthAimPivot:true,movingUltFrames:clips};
 })()`);
 assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close();}
