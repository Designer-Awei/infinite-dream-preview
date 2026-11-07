// Controlled arena capture using the real Game, companion AI, combat FX and Renderer.
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {browserSession} from '../../test/browser-session.mjs';
const b=await browserSession('pet-gameplay-video');let encoder;
try{
  const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8775',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({name:'伙伴演示',tutorialSeen:true,sel:'deepseek',chars:['deepseek'],seenUnlock:['deepseek'],sound:false,music:false}))`});
  await p.wait(`!!document.querySelector('.pet-entry')`);
  await p.evaluate(`(async()=>{const {app}=await import('./js/main.js'),{Renderer}=await import('./js/render.js'),{VIEW_W,VIEW_H,RS}=await import('./js/data.js'),{makeKit}=await import('./js/save.js'),{renderGround}=await import('./js/map.js'),{resetPet,toggleMount}=await import('./js/pets.js'),{PETS}=await import('./js/petdata.js');await document.fonts.ready;
    const canvas=document.createElement('canvas');canvas.width=VIEW_W*RS;canvas.height=VIEW_H*RS;
    window.rec={app,canvas,PETS,setup(id){app.begin({mode:'solo',pvp:false,seed:17,petTrial:id,players:[{id:1,cid:'deepseek',name:'试用',local:true,kit:{...makeKit('deepseek'),pet:{id,stage:3}}}],myId:1,opt:{map:'grass',petTrial:true}});app.paused=true;const g=app.game,q=app.me;g.onUi=()=>{};g.banner=null;g.waveDelay=999;g.map.t.fill(0);g.map.mud.fill(0);g.map.crates={};g.ground=renderGround(g.map);q.x=g.map.center.x-110;q.y=g.map.center.y+45;q.invuln=999;resetPet(g,q);q.pet.x=q.x-52;q.pet.y=q.y+12;q.pet.skillCd=1.7;g.enemies=[];for(let i=0;i<6;i++){const e=g.spawnEnemy(i%2?'bat':'slime',g.map.center.x+80+i%3*38,g.map.center.y-30+Math.floor(i/3)*70);e.spawnT=0;e.stunT=999;e.hp=e.maxHp=5000;}this.r=new Renderer(canvas,g.fx);this.r.cam={x:g.map.center.x-VIEW_W/2,y:g.map.center.y-VIEW_H/2};},frame(i){const g=app.game,q=app.me,t=i/24;q.input.mx=t<1.8?.4:0;q.input.my=0;q.input.atk=t>=4.6&&t<5.5;if(i===110){q.mountCd=0;toggleMount(g,q);}if(i===142){q.ult=1;q.input.ult=true;}g.update(1/24);g.fx.update(1/24);this.r.draw(g,q,1/24);const ctx=canvas.getContext('2d');ctx.setTransform(RS,0,0,RS,0,0);ctx.fillStyle='rgba(22,14,42,.85)';ctx.fillRect(12,10,380,39);ctx.font='15px Cubic';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#ffe36a';ctx.fillText(PETS[q.pet.id].name+' · '+(t<4.6?'自动跟随 / 攻击 / 技能':t<5.9?'骑乘 / 专属普攻':'骑乘专属大招'),22,32);return canvas.toDataURL('image/png').split(',')[1]}};return true})()`);
  assert(process.env.FFMPEG,'Set FFMPEG');const output=path.resolve('art/pets/approved-v1/gameplay-preview.mp4');
  encoder=spawn(process.env.FFMPEG,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','24','-i','pipe:0','-an','-c:v','libx264','-pix_fmt','yuv420p','-crf','21','-movflags','+faststart',output],{env:process.env,windowsHide:true});
  let err='';encoder.stderr.on('data',d=>err+=d);const done=new Promise((res,rej)=>{encoder.on('error',rej);encoder.on('close',c=>c?rej(Error(err)):res());});
  for(const id of ['dragon','fox','phoenix']){
    await p.evaluate(`rec.setup('${id}')`);
    for(let i=0;i<264;i++){
      const bytes=Buffer.from(await p.evaluate(`rec.frame(${i})`),'base64');
      if(!encoder.stdin.write(bytes))await new Promise(r=>encoder.stdin.once('drain',r));
      if([70,125,175].includes(i))await writeFile(path.join(b.out,`${id}-${i}.png`),bytes);
    }
  }
  encoder.stdin.end();await done;assert.deepEqual(b.errors,[]);
  await writeFile(path.resolve('art/pets/approved-v1/gameplay-check.json'),JSON.stringify({actors:3,stages:[3],seconds:33,fps:24,realModules:['Game','Renderer','companion AI','combat FX'],controlledArena:true,immobilizedTargets:true,pageErrors:b.errors},null,2));
  console.log('PASS captured 33s real runtime companion/ride/ult demo');
}finally{encoder?.kill();await b.close();}
