// Increase this version when changing cached public files. No user data belongs here.
const CACHE_PREFIX = "brewlite-pwa-static-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const PUBLIC_PATHS = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PUBLIC_PATHS.map((path) => new Request(new URL(path, self.location.origin), {
      cache: "reload", credentials: "omit",
    })));
    // Do not force an existing worker out while another tab is placing an order.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Leave API, mutations, cross-origin traffic and RSC/data requests untouched.
  if (request.method !== "GET" || url.origin !== self.location.origin
    || url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        // Never keep application HTML, including account/cart/order pages.
        return await fetch(request, { cache: "no-store" });
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/offline.html")) || Response.error();
      }
    })());
    return;
  }

  if (!url.search && PUBLIC_PATHS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(url.pathname)) || fetch(request);
    })());
  }
});
