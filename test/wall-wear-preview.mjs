import {writeFile,mkdir} from 'node:fs/promises';
import {browserSession} from './browser-session.mjs';
const out='E:/Rouge-Game/context/wall-wear-2026-11-09';await mkdir(out,{recursive:true});
const b=await browserSession('wall-wear-preview');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8791/web/');await p.wait(`!!document.querySelector('.lb-hero')`);
 const data=await p.evaluate(`(async()=>{
 const {wallSprite,THEMES}=await import('./js/map.js'),{paintWallWear}=await import('../docs/references/previews/wall-wear-options.js');
 const c=document.createElement('canvas');c.width=1440;c.height=930;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.fillStyle='#171a21';g.fillRect(0,0,c.width,c.height);g.fillStyle='#f7edcf';g.font='bold 30px sans-serif';g.fillText('墙体做旧 · 三种候选',34,46);g.font='18px sans-serif';g.fillStyle='#aeb4c2';g.fillText('每组左半轻损、右半重损；原有材质、连接与轮廓保留。仅效果预览，尚未替换游戏。',34,80);
 const variants=['A','B','C'],names=['轻磨损 / 保留大面','局部磕边 / 少量缺口','浅裂纹 / 自然旧痕'];
 for(let col=0;col<3;col++){
  const x=28+col*474;g.fillStyle='#222832';g.fillRect(x,104,454,794);g.fillStyle='#f7d879';g.font='bold 24px sans-serif';g.fillText(variants[col]+'  '+names[col],x+18,142);
  for(let theme=0;theme<3;theme++){
   const y=178+theme*238;g.fillStyle='#b9c2ce';g.font='17px sans-serif';g.fillText(THEMES[theme].name,x+18,y);
   const cluster=document.createElement('canvas');cluster.width=192;cluster.height=92;const k=cluster.getContext('2d');
   for(let ty=0;ty<2;ty++)for(let tx=0;tx<6;tx++){
    const mask=(tx>0?1:0)|(tx<5?2:0)|(ty>0?4:0)|(ty<1?8:0),tile=document.createElement('canvas');tile.width=32;tile.height=46;const z=tile.getContext('2d');z.drawImage(wallSprite(theme,mask),0,0);paintWallWear(z,THEMES[theme],mask,tx<3?1:2,variants[col],tx+ty*17+theme*13);k.drawImage(tile,tx*32,ty*32);
   }
   g.drawImage(cluster,x+32,y+16,384,184);
  }
 }
 return c.toDataURL('image/png');})()`);
 await writeFile(out+'/wall-options.png',Buffer.from(data.split(',')[1],'base64'));console.log(out+'/wall-options.png');
}finally{await b.close();}
