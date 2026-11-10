// Shared authored atlas animation for the lobby and the pet cards.
import { A } from './assets.js';
import { drawPetFields } from './pets.js';
import { PET_SKINS, skinnedFrame, drawAura } from './petskins.js';
const live=new Set(),bounds=new Map();let frame=0;
// wide: true = 512×192 strip, or an explicit [width, height] canvas. stable: one framing for all three clips of the
// stage (so switching idle/move/cast in a showcase never rescales the creature).
// real: true-to-game proportions — every stage of a kind shares one scale (the 终极 framed to the visible area, its
// wing tips may run past the edge; 幼年 / 成长 smaller by their in-game render_scale), standing on one ground line.
// Meant for a canvas shown with object-fit: cover (the visible part is read from the canvas's client size).
export function petPreview(host,id,stage,clip='idle',tight=false,wide=false,alignTop=false,stable=false,real=false){
  const [cw,ch]=Array.isArray(wide)?wide:wide?[512,192]:[256,256];
  const c=document.createElement('canvas');c.width=cw;c.height=ch;c.setAttribute('aria-label',`${id} ${stage} ${clip}`);
  const v={c,id,stage,clip,tight,wide:!!wide,alignTop,stable,real,start:performance.now(),last:null};
  host.replaceChildren(c);live.add(v);c.__pv=v;if(!frame)frame=requestAnimationFrame(draw);return c;
}
/** switch an existing preview's pet / stage / clip in place (no new canvas, restarts the clip) */
export function setPetPreview(c,{id,stage,clip,skin}={}){
  const v=c&&c.__pv;if(!v)return;
  if(skin!==undefined)v.skin=skin||null; // 异色：代码改色 + 光环
  if(id!=null)v.id=id;if(stage!=null)v.stage=stage;if(clip!=null)v.clip=clip;
  v.start=performance.now();v.last=null;v.drawn=0;if(!live.has(v)&&c.isConnected)live.add(v);if(!frame)frame=requestAnimationFrame(draw);
}
function draw(now){
  frame=0;
  for(const v of live){
    if(!v.c.isConnected){live.delete(v);continue;}if(document.hidden||!A.pets)continue;
    const age=Math.max(0,now-v.start)/1000,phase=age%11,clip=v.clip==='lobby'?(phase>=9&&phase<10.333?'cast':'idle'):v.clip;
    const clipAge=v.clip==='lobby'&&phase>=9?(phase<10.333?phase-9:phase-10.333):age;
    const {meta}=A.pets,key=`${v.id}-${v.stage}`,list=meta.clips[key]?.[clip+'_e'];if(!list)continue;
    const actor=meta.actors[key],cw=actor.cw||meta.cw,ch=actor.ch||meta.ch,count=Math.max(1,list.length-1);
    const image=A.pets.images?.[actor.page||0]||A.pets.image;
    const i=Math.floor(clipAge*(clip==='move'?8:6)*(actor.native_resolution?count/8:1))%count,stamp=clip+':'+i,hasEffects=v.clip==='cast'&&v.wide;
    const skin=v.skin&&PET_SKINS[v.skin];
    if(hasEffects||skin?.aura?now-(v.drawn||0)<33:stamp===v.last)continue;v.last=stamp;v.drawn=now;
    const ctx=v.c.getContext('2d'),[x,y]=list[i],W=v.c.width,H=v.c.height;ctx.clearRect(0,0,W,H);ctx.imageSmoothingEnabled=false;
    const mouth=actor.mouth_frames?.[clip+'_e']?.[i]||actor.cast_mouth||actor.mouth,elapsed=age%1.333;
    const unit=actor.native_resolution?1/actor.render_scale:1;
    const f={kind:v.id==='dragon'?'fire':v.id==='fox'?'zap':'snow',x:v.id==='dragon'?mouth[0]:v.id==='fox'?91:actor.anchor[0],y:v.id==='dragon'?mouth[1]:v.id==='fox'?85:actor.anchor[1]-11*unit,r:(30+v.stage*4)*unit,length:51*unit,width:(11+v.stage*2)*unit,visibleLength:51*unit,a:0,t:elapsed,delay:.24,life:1.333-elapsed,max:1.333};
    const box=boxOf(key,v.stable?'stable':v.clip,hasEffects?f:null,v.stable?['idle_e','move_e','cast_e'].flatMap(k=>meta.clips[key][k]||[]):v.clip==='lobby'?[...meta.clips[key].idle_e,...meta.clips[key].cast_e]:list);
    const [bx,by,w,h]=box;ctx.save();
    if(v.real){
      // the visible part of a cover-fitted canvas, in canvas pixels
      const r=v.c.clientWidth&&v.c.clientHeight?Math.max(v.c.clientWidth/W,v.c.clientHeight/H):1,Wv=v.c.clientWidth?v.c.clientWidth/r:W,Hv=v.c.clientHeight?v.c.clientHeight/r:H;
      // framed on the 终极's resting pose (first idle frame): raised wings, a swishing tail or a cast may run past the edge
      const k3key=`${v.id}-3`,a3=meta.actors[k3key],[,b3y,b3w,b3h]=boxOf(k3key,'rest',null,meta.clips[k3key].idle_e.slice(0,1),a3.page);
      const k3=Math.min(Hv*0.74/b3h,Wv*0.9/b3w),k=k3*actor.render_scale/a3.render_scale,an=actor.anchor||[cw/2,ch-8];
      const ground=(H-b3h*k3)/2+H*0.04+((a3.anchor||an)[1]-b3y)*k3;
      // real==='center': each stage's resting pose centred up and down instead of standing on the 终极's ground line
      const rest=v.real==='center'&&boxOf(key,'rest',null,meta.clips[key].idle_e.slice(0,1),actor.page);
      ctx.translate(W/2-(bx+w/2)*k,rest?H/2-(rest[1]+rest[3]/2)*k:ground-an[1]*k);ctx.scale(k,k);
      // centred stages carry their own ground shadow, under this stage's feet and as wide as its resting pose
      if(rest){const sx=rest[0]+rest[2]/2,sy=rest[1]+rest[3]-2,rx=rest[2]*0.42,ry=rx*0.16;ctx.save();ctx.translate(sx,sy);ctx.scale(1,ry/rx);const g=ctx.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,'rgba(10,4,24,.5)');g.addColorStop(1,'rgba(10,4,24,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,rx,0,Math.PI*2);ctx.fill();ctx.restore();}
    }else{const k=Math.min(W/(w+12),H/(h+12));ctx.translate((W-w*k)/2-bx*k,(v.alignTop?0:(H-h*k)/2)-by*k);ctx.scale(k,k);}
    if(hasEffects&&v.id==='phoenix')drawPetFields(ctx,{petFields:[f],fx:{lite:true}},now/1000);
    if(skin){const cell=skinnedFrame(v.skin,image,x,y,cw,ch,now/1000),an=actor.anchor||[cw/2,ch-8];ctx.drawImage(cell,0,0,cw,ch);if(skin.aura){ctx.save();ctx.translate(an[0],an[1]);drawAura(ctx,skin.aura,cell,an,1,now/1000);ctx.restore();}}
    else ctx.drawImage(image,x,y,cw,ch,0,0,cw,ch);
    if(hasEffects&&v.id!=='phoenix')drawPetFields(ctx,{petFields:[f],fx:{lite:true}},now/1000);
    ctx.restore();
  }
  if(live.size)frame=requestAnimationFrame(draw);
}
/** the opaque bounds of a set of poses of one actor (cached): [x, y, w, h] in cell pixels; fx widens it for a cast's effect */
function boxOf(key,tag,fx,poses,page){
  const cache=key+tag+(fx?'fx':'');let box=bounds.get(cache);if(box)return box;
  const {meta}=A.pets,actor=meta.actors[key],cw=actor.cw||meta.cw,ch=actor.ch||meta.ch,image=A.pets.images?.[page??actor.page??0]||A.pets.image;
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const g=c.getContext('2d',{willReadFrequently:true});let x0=cw,y0=ch,x1=0,y1=0;
  for(const [sx,sy] of poses){g.clearRect(0,0,cw,ch);g.drawImage(image,sx,sy,cw,ch,0,0,cw,ch);const a=g.getImageData(0,0,cw,ch).data;for(let n=3;n<a.length;n+=4)if(a[n]>32){const q=(n-3)/4,px=q%cw,py=Math.floor(q/cw);x0=Math.min(x0,px);y0=Math.min(y0,py);x1=Math.max(x1,px+1);y1=Math.max(y1,py+1);}}
  if(fx){const f=fx;x0=Math.min(x0,f.x-(f.kind==='fire'?0:f.r));x1=Math.max(x1,f.x+(f.kind==='fire'?f.length:f.r));y0=Math.min(y0,f.y-(f.kind==='fire'?f.width:f.r));y1=Math.max(y1,f.y+(f.kind==='fire'?f.width:f.r));}
  box=[x0,y0,x1-x0,y1-y0];bounds.set(cache,box);return box;
}
