// Shared mount physics and attack geometry, also used by movement/FX.
import { T } from './data.js';
import { SOLID, tileAt } from './map.js';
export const flyingMount=p=>!!(p.mounted&&p.pet?.id==='phoenix'&&p.pet.stage===3);
// Visual height only: physics and the storm's damage centre remain on the ground.
export const flightLift=p=>flyingMount(p)?18+Math.sin((p.pet.anim||0)*2.6)*2:0;
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
