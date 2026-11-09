import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {browserSession} from './browser-session.mjs';
const b=await browserSession('followers-hd');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8794/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});await p.wait(`!!document.querySelector('.lb-hero')`);
 const report=await p.evaluate(`(async()=>{
 const {A}=await import('./js/assets.js'),P=await import('./js/pets.js');const ok=(v,m)=>{if(!v)throw Error(m)},rows=[];let samples=0;
 const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1060;const g=canvas.getContext('2d');g.fillStyle='#202632';g.fillRect(0,0,1200,1060);g.fillStyle='#ffe36a';g.font='20px sans-serif';g.fillText('九形态跟随素材 · 256原生帧与实际游戏大小',20,26);
 for(const [n,id] of ['dragon-1','dragon-2','dragon-3','phoenix-1','phoenix-2','phoenix-3','fox-1','fox-2','fox-3'].entries()){
  const [species,stage]=id.split('-'),actor=A.pets.meta.actors[id],q={id:species,stage:+stage,x:0,y:0,face:0,anim:0,walkT:0,castT:0,castMax:0,moving:false},p={pet:q,mounted:false};let cells=[];const c=document.createElement('canvas'),ctx=c.getContext('2d');let call;ctx.drawImage=(...a)=>{call=a;cells.push(a.slice(1,3).join(','))};
  for(const mode of ['idle','move','cast']){
   const seen=new Set();for(let i=0;i<120;i++){
    const t=i/90;q.anim=q.walkT=t;q.moving=mode==='move';q.castMax=3;q.castT=mode==='cast'?Math.max(.01,3-t):0;P.drawPet(ctx,p,t);
    ok(call[3]===256&&call[4]===256,'Native source rectangle '+id);ok(Math.abs(call[7]-256*P.petScale(p)*actor.render_scale)<.001,'Separate world scale');
    const name=mode+'_e',coords=A.pets.meta.clips[id][name],index=coords.findIndex(([x,y])=>x===call[1]&&y===call[2]);ok(index>=0,'Valid action rectangle '+id);seen.add(index);
    const m=P.petMuzzle(p),point=actor.mouth_frames[name][index],s=P.petScale(p)*actor.render_scale;ok(Math.hypot(m.x-(point[0]-actor.anchor[0])*s,m.y-(point[1]-actor.anchor[1])*s)<.001,'Mouth follows displayed frame');q.face=Math.PI;const mirror=P.petMuzzle(p);ok(Math.abs(m.x+mirror.x)<.001&&m.y===mirror.y,'Mouth mirrors with body');q.face=0;samples++;
   }
   ok(seen.size>=(mode==='cast'?3:12),'Native phases are skipped '+id+mode+' '+seen.size);rows.push({id,mode,uniqueSamples:seen.size});
  }
  q.anim=.35;q.castT=0;q.moving=false;q.x=n%3*400+335;q.y=Math.floor(n/3)*340+240;P.drawPet(g,p,.35);g.fillStyle='#cbd4e5';g.font='14px sans-serif';g.fillText('game size',n%3*400+296,Math.floor(n/3)*340+270);g.fillText(id,n%3*400+24,Math.floor(n/3)*340+325);
  const [sx,sy]=A.pets.meta.clips[id].idle_e[3];g.imageSmoothingEnabled=false;g.drawImage(A.pets.images[actor.page||0],sx,sy,256,256,n%3*400+20,Math.floor(n/3)*340+40,256,256);
 }
 return{rows,mouthSamples:samples,source256:true,perActorScale:true,preview:canvas.toDataURL()};})()`);
 const out='E:/Rouge-Game/context/followers-hd-2026-11-09';await mkdir(out,{recursive:true});await writeFile(out+'/runtime-native-and-world.png',Buffer.from(report.preview.split(',')[1],'base64'));delete report.preview;assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close();}
