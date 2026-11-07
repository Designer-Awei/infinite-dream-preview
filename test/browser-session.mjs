import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function browserSession(name='pet-gameplay') {
  const profile=path.resolve('../.cache/'+name+'-browser'),out=path.resolve('tmp/'+name);
  await mkdir(profile,{recursive:true});await mkdir(out,{recursive:true});await rm(path.join(profile,'DevToolsActivePort'),{force:true});
  const cache=path.resolve('../.cache');
  const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-renderer-backgrounding','--disable-background-timer-throttling','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{env:{...process.env,TEMP:cache,TMP:cache,TMPDIR:cache},stdio:'ignore',windowsHide:true});
  let port;for(let n=0;n<100;n++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await sleep(100);}}
  if(!port){chrome.kill();throw Error('Chrome not ready');}
  const pages=[],errors=[];
  async function page(url,{width=804,height=360,mobile=true,source}={}) {
    const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
    const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let seq=0;const pending=new Map();
    ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    if(source)await send('Page.addScriptToEvaluateOnNewDocument',{source});
    await send('Page.navigate',{url});
    const obj={send,evaluate,ws,shot:async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));},wait:async expression=>{for(let n=0;n<150;n++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timeout: '+expression);}};
    pages.push(obj);return obj;
  }
  return{out,page,errors,close:async()=>{for(const p of pages)p.ws.close();chrome.kill();}};
}
