const CACHE="pinksasha-v8-1-hotfix";
const ASSETS=[
  "./",
  "./index.html",
  "./styles.css?v=8.1.1",
  "./config.js?v=8.1.1",
  "./app.js?v=8.1.1",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./badge-96.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;

  event.respondWith(
    fetch(event.request,{cache:"no-store"})
      .then(response=>{
        if(response && response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        }
        return response;
      })
      .catch(async()=>(
        await caches.match(event.request) ||
        await caches.match("./index.html")
      ))
  );
});

self.addEventListener("push",event=>{
  let data={};
  try{
    data=event.data?event.data.json():{};
  }catch{
    data={body:event.data?.text()||"Новое сообщение"};
  }

  const title=data.title||"PinkSasha";
  const options={
    body:data.body||"Новое сообщение",
    icon:"./icon-192.png",
    badge:"./badge-96.png",
    tag:data.tag||"pinksasha-message",
    renotify:true,
    data:{
      url:data.url||"./",
      conversation_id:data.conversation_id||""
    }
  };

  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||"./",self.registration.scope).href;

  event.waitUntil(
    clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if("focus" in client){
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow?clients.openWindow(url):undefined;
    })
  );
});
