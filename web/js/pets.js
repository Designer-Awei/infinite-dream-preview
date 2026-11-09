// Host-authoritative companions; clients render plain snapshot state.
import { PETS, validPet, FOX_RIDE_RANGE, PHOENIX_STORM_RADIUS, DRAGON_FIREBALL, DRAGON_TORNADO } from './petdata.js';
import { A } from './assets.js';
import { los, tileAt, BLOCKS_SHOT, WALL, BUSH } from './map.js';
import { updateCompanion, PET_MOTION } from './petai.js';
import { CHARS, T } from './data.js';
import { nid } from './util.js';
import { flyingMount, flightLift, safeLanding, clearLanding, inFire, fireHalfWidth } from './petcombat.js';
export function attachPet(game,p,value){
  const pet=!game.pvp&&validPet(value);if(!pet)return;
  p.pet={...pet,x:p.x,y:p.y,r:8,face:0,anim:0,walkT:0,moving:false,castT:0,castMax:0,attackCd:.5,skillCd:2,auraCd:10,blinkT:0,warpSeq:0,route:[],room:-1};
  const def=PETS[pet.id];p.st[def.stat]*=1+def.bonus[pet.stage-1];p.mounted=false;
}
export function resetPet(game,p){if(p.pet)Object.assign(p.pet,{x:p.x,y:p.y+12,route:[],room:game.roomIdx,castT:0,moving:false,blinkT:0,targetId:null,state:'idle',returning:false,nav:null,navCd:0,stuck:0});}
export function petScale(p){return p.mounted?1.04:[1.08,.95,.85][p.pet.stage-1];}
function followerFrame(q,actor,clips){
  let name='idle_e',frame=q.anim*6;
  if(q.castT>0&&clips.cast_e){
    name='cast_e';const elapsed=q.castMax-q.castT,[lo,hi]=actor.cast_hold_frames||[3,5],mid=Math.floor((lo+hi)/2);
    frame=actor.native_resolution?(elapsed*6)%8:elapsed<.35?elapsed*8:q.castT<.375?6+(.375-q.castT)*8:q.id==='phoenix'?(elapsed*6)%8:[lo,mid,hi,mid][Math.floor(elapsed*6)%4];
  }else if(q.moving&&clips.move_e){name='move_e';frame=(q.walkT||0)*(q.id==='phoenix'?6:PET_MOTION.walkFps);}
  const clip=clips[name],count=Math.max(1,clip.length-1);
  frame=Math.floor(frame*(actor.native_resolution?count/8:1));
  const index=Math.min(clip.length-1,q.castT>0?frame:frame%count);
  return{name,index,pos:clip[index]};
}
function mountAsset(p){return p.mounted&&p.pet?.stage===3?A.mounts?.[p.pet.id]||null:null;}
function mountedFrame(q,actor){
  let name='idle_e',clock=q.anim,fps=6,held=null;
  if(q.id==='phoenix'&&actor.shared_flight_cycle){name='idle_e';}
  else if(q.castT>0&&q.id==='fox'&&actor.native_resolution){name='cast_e';clock=q.castMax-q.castT;}
  else if(q.castT>0&&q.id==='phoenix'&&actor.move_e){name='move_e';}
  else if(q.castT>0&&q.id==='dragon'){
    name=q.moving?(actor.cast_walk?'cast_e':'move_e'):'cast_e';clock=q.moving?(q.walkT||0):q.anim;fps=q.moving?PET_MOTION.walkFps:6;
  }else if(q.castT>0&&actor.cast_e){
    name='cast_e';const t=q.castMax-q.castT;held=t<.35?Math.floor(t*8):q.castT<.375?6+Math.floor((.375-q.castT)*8):[3,4,5,4][Math.floor(t*6)%4];
  }else if(q.moving&&actor.move_e){name='move_e';clock=q.walkT||0;fps=PET_MOTION.walkFps;}
  const clip=actor[name],count=Math.max(1,clip.length-1);
  // More native samples improve smoothness without slowing down the authored cycle.
  const index=held==null?Math.floor(clock*fps*count/8)%count:Math.max(0,Math.min(clip.length-1,Math.floor(held*(actor.native_resolution?count/8:1))));
  return{name,index,pos:clip[index]};
}
// Whole-silhouette centre remains available for body overlays.
export function mountedCenter(p){
  const m=mountAsset(p),a=m?.meta.actors[p.cid];
  if(a){const c=a.center||[m.meta.anchor[0],(a.top+m.meta.anchor[1])/2];return{x:p.x+(c[0]-m.meta.anchor[0])*m.meta.scale*(Math.cos(p.face)>=0?1:-1),y:p.y+(c[1]-m.meta.anchor[1])*m.meta.scale};}
  return{x:p.x,y:p.y-(mountedHeadHeight(p)||60)/2};
}
export function mountedVisualHeight(p){
  if(!p.mounted||!p.pet)return null;
  const m=mountAsset(p),a=m?.meta.actors[p.cid];if(a)return(m.meta.anchor[1]-a.top)*m.meta.scale;
  return flightLift(p)+Math.max(68,(A.pets?.meta.actors[`${p.pet.id}-3`]?.anchor?.[1]??96)*petScale(p));
}
export function mountedHeadHeight(p){
  if(!p.mounted||!p.pet)return null;
  const m=mountAsset(p),a=m?.meta.actors[p.cid];
  if(a)return(m.meta.anchor[1]-a.top)*m.meta.scale;
  return 68;
}
export function mountedShield(p){
  const head=mountedHeadHeight(p);if(!head)return null;
  const bottom=5;return{radius:Math.ceil((head+bottom)/2+3),x:p.x,y:p.y+22+(bottom-head)/2};
}
export function petMuzzle(p){
  const m=mountAsset(p),a=m?.meta.actors[p.cid];
  if(a){const f=mountedFrame(p.pet,a),mouth=a.mouth_frames?.[f.name]?.[f.index]||a.mouth;return{x:(p.x??p.pet.x)+(mouth[0]-m.meta.anchor[0])*m.meta.scale*(Math.cos(p.face??p.pet.face)>=0?1:-1),y:(p.y??p.pet.y)+(mouth[1]-m.meta.anchor[1])*m.meta.scale};}
  const q=p.pet,id=`${q.id}-${q.stage}`,a0=A.pets?.meta.actors[id],clips=A.pets?.meta.clips[id],f=a0&&clips?followerFrame(q,a0,clips):null,point=a0?.mouth_frames?.[f?.name]?.[f?.index]||(q.castT>0&&a0?.cast_mouth)||a0?.mouth||[89,60],anchor=a0?.anchor||[64,96],k=petScale(p)*(a0?.render_scale??1);
  return{x:q.x+(point[0]-anchor[0])*k*(Math.cos(q.face)>=0?1:-1),y:q.y+(point[1]-anchor[1])*k-flightLift(p)};
}
export function mountedAttackOrigin(p){
 if(p.mounted&&p.pet?.id==='dragon'){
  const m=mountAsset(p),a=m?.meta.actors[p.cid],point=a?.attack_origin||a?.mouth;
  if(point)return{x:p.x+(point[0]-m.meta.anchor[0])*m.meta.scale*(Math.cos(p.face)>=0?1:-1),y:p.y+(point[1]-m.meta.anchor[1])*m.meta.scale};
  return petMuzzle(p);
 }
 return p.mounted&&p.pet?.id==='fox'?petMuzzle(p):{x:p.x,y:p.y-16};
}
export function petLine(game,line){
 if(line.anchorOwner==null)return line;
 const p=game.player(line.anchorOwner);if(!p?.mounted||p.pet?.id!=='fox'||p.dead||p.downed)return null;
 const m=petMuzzle(p);return{...line,x0:m.x,y0:m.y};
}
export function toggleMount(game,p){
  if(game.pvp||!p.pet||p.pet.stage!==3||p.dead||p.downed||p.mountCd>0)return false;
  if(flyingMount(p)){const spot=safeLanding(game.map,p.x,p.y,p.r);if(!spot)return false;Object.assign(p,spot);p.pet.warpSeq++;p.petWarpUntil=game.time+.2;}
  p.mounted=!p.mounted;p.mountCd=.4;p.pet.castT=0;p.pet.blinkT=0;p.pet.route=[];
  game.petFields=(game.petFields||[]).filter(f=>f.owner!==p.id);
  if(p.mounted)Object.assign(p.pet,{x:p.x,y:p.y,face:p.face});
  game.vfx('spawn/poof',p.x,p.y,{layer:'back',life:.45});return true;
}
function targetFor(game,x,y,range=Infinity,exclude,needSight=true,bounds=null){
  let best=null,distance=range;
  for(const e of game.enemies){if(e.dead||e.spawnT>0||exclude?.has(e.id)||(bounds&&Math.hypot(e.x-bounds.x,e.y-bounds.y)>bounds.r))continue;const d=Math.hypot(e.x-x,e.y-y);if(d<=distance&&(!needSight||los(game.map,x,y,e.x,e.y))){best=e;distance=d;}}
  return best;
}
function props(game,p,damage,contains,ultimate=false){
  if(!game.host)return;
  for(const [key,c] of Object.entries(game.map.crates)){
    if(c.dead)continue;const i=Number(key),x=(i%game.map.W)*T+T/2,y=Math.floor(i/game.map.W)*T+T/2;
    if(contains(x,y))game.damageTile(i,damage,p,{noUltGain:ultimate});
  }
}
function pulse(game,p,kind,x,y,r,life=.35){
  game.petFields.push({id:nid(),owner:p.id,kind,x,y,r,t:0,life,max:life,delay:0});
}
function strike(game,p,x,y,r,damage,ultimate=false,bounds=null){
  game.line(x,y-110,x,y-8,'#fff4b2',3,.25,'zap');pulse(game,p,'zap',x,y,r);
  for(const e of game.enemies){if(e.dead||e.spawnT>0||Math.hypot(e.x-x,e.y-y)>r+e.r||(bounds&&Math.hypot(e.x-bounds.x,e.y-bounds.y)>bounds.r))continue;game.hit(e,damage,{p,elem:'thunder',noUltGain:ultimate,noReact:true});if(!e.boss)e.stunT=Math.max(e.stunT||0,.18);}
  props(game,p,damage,(cx,cy)=>Math.hypot(cx-x,cy-y)<=r+12&&(!bounds||Math.hypot(cx-bounds.x,cy-bounds.y)<=bounds.r),ultimate);
  game.sound('shoot_thunder',.1);
}
function shot(game,p,angle,mounted=false){
  const q=p.pet,def=PETS[q.id],m=petMuzzle(p),dmg=mounted?CHARS[p.cid].atk.dmg*1.25:5+q.stage*4;
  game.bullets.push(game.mkBullet(p,{x:m.x,y:m.y,h:q.y-m.y,a:angle,spd:q.id==='fox'?360:290,dmg,elem:def.elem,kind:'pet_'+q.id,r:q.id==='dragon'?5:3,life:1.15,pierce:mounted&&q.id==='phoenix'?2:0,slow:q.id==='phoenix'?.5:0}));
  game.sound(q.id==='fox'?'shoot_thunder':q.id==='phoenix'?'shoot_water':'shoot_dragon',.12);
}
export function mountedAttack(game,p,angle,target){
  if(!p.mounted||!p.pet)return false;if(!game.host)return true;
  p.pet.face=p.face=angle;
  if(p.pet.id==='fox'){foxArc(game,p,angle);return true;}
  if(p.pet.id==='dragon'){
    p.pet.castT=Math.max(p.pet.castT,.3);p.pet.castMax=Math.max(p.pet.castMax,.3);
    const m=mountedAttackOrigin(p),a=target?Math.atan2(target.y-target.r-m.y,target.x-m.x):angle;
    game.bullets.push(game.mkBullet(p,{x:m.x,y:m.y,h:0,a,spd:DRAGON_FIREBALL.speed,dmg:CHARS[p.cid].atk.dmg*DRAGON_FIREBALL.damageScale,elem:'dragon',kind:'pet_dragon',r:DRAGON_FIREBALL.radius,life:DRAGON_FIREBALL.range/DRAGON_FIREBALL.speed,big:true}));
    game.sound('shoot_dragon',.08);return true;
  }
  const m=petMuzzle(p),aim=target?Math.atan2(target.y-target.r-m.y,target.x-m.x):angle;shot(game,p,aim,true);return true;
}
function foxArc(game,p,angle){
  const bounds={x:p.x,y:p.y,r:FOX_RIDE_RANGE},used=new Set(),damage=CHARS[p.cid].atk.dmg*1.25,m=petMuzzle(p);
  const candidates=()=>[
    ...game.enemies.filter(e=>!e.dead&&e.spawnT<=0).map(e=>({key:'e'+e.id,x:e.x,y:e.y,r:e.r,e})),
    ...Object.entries(game.map.crates).filter(([,c])=>!c.dead).map(([i])=>({key:'p'+i,x:(i%game.map.W)*T+T/2,y:Math.floor(i/game.map.W)*T+T/2,r:14,i:Number(i)}))
  ].filter(v=>!used.has(v.key)&&Math.hypot(v.x-bounds.x,v.y-bounds.y)<=bounds.r);
  const e=targetFor(game,p.x,p.y,FOX_RIDE_RANGE,null,true);
  if(e)angle=Math.atan2(e.y-p.y,e.x-p.x);
  let x=p.x,y=p.y,vx=m.x,vy=m.y;
  for(let bounce=0;bounce<=3;bounce++){
    let hit=null,distance=bounce?110:FOX_RIDE_RANGE;
    if(bounce){
      const clear=(v)=>{const n=Math.ceil(Math.hypot(v.x-x,v.y-y)/4),start=Math.floor(y/T)*game.map.W+Math.floor(x/T),end=Math.floor(v.y/T)*game.map.W+Math.floor(v.x/T);for(let i=1;i<n;i++){const px=x+(v.x-x)*i/n,py=y+(v.y-y)*i/n,tile=Math.floor(py/T)*game.map.W+Math.floor(px/T);if(tile!==start&&tile!==end&&BLOCKS_SHOT(tileAt(game.map,px,py)))return false;}return true;};
      for(const v of candidates()){const d=Math.hypot(v.x-x,v.y-y);if(d<distance&&clear(v)){hit=v;distance=d;}}
      if(!hit)break;
    }else{
      // Trace the first arc, including cover, even when no monster can be selected.
      let wall=FOX_RIDE_RANGE;
      for(let d=2;d<=FOX_RIDE_RANGE;d+=2)if(tileAt(game.map,x+Math.cos(angle)*d,y+Math.sin(angle)*d)===WALL){wall=d;break;}
      distance=wall;
      for(const v of candidates()){const dx=v.x-x,dy=v.y-y,along=dx*Math.cos(angle)+dy*Math.sin(angle),across=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));if(along>=0&&across<=v.r+4){const entry=Math.max(0,along-Math.sqrt(Math.max(0,(v.r+4)**2-across**2)));if(entry<distance){hit=v;distance=entry;}}}
      if(!hit){game.line(vx,vy,vx+Math.cos(angle)*distance,vy+Math.sin(angle)*distance,'#fff2a0',3,.22,'zap',p.id);break;}
    }
    const endY=hit.y-(hit.e?.r||p.y-m.y);game.line(vx,vy,hit.x,endY,'#fff2a0',3,.24,'zap',bounce===0?p.id:null);used.add(hit.key);
    if(hit.e){game.hit(hit.e,damage,{p,elem:'thunder',noReact:true});if(!hit.e.boss)hit.e.stunT=Math.max(hit.e.stunT||0,.12);}
    else game.damageTile(hit.i,damage,p);
    x=hit.x;y=hit.y;vx=x;vy=endY;
  }
  game.sound('shoot_thunder',.12);
}
function channel(game,p,kind,options,duration,ultimate=false){
  p.pet.castT=duration+.7;p.pet.castMax=p.pet.castT;
  game.petFields=game.petFields.filter(f=>f.owner!==p.id||f.kind==='purge');
  game.petFields.push({id:nid(),owner:p.id,kind,...options,t:0,life:duration+.35,max:duration+.35,delay:.35,tick:0,ultimate});
}
function lightning(game,p,targets,damage,from){
  const used=new Set(),bounds={x:p.pet.x,y:p.pet.y,r:FOX_RIDE_RANGE};let x=from.x,y=from.y,groundY=p.pet.y;
  for(let i=0;i<targets;i++){const e=targetFor(game,x,groundY,i?145:FOX_RIDE_RANGE,used,true,bounds);if(!e)break;used.add(e.id);game.line(x,y,e.x,e.y-e.r,'#fff2a0',3,.24,'zap');game.hit(e,damage,{p,elem:'thunder',noUltGain:from.ultimate,noReact:from.ultimate});props(game,p,damage,(cx,cy)=>Math.hypot(cx-e.x,cy-e.y)<38&&Math.hypot(cx-bounds.x,cy-bounds.y)<=bounds.r);if(!e.boss)e.stunT=Math.max(e.stunT||0,.15);x=e.x;y=e.y-e.r;groundY=e.y;}
}
function skill(game,p,target,angle,ultimate=false){
  const q=p.pet;q.face=angle;const m=petMuzzle(p),aim=target?Math.atan2(target.y-target.r-m.y,target.x-m.x):angle;
  if(q.id==='dragon')channel(game,p,'fire',{a:aim,x:m.x,y:m.y,length:ultimate?320:180+q.stage*18,width:ultimate?64:25+q.stage*5,damage:ultimate?22:5+q.stage*3},ultimate?3.2:1.6,ultimate);
  else if(q.id==='phoenix')channel(game,p,'snow',{x:ultimate?p.x:target?.x??p.x+Math.cos(angle)*140,y:ultimate?p.y:target?.y??p.y+Math.sin(angle)*140,r:ultimate?PHOENIX_STORM_RADIUS:54+q.stage*10,damage:ultimate?18:5+q.stage*3,follow:ultimate},ultimate?5:3.2,ultimate);
  else{q.castT=q.castMax=1.1;game.after(.35,()=>{if(!p.dead&&!p.downed&&q===p.pet)lightning(game,p,2+q.stage,10+q.stage*5,petMuzzle(p));});game.vfx('lightning/thunderclap',m.x,m.y,{life:.7,size:35});}
}
export function mountedUlt(game,p,angle,target){
  if(!p.mounted||!p.pet)return false;if(!game.host)return true;
  game.text(p.x,p.y-95,PETS[p.pet.id].rideUlt,PETS[p.pet.id].color,1.5,1.2);
  if(p.pet.id==='dragon'){
    game.petFields=game.petFields.filter(f=>f.owner!==p.id||f.kind!=='tornado');
    const claimed=new Set();
    for(let i=0;i<DRAGON_TORNADO.count;i++){
      const a=angle+(i-(DRAGON_TORNADO.count-1)/2)*.65,e=targetFor(game,p.x,p.y,DRAGON_TORNADO.range,claimed,false);if(e)claimed.add(e.id);
      game.petFields.push({id:nid(),owner:p.id,kind:'tornado',ultimate:true,x:p.x+Math.cos(a)*28,y:p.y+Math.sin(a)*28,a,r:DRAGON_TORNADO.radius,origin:{x:p.x,y:p.y},targetId:e?.id??null,t:0,delay:0,life:DRAGON_TORNADO.duration,max:DRAGON_TORNADO.duration,tick:0,damage:DRAGON_TORNADO.damage});
    }
    p.pet.castT=p.pet.castMax=.4;game.sound('shoot_dragon',.18);
  }else if(p.pet.id==='fox'){if(!targetFor(game,p.x,p.y,FOX_RIDE_RANGE,null,false))return true;Object.assign(p.pet,{blinkT:1,blinkHits:0,blinkOrigin:{x:p.x,y:p.y,r:FOX_RIDE_RANGE},blinkRoom:game.roomIdx,castT:1,castMax:1});p.petWarpUntil=game.time+1.15;}
  else skill(game,p,target,angle,true);return true;
}
export function releaseEmptyBlink(game,p){
  const q=p.pet;if(!game.host||!(q?.blinkT>0))return;
  if(q.blinkRoom!==game.roomIdx||!p.mounted||!targetFor(game,p.x,p.y,FOX_RIDE_RANGE*2,null,false,q.blinkOrigin)){q.blinkT=0;q.castT=0;p.petWarpUntil=game.time;}
}
function blink(game,p,dt){
  releaseEmptyBlink(game,p);
  const q=p.pet;if(!(q.blinkT>0))return;
  if(q.blinkRoom!==game.roomIdx||!p.mounted){q.blinkT=0;return;}
  const elapsed=1-q.blinkT+dt;
  while(q.blinkHits<5&&elapsed>=q.blinkHits*.2){
    const e=targetFor(game,p.x,p.y,FOX_RIDE_RANGE*2,null,false,q.blinkOrigin);if(e){
      const old={x:p.x,y:p.y};let spot=null;
      for(let j=0;j<8;j++){const a=q.blinkHits*Math.PI*.8+j*Math.PI/4,x=e.x+Math.cos(a)*(e.r+p.r+8),y=e.y+Math.sin(a)*(e.r+p.r+8);if(clearLanding(game.map,x,y,p.r)){spot={x,y};break;}}
      spot||=safeLanding(game.map,e.x,e.y,p.r);
      if(spot){
        const length=Math.hypot(spot.x-old.x,spot.y-old.y),n=Math.max(2,Math.min(5,Math.ceil(length/25)));
        for(let j=0;j<n;j++){const u=j/n;game.petFields.push({id:nid(),owner:p.id,kind:'afterimage',x:old.x+(spot.x-old.x)*u,y:old.y+(spot.y-old.y)*u,face:p.face,anim:q.anim,castT:q.castT,castMax:q.castMax,t:0,delay:0,life:.36,max:.36});}
        Object.assign(p,spot);q.x=p.x;q.y=p.y;q.warpSeq++;game.line(old.x,old.y-25,p.x,p.y-25,'#ffe7a1',4,.18,'zap');
      }
      strike(game,p,e.x,e.y,64,30,true,q.blinkOrigin);
    }else{q.blinkT=0;q.castT=0;p.petWarpUntil=game.time;return;}q.blinkHits++;
    releaseEmptyBlink(game,p);if(q.blinkT<=0)return;
  }
  q.blinkT=Math.max(0,q.blinkT-dt);p.moving=false;
}
export function updatePets(game,dt){
  if(game.pvp)return;
  for(const p of game.players){const q=p.pet;if(!q)continue;p.mountCd=Math.max(0,(p.mountCd||0)-dt);q.anim+=dt;q.castT=Math.max(0,q.castT-dt);
    if(p.dead||p.downed){p.mounted=false;q.moving=false;q.castT=0;q.blinkT=0;continue;}
    const target=game.host?updateCompanion(game,p,dt):null;if(q.moving)q.walkT=(q.walkT||0)+dt;if(!game.host)continue;
    blink(game,p,dt);if(game.petTrial)p.ult=Math.min(1,p.ult+dt*.1);
    if(q.id==='fox'&&game.phase==='fight'){q.auraCd=(q.auraCd??10)-dt;if(q.auraCd<=0){q.auraCd+=10;game.bullets=game.bullets.filter(b=>b.side!=='e');pulse(game,p,'purge',q.x,q.y,Math.hypot(game.map.pxW,game.map.pxH),.7);}}
    q.attackCd-=dt;q.skillCd-=dt;if(p.mounted||q.castT>0||game.phase!=='fight')continue;
    if(!target)continue;const facing=Math.atan2(target.y-q.y,target.x-q.x);q.face=facing;const m=petMuzzle(p),a=Math.atan2(target.y-target.r-m.y,target.x-m.x);
    if(q.skillCd<=0){skill(game,p,target,facing);q.skillCd=PETS[q.id].skillCd;}else if(q.attackCd<=0){shot(game,p,a);q.attackCd=q.id==='fox'?.7:1.1;}
  }
  for(const f of game.petFields){f.t+=dt;f.life-=dt;const p=game.player(f.owner);if(!p?.pet||p.dead||p.downed){f.life=0;continue;}
    if(f.follow){f.x=p.x;f.y=p.y;}
    if(f.kind==='tornado'&&game.host){
      const valid=e=>e&&!e.dead&&e.spawnT<=0&&Math.hypot(e.x-f.origin.x,e.y-f.origin.y)<=DRAGON_TORNADO.range;
      let e=game.enemies.find(e=>e.id===f.targetId);
      if(!valid(e)){
        const claimed=new Set(game.petFields.filter(o=>o!==f&&o.owner===p.id&&o.kind==='tornado'&&o.life>0).map(o=>o.targetId));
        e=targetFor(game,f.x,f.y,DRAGON_TORNADO.range,claimed,false,{...f.origin,r:DRAGON_TORNADO.range})||targetFor(game,f.x,f.y,DRAGON_TORNADO.range,null,false,{...f.origin,r:DRAGON_TORNADO.range});f.targetId=e?.id??null;
      }
      if(valid(e)){const dx=e.x-f.x,dy=e.y-f.y,d=Math.hypot(dx,dy);f.a=Math.atan2(dy,dx);const step=Math.min(d,DRAGON_TORNADO.speed*dt);f.x+=Math.cos(f.a)*step;f.y+=Math.sin(f.a)*step;}
      else{f.x+=Math.cos(f.a)*45*dt;f.y+=Math.sin(f.a)*45*dt;}
      f.x=Math.max(T+f.r,Math.min(game.map.pxW-T-f.r,f.x));f.y=Math.max(T+f.r,Math.min(game.map.pxH-T-f.r,f.y));
    }
    if(f.kind==='fire'){const m=petMuzzle(p);f.x=m.x;f.y=m.y;f.height=p.pet.y-m.y;if(p.mounted)f.a=p.input.aim==null&&p.target?Math.atan2(p.target.y-p.target.r-m.y,p.target.x-m.x):p.face;f.visibleLength=f.length;
      if(!f.ultimate)for(let d=8;d<f.length;d+=8){const tile=tileAt(game.map,f.x+Math.cos(f.a)*d,f.y+Math.sin(f.a)*d+(p.pet.y-m.y));if(BLOCKS_SHOT(tile)){f.visibleLength=d;break;}}
    }
    if(!game.host||f.life<=0||f.t<f.delay||!['fire','snow','tornado'].includes(f.kind))continue;
    f.tick-=dt;if(f.tick>0)continue;f.tick=f.kind==='fire'?.25:DRAGON_TORNADO.interval;
    for(const e of game.enemies){if(e.dead||e.spawnT>0)continue;const inside=f.kind==='tornado'?Math.hypot(e.x-f.x,e.y-f.y)<f.r+e.r:f.kind==='snow'?Math.hypot(e.x-f.x,e.y-f.y)<f.r+e.r&&(f.ultimate||los(game.map,f.x,f.y,e.x,e.y)):inFire(f,e.x,e.y-e.r,e.r);if(!inside)continue;
      game.hit(e,f.damage,{p,elem:f.kind==='snow'?'water':'dragon',noUltGain:f.ultimate,noReact:true});if(f.kind==='snow'){e.slowT=Math.max(e.slowT||0,.65);e.slowK=.45;if(!e.boss&&f.t%1.6<.5)e.freezeT=Math.max(e.freezeT||0,.35);}}
    const height=f.height??p.pet.y-petMuzzle(p).y;
    props(game,p,f.damage,(x,y)=>f.kind==='tornado'?Math.hypot(x-f.x,y-f.y)<f.r+12:f.kind==='snow'?Math.hypot(x-f.x,y-f.y)<f.r+12&&(f.ultimate||los(game.map,f.x,f.y,x,y)):inFire(f,x,y-height,12),f.ultimate);
    if(f.kind==='tornado'&&p.mounted&&p.pet.id==='dragon'){
      const m=game.map;
      const reach=f.length||f.r+T,cx=f.x,cy=f.kind==='tornado'?f.y:f.y+height;
      for(let ty=Math.max(1,Math.floor((cy-reach)/T));ty<=Math.min(m.H-2,Math.ceil((cy+reach)/T));ty++)for(let tx=Math.max(1,Math.floor((cx-reach)/T));tx<=Math.min(m.W-2,Math.ceil((cx+reach)/T));tx++){
        const i=ty*m.W+tx,inside=f.kind==='tornado'?Math.hypot(tx*T+T/2-f.x,ty*T+T/2-f.y)<=f.r+T/2:inFire(f,tx*T+T/2,ty*T+T/2-height,T/2);if(inside){if(m.t[i]===WALL)game.damageWall(i,f.damage,p);else if(m.t[i]===BUSH)game.burnBush(i,p);}
      }
    }
  }
  game.petFields=game.petFields.filter(f=>f.life>0);
}

