// Stage anchors are relative to base enemy HP / base incoming hit damage.
// Calibrated around a completed card build at floor 35, not a naked level-one hero.
export const ENDLESS_HP_ANCHORS=Object.freeze([[1,1.5],[10,4],[20,5.5],[30,6],[35,18],[60,180],[90,1800],[120,32000],[150,600000]]);
export const ENDLESS_HIT_ANCHORS=Object.freeze([[1,1],[30,1.6],[60,3.6],[90,8],[120,16],[150,40]]);
function smoothCurve(points){
  const x=points.map(p=>p[0]),y=points.map(p=>Math.log(p[1])),h=x.slice(1).map((v,i)=>v-x[i]),d=h.map((v,i)=>(y[i+1]-y[i])/v),m=[d[0]];
  for(let i=1;i<d.length;i++){const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i]);}m[d.length]=d[d.length-1];
  return value=>{
    const floor=Math.max(1,Number.isFinite(value)?value:1),last=x.length-1;
    if(floor>=x[last])return Math.exp(Math.min(35,y[last]+m[last]*(floor-x[last])));
    let i=0;while(floor>x[i+1])i++;
    const t=(floor-x[i])/h[i],t2=t*t,t3=t2*t;
    return Math.exp((2*t3-3*t2+1)*y[i]+(t3-2*t2+t)*h[i]*m[i]+(-2*t3+3*t2)*y[i+1]+(t3-t2)*h[i]*m[i+1]);
  };
}
export const endlessEnemyHP=smoothCurve(ENDLESS_HP_ANCHORS);
export const endlessEnemyHit=smoothCurve(ENDLESS_HIT_ANCHORS);
// First forty cubes retain their full payoff. The tail has a smooth soft knee
// plus a small guaranteed marginal gain, so later cubes still matter.
export function effectiveCubes(value,endless=false){
  const n=Math.max(0,Number.isFinite(value)?value:0);if(!endless||n<=40)return n;
  const tail=n-40;return 40+.1*tail+36*tail/(40+tail);
}
export const cubeDamage=(n,endless=false)=>1+.06*effectiveCubes(n,endless);
export const cubeHealth=(n,endless=false)=>Math.floor(effectiveCubes(n,endless)/5+1e-9);
export const reactionRoom=(room,endless=false)=>Math.max(0,endless?Math.min(34,room):room);
