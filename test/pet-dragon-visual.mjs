import {writeFile,mkdir,copyFile} from 'node:fs/promises';
import {browserSession,sleep} from './browser-session.mjs';
const out='E:/Rouge-Game/context/dragon-rework-2026-11-09';await mkdir(out,{recursive:true});
const b=await browserSession('pet-dragon-visual');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8791/web/',{width:804,height:360,source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});await p.wait(`!!document.querySelector('.lb-hero')`);
 await p.evaluate(`(async()=>{
 const {app}=await import('./js/main.js'),{makeKit}=await import('./js/save.js'),M=await import('./js/map.js'),P=await import('./js/pets.js'),{input}=await import('./js/input.js');window.demo={app,P,input};
 app.begin({mode:'solo',seed:17,pvp:false,players:[{id:1,cid:'claude',local:true,kit:{...makeKit('claude'),pet:{id:'dragon',stage:3}}}],myId:1,opt:{map:'grass',petTrial:true}});app.paused=true;const g=app.game,q=app.me;g.banner=null;g.map.t.fill(0);g.map.crates={};g.map.mud.fill(0);g.enemies=[];g.fx.clearAll();q.x=350;q.y=300;q.face=0;P.resetPet(g,q);P.toggleMount(g,q);q.face=q.pet.face=q.input.aim=input.aim=.1;P.mountedAttack(g,q,.1,null);P.updatePets(g,.12);g.ground=M.renderGround(g.map);g.floaters=[];
 })()`);await sleep(150);await p.shot('mouth-breath');await copyFile(b.out+'/mouth-breath.png',out+'/mouth-breath.png');
 await p.evaluate(`(()=>{const {app,P,input}=demo,g=app.game,q=app.me;g.petFields=[];q.input.aim=input.aim=null;for(const [x,y] of [[520,210],[570,300],[500,390]]){const e=g.spawnEnemy('slime',x,y);e.spawnT=0;e.hp=e.maxHp=100000;}P.mountedUlt(g,q,0,null);for(let n=0;n<60;n++){P.updatePets(g,.01);g.fx.update(.01);}g.fx.syncPetFields(g);g.floaters=[];})()`);await sleep(150);await p.shot('large-tornado');await copyFile(b.out+'/large-tornado.png',out+'/large-tornado.png');
 if(b.errors.length)throw Error(JSON.stringify(b.errors));await writeFile(out+'/visual-check.json',JSON.stringify({screenshots:['mouth-breath.png','large-tornado.png'],viewport:[804,360],pageErrors:b.errors}));console.log(out);
}finally{await b.close();}
