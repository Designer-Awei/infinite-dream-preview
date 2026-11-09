import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('followers-hd-visual'),out='E:/Rouge-Game/context/followers-hd-2026-11-09';await mkdir(out,{recursive:true});
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8794/web/',{width:804,height:360,source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});await p.wait(`!!document.querySelector('.lb-hero')`);
 for(const family of ['dragon','phoenix','fox']){
  await p.evaluate(`(async()=>{const {app}=await import('./js/main.js'),{makeKit}=await import('./js/save.js'),M=await import('./js/map.js'),P=await import('./js/pets.js');window.hdDemo={app,P};app.begin({mode:'solo',seed:17,pvp:false,players:[1,2,3].map((stage,i)=>({id:i+1,name:['幼年','成长','终极'][i],cid:['gpt','claude','grok'][i],local:i===0,kit:{...makeKit(['gpt','claude','grok'][i]),pet:{id:'${family}',stage}}})),myId:1,opt:{map:'grass',petTrial:true}});app.paused=true;const g=app.game;g.banner=null;g.map.t.fill(0);g.map.crates={};g.map.mud.fill(0);g.enemies=[];g.fx.clearAll();for(let i=0;i<3;i++){const q=g.players[i];q.x=180+i*230;q.y=260;q.face=0;P.resetPet(g,q);q.pet.x=q.x+75;q.pet.y=q.y;q.pet.face=0;q.pet.anim=.35;}g.ground=M.renderGround(g.map);g.floaters=[];})()`);
  await sleep(120);await p.shot(family+'-three-stage-follow');await copyFile(b.out+'/'+family+'-three-stage-follow.png',out+'/'+family+'-three-stage-follow.png');
 }
 if(b.errors.length)throw Error(JSON.stringify(b.errors));await writeFile(out+'/visual-check.json',JSON.stringify({screenshots:['dragon-three-stage-follow.png','phoenix-three-stage-follow.png','fox-three-stage-follow.png'],viewport:[804,360],pageErrors:b.errors}));console.log(out);
}finally{await b.close();}
