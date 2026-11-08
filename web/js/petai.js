// Companion decisions use separate approach/attack/return states and hysteresis.
import {T} from './data.js';
import {SOLID,tileAt,los,moveCircle,flowField,flowDir} from './map.js';
import {PET_ATTACK_RANGE} from './petdata.js';
export const PET_MOTION={speed:132,returnStart:86,returnStop:46,leash:320,recover:480,aggro:260,walkFps:7};
function walkableLine(m,q,goal){
 const dx=goal.x-q.x,dy=goal.y-q.y,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/8));
 for(let i=1;i<=n;i++){const x=q.x+dx*i/n,y=q.y+dy*i/n;for(const [ox,oy] of [[0,0],[8,0],[-8,0],[0,8],[0,-8]])if(SOLID(tileAt(m,x+ox,y+oy)))return false;}
 return true;
}
function moveToward(game,q,goal,stop,dt){
 const dx=goal.x-q.x,dy=goal.y-q.y,d=Math.hypot(dx,dy);if(d<=stop){q.moving=false;return;}
 let vx=dx/d,vy=dy/d;
 if(!walkableLine(game.map,q,goal)){
  const key=Math.floor(goal.x/T)+':'+Math.floor(goal.y/T);q.navCd=(q.navCd||0)-dt;
  if(!q.nav||q.navKey!==key||q.navCd<=0){q.nav=flowField(game.map,[goal]);q.navKey=key;q.navCd=.35;}
  const v=flowDir(game.map,q.nav,q.x,q.y);if(!v){q.moving=false;return;}[vx,vy]=v;
 }
 const ox=q.x,oy=q.y,step=Math.min(PET_MOTION.speed*dt,Math.max(0,d-stop));moveCircle(game.map,q,vx*step,vy*step);
 q.moving=Math.hypot(q.x-ox,q.y-oy)>.05;if(q.moving)q.face=Math.atan2(vy,vx);
}
export function updateCompanion(game,p,dt){
 const q=p.pet,D=PET_MOTION,d=Math.hypot(q.x-p.x,q.y-p.y);q.moving=false;
 if(p.mounted){q.x=p.x;q.y=p.y;q.face=p.face;q.moving=p.moving;q.state='mounted';return null;}
 if(q.room!==game.roomIdx||d>D.recover){Object.assign(q,{x:p.x,y:p.y+12,room:game.roomIdx,targetId:null,state:'idle',returning:false,nav:null,stuck:0,castT:0,castMax:0});game.petFields=(game.petFields||[]).filter(f=>f.owner!==p.id);return null;}
 if(d>D.leash)q.returning=true;if(q.returning&&d<=D.returnStop+.001)q.returning=false;
 const valid=e=>e&&!e.dead&&e.spawnT<=0&&Math.hypot(e.x-p.x,e.y-p.y)<=D.aggro&&los(game.map,q.x,q.y,e.x,e.y);
 let target=game.phase==='fight'&&!q.returning?game.enemies.find(e=>e.id===q.targetId&&valid(e)):null;
 if(!target&&game.phase==='fight'&&!q.returning){let best=Infinity;for(const e of game.enemies)if(valid(e)){const ed=Math.hypot(e.x-q.x,e.y-q.y);if(ed<best){best=ed;target=e;}}}
 q.targetId=target?.id??null;
 if(q.castT>0){q.state='cast';return target;}
 if(target){
  const range=PET_ATTACK_RANGE[q.id],ed=Math.hypot(target.x-q.x,target.y-q.y);
  if(ed>range||(q.state==='approach'&&ed>range-12)){q.state='approach';moveToward(game,q,target,range-12,dt);}
  else{q.state='attack';q.face=Math.atan2(target.y-q.y,target.x-q.x);}
  return ed<=range?target:null;
 }
 if(d>D.returnStart)q.returning=true;
 if(q.returning){q.state='return';const ox=q.x,oy=q.y;moveToward(game,q,p,D.returnStop,dt);q.stuck=Math.hypot(q.x-ox,q.y-oy)<.05?(q.stuck||0)+dt:0;if(q.stuck>3&&d>160){q.x=p.x;q.y=p.y+12;q.moving=false;q.stuck=0;q.nav=null;}}
 else{q.state='idle';q.stuck=0;}
 return null;
}
