import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('followers-hd-preview');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8794/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false,pets:{owned:{dragon:{stage:1,xp:0}},equipped:'dragon'}}))`});await p.wait(`!!document.querySelector('.pet-entry')`);
 await p.evaluate(`(async()=>{const {A}=await import('./js/assets.js'),{petPreview}=await import('./js/petpreview.js');window.hdCalls=[];const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(A.pets.images.includes(args[0])&&this.canvas.dataset.hdId)hdCalls.push({id:this.canvas.dataset.hdId,sw:args[3],sh:args[4],sx:args[1],sy:args[2]});return original.apply(this,args)};const host=document.createElement('div');host.id='hd-preview-check';host.style.cssText='position:fixed;left:-5000px;top:0';document.body.appendChild(host);for(const family of ['dragon','phoenix','fox'])for(const stage of [1,2,3])for(const clip of ['idle','move','cast']){const box=document.createElement('div');host.appendChild(box);const c=petPreview(box,family,stage,clip,true,true);c.dataset.hdId=family+'-'+stage+'-'+clip;}})()`);
 await sleep(1600);
 const r=await p.evaluate(`(()=>{const ids=[...new Set(hdCalls.map(x=>x.id))],rows=ids.map(id=>{const calls=hdCalls.filter(x=>x.id===id),size=256,canvas=[...document.querySelectorAll('#hd-preview-check canvas')].find(x=>x.dataset.hdId===id),a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return{id,correctSize:calls.every(x=>x.sw===size&&x.sh===size),moving:new Set(calls.map(x=>x.sx+','+x.sy)).size,visible:a.some((v,i)=>i%4===3&&v>128)}});document.querySelector('#hd-preview-check').remove();return rows})()`);
 assert.equal(r.length,27);assert(r.every(x=>x.correctSize&&x.moving>=6&&x.visible),JSON.stringify(r));
 for(const [width,height] of [[804,360],[667,375]]){
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await p.evaluate(`document.querySelector('.pet-entry').click()`);await sleep(100);await p.shot('young-dragon-'+width);
  for(const species of ['dragon','phoenix'])for(const stage of [1,2,3]){await p.evaluate(`document.querySelectorAll('.pet-choice')[${species==='dragon'?0:2}].click();document.querySelector('[data-stage="${stage}"]').click()`);await sleep(50);assert(await p.evaluate(`document.querySelector('.pet-panel').scrollHeight<=document.querySelector('.pet-panel').clientHeight+1`));}
  await p.shot('final-phoenix-'+width);await p.evaluate(`document.querySelector('.pet-panel header button').click()`);
 }
 assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify({rows:r,phoneLayouts:[804,667],pageErrors:b.errors},null,2));console.log(JSON.stringify({clips:r.length,correctSourceRectangles:true,animatedAndVisible:true,phoneLayouts:[804,667],pageErrors:b.errors}));
}finally{await b.close();}
