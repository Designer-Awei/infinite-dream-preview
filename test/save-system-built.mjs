// Test the shipped bundle via real settings buttons; do not import unbundled game modules.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fixture=JSON.parse(await readFile('.cache/save-system/fixture.json','utf8')),manifest=JSON.parse(await readFile('docs/update.json','utf8'));
const url=process.env.TEST_URL||'http://127.0.0.1:9878';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 const open=async(native=false)=>{
  const ctx=await browser.newContext({viewport:{width:native?667:804,height:375},isMobile:true,hasTouch:true,...(native?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{})});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({fixture,native,rev})=>{
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async v=>{window.__clip=v;},readText:async()=>window.__clip||''}});
   if(native){window.Capacitor={isNativePlatform:()=>true,Plugins:{App:{getInfo:async()=>({version:`1.${rev}.test`})}}};Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});}
   if(localStorage.getItem('test-seeded'))return;localStorage.setItem('test-seeded','yes');
   const d=JSON.parse(JSON.stringify(fixture));d.main.name=native?'目标原进度':'新版源进度';d.main.tutorialSeen=true;d.main.seenUnlock=[...d.main.chars];d.main.sound=false;d.main.music=false;
   if(native){d.main.tokens=17;d.world.opened=[99999];d.home.lv.hut=0;}
   for(const [id,key] of Object.entries({main:'ai-girls-dungeon-v1',world:'ai-girls-dungeon-world-v1',home:'ai-girls-dungeon-home-v1',run:'ai-girls-dungeon-run-v1'}))localStorage.setItem(key,JSON.stringify(d[id]));
  },{fixture,native,rev:manifest.native});
  await p.goto(url);await p.locator('.play-btn').waitFor({timeout:60000});await p.evaluate(()=>document.querySelector('.resume-md')?.remove());return p;
 };
 const a=await open();await a.locator('.set-btn').click();await a.getByRole('button',{name:'导出存档',exact:true}).click();
 const code=await a.locator('.save-code').inputValue();assert(code.startsWith('IDSAVE2.'));await a.getByRole('button',{name:'复制压缩存档码'}).click();await a.waitForFunction(()=>document.querySelector('.save-msg')?.textContent.includes('回读一致'));
 await a.screenshot({path:'.cache/save-system/browser/built-export-804.png'});
 const keys=['ai-girls-dungeon-v1','ai-girls-dungeon-world-v1','ai-girls-dungeon-home-v1','ai-girls-dungeon-run-v1'];
 const expected=await a.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,JSON.parse(localStorage.getItem(k))])),keys);
 const b=await open(true);await b.locator('.set-btn').click();await b.getByRole('button',{name:'导入存档',exact:true}).click();await b.locator('.save-code').fill(code);
 await b.waitForFunction(()=>!document.querySelector('.save-panel .acts button:nth-child(2)').disabled);await b.getByRole('button',{name:'预览并覆盖'}).click();await b.getByRole('button',{name:'确认覆盖',exact:true}).click();
 await b.waitForTimeout(700);await b.locator('.play-btn').waitFor({timeout:60000});
 const actual=await b.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,JSON.parse(localStorage.getItem(k))])),keys);assert.deepEqual(actual,expected);
 await b.evaluate(()=>document.querySelector('.resume-md')?.remove());await b.locator('.set-btn').click();await b.getByRole('button',{name:'导出存档',exact:true}).click();
 assert.match(await b.locator('.save-summary').innerText(),/新版源进度/);assert.match(await b.locator('.save-meta').innerText(),new RegExp(manifest.version.replaceAll('.','\\.')));
 await b.getByRole('button',{name:'复制压缩存档码'}).click();await b.waitForFunction(()=>document.querySelector('.save-msg')?.textContent.includes('回读一致'));
 await b.screenshot({path:'.cache/save-system/browser/built-native-simulated-667.png'});assert.deepEqual(errors,[]);
 const report={status:'PASS',bundle:true,realSettingsButtons:true,separateStoresAfterReload:true,modules:4,withoutWebCrypto:true,androidShellSimulated:true,physicalAndroid:false,identityAndNativeRevisionUnchanged:true,pageErrors:errors};
 await writeFile('.cache/save-system/browser/built-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
