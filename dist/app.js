import {MAX_BYTES,validateSource,detectFormat,parseDocument,documentShell,downloadHTML,safeFilename,pageCount,clampPage,dbAction} from './core.js';
const $=id=>document.getElementById(id);
let current=null,docs=[],mode='read',page=0,total=1,renderToken=0,readCSS='',frameDoc=null,root=null,pendingDelete=null,editing=false,matches=[],matchIndex=-1,saveTimer,toastTimer,searchTimer;
let prefs={theme:'light',font:18};try{prefs={...prefs,...JSON.parse(localStorage.getItem('folio-prefs')||'{}')};}catch{}
if(!['light','sepia','dark'].includes(prefs.theme))prefs.theme='light';prefs.font=Math.min(28,Math.max(14,Number(prefs.font)||18));
const sample=`# 让 AI 的好想法，值得再读一遍

一份文档写完，只是开始。随页把零散的文字、报告和网页，变成你愿意随手翻开的书页。

> 这是示例文档。你的文件只在浏览器中读取，不会上传到服务器。

## 01 · 从文件，到书页

把 AI 生成的 **Markdown、HTML 或纯文本** 导入进来，你可以自由选择阅读方式。

| 模式 | 适合什么时候 |
| --- | --- |
| 阅读 | 在小屏幕上连续看完一篇文章 |
| 分页 | 一页一页翻，记住阅读的位置 |
| 原样 | 查看 HTML 自带的颜色和布局 |
| 源码 | 检查或复制原始内容 |

## 02 · 留一点空白，读得更舒服

打开右上方的 **Aa**，试着调大字号，或把白纸换成暖纸。夜晚可以选择深色背景。

字号改变时，分页会跟着重新排版。你也可以打开目录，直接跳到感兴趣的章节。

### 给手机的一点心意

- 按屏幕宽度自动换行。
- 较宽的表格可以左右滑动。
- 代码保留格式，长行会自动折行。
- 用底部箭头翻页，或者直接输入页码。

## 03 · 一份小小的阅读计划

1. 导入今天最想看的文档。
2. 选一个舒服的字号和纸张颜色。
3. 通过目录找到你真正关心的部分。
4. 需要分享时，导出阅读版 HTML 或保存为 PDF。

### 一个 Markdown 例子

\`\`\`markdown
# 研究笔记

## 核心问题
用一句话说明你想知道什么。

- 证据是什么？
- 还有哪些不确定？
- 下一步可以做什么？
\`\`\`

## 04 · 把内容带走

点击 **导出 → 保存为 PDF**，会打开系统打印窗口。电脑可选择保存为 PDF。iPhone 可以在打印预览上双指放大，再通过分享菜单存入「文件」。

PDF 会使用统一的阅读排版，文字仍然可以选中；不需要把每一页变成截图。

## 05 · 一些清楚的边界

书架属于当前浏览器。清除浏览器数据后，文档也会被清除，所以请保留重要文件的原件。

为了让阅读保持安静，随页不会执行导入 HTML 中的脚本，也不加载外部图片、字体或样式文件。内嵌图片和静态 SVG 可以显示。交互式图表、Mermaid、LaTeX 代码需要在原工具中查看。

外部文件改了？重新导入，或者在 Aa 中选择「编辑 / 更新文档」。随页不会在后台监视其他 App。

---

愿每一个好想法，都有被认真阅读的时刻。
`;
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function show(id){$(id).showModal();}
function savePrefs(){try{localStorage.setItem('folio-prefs',JSON.stringify(prefs));}catch{}applyPrefs();}
function applyPrefs(){document.body.dataset.theme=prefs.theme;$('fontSize').value=prefs.font;$('fontOutput').textContent=prefs.font+' px';document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===prefs.theme)));}
function updateShelf(){const list=$('recentList');list.replaceChildren();$('recentCount').textContent=docs.length?`${docs.length} 份 · 保存在此浏览器`:'只保存在此浏览器';if(!docs.length){const p=document.createElement('p');p.className='empty';p.textContent='读过的文档，会在这里等你。';list.append(p);return;}docs.sort((a,b)=>b.updatedAt-a.updatedAt).forEach(doc=>{const card=document.createElement('div');card.className='doc-card';const open=document.createElement('button');open.className='open-doc';const icon=document.createElement('span');icon.className='doc-icon';icon.textContent=doc.format.toUpperCase();const info=document.createElement('span');info.style.minWidth='0';const title=document.createElement('strong');title.textContent=doc.title;const sub=document.createElement('small');sub.textContent=new Date(doc.updatedAt).toLocaleDateString('zh-CN')+' · '+Math.max(1,Math.round(new Blob([doc.source]).size/1024))+' KB';info.append(title,sub);open.append(icon,info);open.onclick=()=>openDoc(doc);const del=document.createElement('button');del.className='quiet';del.textContent='×';del.setAttribute('aria-label','移除 '+doc.title);del.onclick=()=>{pendingDelete=doc.id;$('deleteText').textContent='只移除「'+doc.title+'」在此浏览器中的副本，原文件不受影响。';show('deleteDialog');};card.append(open,del);list.append(card);});}
async function persist(doc){try{await dbAction('put',doc);const i=docs.findIndex(d=>d.id===doc.id);if(i>=0)docs[i]=doc;else docs.push(doc);updateShelf();return true;}catch{toast('浏览器未能保存此文档，仍可阅读。请保留原文件或导出备份。');return false;}}
function saveProgress(){if(!current)return;current.progress=mode==='pages'?page/Math.max(1,total-1):mode==='read'?(frameDoc?.scrollingElement.scrollTop||0)/Math.max(1,(frameDoc?.scrollingElement.scrollHeight||0)-(frameDoc?.documentElement.clientHeight||0)):current.progress;clearTimeout(saveTimer);const doc=current;saveTimer=setTimeout(()=>persist(doc),600);}
async function createDoc(source,name,format='auto',replace=false){validateSource(source);const type=detectFormat(name,source,format);const parsed=parseDocument(source,type);const doc={id:replace&&current?current.id:crypto.randomUUID(),title:(name?.trim()||parsed.title||'未命名文档').slice(0,120),source,format:type,updatedAt:Date.now(),progress:replace?(current?.progress||0):0};await persist(doc);await openDoc(doc);}
async function openDoc(doc){clearTimeout(saveTimer);if(current&&current.id!==doc.id)await persist(current);current=doc;mode='read';page=0;$('home').hidden=true;$('reader').hidden=false;$('docTitle').textContent=doc.title;$('docMeta').textContent=doc.format.toUpperCase()+' · 仅保存在此浏览器';document.title=doc.title+' · 随页';$('searchInput').value='';$('searchBar').hidden=true;await render(doc.progress||0);window.scrollTo(0,0);}
function getRatio(){if(mode==='pages')return page/Math.max(total-1,1);if(mode==='read'&&frameDoc)return frameDoc.scrollingElement.scrollTop/Math.max(1,frameDoc.scrollingElement.scrollHeight-frameDoc.documentElement.clientHeight);return current?.progress||0;}
async function render(ratio=getRatio()){
  const token=++renderToken;matches=[];matchIndex=-1;$('searchCount').textContent='';document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  $('docFrame').hidden=mode==='source';$('sourceView').hidden=mode!=='source';$('pageControls').hidden=mode!=='pages';$('modeNote').hidden=!['source','original'].includes(mode);$('modeNote').textContent=mode==='source'?'原始内容可长按选中、复制。':'保留内嵌样式；脚本和外部资源已停用。横向布局可在文档内滑动。';
  $('tocBtn').disabled=mode==='source';$('searchBtn').disabled=mode==='source';if(mode==='source'){$('searchBar').hidden=true;$('sourceView').textContent=current.source;$('readingStatus').textContent='原始文件 · '+new Blob([current.source]).size.toLocaleString()+' 字节';return;}
  let parsed;try{parsed=parseDocument(current.source,current.format,mode==='original');}catch(e){toast('无法渲染这份文档，可切换到源码检查。');return;}
  $('docFrame').onload=()=>{if(token!==renderToken)return;frameDoc=$('docFrame').contentDocument;root=frameDoc?.getElementById('folioRoot');if(!root)return;
    frameDoc.addEventListener('click',ev=>{const link=ev.target.closest('a');if(!link)return;ev.preventDefault();const href=link.getAttribute('href');if(href?.startsWith('#')){const target=frameDoc.getElementById(href.slice(1))||frameDoc.getElementById('user-content-'+href.slice(1));if(target)jumpTo(target);}else if(link.title)toast('外部链接：'+link.title);},true);
    frameDoc.addEventListener('keydown',ev=>{if(mode==='pages'&&['ArrowRight','PageDown','ArrowLeft','PageUp'].includes(ev.key)){ev.preventDefault();goPage(page+(['ArrowRight','PageDown'].includes(ev.key)?1:-1));}});
    if(mode==='pages')layoutPages(ratio);else{frameDoc.scrollingElement.scrollTop=ratio*Math.max(0,frameDoc.scrollingElement.scrollHeight-frameDoc.documentElement.clientHeight);updateStatus();}
    frameDoc.addEventListener('scroll',()=>{if(mode==='read'){updateStatus();saveProgress();}},true);
    root.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{if(mode==='pages')layoutPages(getRatio());}));
    root.querySelectorAll('img').forEach(img=>{img.addEventListener('load',()=>{if(mode==='pages')layoutPages(getRatio());});});
    buildToc();if($('searchInput').value)runSearch();
  };
  $('docFrame').srcdoc=documentShell(parsed,readCSS,{title:current.title,theme:prefs.theme,font:prefs.font,original:mode==='original'});
}
function layoutPages(ratio=0){if(!root||mode!=='pages')return;const win=$('docFrame').contentWindow;const w=win.innerWidth,h=win.innerHeight;const padding=w<600?22:44;const width=Math.max(100,w-padding*2),height=Math.max(140,h-56);frameDoc.documentElement.style.cssText+=';height:100%;overflow:hidden';frameDoc.body.style.cssText='margin:0;overflow:hidden;padding:28px '+padding+'px';root.style.cssText=`max-width:none;width:${width}px;height:${height}px;max-height:${height}px;padding:0;margin:0;column-width:${width}px;column-gap:36px;column-fill:auto;overflow:visible;position:relative;transform:none;font-size:${prefs.font}px;`;
  const style=frameDoc.createElement('style');style.dataset.pagination='true';style.textContent=`#folioRoot img,#folioRoot svg{max-height:${Math.max(80,height-32)}px;object-fit:contain}#folioRoot pre{break-inside:auto}#folioRoot .table-wrap{max-height:${height}px;overflow:auto;break-inside:avoid}`;frameDoc.querySelector('style[data-pagination]')?.remove();frameDoc.head.append(style);
  total=pageCount(root.scrollWidth,width);root.dataset.step=String(width+36);root.dataset.width=String(width);goPage(Math.round(ratio*(total-1)),false);}
