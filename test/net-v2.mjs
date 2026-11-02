// npm run test:net (install Chromium with npx playwright install chromium).
// NET_URL can select a separately served build; NET_PEER selects a TLS PeerServer for real WebRTC.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const server = process.env.NET_URL ? null : spawn('python3', ['-m', 'http.server', '9876', '--bind', '127.0.0.1', '--directory', 'web'], {stdio:'ignore'});
const pvp = process.env.NET_PVP === '1';
const base = process.env.NET_URL || 'http://127.0.0.1:9876';
const browser = await chromium.launch({headless:true, ...(process.env.CHROME_CHANNEL ? {channel:process.env.CHROME_CHANNEL} : {})});
try {
  for (let i=0;i<30;i++) { try { await fetch(base); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
  const ctx = await browser.newContext({viewport:{width:1100,height:620},ignoreHTTPSErrors:true});
  ctx.setDefaultTimeout(15000);
  const a=await ctx.newPage(), b=await ctx.newPage(), errors=[];
  for (const p of [a,b]) p.on('pageerror', e=>errors.push(e.message));
  const query=process.env.NET_PEER ? `?peer=${process.env.NET_PEER}` : '?local&lag=90&jitter=75&loss=0.15';
  for (const p of [a,b]) {
    await p.addInitScript(()=>localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,name:'网络测试',sound:false,music:false})));
    await p.goto(base+'/'+query);
    await p.locator('.t-net').waitFor();
  }
  await a.locator('.t-net').click();await a.getByRole('button',{name:pvp?'竞技场PVP':'合作闯关',exact:true}).click();
  await a.waitForFunction(()=>__app.net?.status.includes('房间已创建'));
  const code=await a.locator('.code').textContent();
  await b.locator('.t-net').click();await b.locator('.code-in').fill(code);await b.getByRole('button',{name:'加入',exact:true}).click();
  await a.waitForFunction(()=>__app.net.members.length===2);
  const extra=[];
  for(let i=2;i<+(process.env.NET_PLAYERS || 2);i++) {
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(()=>localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,name:'队友',sound:false,music:false})));
    await p.goto(base+'/'+query);await p.locator('.t-net').click();await p.locator('.code-in').fill(code);await p.getByRole('button',{name:'加入',exact:true}).click();extra.push(p);
  }
  await a.waitForFunction(n=>__app.net.members.length===n,2+extra.length);
  await a.getByRole('button',{name:pvp?'开战！':'出发！',exact:true}).click();
  await b.waitForFunction(()=>__app.game?.mode==='client' && __app.net.lastSeq>0);
  for (const p of extra) await p.waitForFunction(()=>__app.game?.mode==='client' && __app.net.lastSeq>0);
  if (process.env.NET_PEER) {
    for(const p of [a,b]) await p.waitForFunction(()=>[...__app.net.t.conns.values()].every(c=>c.fast?.readyState==='open'));
    const channels=await b.evaluate(()=>[...__app.net.t.conns.values()].map(c=>({ordered:c.fast.ordered,retries:c.fast.maxRetransmits,reliable:c.dataChannel.ordered})));
    assert(channels.every(c=>c.ordered===false&&c.retries===0&&c.reliable===true));console.log('WebRTC channels',channels);
  }
  // Observe motion from both sides and input prediction without a round trip.
  await b.evaluate(()=>{__dbg.input.mx=1;__dbg.input.atk=true;__dbg.input.pressed.dash=true});
  await b.waitForTimeout(2500);
  const stats=await b.evaluate(()=>({...__app.net.stats,epoch:__app.net.epoch,frames:__app.net.motion.frames.length}));
  assert(stats.received>10 && stats.frames>1 && stats.rtt>0);console.log('network stats',stats);
  await b.evaluate(()=>{__dbg.input.mx=0;__dbg.input.atk=false});
  const before = await b.evaluate(()=>__app.net.stats.received);
  await a.evaluate(()=>{__app.game.hitStop=1});await b.waitForTimeout(1200);
  assert((await b.evaluate(()=>__app.net.stats.received))-before>8,'hit stop stalled network cadence');
  // Duplicate / old state must not rewind the world.
  assert(await b.evaluate(()=>{const n=__app.net,old=n.lastSeq;n.receiveState({epoch:n.epoch,n:old-1});return n.lastSeq===old}));
  // Reliable critical events survive even complete loss of subsequent snapshots.
  await a.evaluate(()=>{const n=__app.net,orig=n.t.send.bind(n.t);n.t.send=(to,d,fast)=>{if(fast&&d.t==='s')return;orig(to,d,fast)};const g=__app.game;const tile=Object.keys(g.map.crates)[0];window.testTile=tile;g.events.push({t:'tile',i:+tile});g.offerCards(g.player(2), 3);});
  const tile=await a.evaluate(()=>window.testTile);
  await b.waitForFunction(t=>__app.game.cardOffers[2]?.length===3&&(!t||__app.game.map.crates[t]?.dead),tile);
  assert(await a.evaluate(()=>{
    const n=__app.net,mem=n.members[1],p=__app.game.player(mem.id);
    const d={t:'action',epoch:n.epoch,n:9999,da:true};
    p.input.dash=false;n.onHostMsg(mem.peer,d);const first=p.input.dash;
    p.input.dash=false;n.onHostMsg(mem.peer,d);return first&&!p.input.dash;
  }));
  // Reliable baseline changes epoch and map even while unreliable snapshots are blocked.
  await a.evaluate(()=>__app.game.nextRoom());
  await b.waitForFunction(()=>__app.game.roomIdx===1);
  const epoch=await b.evaluate(()=>__app.net.epoch);assert(epoch>stats.epoch);
  assert(await b.evaluate(()=>{const n=__app.net,seq=n.lastSeq;n.receiveState({epoch:n.epoch-1,n:seq+100});return n.lastSeq===seq}));
  assert.deepEqual(errors,[]);console.log('PASS: input, stale rejection, reliable cards/tiles, room baseline and epoch isolation');
  await ctx.close();
} finally { await browser.close(); server?.kill(); }
