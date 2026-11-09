// Shared mount physics and attack geometry, also used by movement/FX.
import { T } from './data.js';
import { SOLID, tileAt, WALL, CRATE, BARREL, BUSH, LIFT } from './map.js';
// Projected sprite-space geometry: bullets, obstacles and the aim ribbon share it.
export function visualTilesIn(map,x,y,r,includeGrass=false){
 const hits=[];
 for(let ty=Math.max(0,Math.floor((y-r)/T));ty<=Math.min(map.H-1,Math.floor((y+r+LIFT)/T));ty++)
  for(let tx=Math.max(0,Math.floor((x-r-4)/T));tx<=Math.min(map.W-1,Math.floor((x+r+4)/T));tx++){
   const i=ty*map.W+tx,t=map.t[i];let left=tx*T,top=ty*T-LIFT,w=T,h=T+LIFT;
   if(t===CRATE||t===BARREL){left+=t===BARREL?6:2;top=ty*T-6;w=t===BARREL?20:28;h=34;}
   else if(t===BUSH&&includeGrass){left-=4;top=ty*T-12;w=T+8;h=T+14;}
   else if(t!==WALL)continue;
   const dx=Math.max(left-x,0,x-left-w),dy=Math.max(top-y,0,y-top-h);
   if(dx*dx+dy*dy<=r*r)hits.push({i,t});
  }
 return hits;
}
export const flyingMount=p=>!!(p.mounted&&p.pet?.id==='phoenix'&&p.pet.stage===3);
// Keep the original authored height; flight uses a foreground layer rather than extra lift.
export const flightLift=()=>0;
export function clearLanding(map,x,y,r=12){
  if(x<T+r||y<T+r||x>map.pxW-T-r||y>map.pxH-T-r)return false;
  for(const [dx,dy] of [[0,0],[r,0],[-r,0],[0,r],[0,-r],[r*.71,r*.71],[-r*.71,r*.71],[r*.71,-r*.71],[-r*.71,-r*.71]])if(SOLID(tileAt(map,x+dx,y+dy)))return false;
  return true;
}
export function safeLanding(map,x,y,r=12){
  if(clearLanding(map,x,y,r))return{x,y};
  let best=null,dist=Infinity;
  for(let ty=1;ty<map.H-1;ty++)for(let tx=1;tx<map.W-1;tx++){
    const px=tx*T+T/2,py=ty*T+T/2,d=Math.hypot(px-x,py-y);
    if(d<dist&&clearLanding(map,px,py,r)){best={x:px,y:py};dist=d;}
  }
  return best;
}
export function fireHalfWidth(f,d){
  const len=f.visibleLength??f.length,r=Math.min(f.width,len*.3),core=Math.max(1,len-r);
  return d<=core?Math.max(3,r*Math.max(0,d)/core):Math.sqrt(Math.max(0,r*r-(d-core)**2));
}
export function inFire(f,x,y,padding=0){
  const dx=x-f.x,dy=y-f.y,cs=Math.cos(f.a),sn=Math.sin(f.a),d=dx*cs+dy*sn;
  return d>=-padding&&d<=(f.visibleLength??f.length)+padding&&Math.abs(-dx*sn+dy*cs)<=fireHalfWidth(f,Math.max(0,Math.min(f.visibleLength??f.length,d)))+padding;
}
