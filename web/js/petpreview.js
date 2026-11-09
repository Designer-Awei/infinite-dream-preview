// Shared authored atlas animation for the lobby and the pet cards.
import { A } from './assets.js';
import { drawPetFields } from './pets.js';
const live=new Set(),bounds=new Map();let frame=0;
// wide: true = 512×192 strip, or an explicit [width, height] canvas. stable: one framing for all three clips of the
// stage (so switching idle/move/cast in a showcase never rescales the creature).
export function petPreview(host,id,stage,clip='idle',tight=false,wide=false,alignTop=false,stable=false){
  const [cw,ch]=Array.isArray(wide)?wide:wide?[512,192]:[256,256];
  const c=document.createElement('canvas');c.width=cw;c.height=ch;c.setAttribute('aria-label',`${id} ${stage} ${clip}`);
  const v={c,id,stage,clip,tight,wide:!!wide,alignTop,stable,start:performance.now(),last:null};
  host.replaceChildren(c);live.add(v);c.__pv=v;if(!frame)frame=requestAnimationFrame(draw);return c;
}
/** switch an existing preview's pet / stage / clip in place (no new canvas, restarts the clip) */
export function setPetPreview(c,{id,stage,clip}={}){
  const v=c&&c.__pv;if(!v)return;
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
    if(hasEffects?now-(v.drawn||0)<33:stamp===v.last)continue;v.last=stamp;v.drawn=now;
    const ctx=v.c.getContext('2d'),[x,y]=list[i],W=v.c.width,H=v.c.height;ctx.clearRect(0,0,W,H);ctx.imageSmoothingEnabled=false;
    const mouth=actor.mouth_frames?.[clip+'_e']?.[i]||actor.cast_mouth||actor.mouth,elapsed=age%1.333;
    const unit=actor.native_resolution?1/actor.render_scale:1;
    const f={kind:v.id==='dragon'?'fire':v.id==='fox'?'zap':'snow',x:v.id==='dragon'?mouth[0]:v.id==='fox'?91:actor.anchor[0],y:v.id==='dragon'?mouth[1]:v.id==='fox'?85:actor.anchor[1]-11*unit,r:(30+v.stage*4)*unit,length:51*unit,width:(11+v.stage*2)*unit,visibleLength:51*unit,a:0,t:elapsed,delay:.24,life:1.333-elapsed,max:1.333};
    const cache=key+(v.stable?'stable':v.clip)+(hasEffects?'fx':'');let box=bounds.get(cache);
    if(!box){
      const c=document.createElement('canvas');c.width=cw;c.height=ch;const g=c.getContext('2d',{willReadFrequently:true});let x0=cw,y0=ch,x1=0,y1=0;
      const poses=v.stable?['idle_e','move_e','cast_e'].flatMap(k=>meta.clips[key][k]||[]):v.clip==='lobby'?[...meta.clips[key].idle_e,...meta.clips[key].cast_e]:list;
      for(const [sx,sy] of poses){g.clearRect(0,0,c.width,c.height);g.drawImage(image,sx,sy,cw,ch,0,0,cw,ch);const a=g.getImageData(0,0,c.width,c.height).data;for(let n=3;n<a.length;n+=4)if(a[n]>32){const q=(n-3)/4,px=q%cw,py=Math.floor(q/cw);x0=Math.min(x0,px);y0=Math.min(y0,py);x1=Math.max(x1,px+1);y1=Math.max(y1,py+1);}}
      if(hasEffects){x0=Math.min(x0,f.x-(f.kind==='fire'?0:f.r));x1=Math.max(x1,f.x+(f.kind==='fire'?f.length:f.r));y0=Math.min(y0,f.y-(f.kind==='fire'?f.width:f.r));y1=Math.max(y1,f.y+(f.kind==='fire'?f.width:f.r));}
      box=[x0,y0,x1-x0,y1-y0];bounds.set(cache,box);
    }
    const [bx,by,w,h]=box,k=Math.min(W/(w+12),H/(h+12));ctx.save();ctx.translate((W-w*k)/2-bx*k,(v.alignTop?0:(H-h*k)/2)-by*k);ctx.scale(k,k);
    if(hasEffects&&v.id==='phoenix')drawPetFields(ctx,{petFields:[f],fx:{lite:true}},now/1000);
    ctx.drawImage(image,x,y,cw,ch,0,0,cw,ch);
    if(hasEffects&&v.id!=='phoenix')drawPetFields(ctx,{petFields:[f],fx:{lite:true}},now/1000);
    ctx.restore();
  }
  if(live.size)frame=requestAnimationFrame(draw);
}
