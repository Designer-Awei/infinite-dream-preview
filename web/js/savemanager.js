// Storage coordinator: complete synchronous snapshots, pure migrations and a recoverable write journal.
import {encodeSave,decodeCode,canonical,digest,fail,isObject,SAVE_VERSION,SAVE_LIMITS} from './saveformat.js';
import {SAVE_MODULES,migrateSave,saveSummary} from './savemodules.js';
export const BACKUP_KEY='ai-girls-dungeon-backups-v2', TRANSACTION_KEY='ai-girls-dungeon-save-txn-v2', META_KEY='ai-girls-dungeon-save-meta-v2';
const MAX_BACKUPS=6, BACKUP_BUDGET=2*1024*1024;
const hashJSON=v=>digest(new TextEncoder().encode(canonical(v)));
export class SaveManager {
  constructor({storage=()=>globalThis.localStorage,version='dev',now=()=>Date.now()}={}){this.getStorage=typeof storage==='function'?storage:()=>storage;this.version=version;this.now=now;this.hooks={};this.applying=false;this.notice='';}
  get storage(){return this.getStorage();}
  connect(hooks){this.hooks=hooks;}
  readRaw(){return Object.fromEntries(SAVE_MODULES.map(m=>[m.key,this.storage.getItem(m.key)]));}
  checkedSet(key,value){value===null?this.storage.removeItem(key):this.storage.setItem(key,value);if(this.storage.getItem(key)!==value)fail('STORAGE','存档写入后回读不一致');}
  restoreRaw(before){for(const [key,value] of Object.entries(before))if(this.storage.getItem(key)!==value)this.checkedSet(key,value);if(canonical(this.readRaw())!==canonical(before))fail('RECOVERY','原始模块回读不一致');}
  recover(){
    if(this.applying)return;
    const raw=this.storage.getItem(TRANSACTION_KEY);if(!raw)return;
    let j;try{j=JSON.parse(raw);}catch{fail('RECOVERY','导入恢复记录损坏，已停止写入，避免混用存档');}
    if(j.v!==1||!['pending','committed'].includes(j.phase)||!isObject(j.before)||hashJSON(j.before)!==j.hash||canonical(Object.keys(j.before).sort())!==canonical(SAVE_MODULES.map(m=>m.key).sort()))fail('RECOVERY','导入恢复记录不完整，已停止写入');
    for(const v of Object.values(j.before))if(v!==null&&(typeof v!=='string'||v.length>SAVE_LIMITS.json))fail('RECOVERY','导入恢复记录内容无效');
    if(j.phase==='committed'&&j.afterHash===hashJSON(this.readRaw())){this.checkedSet(TRANSACTION_KEY,null);return;}
    try{this.restoreRaw(j.before);this.checkedSet(TRANSACTION_KEY,null);this.hooks.invalidate?.();}
    catch{fail('RECOVERY','上次导入未完成，原存档恢复仍失败。恢复记录已保留，请释放存储空间后重新打开游戏。');}
    this.notice='已从中断的导入中恢复原存档';
  }
  guard(){if(!this.applying)this.recover();}
  collect({flush=true}={}){
    this.guard();if(flush){try{this.hooks.flush?.();}catch{fail('STORAGE','本机最新进度无法保存，已停止导出或覆盖。请释放存储空间后重试。');}}
    const known=new Set([...SAVE_MODULES.map(m=>m.key),BACKUP_KEY,TRANSACTION_KEY,META_KEY]);
    if(typeof this.storage.key==='function')for(let i=0;i<this.storage.length;i++){
      const key=this.storage.key(i);
      if(key?.startsWith('ai-girls-dungeon-')&&!known.has(key))fail('MODULE_MISSING',`检测到未注册的玩家数据模块「${key}」，已停止不完整导出，请更新游戏。`);
    }
    const before=this.readRaw(),modules={};
    for(const m of SAVE_MODULES){
      let data=null;const raw=before[m.key];
      if(raw!==null){if(raw.length>SAVE_LIMITS.json)fail('LIMIT',`${m.name}超过允许体积`);try{data=JSON.parse(raw);}catch{fail('STORAGE',`本机「${m.name}」数据损坏，已停止导出`);}}
      if(m.id==='main'&&data===null)fail('MODULE_MISSING','本机还没有主存档');
      modules[m.id]={version:m.version,data};
    }
    if(canonical(before)!==canonical(this.readRaw()))fail('CHANGED','收集存档时数据发生变化，请重试');
    const snapshot={format:'infinite-dream',envelopeVersion:2,saveVersion:SAVE_VERSION,gameVersion:this.version,exportedAt:new Date(this.now()).toISOString(),modules};
    // Validate every known module without advancing timers or replacing the collected raw values.
    migrateSave(snapshot);return snapshot;
  }
  export(){const artifact=encodeSave(this.collect());return{...artifact,summary:saveSummary(artifact.snapshot)};}
  prepare(input){
    const decoded=decodeCode(input),migrated=migrateSave(decoded.snapshot);
    return{...decoded,...migrated,summary:saveSummary(migrated.snapshot),verified:true};
  }
  readBackups(){
    let rows;try{rows=JSON.parse(this.storage.getItem(BACKUP_KEY)||'[]');}catch{fail('BACKUP','本机历史备份清单损坏，未覆盖原备份');}
    if(!Array.isArray(rows))fail('BACKUP','本机历史备份清单无效');
    return rows;
  }
  backups(){return this.readBackups().map(row=>{try{const p=this.prepare(row.code);return{id:row.id,at:row.at,reason:row.reason,summary:p.summary,gameVersion:p.snapshot.gameVersion,bytes:row.code.length,valid:true};}catch(e){return{id:row.id,at:row.at,reason:row.reason,valid:false,error:e.message};}});}
  backup(reason='manual',snapshot=this.collect()){
    const artifact=encodeSave(snapshot),row={id:`${this.now()}-${Math.random().toString(36).slice(2,10)}`,at:snapshot.exportedAt,reason,code:artifact.code};
    // Verify existing entries before keeping them. Never overwrite an invalid history index.
    const prior=this.readBackups(),valid=prior.filter(r=>{try{this.prepare(r.code);return true;}catch{return false;}});
    const rows=[row,...valid].slice(0,MAX_BACKUPS);
    while(rows.length>1&&JSON.stringify(rows).length>BACKUP_BUDGET)rows.pop();
    if(JSON.stringify(rows).length>BACKUP_BUDGET)fail('BACKUP','自动备份超过本机历史容量，请先保管存档码并释放空间');
    const old=this.storage.getItem(BACKUP_KEY),text=JSON.stringify(rows);
    try{this.checkedSet(BACKUP_KEY,text);}catch(e){try{this.checkedSet(BACKUP_KEY,old);}catch{}fail('BACKUP',`无法保存导入前完整备份，未覆盖当前进度：${e.message}`);}
    return row;
  }
  apply(prepared,{reason='before-import'}={}){
    this.guard();const snapshot=migrateSave(prepared.snapshot).snapshot;
    const current=this.collect();this.backup(reason,current);
    const before=this.readRaw(),journal={v:1,phase:'pending',before,hash:hashJSON(before)};
    const target=Object.fromEntries(SAVE_MODULES.map(m=>[m.key,snapshot.modules[m.id].data===null?null:JSON.stringify(snapshot.modules[m.id].data)]));
    // Journal must fit before ANY player module is touched.
    try{this.checkedSet(TRANSACTION_KEY,JSON.stringify(journal));}catch{fail('STORAGE','无法建立完整恢复记录，未覆盖当前进度。请释放存储空间后重试。');}
    this.applying=true;
    try{
      for(const [key,value] of Object.entries(target))this.checkedSet(key,value);
      if(canonical(this.readRaw())!==canonical(target))fail('STORAGE','完整存档回读验证失败');
      this.checkedSet(TRANSACTION_KEY,JSON.stringify({...journal,phase:'committed',afterHash:hashJSON(target)}));
      this.checkedSet(TRANSACTION_KEY,null);this.hooks.invalidate?.();
    }catch(e){
      // Also roll back when the commit-marker readback or journal cleanup failed.
      // The in-memory before image is authoritative while this call is still alive.
      try{this.checkedSet(TRANSACTION_KEY,JSON.stringify(journal));}catch{}
      try{this.restoreRaw(before);this.checkedSet(TRANSACTION_KEY,null);this.hooks.invalidate?.();}
      catch{try{this.checkedSet(TRANSACTION_KEY,JSON.stringify(journal));}catch{}fail('RECOVERY','导入未完成，自动回滚仍失败。完整原始备份和恢复记录已保留，请释放存储空间后重开。');}
      fail('ROLLED_BACK',`导入失败，已恢复导入前全部进度：${e.message}`);
    }finally{this.applying=false;}
    return{summary:saveSummary(snapshot),snapshot};
  }
  restore(id){const row=this.readBackups().find(r=>r.id===id);if(!row)fail('BACKUP','找不到这份备份');return this.apply(this.prepare(row.code),{reason:'before-restore'});}
  initialize(version){
    this.version=version||'dev';this.recover();
    if(!this.storage.getItem(SAVE_MODULES[0].key))return;
    let meta;try{meta=JSON.parse(this.storage.getItem(META_KEY)||'{}');}catch{meta={};}
    const beforeUpdate=meta.gameVersion!==this.version,elapsed=this.now()-(meta.autoAt||0);
    try{
      if(beforeUpdate||elapsed>24*3600e3){this.backup(beforeUpdate?'before-update':'automatic',this.collect({flush:false}));this.checkedSet(META_KEY,JSON.stringify({gameVersion:this.version,autoAt:this.now()}));}
    }catch(e){this.notice=`自动备份未完成：${e.message}。请先导出完整存档码。`;}
  }
}
export const saveManager=new SaveManager();
export async function initializeSaveStorage(){
  // Recover before load() or any migration can write. Fetch only the local build's manifest.
  saveManager.recover();let version='unknown';
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),1500);
  try{const r=await fetch('update.json',{cache:'no-store',signal:abort.signal});if(r.ok)version=(await r.json()).version||version;}catch{}finally{clearTimeout(timer);}
  saveManager.initialize(version);
}
