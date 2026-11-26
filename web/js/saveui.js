import {el} from './util.js';
import {btn,toast,uiRoot} from './ui.js';
import {saveManager} from './savemanager.js';
import {copySaveCode} from './saveclipboard.js';
import {localVersion} from './updater.js';
import {PLAYER_NAME_MAX} from './save.js';
import {SAVE_LIMITS} from './saveformat.js';
function showSummary(node,s){
  const fields=[
    ['玩家',s?.name?[...s.name].slice(0,PLAYER_NAME_MAX).join(''):''],['宠物',s?.pets],['角色',s?.characters],
    ['晶石',s?.tokens],['通关',s?.bossKills],['宝箱',s?.chests],
    ['传送门',s?.gates],['派遣',s?.dispatches],['续玩',s?(s.run?'有':'无'):null],
  ];
  node.replaceChildren(...fields.map(([label,value,cls=''])=>{
    const field=text(`save-field ${cls}`,'');
    field.append(text('save-field-label',label),text('save-field-value',value??''));
    return field;
  }));
}
function modal(title,existing){
  const md=existing||el('div','modal save-modal');
  md.innerHTML=`<div class="panel save-panel"><h2 class="outline"></h2><div class="save-body"></div><div class="row acts"></div></div>`;
  md.querySelector('h2').textContent=title;
  if(!existing){md.addEventListener('click',e=>e.target===md&&md.remove());uiRoot().append(md);}
  return{md,body:md.querySelector('.save-body'),acts:md.querySelector('.acts')};
}
function text(cls,value){const node=el('div',cls);node.textContent=value;return node;}
function confirmImport(prepared,onConfirm,host){
  // Reuse the existing backdrop: no stacked dimming or replayed overlay animation.
  const previous=host.firstElementChild;
  const {md,body,acts}=modal('确认覆盖存档？',host);
  const preview=text('save-summary o1','');showSummary(preview,prepared.summary);
  body.append(preview,text('muted','这会覆盖本机角色、地图、家园与续玩进度；请先确认源设备进度正确。'));
  const ok=btn('确认覆盖','',()=>{
    ok.disabled=true;
    try{onConfirm();md.remove();toast('完整存档已恢复，正在重新加载');setTimeout(()=>location.reload(),400);}
    catch(e){body.append(text('save-error o1',e.message));ok.disabled=false;}
  });
  acts.append(btn('取消','gray',()=>md.replaceChildren(previous)),ok);
}
export function showSaveExport(){
  const {md,body,acts}=modal('导出完整存档码');
  try{
    saveManager.version=localVersion||'IDSAVE2';
    const artifact=saveManager.export(),preview=text('save-summary o1','');
    showSummary(preview,artifact.summary);body.append(preview,text('save-valid o1','导出校验通过'));
    const ta=el('textarea','save-code');ta.readOnly=true;ta.spellcheck=false;ta.value=artifact.code;ta.setAttribute('aria-label','完整压缩存档码');ta.onclick=()=>{ta.select();ta.setSelectionRange(0,ta.value.length);};body.append(ta);
    const copy=btn('复制存档码','',async()=>{
      copy.disabled=true;
      try{const result=await copySaveCode(artifact.code,ta);toast(!result.copied?'自动复制失败，请全选复制':result.mismatch?'复制内容不一致，请重新复制':'已复制存档码');}
      finally{copy.disabled=false;}
    });
    acts.append(copy,btn('关闭','gray',()=>md.remove()));
  }catch(e){body.append(text('save-error o1',e.message));acts.append(btn('关闭','gray',()=>md.remove()));}
}
export function showSaveImport(){
  const {md,body,acts}=modal('导入存档码');
  body.append(text('muted','粘贴存档码，校验通过后可覆盖本机进度。'));
  const ta=el('textarea','save-code');ta.spellcheck=false;ta.placeholder='在这里粘贴完整 IDSAVE2 存档码';ta.setAttribute('aria-label','待导入存档码');ta.maxLength=SAVE_LIMITS.text;body.append(ta);
  const status=text('save-msg o1','请先粘贴存档码'),preview=text('save-summary o1','');acts.before(status);body.append(preview);showSummary(preview);
  let prepared=null,timer=null;
  const check=()=>{
    clearTimeout(timer);prepared=null;ok.disabled=true;showSummary(preview);status.className='save-msg o1';
    if(!ta.value.trim()){status.textContent='请先粘贴存档码';return;}
    try{
      prepared=saveManager.prepare(ta.value);status.className='save-msg save-valid o1';
      status.textContent='存档校验通过，可以覆盖';
      showSummary(preview,prepared.summary);ok.disabled=false;
    }catch(e){status.className='save-msg save-error o1';status.textContent=`${e.message}（收到 ${ta.value.replace(/\s/g,'').length} 字符）`;}
  };
  const ok=btn('覆盖存档','',()=>{check();if(prepared){const selected=prepared;confirmImport(selected,()=>saveManager.apply(selected),md);}});ok.disabled=true;
  ta.oninput=()=>{
    prepared=null;ok.disabled=true;clearTimeout(timer);showSummary(preview);
    status.className='save-msg o1';status.textContent=ta.value.trim()?'正在校验存档码…':'请先粘贴存档码';
    timer=setTimeout(check,180);
  };
  acts.append(ok,btn('取消','gray',()=>{clearTimeout(timer);md.remove();}));
}
