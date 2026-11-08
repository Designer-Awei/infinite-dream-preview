// Exercise the approved whole fox+rider atlas through actual runtime drawing.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {browserSession} from './browser-session.mjs';
const b=await browserSession('pet-mounted');
try {
  const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8775',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});
  await p.wait(`!!document.querySelector('.lb-hero')`);
  const result=await p.evaluate(`(async()=>{
    const {A}=await import('./js/assets.js'),P=await import('./js/pets.js'),{CHAR_ORDER}=await import('./js/data.js');
    const mount=A.mounts.fox,check=(v,m)=>{if(!v)throw Error(m)};
    check(mount.meta.ride_stage===3&&mount.image.complete,'Approved final fox atlas loaded');
    check(CHAR_ORDER.every(cid=>mount.meta.actors[cid]),'All six rider identities mapped');
    const c=document.createElement('canvas');c.width=960;c.height=560;const ctx=c.getContext('2d');
    const render=t=>{ctx.fillStyle='#181329';ctx.fillRect(0,0,c.width,c.height);
      CHAR_ORDER.forEach((cid,i)=>{
        ctx.save();ctx.translate(i%3*320+160,Math.floor(i/3)*280+230);ctx.scale(2,2);
        const player={cid,x:0,y:0,mounted:true,pet:{id:'fox',stage:3,x:0,y:0,face:0,anim:t,walkT:t,moving:t>=1.5&&t<3,castT:t>=3?1:0,castMax:2}};
        check(P.drawMountedPet(ctx,player,t),'Draw whole rider '+cid);check(P.mountedVisualHeight(player)>70,'Whole silhouette height');
        const muzzle=P.petMuzzle(player);check(muzzle.x>20&&muzzle.y<0,'Mouth forward of origin');
        ctx.restore();ctx.font='17px Cubic';ctx.fillStyle='#ffe36a';ctx.fillText(cid,i%3*320+12,Math.floor(i/3)*280+24);
      });return c.toDataURL('image/png').split(',')[1]};
    check(render(.1)!==render(.7),'Living idle changes');check(render(1.6)!==render(2.1),'Four-paw walk changes');
    check(render(3.1)!==render(.1),'Body casting differs from idle');
    const player={cid:'deepseek',mounted:false,pet:{id:'fox',stage:3}};
    check(!P.drawMountedPet(ctx,player,0),'Follow never uses mounted composite');
    player.mounted=true;for(const stage of [1,2]){player.pet.stage=stage;check(!P.drawMountedPet(ctx,player,0),'Non-final has no mounted render');}
    window.mountReview={render};return {approvedFoxRiders:6,clips:18,stage3Only:true,fullComposite:true,pageErrors:[]};
  })()`);
  for(const [name,t] of [['idle',.7],['move',2.1],['cast',3.1]])await writeFile(path.join(b.out,name+'.png'),Buffer.from(await p.evaluate(`mountReview.render(${t})`),'base64'));
  assert.deepEqual(b.errors,[]);await writeFile(path.join(b.out,'check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await b.close();}