function goPage(next,persistIt=true){if(mode!=='pages'||!root)return;page=clampPage(next,total);root.style.transform=`translateX(${-page*Number(root.dataset.step)}px)`;$('pageInput').value=page+1;$('pageInput').max=total;$('pageTotal').textContent='/ '+total;$('prevPage').disabled=page===0;$('nextPage').disabled=page>=total-1;updateStatus();if(persistIt)saveProgress();}
function updateStatus(){const percent=Math.round(mode==='pages'?(page+1)/total*100:mode==='original'?0:getRatio()*100);$('progressFill').style.width=percent+'%';$('readingStatus').textContent=mode==='pages'?'每次，专注一页':mode==='original'?'HTML 静态预览':(percent>=99?'已读至文末':percent+'% · 连续阅读');}
function buildToc(){const nav=$('tocList');nav.replaceChildren();root.querySelectorAll('h1,h2,h3,h4').forEach((heading,i)=>{const b=document.createElement('button');b.textContent=heading.textContent.trim()||'未命名章节';b.style.paddingLeft=(Number(heading.tagName[1])-1)*14+4+'px';b.onclick=()=>{$('tocDialog').close();jumpTo(heading);};nav.append(b);});if(!nav.childNodes.length){const p=document.createElement('p');p.className='muted';p.textContent='这份文档没有标题，暂时无法生成目录。';nav.append(p);}}
function jumpTo(node){if(mode==='pages'){const rootRect=root.getBoundingClientRect();const rect=node.getBoundingClientRect();goPage(Math.floor((rect.left-rootRect.left)/Number(root.dataset.step)));}else node.scrollIntoView({block:'start'});}
function clearMatches(){root?.querySelectorAll('mark.folio-hit').forEach(el=>el.replaceWith(frameDoc.createTextNode(el.textContent)));root?.normalize();matches=[];matchIndex=-1;}
function runSearch(){if(!root||mode==='source')return;const before=getRatio();clearMatches();const q=$('searchInput').value.trim().slice(0,120);if(!q){$('searchCount').textContent='';if(mode==='pages')layoutPages(before);return;}const walker=frameDoc.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('style,script')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});const nodes=[];let n;while(n=walker.nextNode())nodes.push(n);let count=0;for(const node of nodes){if(count>=500)break;const text=node.nodeValue,low=text.toLocaleLowerCase(),needle=q.toLocaleLowerCase();let pos=0,at=low.indexOf(needle);if(at<0)continue;const fragment=frameDoc.createDocumentFragment();while(at>=0&&count<500){fragment.append(frameDoc.createTextNode(text.slice(pos,at)));const mark=frameDoc.createElement('mark');mark.className='folio-hit';mark.textContent=text.slice(at,at+q.length);fragment.append(mark);matches.push(mark);count++;pos=at+q.length;at=low.indexOf(needle,pos);}fragment.append(frameDoc.createTextNode(text.slice(pos)));node.replaceWith(fragment);}if(mode==='pages')layoutPages(before);if(matches.length)selectMatch(0);else $('searchCount').textContent='无结果';}
function selectMatch(index){if(!matches.length)return;matches[matchIndex]?.classList.remove('folio-current');matchIndex=(index+matches.length)%matches.length;matches[matchIndex].classList.add('folio-current');jumpTo(matches[matchIndex]);$('searchCount').textContent=`${matchIndex+1}/${matches.length}${matches.length===500?'+':''}`;}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function openPaste(isEdit=false){editing=isEdit;$('pasteTitle').textContent=isEdit?'更新这份文档':'把内容放进来';$('pasteName').value=isEdit?current.title:'';$('pasteContent').value=isEdit?current.source:'';$('pasteFormat').value=isEdit?current.format:'auto';show('pasteDialog');}
async function importFiles(files){let count=0,last=null;for(const file of Array.from(files)){try{if(!/\.(md|markdown|html?|txt)$/i.test(file.name))throw new Error(file.name+'：请选择 HTML、MD 或 TXT 文件。');if(file.size>MAX_BYTES)throw new Error(file.name+' 超过 2 MB。');const source=await file.text();validateSource(source);const format=detectFormat(file.name,source);const doc={id:crypto.randomUUID(),title:file.name.replace(/\.(md|markdown|html?|txt)$/i,''),source,format,updatedAt:Date.now(),progress:0};await persist(doc);last=doc;count++;}catch(e){toast(e.message);}}if(last)await openDoc(last);if(count>1)toast('已导入 '+count+' 份文档，其余文件在书架中。');$('fileInput').value='';}
$('importBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=()=>importFiles($('fileInput').files);$('pasteBtn').onclick=()=>openPaste();$('demoBtn').onclick=()=>{const existing=docs.find(d=>d.id==='folio-demo');if(existing)openDoc(existing);else{const doc={id:'folio-demo',title:'让好想法，值得再读一遍',source:sample,format:'md',updatedAt:Date.now(),progress:0};persist(doc);openDoc(doc);}};
$('pasteForm').onsubmit=async e=>{e.preventDefault();try{await createDoc($('pasteContent').value,$('pasteName').value,$('pasteFormat').value,editing);$('pasteDialog').close();}catch(err){toast(err.message);}};
$('backBtn').onclick=async()=>{clearTimeout(saveTimer);if(current)await persist(current);$('reader').hidden=true;$('home').hidden=false;document.title='随页 Folio · AI 文档随身读';updateShelf();};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(mode===b.dataset.mode)return;const ratio=getRatio();mode=b.dataset.mode;render(ratio);});
$('tocBtn').onclick=()=>show('tocDialog');$('settingsBtn').onclick=()=>show('settingsDialog');$('exportBtn').onclick=()=>show('exportDialog');$('helpBtn').onclick=()=>show('helpDialog');
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('editBtn').onclick=()=>{$('settingsDialog').close();openPaste(true);};$('fontSize').oninput=()=>{prefs.font=Number($('fontSize').value);savePrefs();if(current&&mode!=='original'&&mode!=='source')render();};
document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{prefs.theme=b.dataset.theme;savePrefs();if(current)render();});
$('prevPage').onclick=()=>goPage(page-1);$('nextPage').onclick=()=>goPage(page+1);$('pageInput').onchange=()=>goPage(Number($('pageInput').value)-1);
$('searchBtn').onclick=()=>{$('searchBar').hidden=!$('searchBar').hidden;if(!$('searchBar').hidden)$('searchInput').focus();if(mode==='pages')layoutPages(getRatio());};$('searchInput').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(runSearch,180);};$('searchInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();selectMatch(matchIndex+(e.shiftKey?-1:1));}};$('nextMatch').onclick=()=>selectMatch(matchIndex+1);$('prevMatch').onclick=()=>selectMatch(matchIndex-1);$('closeSearch').onclick=()=>{const ratio=getRatio();$('searchBar').hidden=true;$('searchInput').value='';clearMatches();if(mode==='pages')layoutPages(ratio);};
$('downloadSourceBtn').onclick=()=>{download(current.source,safeFilename(current.title,current.format),current.format==='html'?'text/html;charset=utf-8':'text/plain;charset=utf-8');toast('已准备原始文件，请在浏览器下载中查看。');};
$('downloadHtmlBtn').onclick=()=>{download(downloadHTML(parseDocument(current.source,current.format),readCSS,current.title),safeFilename(current.title+'-阅读版','html'),'text/html;charset=utf-8');toast('已准备阅读版 HTML。');};
$('printBtn').onclick=()=>{const parsed=parseDocument(current.source,current.format);$('printDocument').innerHTML=parsed.html;$('printDocument').setAttribute('aria-hidden','false');$('exportDialog').close();document.title=current.title;window.print();};window.addEventListener('afterprint',()=>{$('printDocument').replaceChildren();$('printDocument').setAttribute('aria-hidden','true');if(current)document.title=current.title+' · 随页';});
$('confirmDelete').onclick=async()=>{try{const deletedId=pendingDelete;clearTimeout(saveTimer);if(current?.id===deletedId){current=null;frameDoc=null;root=null;++renderToken;$('docFrame').onload=null;$('docFrame').srcdoc='';}await dbAction('delete',deletedId);docs=docs.filter(d=>d.id!==deletedId);pendingDelete=null;updateShelf();$('deleteDialog').close();toast('已从书架移除。');}catch{toast('移除失败，请稍后重试。');}};
const dz=$('dropZone');['dragenter','dragover'].forEach(type=>dz.addEventListener(type,e=>{e.preventDefault();dz.classList.add('dragging');}));['dragleave','drop'].forEach(type=>dz.addEventListener(type,e=>{e.preventDefault();dz.classList.remove('dragging');}));dz.addEventListener('drop',e=>importFiles(e.dataTransfer.files));
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);const ratio=getRatio();resizeTimer=setTimeout(()=>{if(mode==='pages'&&current)layoutPages(ratio);},120);}).observe($('docFrame'));
window.addEventListener('pagehide',()=>{if(current)dbAction('put',current).catch(()=>{});});document.addEventListener('visibilitychange',()=>{if(document.hidden&&current)dbAction('put',current).catch(()=>{});});
applyPrefs();try{const r=await fetch('./reader.css');if(!r.ok)throw Error('style');readCSS=await r.text();docs=await dbAction('getAll');updateShelf();}catch{toast('本地书架暂不可用；仍可导入阅读，请保留原文件。');}
if('serviceWorker'in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
