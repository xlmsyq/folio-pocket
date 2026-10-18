export const MAX_BYTES = 2 * 1024 * 1024;
export function unwrapFence(value) {
  const source=String(value).replace(/^\uFEFF/,'');
  const m=source.trim().match(/^(`{3,}|~{3,})(html?|markdown|md|text)\s*\n([\s\S]*?)\n\1\s*$/i);
  return m ? m[3] : source;
}
export function detectFormat(name, source, explicit='auto') {
  if(['md','html','txt'].includes(explicit)) return explicit;
  if(/\.html?$/i.test(name)) return 'html';
  if(/\.(md|markdown)$/i.test(name)) return 'md';
  if(/\.txt$/i.test(name)) return 'txt';
  return /^\s*(?:<!doctype\s+html|<html\b|<(?:head|body|article|main|section|div|h[1-6]|p|table|style)\b)/i.test(unwrapFence(source))?'html':'md';
}
export function safeFilename(name, extension) {
  const stem=String(name||'document').replace(/\.(?:md|markdown|html?|txt)$/i,'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim().slice(0,100)||'document';
  return stem+'.'+extension;
}
export function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function validateSource(source) {
  if(!source.trim()) throw new Error('文档是空的，请放入一些内容。');
  if(new TextEncoder().encode(source).length>MAX_BYTES) throw new Error('文档超过 2 MB，请拆分后再导入。');
  if(source.includes('\u0000')) throw new Error('这似乎不是文本文件，请选择 HTML、MD 或 TXT。');
}
export function parseDocument(raw, format, original=false) {
  const source=unwrapFence(raw);
  const input=format==='md'?globalThis.marked.parse(source,{gfm:true,breaks:false}):format==='txt'?'<pre>'+escapeHTML(source)+'</pre>':source;
  const clean=globalThis.DOMPurify.sanitize(input,{
    WHOLE_DOCUMENT:true,RETURN_DOM:true,
    FORBID_TAGS:['script','iframe','frame','frameset','object','embed','link','meta','base','form','button','textarea','select','video','audio','source','track','foreignObject','animate','animateTransform','set'],
    FORBID_ATTR:['srcset','action','formaction','autofocus','contenteditable','ping','download'],
    ADD_TAGS:original?['style']:[],
    SANITIZE_NAMED_PROPS:true
  });
  const head=clean.querySelector('head'), body=clean.querySelector('body')||clean;
  const title=head?.querySelector('title')?.textContent||body.querySelector('h1')?.textContent||'';
  if(!original) clean.querySelectorAll('style').forEach(n=>n.remove());
  clean.querySelectorAll('*').forEach(el=>{
    if(!original){el.removeAttribute('style');el.removeAttribute('class');el.removeAttribute('width');el.removeAttribute('height');}
    ['href','xlink:href'].forEach(attr=>{const val=el.getAttribute(attr);if(val && !val.startsWith('#')){el.removeAttribute(attr);if(el.tagName.toLowerCase()==='a')el.setAttribute('title',val);}});
    if(el.tagName.toLowerCase()==='img'){
      const src=el.getAttribute('src')||'';
      if(!/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z\d+/=\s]+$/i.test(src)){
        const placeholder=document.createElement('span');placeholder.className='blocked-media';placeholder.textContent='[图片未加载'+(el.getAttribute('alt')?'：'+el.getAttribute('alt'):'')+' · 仅显示内嵌图片]';el.replaceWith(placeholder);
      }
    } else el.removeAttribute('src');
    if(el.tagName.toLowerCase()==='input'){if(el.getAttribute('type')!=='checkbox')el.remove();else el.setAttribute('disabled','');}
  });
  if(!original) body.querySelectorAll('table').forEach(table=>{const wrap=document.createElement('div');wrap.className='table-wrap';table.replaceWith(wrap);wrap.append(table);});
  return {html:body.innerHTML,styles:original?Array.from(head?.querySelectorAll('style')||[],s=>s.outerHTML).join(''):'',title:title.trim().slice(0,120),text:body.textContent||''};
}
export const FRAME_CSP="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export function documentShell({html,styles=''},css,{title='随页',theme='light',font=18,original=false}={}){
  const colors={light:['#fffefb','#2c372e'],sepia:['#f5eddd','#493f2e'],dark:['#202923','#dfe6d8']}[theme]||['#fffefb','#2c372e'];
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+FRAME_CSP+'"><title>'+escapeHTML(title)+'</title>'+styles+'<style>'+css+'\n'+(original?'html{overflow:auto}body{margin:16px;overflow-wrap:anywhere}img,svg{max-width:100%}':'html{height:100%;background:'+colors[0]+';color:'+colors[1]+'}body{margin:0}#folioRoot{max-width:760px;margin:auto;padding:40px 44px;font-size:'+Math.min(28,Math.max(14,font))+'px}#folioRoot a{color:inherit}@media(max-width:600px){#folioRoot{padding:26px 22px}}')+'</style></head><body><article id="folioRoot" class="'+(original?'original-document':'prose')+'">'+html+'</article></body></html>';
}
export function downloadHTML(parsed,css,title){return documentShell(parsed,css+'\n@media print{@page{size:A4;margin:16mm}html{background:white!important;color:black!important}#folioRoot{padding:0!important;font-size:11pt!important;max-width:none!important}.table-wrap{overflow:visible!important}table{table-layout:fixed}pre{white-space:pre-wrap}}',{title,font:18});}
export function pageCount(scrollWidth,width,gap=36){return Math.max(1,Math.ceil((scrollWidth+gap-1)/(width+gap)));}
export function clampPage(page,total){return Math.max(0,Math.min(total-1,Number.isFinite(page)?Math.floor(page):0));}
export function idbOpen(){return new Promise((resolve,reject)=>{const req=indexedDB.open('folio-pocket',1);req.onupgradeneeded=()=>req.result.createObjectStore('documents',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('请关闭其他随页标签后重试。'));});}
export async function dbAction(action,value){const db=await idbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('documents',action==='getAll'?'readonly':'readwrite');const req=tx.objectStore('documents')[action](value);tx.oncomplete=()=>{db.close();resolve(req.result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};});}
