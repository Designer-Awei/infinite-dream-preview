// Shipped bundle: mobile -> real Chrome clipboard -> independent desktop context -> reload.
// Android WebView bridge/UA are simulated; clipboard and copy events are NOT mocked.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fixture=JSON.parse(await readFile('.cache/save-system/fixture.json','utf8')),manifest=JSON.parse(await readFile('docs/update.json','utf8'));
const url=process.env.TEST_URL||'http://127.0.0.1:9878',out='.cache/save-system/browser';await mkdir(out,{recursive:true});
const keys=['ai-girls-dungeon-v1','ai-girls-dungeon-world-v1','ai-girls-dungeon-home-v1','ai-girls-dungeon-run-v1'];
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],reports=[];
async function layout(p){
 await p.waitForTimeout(60);
 const l=await p.locator('.save-panel').evaluate(panel=>{
  const box=panel.getBoundingClientRect(),body=panel.querySelector('.save-body'),ta=panel.querySelector('.save-code'),r=ta.getBoundingClientRect();
  const fields=[...panel.querySelectorAll('.save-field')].map(f=>{const label=f.querySelector('.save-field-label').getBoundingClientRect(),value=f.querySelector('.save-field-value').getBoundingClientRect();return{left:label.left,gap:value.left-label.right};});
  return{fields,top:box.top,height:box.height,bottom:box.bottom,viewport:innerHeight,scroll:panel.scrollHeight-panel.clientHeight,bodyScroll:body.scrollHeight-body.clientHeight,
   buttons:[...panel.querySelectorAll('.acts button')].map(b=>b.getBoundingClientRect().width),ringSpace:[r.left-box.left,box.right-r.right,r.top-body.getBoundingClientRect().top,body.getBoundingClientRect().bottom-r.bottom],outline:getComputedStyle(ta).outlineStyle};
 });
 assert.equal(l.fields.length,9);assert(l.fields.every(f=>f.gap>=8));
 for(const indexes of [[0,3,6],[1,4,7],[2,5,8]])assert(indexes.every(i=>Math.abs(l.fields[i].left-l.fields[indexes[0]].left)<1),'summary columns must align');
 assert(l.top>=0&&l.bottom<=l.viewport,'modal must fit in viewport');assert(l.scroll<=1&&l.bodyScroll<=1,'no modal scrolling');assert.equal(l.buttons.length,2);assert.equal(l.buttons[0],l.buttons[1]);assert(l.ringSpace.every(n=>n>=3),'focus ring must fit fully inside ancestors');return l;
}
try{
 const open=async(mobile,count)=>{
  const ctx=await browser.newContext({viewport:{width:mobile?804:1280,height:mobile?360:720},isMobile:mobile,hasTouch:mobile,permissions:['clipboard-read','clipboard-write'],...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{})});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({fixture,mobile,rev,count,keys})=>{
   if(mobile){window.Capacitor={isNativePlatform:()=>true,Plugins:{App:{getInfo:async()=>({version:`1.${rev}.test`})}}};Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});}
   if(localStorage.getItem('test-seeded'))return;localStorage.setItem('test-seeded','yes');
   const d=JSON.parse(JSON.stringify(fixture));d.main.name=mobile?'手机源进度🐉':'电脑原进度';d.main.tutorialSeen=true;d.main.seenUnlock=[...d.main.chars];d.main.sound=false;d.main.music=false;
   if(mobile&&count>8)d.main.pets.list=Array.from({length:count},(_,i)=>({...d.main.pets.list[i%8],uid:'p'+i.toString(36),xp:i%1200,t:1700000000000+i*23871}));
   if(!mobile){d.main.tokens=17;d.world.opened=[99999];d.home.lv.hut=0;}
   ['main','world','home','run'].forEach((id,i)=>localStorage.setItem(keys[i],JSON.stringify(d[id])));
  },{fixture,mobile,rev:manifest.native,count,keys});
  await p.goto(url);await p.locator('.play-btn').waitFor({timeout:60000});await p.evaluate(()=>document.querySelector('.resume-md')?.remove());return{ctx,p};
 };
 for(const count of [8,2500]){
  const {ctx:ac,p:a}=await open(true,count);
  await a.locator('.set-btn').click();assert.equal(await a.getByRole('button',{name:'历史备份',exact:true}).count(),0);
  await a.getByRole('button',{name:'导出存档',exact:true}).click();
  const code=await a.locator('.save-code').inputValue();assert(code.startsWith('IDSAVE2.'));
  // Start with an intentionally partial selection: copying must still include the entire SHA trailer.
  await a.locator('.save-code').evaluate(ta=>{ta.focus();ta.setSelectionRange(16,80);});
  await a.getByRole('button',{name:'复制存档码'}).click();
  await a.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('已复制存档码'));
  assert.equal(await a.evaluate(()=>navigator.clipboard.readText()),code);
  const expected=await a.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,JSON.parse(localStorage.getItem(k))])),keys);
  if(count===8){
    assert.equal(await a.locator('.save-meta,.save-msg,.save-panel .muted').count(),0);
    for(const [width,height] of [[804,360],[667,375],[896,400]]){await a.setViewportSize({width,height});await a.locator('.save-code').focus();await layout(a);await a.screenshot({path:out+`/export-${width}.png`});}
  }
  const {ctx:bc,p:b}=await open(false,count);
  await b.locator('.set-btn').click();await b.getByRole('button',{name:'导入存档',exact:true}).click();
  assert.equal(await b.locator('.save-msg').innerText(),'请先粘贴存档码');assert.equal(await b.locator('.save-msg.save-valid').count(),0);assert(await b.getByRole('button',{name:'覆盖存档'}).isDisabled());
  const layoutBefore=await layout(b);
  await b.screenshot({path:out+'/import-empty.png'});
  // Verify rejection leaves all four target modules intact, then paste using the browser’s native paste shortcut.
  const before=await b.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),keys);
  await b.locator('.save-code').fill(code.slice(0,code.lastIndexOf('.')));await b.waitForTimeout(250);
  assert(await b.getByRole('button',{name:'覆盖存档'}).isDisabled());
  assert.deepEqual(await b.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),keys),before);
  await b.locator('.save-code').fill('');await b.locator('.save-code').focus();await b.keyboard.press('ControlOrMeta+V');
  await b.waitForFunction(()=>!document.querySelector('.save-panel .acts button:first-child').disabled);
  assert.equal(await b.locator('.save-code').inputValue(),code);
  assert.equal(await b.locator('.save-field').filter({has:b.locator('.save-field-label',{hasText:'宠物'})}).locator('.save-field-value').innerText(),String(count));
  const layoutAfter=await layout(b);assert.equal(layoutAfter.height,layoutBefore.height);assert.equal(layoutAfter.top,layoutBefore.top);
  if(count===8){
    for(const [width,height] of [[804,360],[667,375],[896,400],[1280,720]]){
      await b.setViewportSize({width,height});await layout(b);await b.screenshot({path:out+`/import-filled-${width}.png`});
      await b.locator('.save-code').fill('');assert.equal(await b.locator('.save-msg.save-valid').count(),0);await b.waitForTimeout(220);const empty=await layout(b);
      await b.screenshot({path:out+`/import-empty-${width}.png`});
      await b.locator('.save-code').fill(code);await b.waitForTimeout(220);const full=await layout(b);assert.equal(empty.height,full.height);assert.equal(empty.top,full.top);
    }
  }
  await b.getByRole('button',{name:'覆盖存档'}).click();await b.getByRole('button',{name:'确认覆盖',exact:true}).click();
  await b.waitForTimeout(700);await b.locator('.play-btn').waitFor({timeout:60000});
  const actual=await b.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,JSON.parse(localStorage.getItem(k))])),keys);assert.deepEqual(actual,expected);
  const extra=await b.evaluate(()=>Object.keys(localStorage).filter(k=>/backups|save-txn|save-meta/.test(k)));assert.deepEqual(extra,[]);
  await b.evaluate(()=>document.querySelector('.resume-md')?.remove());await b.locator('.set-btn').click();await b.getByRole('button',{name:'导出存档',exact:true}).click();
  assert.match(await b.locator('.save-summary').innerText(),/手机源进度/);if(count===8)await b.screenshot({path:out+'/desktop-restored.png'});
  reports.push({pets:count,codeChars:code.length,realClipboard:true,allFourModulesAfterReload:true,truncatedRejected:true,noHistory:true});await ac.close();await bc.close();
 }
 assert.deepEqual(errors,[]);
 const report={status:'PASS',bundle:true,direction:'mobile-to-desktop',layouts:[[804,360],[667,375],[896,400],[1280,720]],alignedSummaryColumns:true,equalButtons:true,stableImportHeight:true,unclippedFocusRing:true,noModalScroll:true,reports,androidShellSimulated:true,physicalAndroid:false,pageErrors:errors};
 await writeFile(out+'/built-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
