const CACHE = "sicpic-shell-v2";
const THUMB_CACHE = "sicpic-thumbs-v1";
const THUMB_CAP = 180;

function thumbPath(url) {
  return /\/thumb(?:-320|-640)?\.(?:webp|jpe?g)$/.test(url.pathname);
}
const SHELL = ["/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "GET" && thumbPath(url)) {
    event.respondWith(cachedThumb(event.request, url));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        });
      }),
    );
  }
});

async function cachedThumb(request, url) {
  const cache = await caches.open(THUMB_CACHE);
  const key = new Request(url.origin + url.pathname);
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    const keys = await cache.keys();
    if (keys.length >= THUMB_CAP && keys[0]) await cache.delete(keys[0]);
    await cache.put(key, response.clone());
  }
  return response;
}
