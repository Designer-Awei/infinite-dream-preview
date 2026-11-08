import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {browserSession} from './browser-session.mjs';
const b=await browserSession('wall-wear');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8791/web/');await p.wait(`!!document.querySelector('.lb-hero')`);
 const r=await p.evaluate(`(async()=>{
 const {wallSprite,crateSprite,THEMES}=await import('./js/map.js'),{A}=await import('./js/assets.js');const ok=(v,m)=>{if(!v)throw Error(m)};
 let count=0,maxChanged=0;const c=document.createElement('canvas');c.width=1160;c.height=500;const g=c.getContext('2d');g.fillStyle='#171a21';g.fillRect(0,0,c.width,c.height);g.fillStyle='#f4dfaa';g.font='bold 24px sans-serif';g.fillText('已采用 C · 浅裂纹、自然旧痕',24,36);g.imageSmoothingEnabled=false;
 for(let theme=0;theme<4;theme++){
  for(let mask=0;mask<16;mask++){
   const base=wallSprite(theme,mask),a=base.getContext('2d').getImageData(0,0,32,46).data;
   for(let stage=1;stage<=2;stage++)for(let seed=0;seed<5;seed++){
    const tile=wallSprite(theme,mask,stage,null,seed),b=tile.getContext('2d').getImageData(0,0,32,46).data;let changed=0;
    for(let i=0;i<a.length;i+=4){ok(a[i+3]===b[i+3],'Wall footprint unchanged');if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;}
    ok(changed>0&&changed<90,'Sparse wear preserves material '+changed);maxChanged=Math.max(maxChanged,changed);count++;
   }
   ok(base.toDataURL()===wallSprite(theme,mask,0,null,4).toDataURL(),'Undamaged walls unchanged by position');
  }
  const x=24+theme*284;g.fillStyle='#d8dfed';g.font='18px sans-serif';g.fillText(THEMES[theme].name,x,74);
  for(let stage=1;stage<=2;stage++){
   g.fillStyle='#8e9aaf';g.font='16px sans-serif';g.fillText(stage===1?'轻损':'重损',x,100+(stage-1)*190);
   for(let row=0;row<2;row++)for(let col=0;col<4;col++){const mask=(col?1:0)|(col<3?2:0)|(row?4:0)|(row<1?8:0);g.drawImage(wallSprite(theme,mask,stage,null,col+row*3),x+col*64,112+(stage-1)*190+row*64,64,92);}
  }
 }
 ok(!A.structureDamage,'Removed unused structure atlas');
 for(let stage=1;stage<=2;stage++){
  ok(crateSprite('crate').toDataURL()===crateSprite('crate',stage===1?.2:.7).toDataURL(),'Crate remains intact at any health');
 }
 return{count,maxChangedPixels:maxChanged,originalPixels:32*46,unchangedFootprint:true,cratesStayIntact:true,preview:c.toDataURL()};})()`);
 const out='E:/Rouge-Game/context/wall-wear-2026-11-09';await mkdir(out,{recursive:true});await writeFile(out+'/approved-c.png',Buffer.from(r.preview.split(',')[1],'base64'));delete r.preview;assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));
}finally{await b.close();}
