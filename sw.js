const CACHE_NAME = "lista-compra-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./products.json",
  "./manifest.webmanifest",
  "./assets/app.css",
  "./assets/app.js",
  "./assets/db.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// 1) Precache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 2) Activate (limpia caches viejas)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// 3) Fetch: cache-first, luego red
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(async () => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("", { status: 204 });
      });
    })
  );
});

