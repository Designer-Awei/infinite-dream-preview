// Save-code transport only: no storage writes or game rules.
import {gzipSync, Gunzip, sha256} from '../vendor/save-codec.js';

export const ENVELOPE_VERSION=2, SAVE_VERSION=1;
export const SAVE_LIMITS=Object.freeze({json:8*1024*1024,compressed:4*1024*1024,text:12*1024*1024,nodes:500000,depth:64});
export class SaveError extends Error {constructor(code,message){super(message);this.name='SaveError';this.code=code;}}
export const fail=(code,message)=>{throw new SaveError(code,message);};
export const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const digest=bytes=>hex(sha256(bytes));
export function safeData(value){
  const stack=[[value,0]];let n=0;
  while(stack.length){
    const [v,d]=stack.pop();if(++n>SAVE_LIMITS.nodes||d>SAVE_LIMITS.depth)fail('LIMIT','存档结构过大或嵌套过深');
    if(v===null||typeof v==='boolean')continue;
    if(typeof v==='number'){if(!Number.isFinite(v))fail('STRUCTURE','存档含无效数值');continue;}
    if(typeof v==='string'){if(v.length>SAVE_LIMITS.json)fail('LIMIT','存档字段过长');continue;}
    if(typeof v!=='object')fail('STRUCTURE','存档含无效数据类型');
    for(const k of Object.keys(v)){
      if(['__proto__','prototype','constructor'].includes(k))fail('STRUCTURE','存档含不安全字段');
      stack.push([v[k],d+1]);
    }
  }
  return value;
}
export function canonical(v){
  safeData(v);
  const order=v=>Array.isArray(v)?v.map(order):isObject(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,order(v[k])])):v;
  return JSON.stringify(order(v));
}
export const clone=v=>JSON.parse(JSON.stringify(v));
export function toBase64(bytes){
  let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  return btoa(s);
}
function fromBase64(s,max){
  if(s.length>Math.ceil(max/3)*4)fail('LIMIT','存档超过允许体积');
  if(!s||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))fail('TRUNCATED','存档编码不完整或损坏，请重新传输完整存档码');
  try{return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}catch{fail('CORRUPT','存档编码损坏');}
}
function parseJSON(bytes){
  if(bytes.length>SAVE_LIMITS.json)fail('LIMIT','解压后存档超过 8 MiB 限制');
  let v;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('CORRUPT','存档内容损坏，无法读取完整数据');}
  return safeData(v);
}
const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function unzip(bytes){
  if(bytes.length<18)fail('TRUNCATED','压缩存档不完整');
  // Our envelope uses one gzip member with no optional header fields.
  if(bytes[0]!==31||bytes[1]!==139||bytes[2]!==8||bytes[3]!==0)fail('CORRUPT','不支持或损坏的 Gzip 载荷');
  const tail=new DataView(bytes.buffer,bytes.byteOffset+bytes.length-8,8),size=tail.getUint32(4,true);
  if(size>SAVE_LIMITS.json)fail('LIMIT','解压后存档超过 8 MiB 限制');
  const chunks=[];let length=0,finished=false;
  const stream=new Gunzip((chunk,final)=>{
    length+=chunk.length;if(length>SAVE_LIMITS.json||length>size)fail('LIMIT','压缩存档解压体积异常');
    chunks.push(chunk.slice());finished=final;
  });
  stream.onmember=()=>fail('CORRUPT','存档不能包含多个压缩成员');
  try{for(let i=0;i<bytes.length;i+=256)stream.push(bytes.subarray(i,i+256),i+256>=bytes.length);}
  catch(e){if(e instanceof SaveError)throw e;fail('CORRUPT','压缩存档损坏或不完整');}
  if(!finished||length!==size)fail('TRUNCATED','压缩存档缺少完整内容');
  const raw=new Uint8Array(length);let pos=0;for(const c of chunks){raw.set(c,pos);pos+=c.length;}
  if(crc32(raw)!==tail.getUint32(0,true))fail('CORRUPT','Gzip 内容校验失败');
  return raw;
}
function checkEnvelope(s){
  if(!isObject(s)||s.format!=='infinite-dream')fail('STRUCTURE','不是无限梦境的完整存档');
  if(s.envelopeVersion!==ENVELOPE_VERSION||!Number.isInteger(s.saveVersion)||s.saveVersion<0||s.saveVersion>SAVE_VERSION)fail('VERSION','存档版本较新或不受支持，请更新游戏后导入');
  if(typeof s.gameVersion!=='string'||typeof s.exportedAt!=='string'||!Number.isFinite(Date.parse(s.exportedAt))||!isObject(s.modules))fail('STRUCTURE','存档元信息无效');
  return s;
}
function decodePayload(bytes,hash){
  if(bytes.length>SAVE_LIMITS.compressed)fail('LIMIT','压缩存档超过 4 MiB 限制');
  if(!/^[a-f0-9]{64}$/i.test(hash))fail('TRUNCATED','存档缺少完整 SHA-256 校验值');
  if(digest(bytes)!==hash.toLowerCase())fail('CHECKSUM','存档校验失败：内容已改变或传输不完整');
  const raw=unzip(bytes),snapshot=checkEnvelope(parseJSON(raw));
  return{snapshot,checksum:'sha256',compressedBytes:bytes.length,jsonBytes:raw.length};
}
export function encodeSave(snapshot){
  checkEnvelope(snapshot);const json=canonical(snapshot),raw=new TextEncoder().encode(json);
  if(raw.length>SAVE_LIMITS.json)fail('LIMIT','完整存档超过 8 MiB 限制');
  const compressed=gzipSync(raw,{level:6,mtime:0});
  if(compressed.length>SAVE_LIMITS.compressed)fail('LIMIT','压缩存档超过 4 MiB 限制');
  const hash=digest(compressed),code=`IDSAVE2.${toBase64(compressed)}.${hash}`;
  // Decode to the exact collected snapshot before allowing copy/export.
  if(canonical(decodeCode(code).snapshot)!==json)fail('ROUNDTRIP','导出反向校验失败，已停止导出');
  return{snapshot:clone(snapshot),code,hash,jsonBytes:raw.length,compressedBytes:compressed.length,verified:true};
}
export function decodeCode(input){
  if(typeof input!=='string'||input.length>SAVE_LIMITS.text)fail('LIMIT','存档码超过长度限制');
  const text=input.replace(/[\s\u200b\ufeff]+/g,''),parts=text.split('.');
  if(!/^IDSAVE\d+$/.test(parts[0]))fail('FORMAT','这不是无限梦境的存档码（应以 IDSAVE2 开头）');
  if(parts[0]!=='IDSAVE2')fail('VERSION','请在最新预览版重新导出 IDSAVE2 存档码');
  if(parts.length!==3||!parts[1]||!parts[2])fail('TRUNCATED','存档码不完整：缺少载荷或末尾校验值，请重新导出或传输');
  return decodePayload(fromBase64(parts[1],SAVE_LIMITS.compressed),parts[2]);
}
