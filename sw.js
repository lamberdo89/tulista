const CACHE_NAME = "lista-compra-v2"; // cambia versión cuando edites
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

// 1) Instala y cachea
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

// 2) Activa y limpia caches viejas
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    self.clients.claim();
  })());
});

// 3) Fetch: cache-first
self.addEventListener("fetch", (event) => {
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const res = await fetch(event.request);
      return res;
    } catch {
      // fallback navegación
      if (event.request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      return new Response("", { status: 204 });
    }
  })());
});
