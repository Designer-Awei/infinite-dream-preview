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
  const check=(v,m)=>{if(!v)throw Error(m)},c=document.createElement('canvas');c.width=1536;c.height=620;const ctx=c.getContext('2d'),checks=[];let sampleCount=0;
  for(const species of ['dragon','phoenix','fox']){
   const m=A.mounts[species];check(m.image.complete&&m.meta.ride_stage===3,'Loaded final '+species);check(m.meta.cw===256&&m.meta.ch===256&&m.image.width<=4096&&m.image.height<=4096,'Native 256 mobile atlas');
   for(const cid of CHAR_ORDER){
    const a=m.meta.actors[cid],q={id:species,stage:3,x:0,y:0,face:0,anim:0,walkT:0,castT:0,castMax:0,moving:false},player={cid,mounted:true,pet:q};
    for(const clip of ['idle_e','move_e','cast_e']){
     check(a[clip].length>=9&&a.mouth_frames[clip].length===a[clip].length,'Mapped native frames');
     const count=a[clip].length-1;
     for(let i=0;i<count;i++){
      const expected=clip==='cast_e'&&species==='phoenix'?'move_e':clip;
      Object.assign(q,{anim:(i+.05)/(6*count/8),walkT:(i+.05)/((a.shared_flight_cycle?6:7)*count/8),moving:clip==='move_e',castMax:4,castT:clip==='cast_e'?(species==='fox'?4-(i+.05)/(6*count/8):3):0});
      let call;const draw=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{call=args;draw(...args)};check(P.drawMountedPet(ctx,player,0,false),'Whole pair rendered');ctx.drawImage=draw;
      const index=a[expected].findIndex(([x,y])=>x===call[1]&&y===call[2]);check(index===i,'Rendering correct action sample');
      sampleCount++;const point=a.mouth_frames[expected][index],muzzle=P.petMuzzle(player);check(Math.abs(muzzle.x-(point[0]-128)*m.meta.scale)<.001&&Math.abs(muzzle.y-(point[1]-232)*m.meta.scale)<.001,'Muzzle follows displayed frame');
      q.face=Math.PI;const mirrored=P.petMuzzle(player);check(Math.abs(mirrored.x+muzzle.x)<.001&&mirrored.y===muzzle.y,'Muzzle mirrors with body');q.face=0;
     }
    }
    q.castT=0;q.moving=false;player.mounted=false;check(!P.drawMountedPet(ctx,player,0),'Follower excludes composite');player.mounted=true;
    for(const stage of [1,2]){q.stage=stage;check(!P.drawMountedPet(ctx,player,0),'Only terminal stage mounts');}q.stage=3;
    checks.push({species,cid,headHeight:P.mountedHeadHeight(player),shieldRadius:P.mountedShield(player).radius});
   }
  }
  const render=(species,mode,t)=>{ctx.fillStyle='#181329';ctx.fillRect(0,0,c.width,c.height);CHAR_ORDER.forEach((cid,i)=>{ctx.save();ctx.translate(i%3*512+256,Math.floor(i/3)*310+270);ctx.scale(2.2,2.2);P.drawMountedPet(ctx,{cid,mounted:true,pet:{id:species,stage:3,x:0,y:0,face:0,anim:t,walkT:t,moving:mode==='move',castMax:3,castT:mode==='cast'?2:0}},t,false);ctx.restore();ctx.font='18px Cubic';ctx.fillStyle='#ffe36a';ctx.fillText(cid+' '+mode,i%3*512+18,Math.floor(i/3)*310+25);});return c.toDataURL().split(',')[1];};
  for(const species of ['dragon','phoenix','fox'])for(const mode of ['idle','move'])check(render(species,mode,.1)!==render(species,mode,.65),'Animated '+species+mode);
  window.mountReview={render};return{riders:18,clips:54,sourceCells:256,maxAtlasDimension:4096,muzzleSamples:sampleCount,stage3Only:true,geometry:checks};
 })()`);
 for(const species of ['dragon','phoenix','fox'])for(const mode of ['idle','move','cast'])await writeFile(path.join(b.out,species+'-'+mode+'.png'),Buffer.from(await p.evaluate(`mountReview.render('${species}','${mode}',.65)`),'base64'));
 assert.deepEqual(b.errors,[]);await writeFile(path.join(b.out,'report.json'),JSON.stringify({...report,pageErrors:b.errors},null,2));console.log(JSON.stringify({...report,geometry:report.geometry.length,pageErrors:b.errors}));
}finally{await b.close();}
