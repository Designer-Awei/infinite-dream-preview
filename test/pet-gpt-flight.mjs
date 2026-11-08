import assert from 'node:assert/strict';
import {writeFile,copyFile} from 'node:fs/promises';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('pet-gpt-flight');
try{
 const results=[];
 for(const [width,height] of [[804,360],[667,375]]){
  const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8791/web/',{width,height,source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});await p.wait(`!!document.querySelector('.lb-hero')`);
  const r=await p.evaluate(`(async()=>{
   const {app}=await import('./js/main.js'),{makeKit}=await import('./js/save.js'),P=await import('./js/pets.js'),{A}=await import('./js/assets.js');
   app.begin({mode:'solo',seed:18,pvp:false,players:[{id:1,cid:'gpt',local:true,kit:{...makeKit('gpt'),pet:{id:'phoenix',stage:3}}}],myId:1,opt:{map:'grass',petTrial:true}});app.paused=true;
   const g=app.game,q=app.me;g.enemies=[];g.banner=null;g.fx.clearAll();P.resetPet(g,q);P.toggleMount(g,q);q.pet.anim=.53;
   const c=document.createElement('canvas'),ctx=c.getContext('2d');let cells=[];ctx.drawImage=(...a)=>cells.push(a.slice(1,3).join(','));
   for(const mode of ['idle','move','cast']){q.pet.moving=mode==='move';q.pet.castT=mode==='cast'?3:0;q.pet.castMax=5;P.drawMountedPet(ctx,q,0,false);}
   if(new Set(cells).size!==1)throw Error('Phase changed across idle/move/cast');
   q.pet.moving=true;q.pet.castT=3;const motion=[];for(let n=0;n<6;n++){q.pet.anim+=.16;P.drawMountedPet(ctx,q,0,false);motion.push(cells.at(-1));}if(new Set(motion).size<4)throw Error('Flight frozen during cast');
   q.pet.moving=false;q.pet.castT=0;g.floaters=[];
   return{sharedCycle:A.mounts.phoenix.meta.actors.gpt.shared_flight_cycle,phasePreserved:true,movingCastFrames:new Set(motion).size};
  })()`);results.push({width,height,...r});await sleep(100);await p.shot('gpt-phoenix-'+width);if(width===804)await copyFile(b.out+'/gpt-phoenix-804.png','E:/Rouge-Game/context/phoenix-occlusion-2026-11-09/in-game.png');
 }
 assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify({results,pageErrors:b.errors},null,2));console.log(JSON.stringify(results));
}finally{await b.close();}
