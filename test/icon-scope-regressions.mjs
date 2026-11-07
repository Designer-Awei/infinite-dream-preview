import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.resolve('tmp/icon-scope-regressions');
const profile = path.resolve('../.cache/icon-scope-browser');
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

  const baselineRef='e75d821';
  const git='C:/Program Files/Git/cmd/git.exe';
  const baselineCSS=execFileSync(git,['show',baselineRef+':web/css/style.css'],{encoding:'utf8'}).replaceAll('../assets/','/assets/');
  const baselineIcons=execFileSync(git,['show',baselineRef+':web/js/icons.js'],{encoding:'utf8'}).replace('"./data.js"','"http://127.0.0.1:8775/js/data.js"');
  const names=[...baselineIcons.matchAll(/^  (\w+)\(p\)/gm)].map(m=>m[1]);
  const result=await evaluate(`(async()=>{
    const baseline=await import(URL.createObjectURL(new Blob([${JSON.stringify(baselineIcons)}],{type:'text/javascript'})));
    const current=await import('./js/icons.js');
    const names=${JSON.stringify(names)},different=[];
    for(const name of names){const a=baseline.icon(name),b=current.icon(name);if(a.toDataURL()!==b.toDataURL())different.push(name)}
    const freeze=document.createElement('style');freeze.textContent='*{animation:none!important;transition:none!important}';document.head.appendChild(freeze);
    const selectors=['.codex-btn span','.help-btn span','.set-btn','.name-pill span','.t-gacha .ti','.t-net .ti','.t-gacha .tl','.t-net .tl','.li-name','.li-level','.play-btn'];
    const styles=()=>selectors.map(selector=>{const n=document.querySelector(selector),s=getComputedStyle(n);return{selector,shadow:s.textShadow,stroke:s.webkitTextStrokeWidth,strokeColor:s.webkitTextStrokeColor,font:s.fontFamily,fontSize:s.fontSize,color:s.color,filter:s.filter,border:s.border,boxShadow:s.boxShadow}});
    const currentStyles=styles();const link=document.querySelector('link[rel="stylesheet"]'),old=document.createElement('style');old.textContent=${JSON.stringify(baselineCSS)};document.head.appendChild(old);link.disabled=true;
    const baselineStyles=styles();link.disabled=false;old.remove();
    return{baselineRef:${JSON.stringify(baselineRef)},iconsCompared:names.length,changedIcons:different,baselineStyles,currentStyles};
  })()`);
  assert.deepEqual(result.changedIcons,[],'Existing pixel icons must be byte-identical');assert.deepEqual(result.currentStyles,result.baselineStyles,'Other UI icon/text outline styles unchanged');
  await writeFile(path.join(out,'checks.json'),JSON.stringify(result,null,2));
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'lobby-current.png'),Buffer.from(shot.data,'base64'));
  assert.deepEqual(errors,[]);console.log(`PASS ${result.iconsCompared} existing pixel icons byte-identical; ${result.currentStyles.length} other UI styles unchanged versus ${baselineRef}.`);
  await send('Browser.close');
} finally {socket?.close();chrome.kill();}
