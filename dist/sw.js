const CACHE='folio-pocket-v1.0.0';
const ASSETS=['./','./index.html','./style.css','./reader.css','./app.js','./core.js','./vendor/marked.umd.js','./vendor/purify.min.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('folio-pocket-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(response=>response||new Response('离线资源尚未缓存，请联网后重试。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}}))));});
