// Review-only, code-native variants of map.js wall art. Not imported by the game.
export function paintWallWear(g,th,mask,stage,variant,seed=0){
 if(!stage)return;
 const edge=(mask&4)===0,front=(mask&8)===0;
 let n=seed>>>0;const rand=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};
 const patch=(x,y,w,h,dark=false)=>{g.fillStyle=dark?th.frontLo:th.front;g.fillRect(x,y,w,h);g.fillStyle=th.topHi;g.fillRect(x,y+h,w,1);};
 // A: a few broad faded grain patches, with almost all structure intact.
 if(variant==='A'){
  g.globalAlpha=.32;for(let i=0;i<stage+1;i++){const x=4+Math.floor(rand()*19),y=5+Math.floor(rand()*20);patch(x,y,3+Math.floor(rand()*4),1+Math.floor(rand()*2));}g.globalAlpha=1;
  if(edge){patch(7+seed%11,2,stage+1,1,true);}
  if(front){g.globalAlpha=.38;patch(7+(seed*3)%12,36,4+stage*2,2);g.globalAlpha=1;}
 }
 // B: isolated edge knocks and one local splinter, no web of dark fractures.
 if(variant==='B'){
  if(edge){patch(5+seed%9,2,stage+2,2,true);patch(5+seed%9,4,stage,1);}
  patch(18+seed%5,14+seed%6,stage+1,2,true);
  if(stage===2){g.globalAlpha=.45;patch(7,23,6,1);g.globalAlpha=1;}
  if(front){patch(22,35,2,stage+2,true);g.globalAlpha=.3;patch(8,38,6,2);g.globalAlpha=1;}
 }
 // C: one short material seam, a soft abrasion and a small chipped corner.
 if(variant==='C'){
  g.globalAlpha=.62;g.fillStyle=th.frontLo;const x=9+seed%11,y=11+seed%6;
  g.fillRect(x,y,1,stage+2);g.fillRect(x+1,y+stage+1,2,1);if(stage===2)g.fillRect(x+2,y+4,1,3);g.globalAlpha=.3;patch(5,22,7+stage,2);g.globalAlpha=1;
  if(edge)patch(23-seed%6,2,stage+1,1,true);
  if(front){g.globalAlpha=.45;patch(12,37,stage+3,2);g.globalAlpha=1;}
 }
}
