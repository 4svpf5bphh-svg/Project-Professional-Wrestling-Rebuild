/* Static install shell only: never cache authenticated requests or World data. */
const CACHE="ppw-static-shell-v2";
const CORE=["/offline.html","/icon.svg","/manifest.webmanifest"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys
  .filter(key=>key.startsWith("ppw-static-shell-")&&key!==CACHE)
  .map(key=>caches.delete(key)))));
 self.clients.claim();
});
self.addEventListener("fetch",event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=="GET"||url.origin!==self.location.origin||
  url.pathname.startsWith("/api/"))return;
 if(req.mode==="navigate"){
  event.respondWith(fetch(req).catch(()=>caches.match("/offline.html")));
  return;
 }
 if(url.pathname.startsWith("/assets/")){
  event.respondWith(caches.open(CACHE).then(async cache=>{
   const saved=await cache.match(req);
   if(saved)return saved;
   const response=await fetch(req);
   if(response.ok&&response.type==="basic")await cache.put(req,response.clone());
   return response;
  }));
 }
});