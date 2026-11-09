import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserSession} from './browser-session.mjs';
const b=await browserSession('gpt-skill-movement');
try{
 const page=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8795/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});await page.wait(`!!document.querySelector('.lb-hero')`);
 const report=await page.evaluate(`(async()=>{
 const {Game}=await import('./js/game.js'),{FxLayer}=await import('./js/fx.js'),{castSkill}=await import('./js/skills.js'),{CHARS}=await import('./js/data.js'),P=await import('./js/pets.js');const rows=[],ok=(v,m)=>{if(!v)throw Error(m)};
 for(const pet of [null,'dragon','fox','phoenix']){
  const g=new Game({fx:new FxLayer(),seed:17}),p=g.addPlayer({id:1,cid:'gpt',local:true,kit:{tal:{},eq:{},cards:[],pet:pet?{id:pet,stage:3}:null}});g.startRun();g.map.t.fill(0);g.map.crates={};g.enemies=[];g.phase='fight';g.waveDelay=999;g.hazard=null;p.x=320;p.y=272;p.st.speed=1.3;p.input.mx=1;p.input.my=0;
  if(pet){P.resetPet(g,p);P.toggleMount(g,p)}
  const speed=()=>{p.x=320;const x=p.x;g.updatePlayer(p,.05);return(p.x-x)/.05},base=speed();castSkill(g,p,'gpt',0,null);const during=speed();ok(Math.abs(during-base*.7)<1e-6,'Temporary breath penalty changed');
  for(let i=0;i<30;i++){p.x=320;g.updatePlayer(p,.05);g.updateZones(.05)}
  const after=speed();ok(!(p.buff.breath>0)&&Math.abs(after-base)<1e-6,'Skill left permanent movement slowdown');
  castSkill(g,p,'gpt',0,null);g.updatePlayer(p,.2);castSkill(g,p,'gpt',0,null);ok(p.buff.breath===1.2,'Repeated breath stacks movement penalty');for(let i=0;i<30;i++){p.x=320;g.updatePlayer(p,.05)}ok(Math.abs(speed()-base)<1e-6,'Repeated breath fails to expire');
  const expected=CHARS.gpt.speed*1.3*(pet?1.25:1);ok(Math.abs(base-expected)<1e-6,'Permanent speed bonuses changed');rows.push({mount:pet,base,during,after});
 }
 return{cases:rows,repeatedCastExpires:true,permanentBonusesPreserved:true};})()`);
 assert.deepEqual(b.errors,[]);await writeFile(b.out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close()}
