import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {browserSession} from './browser-session.mjs';
const b=await browserSession('wall-colour');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8793/web/');await p.wait(`!!document.querySelector('.lb-hero')`);
 const report=await p.evaluate(`(async()=>{
 const {wallSprite,crateSprite,THEMES}=await import('./js/map.js'),ok=(v,m)=>{if(!v)throw Error(m)};
 let count=0;const c=document.createElement('canvas');c.width=1080;c.height=430;const g=c.getContext('2d');g.fillStyle='#171a21';g.fillRect(0,0,c.width,c.height);g.fillStyle='#f4dfaa';g.font='bold 24px sans-serif';g.fillText('墙体损伤：颜色加深，透明度最低60%',24,36);g.imageSmoothingEnabled=false;
 for(let theme=0;theme<4;theme++){
  for(let mask=0;mask<16;mask++){
   const base=wallSprite(theme,mask).getContext('2d').getImageData(0,0,32,46).data;let prev=base;
   for(let step=1;step<=20;step++){
    const d=step/20,a=wallSprite(theme,mask,d).getContext('2d').getImageData(0,0,32,46).data;
    for(let i=0;i<a.length;i+=4){ok((a[i+3]>0)===(base[i+3]>0),'Original shape preserved');ok(a[i+3]<=prev[i+3]&&a[i+3]>=Math.floor(base[i+3]*.6),'Opacity decreases to a 60% floor');ok(Math.abs(a[i+3]-base[i+3]*(1-d*.4))<=1,'Proportional opacity');for(let j=0;j<3;j++)ok(a[i+j]<=base[i+j]+1&&Math.abs(a[i+j]-base[i+j]*(1-d*.32))<3,'Original colours darken uniformly without added cracks');}
    prev=a;count++;
   }
  }
  const x=24+theme*265;g.fillStyle='#d8dfed';g.font='18px sans-serif';g.fillText(THEMES[theme].name,x,76);
  for(const [row,d] of [0,.5,1].entries()){g.fillStyle='#8e9aaf';g.font='15px sans-serif';g.fillText(['完整 100%','半损 80%','重损 60%'][row],x,105+row*104);for(let col=0;col<3;col++)g.drawImage(wallSprite(theme,(col?1:0)|(col<2?2:0),d),x+col*64,112+row*104,64,92);}
 }
 for(const hp of [.1,.5,.9])ok(crateSprite('crate').toDataURL()===crateSprite('crate',hp).toDataURL(),'Crates retain intact appearance');
 return{count,originalShape:true,uniformDarkening:true,opacityFloor:.6,cratesStayIntact:true,preview:c.toDataURL()};})()`);
 const out='E:/Rouge-Game/context/wall-wear-2026-11-09';await mkdir(out,{recursive:true});await writeFile(out+'/colour-opacity.png',Buffer.from(report.preview.split(',')[1],'base64'));delete report.preview;assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close();}
