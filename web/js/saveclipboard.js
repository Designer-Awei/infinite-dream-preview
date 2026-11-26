// Clipboard permission varies between browsers and Android WebViews. Never imply a readback occurred when it did not.
export async function copySaveCode(code,textarea){
  let copied=false;
  try{await navigator.clipboard.writeText(code);copied=true;}catch{
    if(textarea){textarea.focus();textarea.select();try{copied=!!document.execCommand('copy');}catch{}}
  }
  if(!copied)return{copied:false,verified:false,message:'未能自动复制，请长按全选后复制；复制结果未验证。'};
  let read;
  try{read=await navigator.clipboard.readText();}catch{return{copied:true,verified:false,message:'已复制，但剪贴板回读未获允许，完整性未验证。'};}
  if(read!==code)return{copied:true,verified:false,mismatch:true,message:`剪贴板回读不一致（应为 ${code.length} 字符，实际 ${read.length} 字符）。请重新复制完整存档码。`};
  return{copied:true,verified:true,message:`已复制 ${code.length} 字符，剪贴板回读一致。`};
}
