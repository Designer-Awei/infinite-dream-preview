import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.resolve('tmp/rift-mine-regressions');
const profile = path.resolve('../.cache/rift-mine-browser');
await mkdir(profile, { recursive: true });
await mkdir(out, { recursive: true });
await rm(path.join(profile, 'DevToolsActivePort'), { force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
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
  await evaluate('document.fonts.ready.then(()=>true)');
  const report=await evaluate(`(async()=>{
    const {app}=await import('./js/main.js'),S=await import('./js/save.js'),UI=await import('./js/ui.js');
    const {REWARD}=await import('./js/data.js'),{Game}=await import('./js/game.js');
    const {Dive,setMute}=await import('./js/mine.js'),{Renderer}=await import('./js/render.js');
    const {icon}=await import('./js/icons.js');
    const check=(v,m)=>{if(!v)throw Error(m)};
    const meta=S.load();meta.maps={grass:1,ice:1,lava:1};meta.stats.runs=3;
    UI.toast('裂隙收获：晶石 200');const notice=getComputedStyle(document.querySelector('.toast'));check(notice.textShadow==='none' && notice.webkitTextStrokeWidth==='2px' && notice.paintOrder.startsWith('stroke'),'Toast uses single 2px stroke');document.querySelectorAll('.toast').forEach(n=>n.remove());
    const make=(endless=false)=>{
      UI.clear();app.net=null;app.begin({mode:'solo',pvp:false,seed:17,players:[{id:1,cid:'grok',name:'回归检查',kit:{tal:[],eq:[],cards:[]}}],myId:1,opt:{map:'lava',endless}});
      const g=app.game;g.runStats.rooms=0;g.runStats.kills=0;g.runStats.elites=0;g.runStats.boss=false;g.phase='clear';g.roomIdx=6;app.paused=true;return g;
    };
    const shadows=()=>{
      const buttons=[...document.querySelectorAll('.res-r .acts .btn')];check(buttons.length===2,'Two result buttons');
      for(const b of buttons){const s=getComputedStyle(b);
        check(s.textShadow==='none' && s.webkitTextStrokeWidth==='2px' && s.paintOrder.startsWith('stroke') && s.boxShadow==='none','Single 2px stroke, no extra text or button shadow');
        b.classList.add('press');check(getComputedStyle(b).textShadow===s.textShadow && getComputedStyle(b).boxShadow==='none','Pressed button preserves outline');b.classList.remove('press');}
    };
    let g=make();let before=meta.tokens;app.offerRift();
    check(!document.querySelector('.rift-modal').textContent.includes('不了'),'Old decline wording removed');
    check(document.querySelector('.rift-modal').textContent.includes('200 晶石'),'Decline reward explained');
    for(const b of document.querySelectorAll('.rift-modal button')){const s=getComputedStyle(b);check(s.textShadow==='none' && s.webkitTextStrokeWidth==='2px' && s.paintOrder.startsWith('stroke'),'Rift buttons use single 2px stroke');}
    let skip=[...document.querySelectorAll('.rift-modal button')].find(b=>b.textContent==='放弃进入');check(skip,'Normal room skip label');skip.click();skip.click();
    check(g.runStats.riftDeclines===1 && meta.tokens-before===200,'Normal skip grants one flat 200 at settlement, not 1.7x');
    check(app.ended,'Normal boss ends as before');app.endRun(true);check(meta.tokens-before===200,'Settlement idempotent');shadows();
    g=make(true);g.roomIdx=14;before=meta.tokens;app.offerRift();app.offerRift();check(document.querySelectorAll('.rift-modal').length===1,'Only one offer per boss');
    check(document.querySelector('.rift-modal').textContent.includes('不会提前结算'),'Endless return explanation');
    skip=[...document.querySelectorAll('.rift-modal button')].find(b=>b.textContent==='放弃进入');skip.click();skip.click();
    check(!app.ended && g.phase==='clear' && meta.tokens===before && g.runStats.riftDeclines===1,'Endless skip continues, reward deferred');
    app.offerRift();check(!document.querySelector('.rift-modal'),'Same boss cannot grant another decline');
    g.roomIdx=19;app.offerRift();[...document.querySelectorAll('.rift-modal button')].find(b=>b.textContent==='放弃进入').click();
    check(g.runStats.riftDeclines===2 && meta.tokens===before,'Multiple declines accumulate');
    g.roomIdx=24;app.offerRift();document.querySelector('.rift-modal button').click();
    check(app.dive && app.dive.lite.time===90,'Entering still starts 90s dig');const dive=app.dive;app.endRift(dive,{value:0,mats:0,stars:0});
    check(app.game===g && !app.ended && !app.dive && g.roomIdx===24 && g.runStats.riftDeclines===2,'Endless returns to same progress; entering grants no decline reward');
    app.endRun(false);check(meta.tokens-before===400,'Final defeat settlement includes 2 x 200');shadows();
    const labels=[...document.querySelectorAll('.res-label')].map(n=>n.textContent);check(labels.includes('放弃裂隙'),'Bonus is itemized');
    // Test actual monster death, not just an effect wrapper.
    setMute(true);const calls=[];const d=new Dive({cid:'grok',shovel:'cu',up:{},seed:17,fx:{spawn(id,x,y,o){calls.push({id,o})}}});
    const mole=d.mkMob('mole',200,320);d.mobs=[mole];d.hitMob(mole,9999);setMute(false);
    check(d.moles===1 && d.bag.length>=4 && d.bag.length<=6 && d.stars>=2,'Mole loot retained');
    check(calls.find(c=>c.id==='pickups/loot-beam')?.o.opts.item===false,'Mole beam has no sword');
    d.spawnFx('pickups/loot-beam',0,0,{opts:{radius:20}});check(calls.at(-1).o.opts.item===false && calls.at(-1).o.opts.radius===20,'Other mine beams hide sword without losing options');
    // Host event carries the back-layer choice, and the real renderer never washes out chest pixels.
    const {FxLayer,loadFx}=await import('./js/fx.js');await loadFx();const fx=new FxLayer(804,360);
    const host=new Game({mode:'host',seed:17,fx});const hero=host.addPlayer({id:1,cid:'deepseek',kit:{tal:[],eq:[],cards:[]}});host.startRun();host.enemies=[];host.phase='fight';host.roomCleared();
    const event=JSON.parse(JSON.stringify(host.events.find(e=>e.id==='pickups/loot-beam')));check(event.o.layer==='back' && event.o.opts.item===false,'Network event preserves back layer and sword-free option');
    const canvas=document.createElement('canvas');canvas.width=1608;canvas.height=720;const r=new Renderer(canvas,fx);r.cam.x=host.map.center.x-402;r.cam.y=host.map.center.y-180;hero.x=host.chest.x-160;hero.y=host.chest.y;
    const samples=[];for(const t of [.05,.25,.6,1.5,2.6]){fx.clearAll();fx.spawn(event.id,event.x,event.y,event.o);fx.update(t);r.draw(host,hero,0);
      const x=Math.round((host.chest.x-12-Math.round(r.cam.x))*2),y=Math.round((host.chest.y-10-Math.round(r.cam.y))*2);const color=[...canvas.getContext('2d').getImageData(x,y,1,1).data];check(color.join(',')==='255,216,74,255','Chest foreground stable at '+t+': '+color);samples.push({t,color});}
    // Leave a populated result for screenshot and alignment checks.
    UI.clear();g=make(true);g.runStats.rooms=30;g.runStats.kills=860;g.runStats.shovels=['ag','ag','ag'];g.runStats.riftDeclines=2;app.endRun(false);
    const more=document.querySelector('.res-more');if(more)more.click();
    const mine=[...document.querySelectorAll('.res-detail-list .res-chip')].find(n=>n.textContent.includes('梦境矿场'));check(mine && !mine.querySelector('.res-icon') && !mine.textContent.includes('⛏'),'Mine settlement label is plain aligned text');
    app.paused=true;
    return {normalDecline:200,endlessDeclines:400,repeatedClicksSafe:true,enteredRiftReturns:true,resultStroke:'2px',riftStroke:'2px',moleLoot:d.bag.length,moleSwordRemoved:true,chestSamples:samples,networkBackLayer:true};
  })()`);
  console.log('PASS',JSON.stringify(report));
  await writeFile(path.join(out,'checks.json'),JSON.stringify(report,null,2));
  await evaluate(`document.querySelectorAll('.toast').forEach(n=>n.remove())`);await sleep(600);
  let shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'settlement-details.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`document.querySelector('.res-sheet header button')?.click()`);
  shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'battle-result.png'),Buffer.from(shot.data,'base64'));
  for(const [width,height] of [[804,360],[667,375]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:3,mobile:true});
    for(const endless of [true,false]){
      await evaluate(`(async()=>{const {app}=await import('./js/main.js'),UI=await import('./js/ui.js');UI.clear();app.ended=false;app.game.endless=${endless};app.game.roomIdx++;app.offerRift();})()`);
      const fits=await evaluate(`(()=>{const p=document.querySelector('.rift-modal .panel').getBoundingClientRect(),buttons=[...document.querySelectorAll('.rift-modal button')].map(b=>b.getBoundingClientRect());return p.top>=0 && p.bottom<=innerHeight && p.left>=0 && p.right<=innerWidth && buttons.every(b=>b.bottom<=p.bottom)})()`);assert(fits,'Rift dialog fits '+width+'x'+height);
      shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'rift-'+(endless?'endless':'normal')+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
    }
  }
  await evaluate(`(async()=>{const UI=await import('./js/ui.js'),M=await import('./js/mineui.js');UI.clear();M.showMineResult({how:'extract',cid:'grok',kept:['rune','gear'],value:1024,mats:460,stars:437,depth:121,dug:303,kills:10},()=>{},()=>{});})()`);
  const mineStyle=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.mres .acts .btn'));return{shadow:s.textShadow,stroke:s.webkitTextStrokeWidth}})()`);assert.equal(mineStyle.shadow,'none');assert.equal(mineStyle.stroke,'2px');
  shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'mine-result.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`import('./js/lobby.js').then(L=>L.showLobby())`);await sleep(300);
  assert(await evaluate(`document.querySelector('.t-mine .ti img').naturalWidth===64`),'New PixelLab mine icon loads at native 64px');
  shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'mine-icon.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`import('./js/ui.js').then(UI=>UI.toast('已放弃裂隙，本局结算额外 +200 晶石',3000))`);await sleep(150);
  shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'notification.png'),Buffer.from(shot.data,'base64'));
  assert.deepEqual(errors,[]);console.log('PASS both phone sizes, battle/mine result styles, lobby icon; no page errors');
  await send('Browser.close');
} finally {socket?.close();chrome.kill();}
