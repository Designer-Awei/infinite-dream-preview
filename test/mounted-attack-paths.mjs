import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserSession} from './browser-session.mjs';
const b=await browserSession('mounted-attack-paths');
try{
 const page=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8795/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});await page.wait(`!!document.querySelector('.lb-hero')`);
 const report=await page.evaluate(`(async()=>{
 const {Game}=await import('./js/game.js'),{FxLayer}=await import('./js/fx.js'),P=await import('./js/pets.js'),{Renderer}=await import('./js/render.js'),{input}=await import('./js/input.js'),{CHAR_ORDER}=await import('./js/data.js');
 const ok=(v,m)=>{if(!v)throw Error(m)},make=(id)=>{const g=new Game({fx:new FxLayer(),seed:17}),p=g.addPlayer({id:1,cid:'gpt',local:true,kit:{tal:{},eq:{},cards:[],pet:{id,stage:3}}});g.startRun();g.map.t.fill(0);g.map.crates={};g.enemies=[];g.phase='fight';g.waveDelay=999;p.x=320.2;p.y=272.4;P.resetPet(g,p);P.toggleMount(g,p);return[g,p]},enemy=(g,x,y)=>{const e=g.spawnEnemy('slime',x,y);e.spawnT=0;e.hp=e.maxHp=10000;return e};
 const ctx=document.createElement('canvas').getContext('2d');let translated;ctx.translate=(x,y)=>translated={x,y};let sockets=0;
 for(const cid of CHAR_ORDER)for(const a of [0,.65,-.8,Math.PI]){
  const [g,p]=make('dragon');p.cid=cid;p.face=a;const fixed=P.mountedAttackOrigin(p);
  for(const t of [.1,.6,1.1]){p.pet.anim=p.pet.walkT=t;p.pet.moving=t>.2;p.pet.castT=t>.5?.2:0;p.pet.castMax=.3;p.pet.x=p.x-50;p.pet.y=p.y+30;p.pet.face=a+Math.PI;
   const m=P.mountedAttackOrigin(p),o=P.mountedAimOrigin(p);ok(Math.hypot(m.x-fixed.x,m.y-fixed.y)<1e-8,'Dragon socket moved with animation or lagged companion');
   // the guide is drawn from the mount's centre (stand x), which does not jump when the dragon turns round
   p.face=a+Math.PI;const flipped=P.mountedAimOrigin(p);p.face=a;ok(Math.hypot(flipped.x-o.x,flipped.y-o.y)<1e-8&&o.x===p.x,'Guide origin jumps when the mount turns');
   input.aim=a;Renderer.prototype.drawAim.call({},ctx,p);input.aim=null;ok(Math.hypot(translated.x-o.x,translated.y-o.y)<1e-8,'Guide not drawn from the mount centre');P.mountedAttack(g,p,a,null);const ball=g.bullets.at(-1);ok(ball.h===0&&Math.hypot(ball.x-m.x,ball.y-m.y)<1e-8,'Ball does not leave the mouth');g.bullets=[ball];
   // from the mouth the ball eases onto the guide line: its sideways gap only shrinks, and is gone well before range
   const gap=()=>Math.abs((ball.x-o.x)*Math.sin(a)-(ball.y-o.y)*Math.cos(a));let last=gap();
   for(let n=0;n<60;n++){g.updateBullets(.01);const d=gap();ok(d<=last+1e-6,'Ball drifts away from the guide line');last=d;}ok(last<1,'Ball never lines up with the guide');sockets++;
  }
 }
 const [g,p]=make('dragon'),m=P.mountedAimOrigin(p),on=enemy(g,m.x+105,m.y+12),off=enemy(g,m.x+105,m.y+112),hits=[];g.hit=(e,d)=>hits.push(e.id);P.mountedAttack(g,p,0,null);for(let i=0;i<80;i++)g.updateBullets(.01);ok(hits.filter(id=>id===on.id).length===1&&!hits.includes(off.id),'Actual enemy damage does not match visible path');
 const [below,bp]=make('dragon'),bm=P.mountedAttackOrigin(bp),bx=Math.floor((bm.x+85)/32),by=Math.ceil((bm.y+12+14)/32),belowI=by*below.map.W+bx;below.map.t[belowI]=1;P.mountedAttack(below,bp,0,null);const pass=below.bullets[0];for(let i=0;i<50;i++)below.updateBullets(.01);ok(below.map.t[belowI]===1&&!below.map.wallHp?.[belowI]&&pass.x>bx*32+32,'Hidden height offset still collides with a wall below the visible ray');
 const [wall,wp]=make('dragon'),wm=P.mountedAttackOrigin(wp),wi=Math.floor((wm.y+14)/32)*wall.map.W+Math.floor((wm.x+85)/32);wall.map.t[wi]=1;P.mountedAttack(wall,wp,0,null);wall.updateBullets(.5);ok(!wall.bullets.length&&wall.map.wallHp?.[wi]<60,'Swept visible path tunnels through wall on large dt');
 let anchors=0;
 for(const cid of CHAR_ORDER){const [f,fp]=make('fox');fp.cid=cid;f.mode='host';P.mountedAttack(f,fp,0,null);const first=f.lines[0];ok(first.anchorOwner===fp.id&&f.events.some(e=>e.t==='ln'&&e.o===fp.id),'Mouth attachment missing from host event');const end=[first.x1,first.y1];
  for(let i=0;i<30;i++){fp.x+=1.7;fp.y+=.9;fp.face=i<15?0:Math.PI;fp.pet.x=fp.x-90;fp.pet.y=fp.y+40;fp.pet.moving=true;fp.pet.walkT=i*.03;const line=P.petLine(f,first),mouth=P.petMuzzle(fp);ok(line&&Math.hypot(line.x0-mouth.x,line.y0-mouth.y)<1e-8,'Fox line detached while walking');ok(line.x1===end[0]&&line.y1===end[1],'Attachment moved the already-hit target');const moves=[];ctx.moveTo=(x,y)=>moves.push({x,y});Renderer.prototype.drawLines.call({t:0},ctx,f);ok(moves.length&&Math.hypot(moves[0].x-mouth.x,moves[0].y-mouth.y)<1e-8,'Rendered fox line still uses stale origin');anchors++;}
  fp.mounted=false;ok(P.petLine(f,first)===null,'Dismount leaves a floating attached arc');
 }
 return{fixedDragonCases:sockets,visualAndDamagePath:true,noHiddenHeightOffset:true,sweptWallCollision:true,foxMovingMouthSamples:anchors,hostAttachmentEvent:true,dismountCleanup:true};})()`);
 assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close();}
