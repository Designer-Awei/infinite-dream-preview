import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fixture=JSON.parse(await readFile('.cache/save-system/fixture.json','utf8')),manifest=await readFile('docs/update.json','utf8');
const url=process.env.TEST_URL||'http://127.0.0.1:9877';
const out='.cache/save-system/browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 const create=async(name,width=804)=>{
  const ctx=await browser.newContext({viewport:{width,height:375},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/update.json',r=>r.fulfill({status:200,contentType:'application/json',body:manifest}));
  await p.addInitScript(({fixture,name})=>{
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async v=>{window.__clip=v;},readText:async()=>window.__clip||''}});
   document.execCommand=()=>false; // Exercise the async clipboard path in this unit-style UI test.
   // Seed once; don't reseed on reload, otherwise the test would hide an import failure.
   if(localStorage.getItem('test-seeded'))return;localStorage.setItem('test-seeded','yes');
   const data=JSON.parse(JSON.stringify(fixture));data.main.name=name;data.main.tutorialSeen=true;data.main.seenUnlock=[...data.main.chars];data.main.music=false;data.main.sound=false;
   if(name==='目标玩家'){data.world.opened=[99999];data.home.lv.hut=0;data.main.tokens=11;}
   for(const [id,key] of Object.entries({main:'ai-girls-dungeon-v1',world:'ai-girls-dungeon-world-v1',home:'ai-girls-dungeon-home-v1',run:'ai-girls-dungeon-run-v1'}))localStorage.setItem(key,JSON.stringify(data[id]));
  },{fixture,name});
  await p.goto(url);await p.locator('.play-btn').waitFor({timeout:60000});await p.evaluate(()=>document.querySelector('.resume-md')?.remove());return{ctx,p};
 };
 const {p:a}=await create('源玩家');
 const before=await a.evaluate(async()=>{const S=await import('./js/save.js'),{saveManager}=await import('./js/savemanager.js');const code=S.exportSave();return{code,snapshot:saveManager.prepare(code).snapshot};});
 const {p:b}=await create('目标玩家',667);
 await b.evaluate(async()=>{(await import('./js/saveui.js')).showSaveImport();});
 await b.locator('.save-code').fill(before.code.slice(0,-10));await b.waitForTimeout(250);assert(await b.getByRole('button',{name:'覆盖存档'}).isDisabled());
 assert.match(await b.locator('.save-msg').innerText(),/完整|校验/);assert.equal(await b.evaluate(()=>JSON.parse(localStorage.getItem('ai-girls-dungeon-v1')).tokens),11);
 await b.locator('.save-code').fill(before.code);await b.getByRole('button',{name:'覆盖存档'}).waitFor();await b.waitForFunction(()=>!document.querySelector('.save-panel .acts button:first-child').disabled);
 assert.match(await b.locator('.save-summary').innerText(),/源玩家/);
 // Opening and cancelling confirmation reuses one static backdrop and preserves the typed code.
 const backdrop=await b.locator('.save-modal').evaluate(md=>getComputedStyle(md).backgroundColor);
 for(let i=0;i<3;i++){
   await b.getByRole('button',{name:'覆盖存档'}).click();assert.equal(await b.locator('.save-modal').count(),1);
   const frames=await b.locator('.save-modal').evaluate(async md=>{
     const rows=[];for(let n=0;n<15;n++){await new Promise(requestAnimationFrame);rows.push([getComputedStyle(md).backgroundColor,md.getAnimations().length]);}return rows;
   });assert(frames.every(([color,animations])=>color===backdrop&&animations===0));
   const widths=await b.locator('.save-panel .acts button').evaluateAll(bs=>bs.map(b=>b.getBoundingClientRect().width));assert.equal(widths[0],widths[1]);
   await b.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await b.locator('.save-code').inputValue(),before.code);
 }
 await b.getByRole('button',{name:'覆盖存档'}).click();assert.equal(await b.locator('.save-modal').count(),1);
 await b.screenshot({path:out+'/confirm-667.png'});await b.getByRole('button',{name:'确认覆盖',exact:true}).click();
 await b.waitForTimeout(700);await b.locator('.play-btn').waitFor({timeout:60000});
 const after=await b.evaluate(async()=>{
  const {saveManager}=await import('./js/savemanager.js'),W=await import('./js/world.js'),H=await import('./js/home.js'),S=await import('./js/save.js'),R=await import('./js/runsave.js');
  return{snapshot:saveManager.prepare(S.exportSave()).snapshot,world:W.loadWorldSave(),home:H.homeState(),run:R.loadRun()};
 });
 assert.deepEqual(after.snapshot.modules,before.snapshot.modules);assert.deepEqual(after.world,before.snapshot.modules.world.data);assert.deepEqual(after.home,before.snapshot.modules.home.data);assert.deepEqual(after.run,before.snapshot.modules.run.data);
 await b.evaluate(()=>document.querySelector('.resume-md')?.remove());
 await b.evaluate(async()=>{(await import('./js/saveui.js')).showSaveExport();});
 await b.getByRole('button',{name:'复制存档码'}).click();
 await b.waitForFunction(()=>!!window.__clip);assert.equal(await b.evaluate(()=>window.__clip),await b.locator('.save-code').inputValue());
 await b.screenshot({path:out+'/export-667.png'});
 assert.equal(await b.getByRole('button',{name:'历史备份',exact:true}).count(),0);
 // Full source world loader restores fog, opened chests, gates and seven materials (not just the raw JSON).
 assert.equal(after.world.fog,fixture.world.fog);assert.deepEqual(after.world.mats,fixture.world.mats);assert.deepEqual(after.world.gates,fixture.world.gates);
 const desktop=await create('桌面测试',1280);await desktop.p.evaluate(async()=>{(await import('./js/saveui.js')).showSaveExport();});await desktop.p.screenshot({path:out+'/export-1280.png'});
 // Existing rename UI must enforce eight Unicode code points without charging for a rejected name.
 await desktop.p.getByRole('button',{name:'关闭',exact:true}).click();
 await desktop.p.locator('.name-pill').click();await desktop.p.locator('.rn-in').fill('一二三四五六七八九');
 await desktop.p.locator('.rn-in').dispatchEvent('input');assert.match(await desktop.p.locator('.rn-err').innerText(),/最多 8 个字/);
 const beforeName=await desktop.p.evaluate(()=>localStorage.getItem('ai-girls-dungeon-v1'));
 await desktop.p.locator('.rn-acts .btn:last-child').click();assert.equal(await desktop.p.evaluate(()=>localStorage.getItem('ai-girls-dungeon-v1')),beforeName);
 await desktop.p.locator('.rn-in').fill('一二三四五六七八');await desktop.p.locator('.rn-acts .btn:last-child').click();
 assert.equal(await desktop.p.evaluate(()=>JSON.parse(localStorage.getItem('ai-girls-dungeon-v1')).name),'一二三四五六七八');
 assert.deepEqual(errors,[]);
 const report={status:'PASS',separateDeviceContexts:true,allFourModulesAfterReload:true,worldLoaderRestored:true,confirmationRequired:true,staticSingleBackdrop:true,corruptRejectedWithoutWrites:true,clipboard:'copy-complete',layouts:[667,804,1280],pageErrors:errors};
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
