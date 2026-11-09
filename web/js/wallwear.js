// Damage changes the original wall's colour and opacity without adding cracks.
export function applyWallDamage(g,damage,width,height){
 const d=Math.max(0,Math.min(1,damage));if(!d)return;
 g.save();g.globalCompositeOperation='source-atop';
 g.fillStyle=`rgba(0,0,0,${d*.32})`;g.fillRect(0,0,width,height);
 g.globalCompositeOperation='destination-in';
 g.fillStyle=`rgba(0,0,0,${Math.max(.6,1-d*.4)})`;g.fillRect(0,0,width,height);
 g.restore();
}
