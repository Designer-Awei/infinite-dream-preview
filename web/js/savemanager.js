// Transfer coordinator only. Gameplay keeps its existing independent storage and load logic.
import {encodeSave,decodeCode,canonical,fail,SAVE_VERSION,SAVE_LIMITS} from './saveformat.js';
import {SAVE_MODULES,validateSnapshot,saveSummary} from './savemodules.js';
export class SaveManager {
  constructor({storage=()=>globalThis.localStorage,version='IDSAVE2',now=()=>Date.now()}={}){
    this.getStorage=typeof storage==='function'?storage:()=>storage;this.version=version;this.now=now;this.hooks={};
  }
  get storage(){return this.getStorage();}
  connect(hooks){this.hooks=hooks;}
  readRaw(){return Object.fromEntries(SAVE_MODULES.map(m=>[m.key,this.storage.getItem(m.key)]));}
  write(key,value){value===null?this.storage.removeItem(key):this.storage.setItem(key,value);if(this.storage.getItem(key)!==value)fail('STORAGE','存档写入后回读不一致');}
  collect(){
    try{this.hooks.flush?.();}catch{fail('STORAGE','最新进度保存失败，未生成存档码，请释放存储空间后重试');}
    const raw=this.readRaw(),modules={};
    for(const m of SAVE_MODULES){
      let data=null;
      if(raw[m.key]!==null){
        if(raw[m.key].length>SAVE_LIMITS.json)fail('LIMIT',`${m.name}超过允许体积`);
        try{data=JSON.parse(raw[m.key]);}catch{fail('STORAGE',`本机「${m.name}」数据损坏，已停止导出`);}
      }
      modules[m.id]={version:m.version,data};
    }
    const snapshot={format:'infinite-dream',envelopeVersion:2,saveVersion:SAVE_VERSION,gameVersion:this.version,exportedAt:new Date(this.now()).toISOString(),modules};
    validateSnapshot(snapshot);return snapshot;
  }
  export(){const artifact=encodeSave(this.collect());return{...artifact,summary:saveSummary(artifact.snapshot)};}
  prepare(input){const decoded=decodeCode(input);validateSnapshot(decoded.snapshot);return{...decoded,summary:saveSummary(decoded.snapshot)};}
  apply(prepared){
    validateSnapshot(prepared.snapshot);
    // Keep only a temporary in-memory before image; no history, startup jobs or extra storage keys.
    this.hooks.flush?.();const before=this.readRaw();
    const target=Object.fromEntries(SAVE_MODULES.map(m=>[m.key,prepared.snapshot.modules[m.id].data===null?null:JSON.stringify(prepared.snapshot.modules[m.id].data)]));
    try{
      for(const [key,value] of Object.entries(target))this.write(key,value);
      if(canonical(this.readRaw())!==canonical(target))fail('STORAGE','完整存档回读验证失败');
    }catch(e){
      let restored=true;
      for(const [key,value] of Object.entries(before))try{if(this.storage.getItem(key)!==value)this.write(key,value);}catch{restored=false;}
      if(!restored)fail('STORAGE','导入失败，原进度未能全部恢复，请保留源设备存档并释放本机空间后重试');
      fail('ROLLED_BACK',`导入失败，已恢复本次覆盖前的进度：${e.message}`);
    }
    this.hooks.invalidate?.();return{snapshot:prepared.snapshot};
  }
}
export const saveManager=new SaveManager();
