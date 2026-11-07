// Battle companions: authority stays with the host; render state is plain snapshot data.
import { PETS, validPet } from "./petdata.js";
import { A } from "./assets.js";
import { moveCircle, los, tileAt, BLOCKS_SHOT } from "./map.js";
import { CHARS } from "./data.js";
import { nid } from "./util.js";

export function attachPet(game, player, value) {
  const pet = !game.pvp && validPet(value);
  if (!pet) return;
  player.pet = { ...pet, x: player.x, y: player.y, r: 8, face: 0, anim: 0, moving: false, castT: 0, castMax: 0, attackCd: .5, skillCd: 2, route: [], room: -1 };
  const def = PETS[pet.id];player.st[def.stat] *= 1 + def.bonus[pet.stage - 1];
  player.mounted = false;
}
export function resetPet(game, player) {
  if (!player.pet) return;
  Object.assign(player.pet, { x: player.x, y: player.y + 12, route: [], room: game.roomIdx, castT: 0, moving: false });
}
export function petScale(player) { return player.mounted ? 1.04 : [1.08,.95,.85][player.pet.stage - 1]; }
function mountAsset(player) { return player.mounted && player.pet?.stage===3 ? A.mounts?.[player.pet.id] || null : null; }
export function mountedVisualHeight(player) {
  const mount=mountAsset(player),actor=mount?.meta.actors[player.cid];return actor?(mount.meta.anchor[1]-actor.top)*mount.meta.scale:null;
}
export function petMuzzle(player) {
  const mount=mountAsset(player),actor=mount?.meta.actors[player.cid];
  if(actor){const point=actor.mouth,anchor=mount.meta.anchor,scale=mount.meta.scale;return{x:player.pet.x+(point[0]-anchor[0])*scale*(Math.cos(player.pet.face)>=0?1:-1),y:player.pet.y+(point[1]-anchor[1])*scale};}
  const q = player.pet, meta = A.pets?.meta.actors[`${q.id}-${q.stage}`], point = (q.castT>0 && meta?.cast_mouth) || meta?.mouth || [89,60], anchor = meta?.anchor || [64,96], scale = petScale(player);
  return { x: q.x + (point[0] - anchor[0]) * scale * (Math.cos(q.face) >= 0 ? 1 : -1), y: q.y + (point[1] - anchor[1]) * scale };
}
export function toggleMount(game, player) {
  if (game.pvp || !player.pet || player.pet.stage !== 3 || player.dead || player.downed || player.mountCd > 0) return false;
  player.mounted = !player.mounted;player.mountCd = .4;
  player.pet.castT = 0;player.pet.route = [];
  game.petFields = (game.petFields || []).filter(f => f.owner !== player.id);
  if (player.mounted) Object.assign(player.pet,{ x:player.x, y:player.y, face:player.face });
  game.vfx('spawn/poof',player.x,player.y,{layer:'back',life:.45});
  return true;
}
function targetFor(game,x,y,range,exclude) {
  let best=null,distance=range;
  for(const e of game.enemies) {
    if(e.dead || e.spawnT>0 || exclude?.has(e.id))continue;
    const d=Math.hypot(e.x-x,e.y-y);
    if(d<distance && los(game.map,x,y,e.x,e.y)){best=e;distance=d;}
  }
  return best;
}
function shot(game,player,angle,mounted=false) {
  const q=player.pet,def=PETS[q.id],m=petMuzzle(player),base=mounted?CHARS[player.cid].atk.dmg*1.25:5+q.stage*4;
  const angles=mounted && q.id!=='dragon'?[-.14,0,.14]:[0];
  for(const offset of angles) {
    const b=game.mkBullet(player,{x:m.x,y:m.y,h:q.y-m.y,a:angle+offset,spd:q.id==='fox'?360:290,dmg:base*(angles.length>1?.62:1),elem:def.elem,kind:'pet_'+q.id,r:q.id==='dragon'?5:3,life:1.15,pierce:mounted&&q.id==='phoenix'?2:0,slow:q.id==='phoenix'?.5:0});
    game.bullets.push(b);
  }
  game.sound(q.id==='fox'?'shoot_thunder':q.id==='phoenix'?'shoot_water':'shoot_dragon',.12);
}
export function mountedAttack(game,player,angle,target) {
  if(!player.mounted || !player.pet)return false;
  player.pet.face=angle;const m=petMuzzle(player),aim=target?Math.atan2(target.y-target.r-m.y,target.x-m.x):angle;
  shot(game,player,aim,true);return true;
}
function channel(game,player,kind,options,duration,ultimate=false) {
  const q=player.pet;q.castT=duration+.7;q.castMax=q.castT;
  game.petFields=(game.petFields||[]).filter(f=>f.owner!==player.id);
  game.petFields.push({id:nid(),owner:player.id,kind,...options,t:0,life:duration+.35,max:duration+.35,delay:.35,tick:0,ultimate});
}
function lightning(game,player,targets,damage,from) {
  const used=new Set();let x=from.x,y=from.y,groundY=player.pet.y;
  for(let i=0;i<targets;i++) {
    const e=targetFor(game,x,groundY,i?145:310,used);if(!e)break;used.add(e.id);
    game.line(x,y,e.x,e.y-e.r,'#fff2a0',3,.24,'zap');game.hit(e,damage,{p:player,elem:'thunder',noUltGain:from.ultimate,noReact:from.ultimate});
    if(!e.boss)e.stunT=Math.max(e.stunT||0,.15);
    x=e.x;y=e.y-e.r;groundY=e.y;
  }
}
function skill(game,player,target,angle,ultimate=false) {
  const q=player.pet;q.face=angle;const m=petMuzzle(player),aim=target?Math.atan2(target.y-target.r-m.y,target.x-m.x):angle;
  if(q.id==='dragon') channel(game,player,'fire',{a:aim,x:m.x,y:m.y,length:ultimate?320:180+q.stage*18,width:ultimate?64:25+q.stage*5,damage:ultimate?22:5+q.stage*3},ultimate?3.2:1.6,ultimate);
  else if(q.id==='phoenix') {
    const x=target?.x??player.x+Math.cos(angle)*140,y=target?.y??player.y+Math.sin(angle)*140;
    channel(game,player,'snow',{x,y,r:ultimate?124:54+q.stage*10,damage:ultimate?18:5+q.stage*3},ultimate?5:3.2,ultimate);
  } else {
    q.castT=1.1;q.castMax=1.1;
    const waves=ultimate?3:1;for(let n=0;n<waves;n++)game.after(.35+n*.28,()=>{if(!player.dead&&!player.downed)lightning(game,player,ultimate?7:2+q.stage,ultimate?30:10+q.stage*5,{...petMuzzle(player),ultimate})});
    game.vfx('lightning/thunderclap',m.x,m.y,{life:.7,size:ultimate?80:35});
  }
}
export function mountedUlt(game,player,angle,target) {
  if(!player.mounted || !player.pet)return false;
  game.text(player.x,player.y-95,PETS[player.pet.id].rideUlt,PETS[player.pet.id].color,1.5,1.2);
  skill(game,player,target,angle,true);return true;
}
function follow(game,player,q,dt) {
  if(q.room!==game.roomIdx || Math.hypot(q.x-player.x,q.y-player.y)>260) {resetPet(game,player);return;}
  if(player.mounted){q.x=player.x;q.y=player.y;q.face=player.face;q.moving=player.moving;return;}
  const route=q.route,last=route.at(-1);
  if(!last || Math.hypot(last.x-player.x,last.y-player.y)>10)route.push({x:player.x,y:player.y});
  while(route.length>24)route.shift();
  while(route.length>1 && Math.hypot(q.x-route[0].x,q.y-route[0].y)<14)route.shift();
  const distance=Math.hypot(q.x-player.x,q.y-player.y);
  let goal=route[0]||player;
  if(los(game.map,q.x,q.y,player.x,player.y) && distance<100) {goal=player;route.splice(0,Math.max(0,route.length-1));}
  const dx=goal.x-q.x,dy=goal.y-q.y,d=Math.hypot(dx,dy);
  q.moving=(distance>42 || route.length>2) && d>4 && !(q.castT>0);
  if(!q.moving)return;
  const speed=(distance>100?230:160)*dt,oldx=q.x,oldy=q.y;
  moveCircle(game.map,q,dx/d*Math.min(speed,d),dy/d*Math.min(speed,d));
  if(Math.abs(dx)>2)q.face=Math.atan2(dy,dx);
  q.stuck=Math.hypot(q.x-oldx,q.y-oldy)<dt*5?(q.stuck||0)+dt:0;
  if(q.stuck>1.8 && distance>65){q.x=player.x;q.y=player.y;q.route=[];q.stuck=0;}
}
export function updatePets(game,dt) {
  if(game.pvp)return;
  for(const player of game.players) {
    const q=player.pet;if(!q)continue;
    player.mountCd=Math.max(0,(player.mountCd||0)-dt);q.anim+=dt;q.castT=Math.max(0,q.castT-dt);
    if(player.dead||player.downed){player.mounted=false;q.moving=false;q.castT=0;continue;}
    follow(game,player,q,dt);
    if(!game.host)continue;
    if(game.petTrial)player.ult=Math.min(1,player.ult+dt*.1);
    q.attackCd-=dt;q.skillCd-=dt;
    if(player.mounted || q.castT>0 || game.phase!=='fight')continue;
    const target=targetFor(game,q.x,q.y,270);if(!target)continue;
    const facing=Math.atan2(target.y-q.y,target.x-q.x);q.face=facing;
    const m=petMuzzle(player),angle=Math.atan2(target.y-target.r-m.y,target.x-m.x);
    if(q.skillCd<=0){skill(game,player,target,facing);q.skillCd=PETS[q.id].skillCd;}
    else if(q.attackCd<=0){shot(game,player,angle);q.attackCd=q.id==='fox'?.7:1.1;}
  }
  for(const f of game.petFields||[]) {
    f.t+=dt;f.life-=dt;
    const p=game.player(f.owner);if(!p?.pet||p.dead||p.downed){f.life=0;continue;}
    if(f.kind==='fire') {
      const m=petMuzzle(p);f.x=m.x;f.y=m.y;
      if(p.mounted)f.a=p.input.aim==null && p.target?Math.atan2(p.target.y-p.target.r-m.y,p.target.x-m.x):p.face;
      f.visibleLength=f.length;
      for(let d=8;d<f.length;d+=8)if(BLOCKS_SHOT(tileAt(game.map,f.x+Math.cos(f.a)*d,f.y+Math.sin(f.a)*d+(p.pet.y-m.y)))){f.visibleLength=d;break;}
    }
    if(!game.host || f.t<f.delay)continue;
    f.tick-=dt;if(f.tick>0)continue;f.tick=f.kind==='fire'?.25:.4;
    for(const e of game.enemies) {
      if(e.dead||e.spawnT>0)continue;
      let inside=false;
      if(f.kind==='snow')inside=Math.hypot(e.x-f.x,e.y-f.y)<f.r+e.r && los(game.map,f.x,f.y,e.x,e.y);
      else {const dx=e.x-f.x,dy=e.y-e.r-f.y,d=dx*Math.cos(f.a)+dy*Math.sin(f.a),cross=Math.abs(-dx*Math.sin(f.a)+dy*Math.cos(f.a));inside=d>=-e.r&&d<f.visibleLength+e.r&&cross<f.width*Math.max(.1,d/f.length)+e.r;}
      if(!inside)continue;
      game.hit(e,f.damage,{p,elem:f.kind==='fire'?'dragon':'water',noUltGain:f.ultimate,noReact:true});
      if(f.kind==='snow'){e.slowT=Math.max(e.slowT||0,.65);e.slowK=.45;if(!e.boss && f.t%1.6<.5)e.freezeT=Math.max(e.freezeT||0,.35);}
    }
  }
  game.petFields=(game.petFields||[]).filter(f=>f.life>0);
}

