// Verify actual native composite drawing, frame selection and per-frame muzzles.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {browserSession} from './browser-session.mjs';
const b=await browserSession('pet-new-mounts');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8786/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});
 await p.wait(`!!document.querySelector('.lb-hero')`);
 const report=await p.evaluate(`(async()=>{
  const {A}=await import('./js/assets.js'),P=await import('./js/pets.js'),{CHAR_ORDER}=await import('./js/data.js');
  const check=(v,m)=>{if(!v)throw Error(m)},c=document.createElement('canvas');c.width=1536;c.height=620;const ctx=c.getContext('2d'),checks=[];
  for(const species of ['dragon','phoenix']){
   const m=A.mounts[species];check(m.image.complete&&m.meta.ride_stage===3,'Loaded final '+species);check(m.meta.cw===256&&m.meta.ch===256&&m.image.width<=4096&&m.image.height<=4096,'Native 256 mobile atlas');
   for(const cid of CHAR_ORDER){
    const a=m.meta.actors[cid],q={id:species,stage:3,x:0,y:0,face:0,anim:0,walkT:0,castT:0,castMax:0,moving:false},player={cid,mounted:true,pet:q};
    for(const clip of ['idle_e','move_e','cast_e']){
     check(a[clip].length===9&&a.mouth_frames[clip].length===9,'Nine mapped frames');
     for(let i=0;i<8;i++){
      Object.assign(q,{anim:clip==='idle_e'?(i+.05)/6:0,walkT:(i+.05)/7,moving:clip==='move_e',castMax:4,castT:clip==='cast_e'?4-(i<3?(i+.05)/8:.36+(i-3)/6):0});
      let call;const draw=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{call=args;draw(...args)};check(P.drawMountedPet(ctx,player,0,false),'Whole pair rendered');ctx.drawImage=draw;
      const index=a[clip].findIndex(([x,y])=>x===call[1]&&y===call[2]);check(index>=0,'Rendering correct action strip');
      const point=a.mouth_frames[clip][index],muzzle=P.petMuzzle(player);check(Math.abs(muzzle.x-(point[0]-128)*m.meta.scale)<.001&&Math.abs(muzzle.y-(point[1]-232)*m.meta.scale)<.001,'Muzzle follows displayed frame');
      q.face=Math.PI;const mirrored=P.petMuzzle(player);check(Math.abs(mirrored.x+muzzle.x)<.001&&mirrored.y===muzzle.y,'Muzzle mirrors with body');q.face=0;
     }
    }
    q.castT=0;q.moving=false;player.mounted=false;check(!P.drawMountedPet(ctx,player,0),'Follower excludes composite');player.mounted=true;
    for(const stage of [1,2]){q.stage=stage;check(!P.drawMountedPet(ctx,player,0),'Only terminal stage mounts');}q.stage=3;
    checks.push({species,cid,headHeight:P.mountedHeadHeight(player),shieldRadius:P.mountedShield(player).radius});
   }
  }
  const render=(species,mode,t)=>{ctx.fillStyle='#181329';ctx.fillRect(0,0,c.width,c.height);CHAR_ORDER.forEach((cid,i)=>{ctx.save();ctx.translate(i%3*512+256,Math.floor(i/3)*310+270);ctx.scale(2.2,2.2);P.drawMountedPet(ctx,{cid,mounted:true,pet:{id:species,stage:3,x:0,y:0,face:0,anim:t,walkT:t,moving:mode==='move',castMax:3,castT:mode==='cast'?2:0}},t,false);ctx.restore();ctx.font='18px Cubic';ctx.fillStyle='#ffe36a';ctx.fillText(cid+' '+mode,i%3*512+18,Math.floor(i/3)*310+25);});return c.toDataURL().split(',')[1];};
  for(const species of ['dragon','phoenix'])for(const mode of ['idle','move'])check(render(species,mode,.1)!==render(species,mode,.65),'Animated '+species+mode);
  window.mountReview={render};return{riders:12,clips:36,sourceCells:256,maxAtlasDimension:3584,muzzleSamples:288,stage3Only:true,geometry:checks};
 })()`);
 for(const species of ['dragon','phoenix'])for(const mode of ['idle','move','cast'])await writeFile(path.join(b.out,species+'-'+mode+'.png'),Buffer.from(await p.evaluate(`mountReview.render('${species}','${mode}',.65)`),'base64'));
 assert.deepEqual(b.errors,[]);await writeFile(path.join(b.out,'report.json'),JSON.stringify({...report,pageErrors:b.errors},null,2));console.log(JSON.stringify({...report,geometry:report.geometry.length,pageErrors:b.errors}));
}finally{await b.close();}
