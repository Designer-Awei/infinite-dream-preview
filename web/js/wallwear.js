// Approved C: sparse shallow seams and worn edges, drawn into native wall art.
export function paintWallWear(g,th,mask,stage,seed=0){
 if(!stage)return;
 const x=9+seed%11,y=11+seed%6;
 const patch=(x,y,w,h,dark=false)=>{g.fillStyle=dark?th.frontLo:th.front;g.fillRect(x,y,w,h);g.fillStyle=th.topHi;g.fillRect(x,y+h,w,1);};
 g.save();g.globalAlpha=.62;g.fillStyle=th.frontLo;
 g.fillRect(x,y,1,stage+2);g.fillRect(x+1,y+stage+1,2,1);
 if(stage===2)g.fillRect(x+2,y+4,1,3);
 g.globalAlpha=.3;patch(5,22,7+stage,2);g.globalAlpha=1;
 if(!(mask&4))patch(23-seed%6,2,stage+1,1,true);
 if(!(mask&8)){g.globalAlpha=.45;patch(12,37,stage+3,2);}
 g.restore();
}
