import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.resolve('tmp/vfx-regressions');
const profile = path.resolve('../.cache/vfx-regression-browser');
await mkdir(profile, { recursive: true });
await mkdir(out, { recursive: true });
await rm(path.join(profile, 'DevToolsActivePort'), { force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let socket;
const errors = [], pending = new Map(); let seq = 0;
try {
  let port;
  for (let n = 0; n < 100; n++) {
    try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await sleep(100); }
  }
  assert(port, 'Chrome ready');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); message.error ? callback.reject(message.error) : callback.resolve(message.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sel:'deepseek',chars:['deepseek','gpt','grok','claude','doubao','glm'],seenUnlock:['deepseek','gpt','grok','claude','doubao','glm'],sound:false,music:false}))` });
  await send('Emulation.setDeviceMetricsOverride', { width:804,height:360,deviceScaleFactor:3,mobile:true });
  await send('Page.navigate', { url:process.env.GAME_TEST_URL || 'http://127.0.0.1:8775' });
  let ready=false;
  for(let i=0;i<150;i++){ if(await evaluate(`Boolean(document.querySelector('.play-btn'))`)){ready=true;break;} await sleep(100); }
  assert(ready,'Lobby ready');
  const report=await evaluate(`(async()=>{
    const {Game}=await import('./js/game.js'),{castUlt}=await import('./js/skills.js'),{Renderer}=await import('./js/render.js');
    const {createFrame,createFx,hex}=await import('./pixelfx/core/index.js');
    const beam=await import('./pixelfx/fx/pickups/loot-beam.js'),water=await import('./pixelfx/fx/water/whirlpool.js');
    const check=(v,m)=>{if(!v)throw new Error(m)};
    const make=()=>{
      const calls=[];const fx={clearAll(){},spawn(id,x,y,o){const handle={stopped:false,stop(){this.stopped=true}};calls.push({id,x,y,o,handle});return handle}};
      const g=new Game({mode:'host',seed:17,fx});const p=g.addPlayer({id:1,cid:'deepseek',kit:{tal:[],eq:[],cards:[]}});g.startRun();
      return {g,p,calls};
    };
    const first=make();first.g.phase='fight';first.g.roomCleared();
    check(first.g.chest && !first.g.chest.opened,'First room chest retained');
    const chestFx=first.calls.find(x=>x.id==='pickups/loot-beam');check(chestFx?.o.opts.item===false,'Chest beam hides baked sword');
    check(first.g.events.some(x=>x.t==='fx' && x.id==='pickups/loot-beam' && x.o.opts.item===false),'Host sends sword-free option');
    first.g.openChest(first.p);check(first.g.chest.opened,'Chest still opens');
    check(first.calls.some(x=>x.id==='pickups/chest-open'),'Chest opening effect retained');
    const steel=hex('#151726')>>>0;
    const renderBeam=item=>{const f=createFrame(256,256);const e=createFx(beam,{x:128,y:200,seed:4,item});e.update(.4);e.draw(f);return f};
    const original=renderBeam(true),clean=renderBeam(false);
    check(original.color.some(c=>c===steel),'Default beam has sword steel pixels');
    check(!clean.color.some(c=>c===steel),'Chest beam has no sword steel pixels');
    check(clean.color.some(Boolean) && clean.light.some(Boolean),'Light column and glow retained');
    const stats=[];
    for(const core of [false,true]){
      const {g,p,calls}=make();p.core=core;castUlt(g,p,0,{x:p.x+120,y:p.y});
      const timer=g.timers.find(t=>t.t===.55);check(timer,'Whale impact delay');timer.fn();
      const tide=g.zones.find(z=>z.kind==='tide'),fx=calls.find(c=>c.id==='water/whirlpool');
      check(tide.r===(core?90:72) && tide.life===(core?8:5),'Gameplay range/duration unchanged');
      check(fx.o.radius===tide.r && fx.o.life===tide.life,'Visual range/lifetime match zone');
      check(tide.fxh===fx.handle,'Zone owns visual handle');
      const event=JSON.parse(JSON.stringify(g.events.find(e=>e.id==='water/whirlpool')));
      check(event.o.radius===tide.r && event.o.life===tide.life,'Host sends matching radius and duration');
      const f=createFrame(256,200),e=createFx(water,{x:128,y:100,radius:tide.r,seed:5});e.update(.9);e.draw(f);
      let x0=256,x1=0,pixels=0;for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(f.color[y*f.w+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);pixels++}
      const drawCalls=[];const spy=new Proxy({},{get:(o,k)=>o[k]??((...a)=>drawCalls.push([k,...a])),set:(o,k,v)=>(o[k]=v,true)});
      Renderer.prototype.drawZone.call({t:1},spy,{...tide,t:1},g);
      check(!drawCalls.some(c=>['ellipse','stroke','setLineDash'].includes(c[0])),'No tide boundary overlay');
      const other=[];const canvas=new Proxy({},{get:(o,k)=>o[k]??((...a)=>other.push([k,...a])),set:(o,k,v)=>(o[k]=v,true)});
      Renderer.prototype.drawZone.call({t:1},canvas,{kind:'domain',x:0,y:0,r:104,t:1,life:6},g);
      check(other.some(c=>c[0]==='setLineDash'),'Other skill domain rendering remains');
      g.enemies=[];g.updateZones(core?8:5);check(fx.handle.stopped,'Whirlpool stops at zone expiry');
      stats.push({core,radius:fx.o.radius,life:fx.o.life,width:x1-x0+1,pixels});
    }
    check(stats[1].width>stats[0].width*1.2,'Core visibly enlarges actual pixel vortex');
    return {chestSwordRemoved:true,beamRetained:true,ult:stats,networkOptions:true,noTideBoundary:true};
  })()`);
  console.log('PASS',JSON.stringify(report));
  await writeFile(path.join(out,'checks.json'),JSON.stringify(report,null,2));
  // Capture the real first-room chest and core ultimate together.
  await evaluate(`document.querySelector('.play-btn').click()`);
  for(let i=0;i<150;i++){if(await evaluate('Boolean(window.__app?.game && window.__app?.me)'))break;await sleep(100)}
  await sleep(1800);
  await evaluate(`(async()=>{
    const g=__app.game,p=__app.me;__app.paused=true;g.enemies=[];g.fx.clearAll();g.zones=[];g.timers=[];
    g.phase='fight';g.roomCleared();p.core=true;
    const {castUlt}=await import('./js/skills.js');castUlt(g,p,0,{x:p.x+130,y:p.y});g.timers.find(t=>t.t===.55).fn();g.fx.update(.9);
  })()`);
  await sleep(250);
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(path.join(out,'chest-and-core-vortex.png'),Buffer.from(shot.data,'base64'));
  assert.deepEqual(errors,[]);console.log('PASS actual scene screenshot; no page errors');
  await send('Browser.close');
} finally { socket?.close(); chrome.kill(); }