export function drawPet(ctx,player,time,ride=false) {
  const q=player.pet,assets=A.pets;if(!q||!assets||player.dead||player.downed)return;
  const id=`${q.id}-${q.stage}`,actor=assets.meta.actors[id],clips=assets.meta.clips[id],scale=petScale(player)*(actor.render_scale??1),{pos}=followerFrame(q,actor,clips);
  ctx.save();ctx.translate(Math.round(q.x),Math.round(q.y));if(Math.cos(q.face)<0)ctx.scale(-1,1);
  if(!flyingMount(player)){ctx.fillStyle='rgba(15,12,28,.28)';ctx.beginPath();ctx.ellipse(0,0,ride?29:19,ride?9:6,0,0,Math.PI*2);ctx.fill();}
  ctx.translate(0,-flightLift(player));
  const cw=actor.cw||assets.meta.cw,ch=actor.ch||assets.meta.ch,anchor=actor.anchor||[cw/2,ch-8];
  ctx.imageSmoothingEnabled=!!actor.native_resolution;if(actor.native_resolution)ctx.imageSmoothingQuality='high';ctx.drawImage(assets.images?.[actor.page||0]||assets.image,pos[0],pos[1],cw,ch,-anchor[0]*scale,-anchor[1]*scale,cw*scale,ch*scale);ctx.restore();
}
export function drawMountedPet(ctx,player,time,shadow=true) {
  const mount=mountAsset(player),actor=mount?.meta.actors[player.cid];if(!actor)return false;
  const q=player.pet,{cw,ch,anchor,scale}=mount.meta;
  const {pos}=mountedFrame(q,actor);
  ctx.save();ctx.translate(player.x??q.x,player.y??q.y);if(Math.cos(player.face??q.face)<0)ctx.scale(-1,1);ctx.imageSmoothingEnabled=false;
  if(shadow){ctx.fillStyle='rgba(15,12,28,.28)';ctx.beginPath();ctx.ellipse(0,0,30,9,0,0,Math.PI*2);ctx.fill();}
  ctx.drawImage(mount.image,pos[0],pos[1],cw,ch,-anchor[0]*scale,-anchor[1]*scale,cw*scale,ch*scale);ctx.restore();return true;
}
// Clients only interpolate the host's companion state; damage and AI never run twice.
export function animateClientPets(game,dt) {
  for(const p of game.players) {
    const q=p.pet;if(!q)continue;
    q.anim+=dt;if(q.moving)q.walkT=(q.walkT||0)+dt;q.castT=Math.max(0,q.castT-dt);q.blinkT=Math.max(0,(q.blinkT||0)-dt);
    if(p.mounted){q.x=p.x;q.y=p.y;q.face=p.face;q.moving=p.moving;}
    else if(q.tx!=null){q.x+=(q.tx-q.x)*Math.min(1,dt*16);q.y+=(q.ty-q.y)*Math.min(1,dt*16);}
  }
  for(const f of game.petFields||[]){f.t+=dt;f.life-=dt;if(f.follow){const p=game.player(f.owner);if(p){f.x=p.x;f.y=p.y;}}}
  game.petFields=(game.petFields||[]).filter(f=>f.life>0);
}
export function drawPetFields(ctx,game,time,layer='back') {
  for(const f of game.petFields||[]) {
    if(f.kind==='afterimage'||f.kind==='tornado')continue;
    if(layer==='front'&&!f.ultimate)continue;
    if(layer==='back'&&f.ultimate&&f.kind!=='snow')continue;
    if(f.t<f.delay)continue;
    const fade=Math.min(1,(f.t-f.delay)*8,f.life*4);ctx.save();ctx.globalAlpha=fade;
    if(f.kind==='fire') {
      const len=f.visibleLength||f.length,cs=Math.cos(f.a),sn=Math.sin(f.a),step=game.fx?.lite?8:5;
      // World-aligned blocks retain the pixel style at every aim angle; hot tongues travel outward.
      for(let d=2;d<len;d+=step) {
        const half=fireHalfWidth(f,d),shift=Math.sin(d*.055-time*19)*(2+d/f.length*5);
        for(let v=-half;v<=half;v+=step) {
          const edge=Math.abs(v-shift)/half,noise=Math.sin(d*.63+v*1.71-time*26)*.11;
          if(edge>1+noise || (d>len-12 && Math.sin(v*2+d-time*24)<.1))continue;
          const heat=edge+noise;ctx.fillStyle=heat<.22?'#fff3bc':heat<.48?'#ffc34f':heat<.77?'#ff732e':'#c93632';
          const x=f.x+cs*d-sn*v,y=f.y+sn*d+cs*v;ctx.fillRect(Math.round(x/2)*2,Math.round(y/2)*2,step+1,step+1);
        }
      }
      for(let i=0;i<16;i++){const d=((time*120+i*29)%Math.max(1,len)),v=Math.sin(i*2.4+time*5)*f.width*d/f.length*1.2;ctx.fillStyle=i%2?'#ffd967':'#ff8b3b';ctx.fillRect(Math.round((f.x+cs*d-sn*v)/2)*2,Math.round((f.y+sn*d+cs*v)/2)*2,2,2);}
    } else if(f.kind==='zap'||f.kind==='purge'){
      const u=1-f.life/f.max,r=f.kind==='purge'?Math.min(f.r,u*f.r):f.r*(.75+u*.25);
      ctx.strokeStyle='#fff4be';ctx.lineWidth=f.kind==='purge'?3:2;ctx.beginPath();
      for(let i=0;i<=64;i++){const a=i*Math.PI/32,rr=r+(i%2?3:-2),x=f.x+Math.cos(a)*rr,y=f.y+Math.sin(a)*rr*.7;(i?ctx.lineTo(x,y):ctx.moveTo(x,y));}ctx.stroke();
      if(f.kind==='zap'){ctx.fillStyle='rgba(255,225,143,.16)';ctx.beginPath();ctx.ellipse(f.x,f.y,f.r,f.r*.7,0,0,Math.PI*2);ctx.fill();}
    } else if(f.kind==='snow'&&f.ultimate){
      // A deep frost floor and bright orbiting ice ribbons remain readable over scenery.
      if(layer==='back'){
        const frost=ctx.createRadialGradient(f.x,f.y,8,f.x,f.y,f.r);
        frost.addColorStop(0,'rgba(24,91,174,.48)');frost.addColorStop(.68,'rgba(70,169,229,.3)');frost.addColorStop(1,'rgba(158,236,255,.06)');
        ctx.fillStyle=frost;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(151,232,255,.45)';ctx.lineWidth=2;
        for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(f.x,f.y,f.r*(.28+i*.19),time*1.8+i*1.6,time*1.8+i*1.6+2.2);ctx.stroke();}
      }else{
        ctx.lineCap='round';
        for(let i=0;i<7;i++){
          const a=time*(i%2?2.5:1.9)+i*2.4,r=f.r*(.46+(i%3)*.2),cy=f.y-12-(i%3)*9;
          ctx.strokeStyle=i%2?'#73d8ff':'#d5f9ff';ctx.globalAlpha=fade*(i%2?.65:.85);ctx.lineWidth=i%2?3:2;
          ctx.beginPath();ctx.ellipse(f.x,cy,r,r*.68,0,a,a+1.45);ctx.stroke();
        }
        ctx.globalAlpha=fade;
        for(let i=0;i<(game.fx?.lite?30:58);i++){
          const a=i*2.399+time*(1.4+(i%3)*.25),r=f.r*Math.sqrt((i*37%97)/97),x=f.x+Math.cos(a)*r,y=f.y+Math.sin(a)*r-((time*46+i*11)%46);
          ctx.fillStyle=i%3?'#a8ecff':'#ffffff';ctx.fillRect(Math.round(x),Math.round(y),2,4);
          if(i%6===0){ctx.fillRect(Math.round(x)-3,Math.round(y)+1,8,2);ctx.fillRect(Math.round(x),Math.round(y)-2,2,8);}
        }
      }
    } else {
      ctx.fillStyle='rgba(96,182,241,.14)';ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();
      for(let i=0;i<(game.fx?.lite?35:85);i++) {const a=i*2.4+time*(1+i%3*.3),r=Math.sqrt((i*37%97)/97)*f.r,x=Math.round(f.x+Math.cos(a)*r),y=Math.round(f.y+Math.sin(a)*r-((time*32+i*7)%23)+11);ctx.fillStyle=i%3?'#b7f1ff':'#fff';ctx.fillRect(x,y,i%4?2:3,i%4?2:3);}
      ctx.strokeStyle='#91dbff';ctx.lineWidth=1;ctx.globalAlpha=fade*.5;
      for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(f.x,f.y,f.r*(.4+i*.22),time*3+i,time*3+i+1.8);ctx.stroke();}
    }
    ctx.restore();
  }
}
export function drawPetAfterimages(ctx,game,time){
  for(const f of game.petFields||[]){
    if(f.kind!=='afterimage')continue;const p=game.player(f.owner);if(!p?.mounted||p.pet?.id!=='fox'||p.dead||p.downed)continue;
    const ghost={...p,x:f.x,y:f.y,face:f.face,moving:false,hurtT:0,pet:{...p.pet,x:f.x,y:f.y,face:f.face,anim:f.anim,castT:f.castT,castMax:f.castMax,moving:false}};
    ctx.save();ctx.globalAlpha=.22*Math.max(0,f.life/f.max);drawMountedPet(ctx,ghost,time,false);ctx.restore();
  }
}
