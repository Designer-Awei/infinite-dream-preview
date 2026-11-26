// Copy during the button gesture; explicitly supply the entire code, not a mobile selection fragment.
export async function copySaveCode(code,textarea){
  let copied=false;
  const onCopy=e=>{if(e.clipboardData){e.clipboardData.setData('text/plain',code);e.preventDefault();}};
  if(textarea){
    textarea.focus();textarea.select();textarea.setSelectionRange(0,code.length);
    document.addEventListener('copy',onCopy,true);
    try{copied=!!document.execCommand('copy');}catch{}
    finally{document.removeEventListener('copy',onCopy,true);}
  }
  if(!copied)try{await navigator.clipboard.writeText(code);copied=true;}catch{}
  if(!copied)return{copied:false,verified:false,message:`自动复制失败，请全选复制 ${code.length} 字符；结果未验证。`};
  let read;
  try{read=await navigator.clipboard.readText();}catch{return{copied:true,verified:false,message:`已复制 ${code.length} 字符，未获剪贴板回读权限，结果未验证。`};}
  if(read!==code)return{copied:true,verified:false,mismatch:true,message:`复制不完整：应为 ${code.length} 字符，实际 ${read.length} 字符。请重新复制。`};
  return{copied:true,verified:true,message:`已复制 ${code.length} 字符，剪贴板回读一致。`};
}
