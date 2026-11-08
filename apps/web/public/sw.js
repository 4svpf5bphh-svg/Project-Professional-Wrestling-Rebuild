/* Static install shell only: never cache authenticated requests or World data. */
// Asset names are stable across Legends artwork upgrades; rotate the shell
// cache with each curated art replacement so old portraits are never served.
const CACHE="ppw-static-shell-v9";
const CORE=["/offline.html","/icon.svg","/icon-192.png","/icon-512.png",
 "/apple-touch-icon.png","/manifest.webmanifest","/branding/ppw-intro-stage.webp",
 "/branding/news-official-crisp.webp","/branding/news-dirt-crisp.webp",
 "/branding/ppw-showcase-hero.webp","/branding/ppw-showcase-header.webp",
 "/branding/ppw-showcase-badge.webp",
 "/branding/news-official.webp","/branding/news-dirt.webp",
 "/branding/award-match.webp","/branding/award-angle.webp"];
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
   // Owner-supplied Legend artwork intentionally retains stable URLs across
   // releases. Fetch the latest CDN asset first so an older PWA install can
   // never pin a former photo (notably the original Taz portrait) forever.
   // A cached copy still provides offline viewing of previously seen cards.
   if(url.pathname.startsWith("/assets/legends/")){
    try{
     const updated=await fetch(req);
     if(updated.ok&&updated.type==="basic"){
      await cache.put(req,updated.clone());
      return updated;
     }
     return await cache.match(req)??updated;
    }catch{
     return await cache.match(req)??Response.error();
    }
   }
   const saved=await cache.match(req);
   if(saved)return saved;
   const response=await fetch(req);
   if(response.ok&&response.type==="basic")await cache.put(req,response.clone());
   return response;
  }));
 }
});