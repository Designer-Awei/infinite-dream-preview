// Shared authored atlas animation for the lobby and the pet cards.
import { A } from './assets.js';
import { drawPetFields } from './pets.js';
const live=new Set(),bounds=new Map();let frame=0;
export function petPreview(host,id,stage,clip='idle',tight=false,wide=false){
  const c=document.createElement('canvas');c.width=wide?512:256;c.height=wide?192:256;c.setAttribute('aria-label',`${id} ${stage} ${clip}`);
  host.replaceChildren(c);live.add({c,id,stage,clip,tight,wide,start:performance.now(),last:null});if(!frame)frame=requestAnimationFrame(draw);return c;
}
function draw(now){
  frame=0;
  for(const v of live){
    if(!v.c.isConnected){live.delete(v);continue;}if(document.hidden||!A.pets)continue;
    const age=Math.max(0,now-v.start)/1000,phase=age%11,clip=v.clip==='lobby'?(phase>=9&&phase<10.333?'cast':'idle'):v.clip;
    const clipAge=v.clip==='lobby'&&phase>=9?(phase<10.333?phase-9:phase-10.333):age;
    const {meta,image}=A.pets,key=`${v.id}-${v.stage}`,list=meta.clips[key]?.[clip+'_e'];if(!list)continue;
    const i=Math.floor(clipAge*(clip==='move'?8:6))%Math.max(1,list.length-1),stamp=clip+':'+i,hasEffects=v.clip==='cast'&&v.wide;
    if(hasEffects?now-(v.drawn||0)<33:stamp===v.last)continue;v.last=stamp;v.drawn=now;
    const ctx=v.c.getContext('2d'),[x,y]=list[i],W=v.c.width,H=v.c.height;ctx.clearRect(0,0,W,H);ctx.imageSmoothingEnabled=false;
    const actor=meta.actors[key],mouth=actor.cast_mouth||actor.mouth,elapsed=age%1.333;
    const f={kind:v.id==='dragon'?'fire':v.id==='fox'?'zap':'snow',x:v.id==='dragon'?mouth[0]:v.id==='fox'?91:64,y:v.id==='dragon'?mouth[1]:85,r:30+v.stage*4,length:51,width:11+v.stage*2,visibleLength:51,a:0,t:elapsed,delay:.24,life:1.333-elapsed,max:1.333};
    const cache=key+v.clip+(hasEffects?'fx':'');let box=bounds.get(cache);
    if(!box){
      const c=document.createElement('canvas');c.width=meta.cw;c.height=meta.ch;const g=c.getContext('2d',{willReadFrequently:true});let x0=meta.cw,y0=meta.ch,x1=0,y1=0;
      const poses=v.clip==='lobby'?[...meta.clips[key].idle_e,...meta.clips[key].cast_e]:list;
      for(const [sx,sy] of poses){g.clearRect(0,0,c.width,c.height);g.drawImage(image,sx,sy,meta.cw,meta.ch,0,0,meta.cw,meta.ch);const a=g.getImageData(0,0,c.width,c.height).data;for(let n=3;n<a.length;n+=4)if(a[n]>32){const q=(n-3)/4,px=q%meta.cw,py=Math.floor(q/meta.cw);x0=Math.min(x0,px);y0=Math.min(y0,py);x1=Math.max(x1,px+1);y1=Math.max(y1,py+1);}}
      if(hasEffects){x0=Math.min(x0,f.x-(f.kind==='fire'?0:f.r));x1=Math.max(x1,f.x+(f.kind==='fire'?f.length:f.r));y0=Math.min(y0,f.y-(f.kind==='fire'?f.width:f.r));y1=Math.max(y1,f.y+(f.kind==='fire'?f.width:f.r));}
      box=[x0,y0,x1-x0,y1-y0];bounds.set(cache,box);
    }
    const [bx,by,w,h]=box,k=Math.min(W/(w+12),H/(h+12));ctx.save();ctx.translate((W-w*k)/2-bx*k,(H-h*k)/2-by*k);ctx.scale(k,k);
    if(hasEffects&&v.id==='phoenix')drawPetFields(ctx,{petFields:[f],fx:{lite:true}},now/1000);
    ctx.drawImage(image,x,y,meta.cw,meta.ch,0,0,meta.cw,meta.ch);
    if(hasEffects&&v.id!=='phoenix')drawPetFields(ctx,{petFields:[f],fx:{lite:true}},now/1000);
    ctx.restore();
  }
  if(live.size)frame=requestAnimationFrame(draw);
}
