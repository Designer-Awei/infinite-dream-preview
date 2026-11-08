// Smoke test the bundled /docs build without importing development modules.
import assert from 'node:assert/strict';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('pet-published');
try {
 for(const species of ['fox','dragon','phoenix']){
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8776/docs/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false,pets:{owned:{fox:{stage:3,xp:1200}},equipped:'fox'}}))`});
 await p.wait(`!!document.querySelector('.pet-entry')`);
 await p.evaluate(`document.querySelector('.pet-entry').click();[...document.querySelectorAll('.pet-choice')].find(x=>x.textContent.includes('${species==='fox'?'灵狐':species==='dragon'?'火龙':'冰凰'}')).click();document.querySelector('.pet-trial button').click()`);
 await p.wait(`!!document.querySelector('.pet-ride-btn')`);
 await p.wait(`!document.querySelector('.doors')`);
 await p.evaluate(`document.querySelector('.pet-ride-btn').click()`);
 await p.wait(`document.querySelector('.pet-ride-btn span')?.textContent==='下骑'`);
 assert(await p.evaluate(`!!document.querySelector('.pet-trial-tag')`));
 await p.shot('bundled-'+species+'-mounted');
 await sleep(500); // Respect the existing 0.4s mount toggle cooldown.
 await p.evaluate(`document.querySelector('.pet-ride-btn').click()`);
 await p.wait(`document.querySelector('.pet-ride-btn span')?.textContent==='骑乘'`);
 }
 assert.deepEqual(b.errors,[]);
 console.log('PASS bundled build: lobby, three pet trials, mount, dismount, no page errors');
} finally {await b.close();}