export function drawPet(ctx,player,time,ride=false) {
  const q=player.pet,assets=A.pets;if(!q||!assets||player.dead||player.downed)return;
  const id=`${q.id}-${q.stage}`,actor=assets.meta.actors[id],clips=assets.meta.clips[id],scale=petScale(player);
  let clip=clips.idle_e,frame=Math.floor(q.anim*6);
  if(q.castT>0 && clips.cast_e) {
    clip=clips.cast_e;const elapsed=q.castMax-q.castT;
    const [lo,hi]=actor.cast_hold_frames||[3,5],mid=Math.floor((lo+hi)/2);
    frame=elapsed<.35?Math.floor(elapsed*8):q.castT<.375?6+Math.floor((.375-q.castT)*8):q.id==='phoenix'?Math.floor(elapsed*6)%8:[lo,mid,hi,mid][Math.floor(elapsed*6)%4];
  } else if(q.moving && clips.move_e){clip=clips.move_e;frame=Math.floor(q.anim*(q.id==='phoenix'?6:10));}
  const pos=clip[Math.min(clip.length-1,q.castT>0?frame:frame%Math.max(1,clip.length-1))];
  ctx.save();ctx.translate(Math.round(q.x),Math.round(q.y));if(Math.cos(q.face)<0)ctx.scale(-1,1);
  ctx.fillStyle='rgba(15,12,28,.28)';ctx.beginPath();ctx.ellipse(0,0,ride?29:19,ride?9:6,0,0,Math.PI*2);ctx.fill();
  const {cw,ch}=assets.meta,anchor=actor.anchor||[cw/2,ch-8];
  ctx.imageSmoothingEnabled=false;ctx.drawImage(assets.image,pos[0],pos[1],cw,ch,-anchor[0]*scale,-anchor[1]*scale,cw*scale,ch*scale);ctx.restore();
}
export function drawMountedPet(ctx,player,time) {
  const mount=mountAsset(player),actor=mount?.meta.actors[player.cid];if(!actor)return false;
  const q=player.pet,{cw,ch,anchor,scale}=mount.meta;
  let clip=actor.idle_e,frame=Math.floor(q.anim*6);
  if(q.castT>0 && actor.cast_e){clip=actor.cast_e;const t=q.castMax-q.castT;frame=t<.35?Math.floor(t*8):q.castT<.375?6+Math.floor((.375-q.castT)*8):[3,4,5,4][Math.floor(t*6)%4];}
  else if(q.moving && actor.move_e){clip=actor.move_e;frame=Math.floor(q.anim*10);}
  const pos=clip[Math.min(clip.length-1,q.castT>0?frame:frame%Math.max(1,clip.length-1))];
  ctx.save();ctx.translate(Math.round(q.x),Math.round(q.y));if(Math.cos(q.face)<0)ctx.scale(-1,1);ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='rgba(15,12,28,.28)';ctx.beginPath();ctx.ellipse(0,0,30,9,0,0,Math.PI*2);ctx.fill();
  ctx.drawImage(mount.image,pos[0],pos[1],cw,ch,-anchor[0]*scale,-anchor[1]*scale,cw*scale,ch*scale);ctx.restore();return true;
}
export function drawRider(ctx,player,time,back=false) {
  const rider=A.riders,actor=rider?.meta.actors[player.cid];if(!actor)return;
  const {cw,ch,anchor}=rider.meta,frames=actor.idle_e,frame=Math.floor(player.animT*(player.moving?7:5))%Math.max(1,frames.length-1),pos=frames[frame];
  const flip=Math.cos(player.face)<0?-1:1,bob=Math.sin(player.animT*(player.moving?7:3))*(player.moving?.8:.35);
  const offset=back?rider.meta.far_offset:[0,0];
  ctx.save();ctx.translate(Math.round(player.x+(-6+offset[0])*flip),Math.round(player.y-30+offset[1]+bob));ctx.scale(flip,1);ctx.imageSmoothingEnabled=false;
  ctx.drawImage(back?rider.back:rider.image,pos[0],pos[1],cw,ch,-anchor[0],-anchor[1],cw,ch);
  if(!back && player.hurtT>0){ctx.globalAlpha=Math.min(.6,player.hurtT*2);ctx.drawImage(rider.white,pos[0],pos[1],cw,ch,-anchor[0],-anchor[1],cw,ch);}
  ctx.restore();
}
// Clients only interpolate the host's companion state; damage and AI never run twice.
export function animateClientPets(game,dt) {
  for(const p of game.players) {
    const q=p.pet;if(!q)continue;
    q.anim+=dt;q.castT=Math.max(0,q.castT-dt);
    if(p.mounted){q.x=p.x;q.y=p.y;q.face=p.face;q.moving=p.moving;}
    else if(q.tx!=null){q.x+=(q.tx-q.x)*Math.min(1,dt*16);q.y+=(q.ty-q.y)*Math.min(1,dt*16);}
  }
  for(const f of game.petFields||[]){f.t+=dt;f.life-=dt;}
  game.petFields=(game.petFields||[]).filter(f=>f.life>0);
}
export function drawPetFields(ctx,game,time) {
  for(const f of game.petFields||[]) {
    if(f.t<f.delay)continue;
    const fade=Math.min(1,(f.t-f.delay)*8,f.life*4);ctx.save();ctx.globalAlpha=fade;
    if(f.kind==='fire') {
      const len=f.visibleLength||f.length,cs=Math.cos(f.a),sn=Math.sin(f.a),step=game.fx?.lite?8:5;
      // World-aligned blocks retain the pixel style at every aim angle; hot tongues travel outward.
      for(let d=2;d<len;d+=step) {
        const half=3+f.width*d/f.length,shift=Math.sin(d*.055-time*19)*(2+d/f.length*5);
        for(let v=-half;v<=half;v+=step) {
          const edge=Math.abs(v-shift)/half,noise=Math.sin(d*.63+v*1.71-time*26)*.11;
          if(edge>1+noise || (d>len-12 && Math.sin(v*2+d-time*24)<.1))continue;
          const heat=edge+noise;ctx.fillStyle=heat<.22?'#fff3bc':heat<.48?'#ffc34f':heat<.77?'#ff732e':'#c93632';
          const x=f.x+cs*d-sn*v,y=f.y+sn*d+cs*v;ctx.fillRect(Math.round(x/2)*2,Math.round(y/2)*2,step+1,step+1);
        }
      }
      for(let i=0;i<16;i++){const d=((time*120+i*29)%Math.max(1,len)),v=Math.sin(i*2.4+time*5)*f.width*d/f.length*1.2;ctx.fillStyle=i%2?'#ffd967':'#ff8b3b';ctx.fillRect(Math.round((f.x+cs*d-sn*v)/2)*2,Math.round((f.y+sn*d+cs*v)/2)*2,2,2);}
    } else {
      ctx.fillStyle='rgba(96,182,241,.14)';ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();
      for(let i=0;i<(game.fx?.lite?35:85);i++) {const a=i*2.4+time*(1+i%3*.3),r=Math.sqrt((i*37%97)/97)*f.r,x=Math.round(f.x+Math.cos(a)*r),y=Math.round(f.y+Math.sin(a)*r-((time*32+i*7)%23)+11);ctx.fillStyle=i%3?'#b7f1ff':'#fff';ctx.fillRect(x,y,i%4?2:3,i%4?2:3);}
      ctx.strokeStyle='#91dbff';ctx.lineWidth=1;ctx.globalAlpha=fade*.5;
      for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(f.x,f.y,f.r*(.4+i*.22),time*3+i,time*3+i+1.8);ctx.stroke();}
    }
    ctx.restore();
  }
}
