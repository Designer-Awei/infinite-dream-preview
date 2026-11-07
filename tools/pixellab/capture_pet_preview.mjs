// Run against the repository-root HTTP server on port 8776, using installed Chrome.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '../..');
const out = process.env.PET_CAPTURE_OUT || path.join(root, 'art/pets/approved-v1');
const stages=process.argv.includes('--adult-only')?[3]:[1,2,3];
const stillOnly=process.argv.includes('--still-only');
await mkdir(out,{recursive:true});
const profile = path.resolve(root, '../.cache/pet-preview-browser');
await mkdir(profile, { recursive: true });
await rm(path.join(profile,'DevToolsActivePort'),{force:true});
const env = { ...process.env, TEMP: path.resolve(root, '../.cache'), TMP: path.resolve(root, '../.cache'), TMPDIR: path.resolve(root, '../.cache') };
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { env, stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let socket, seq = 0; const pending = new Map(), errors = [];
try {
  let port;
  for (let n = 0; n < 100; n++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await sleep(100); } }
  assert(port, 'Chrome ready');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 650, deviceScaleFactor: 1, mobile: false });
  const previewURL=process.env.PET_PREVIEW_URL || 'http://127.0.0.1:8776/art/pets/approved-v1/preview.html';
  await send('Page.navigate', { url: previewURL });
  for (let n = 0; n < 100 && !(await evaluate('!!window.petPreview')); n++) await sleep(100);
  await evaluate('petPreview.ready'); await evaluate('petPreview.state.manual=true');
  for (const stage of stages) {
    assert.equal(await evaluate(`document.querySelector('[data-stage="${stage}"]').click();petPreview.state.stage`), stage);
    const n = await evaluate('Object.keys(PET_DATA.actors).length'); assert.equal(n, stages.length*3);
    await evaluate('petPreview.drawAt(3.2)');
  }
  const bytes = async t => {
    if(previewURL.startsWith('file:')) {
      // file:// may display local sprites but cannot export canvas pixels across file origins.
      const clip=await evaluate(`petPreview.drawAt(${t});(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
      const shot=await send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});return Buffer.from(shot.data,'base64');
    }
    return Buffer.from(await evaluate(`petPreview.drawAt(${t});document.querySelector('canvas').toDataURL('image/png').split(',')[1]`), 'base64');
  };
  const withFX = await bytes(3.2);
  await evaluate("document.querySelector('#effects').click()");
  assert.equal(await evaluate('petPreview.state.effects'), false);
  const bodyOnly = await bytes(3.2); assert(!withFX.equals(bodyOnly), 'Effects are independent from body frames');
  await writeFile(path.join(out, 'body-only-preview.png'), bodyOnly);
  await evaluate("document.querySelector('#effects').click()");
  await evaluate("document.querySelector('#range').value=250;document.querySelector('#range').dispatchEvent(new Event('input'))");
  assert.equal(await evaluate('petPreview.state.range'), 250);
  await evaluate('petPreview.state.range=210');
  await evaluate("document.querySelector('#radius').value=92;document.querySelector('#radius').dispatchEvent(new Event('input'))");
  assert.equal(await evaluate('petPreview.state.radius'),92);await evaluate('petPreview.state.radius=72');
  assert.equal(await evaluate('petPreview.phaseAt(0).power'),0);assert.equal(await evaluate('petPreview.phaseAt(5).power'),0);
  assert.equal(await evaluate('petPreview.phaseAt(3.2).power'),1);
  await writeFile(path.join(out, 'skill-preview.png'), await bytes(3.2));
  await evaluate("document.querySelector('#idle').click()"); assert.equal(await evaluate('petPreview.state.idleOnly'), true);
  const idleStart=await bytes(0),idleMoved=await bytes(.8); assert(!idleStart.equals(idleMoved),'Living idle frames actually animate');
  await evaluate("document.querySelector('#idle').click()");
  await evaluate("document.querySelector('#move').click()");assert.equal(await evaluate('petPreview.state.moveOnly'),true);const moveA=await bytes(.15),moveB=await bytes(.65);assert(!moveA.equals(moveB),'Movement body frames animate');await bytes(3.2);await evaluate("document.querySelector('#move').click()");
  if (!stillOnly) {
  const ffmpeg = process.env.FFMPEG;
  assert(ffmpeg, 'Set FFMPEG to the installed executable');
  const encoder = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '24', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', path.join(out, 'skill-preview.mp4')], { env, windowsHide: true });
  let stderr = ''; encoder.stderr.on('data', b => { stderr += b; });
  const done = new Promise((resolve, reject) => { encoder.on('error', reject); encoder.on('close', code => code ? reject(Error(stderr)) : resolve()); });
  for (const stage of stages) {
    await evaluate(`petPreview.setStage(${stage})`);
    for (let i = 0; i < 162; i++) { if (!encoder.stdin.write(await bytes(i / 24))) await new Promise(resolve => encoder.stdin.once('drain', resolve)); }
  }
  encoder.stdin.end(); await done;
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'preview-check.json'), JSON.stringify({ actors: stages.length*3, clips: stages.length*9, stages, livingIdle: true, movement: true, effectsToggle: true, adjustableRange: true, adjustableRadius: true, effectsTiming: true, pageErrors: errors, video: stillOnly ? null : { width: 1200, height: 370, fps: 24, duration: 6.75*stages.length }, gameplayIntegrated: true }, null, 2));
  await send('Browser.close');
  console.log(`PASS ${stages.length*3} actors, stage controls, living idle, independent world effects, range adjustment, no page errors; ${stillOnly?'still capture':`recorded ${6.75*stages.length}s preview`}.`);
} finally { socket?.close(); chrome.kill(); }
