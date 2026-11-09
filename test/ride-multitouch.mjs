import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:804,height:360},isMobile:true,hasTouch:true});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,name:'骑乘测试',sound:false,music:false})));
 await p.goto(process.env.TEST_URL||'http://127.0.0.1:9877');await p.locator('.play-btn').waitFor();
 await p.evaluate(()=>__app.startPetTrial('dragon'));await p.locator('.pet-ride-btn').waitFor();await p.locator('.doors').waitFor({state:'detached'});
 await p.evaluate(()=>{__app.game.enemies=[];__app.game.wave=0;__app.game.waveDelay=100000;__app.game.phase="fight";__app.me.invuln=100;document.body.classList.add('touchmode')});
 const cdp=await ctx.newCDPSession(p),joy={x:100,y:260,id:1},drag={x:140,y:260,id:1};
 const box=await p.locator('.pet-ride-btn').boundingBox(),ride={x:box.x+box.width/2,y:box.y+box.height/2,id:2};

 const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(t=>({...t,radiusX:4,radiusY:4,force:1}))});
 await touch('touchStart',[joy]);await touch('touchMove',[drag]);
 await p.waitForFunction(()=>__dbg.input.mx>.5);
 for(const mounted of [true,false,true,false]){
  await p.waitForTimeout(450);
  await touch('touchStart',[drag,ride]);await p.waitForTimeout(100);
  assert.equal(await p.evaluate(()=>__app.me.mounted),mounted,'toggle during held joystick');
  await touch('touchEnd',[ride]);await p.waitForTimeout(100);
  assert.equal(await p.evaluate(()=>__app.me.mounted),mounted,'no duplicate compatibility click');
  assert((await p.evaluate(()=>__dbg.input.mx))>.5,'other finger still controls joystick');
 }
 const atkBox=await p.locator('.b-atk').boundingBox(),fire={x:atkBox.x+atkBox.width/2,y:atkBox.y+atkBox.height/2,id:3};
 await touch('touchStart',[drag,fire]);await p.waitForFunction(()=>__dbg.input.atk);
 for(const mounted of [true,false]){
  await p.waitForTimeout(450);await touch('touchStart',[drag,fire,ride]);await p.waitForTimeout(100);
  assert.equal(await p.evaluate(()=>__app.me.mounted),mounted,'third-finger mount while firing');
  await touch('touchEnd',[ride]);await p.waitForTimeout(60);
  assert(await p.evaluate(()=>__dbg.input.atk&&__dbg.input.mx>.5),'movement and held attack survive ride tap');
 }
 await touch('touchEnd',[fire]);await p.waitForTimeout(60);assert(!(await p.evaluate(()=>__dbg.input.atk)));
 await touch('touchEnd',[]);await p.waitForTimeout(900);
 await p.locator('.pet-ride-btn').click();await p.waitForTimeout(60);assert(await p.evaluate(()=>__app.me.mounted),'mouse click');
 await p.waitForTimeout(450);await p.keyboard.press('KeyR');await p.waitForTimeout(60);assert(!(await p.evaluate(()=>__app.me.mounted)),'R key dismount');
 // Disabled/downed players cannot mount through the pointer path.
 await p.evaluate(()=>{__app.me.downed=true;document.querySelector('.pet-ride-btn').disabled=true;__dbg.input.pressed.mount=false});
 await touch('touchStart',[ride]);await touch('touchEnd',[]);assert(!(await p.evaluate(()=>__dbg.input.pressed.mount)));
 assert.deepEqual(errors,[]);console.log('PASS: held-joystick mount/dismount x4 and third-finger attack+ride x2, no duplicate click, joystick retained, mouse/R and disabled state');
}finally{await browser.close()}
