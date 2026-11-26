import {el} from './util.js';
import {btn,toast,uiRoot} from './ui.js';
import {saveManager} from './savemanager.js';
import {copySaveCode} from './saveclipboard.js';
import {localVersion} from './updater.js';
import {SAVE_LIMITS} from './saveformat.js';
const size=n=>n<1024?`${n} B`:`${(n/1024).toFixed(1)} KiB`;
const date=s=>!s||s.startsWith('1970-')?'旧版未记录时间':new Date(s).toLocaleString();
const summary=s=>`${s.name} · 晶石 ${s.tokens} · 角色 ${s.characters} · 通关 ${s.bossKills}\n地图：${s.world?`宝箱 ${s.chests} · 传送门 ${s.gates}`:'初始状态'}\n家园：${s.home?`派遣 ${s.dispatches} 个`:'初始状态'} · 冒险续玩：${s.run?'有':'无'}`;
function modal(title){
  const md=el('div','modal save-modal');
  md.innerHTML=`<div class="panel save-panel"><h2 class="outline"></h2><div class="save-body"></div><div class="row acts"></div></div>`;
  md.querySelector('h2').textContent=title;md.addEventListener('click',e=>e.target===md&&md.remove());uiRoot().append(md);
  return{md,body:md.querySelector('.save-body'),acts:md.querySelector('.acts')};
}
function text(cls,value){const node=el('div',cls);node.textContent=value;return node;}
function confirmImport(prepared,onConfirm,title='确认覆盖存档？'){
  const {md,body,acts}=modal(title);
  body.append(text('save-summary o1',summary(prepared.summary)),text('muted','这会覆盖本机角色、地图、家园与续玩进度；请先确认源设备进度正确。'));
  const ok=btn('确认覆盖','',()=>{
    ok.disabled=true;
    try{onConfirm();md.remove();toast('完整存档已恢复，正在重新加载');setTimeout(()=>location.reload(),400);}
    catch(e){body.append(text('save-error o1',e.message));ok.disabled=false;}
  });
  acts.append(btn('取消','gray',()=>md.remove()),ok);
}
export function showSaveExport(){
  const {md,body,acts}=modal('导出完整存档码');
  try{
    saveManager.version=localVersion||'IDSAVE2';
    const artifact=saveManager.export(),s=artifact.snapshot;
    body.append(text('muted','包含角色与资产、世界地图、家园与派遣、冒险续玩。接收设备也需更新到支持 IDSAVE2 的版本。'));
    body.append(text('save-summary o1',summary(artifact.summary)));
    body.append(text('save-meta',`导出时间：${date(s.exportedAt)}\n游戏版本：${s.gameVersion} · 封装 IDSAVE2 · 数据 v${s.saveVersion}\n原始 ${size(artifact.jsonBytes)} → Gzip ${size(artifact.compressedBytes)}（缩小 ${(100*(1-artifact.compressedBytes/artifact.jsonBytes)).toFixed(1)}%）\n存档码：${artifact.code.length} 字符`));
    body.append(text('save-valid o1','导出校验：SHA-256 与反向解码一致性检查通过。'));
    const ta=el('textarea','save-code');ta.readOnly=true;ta.value=artifact.code;ta.setAttribute('aria-label','完整压缩存档码');ta.onclick=()=>{ta.select();ta.setSelectionRange(0,ta.value.length);};body.append(ta);
    if(artifact.code.length>64000)body.append(text('save-warning o1','存档码较长，传输应用仍可能截断。请保留全部字符，并让接收设备通过导入校验后再卸载原游戏。'));
    const status=text('save-msg o1','复制状态：尚未复制');acts.before(status);
    const copy=btn('复制压缩存档码','',async()=>{
      copy.disabled=true;try{const result=await copySaveCode(artifact.code,ta);status.textContent=result.message;status.className=`save-msg o1 ${result.verified?'save-valid':result.mismatch?'save-error':'save-warning'}`;}finally{copy.disabled=false;}
    });
    acts.append(copy,btn('关闭','gray small',()=>md.remove()));
  }catch(e){body.append(text('save-error o1',e.message));acts.append(btn('关闭','gray',()=>md.remove()));}
}
export function showSaveImport(){
  const {md,body,acts}=modal('导入存档码');
  body.append(text('muted','粘贴完整 IDSAVE2 压缩存档码。校验通过后确认覆盖，地图和家园会一起恢复。'));
  const ta=el('textarea','save-code');ta.placeholder='在这里粘贴完整 IDSAVE2 存档码';ta.setAttribute('aria-label','待导入存档码');ta.maxLength=SAVE_LIMITS.text;body.append(ta);
  const status=text('save-msg o1','请先粘贴存档码'),preview=text('save-summary o1','');acts.before(status);body.append(preview);
  let prepared=null,timer=null;
  const check=()=>{
    clearTimeout(timer);prepared=null;ok.disabled=true;preview.textContent='';
    if(!ta.value.trim()){status.textContent='请先粘贴存档码';return;}
    try{
      prepared=saveManager.prepare(ta.value);status.className='save-msg save-valid o1';
      status.textContent=`SHA-256 校验与数据结构检查通过 · ${date(prepared.snapshot.exportedAt)} · ${prepared.snapshot.gameVersion}`;
      preview.textContent=summary(prepared.summary);ok.disabled=false;
    }catch(e){status.className='save-msg save-error o1';status.textContent=`${e.message}（收到 ${ta.value.replace(/\s/g,'').length} 字符）`;}
  };
  const ok=btn('预览并覆盖','',()=>{check();if(prepared){const selected=prepared;confirmImport(selected,()=>saveManager.apply(selected));}});ok.disabled=true;
  ta.oninput=()=>{prepared=null;ok.disabled=true;clearTimeout(timer);timer=setTimeout(check,180);};
  acts.append(btn('从剪贴板粘贴','blue small',async()=>{try{ta.value=await navigator.clipboard.readText();check();}catch{status.textContent='无法读取剪贴板，请长按输入框粘贴';}}),ok,btn('取消','gray small',()=>{clearTimeout(timer);md.remove();}));
}
