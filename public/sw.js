const CACHE = "easyfit-v5";
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const reqUrl = new URL(event.request.url);
  const isSameOrigin = reqUrl.origin === self.location.origin;
  const pathname = reqUrl.pathname || "/";
  const isApiRequest = pathname.startsWith("/api/");
  const isAdminAsset = pathname.startsWith("/admin");
  const isCriticalAsset = pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".html");
  const isNavigation = event.request.mode === "navigate";

  // API must always be fresh (never serve stale cache for bookings/admin data).
  if (isSameOrigin && isApiRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Never serve stale shell pages on iOS/Safari: navigation is always network-first.
  if (isSameOrigin && isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Always prefer fresh network for admin and critical assets to avoid stale UI logic.
  if (isSameOrigin && (isAdminAsset || isCriticalAsset)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for non-critical assets.
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      }).catch(() => cached)
    )
  );
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : { title: "For Fitness Club", body: "Hai un nuovo aggiornamento." };
  event.waitUntil(
    self.registration.showNotification(payload.title || "For Fitness Club", {
      body: payload.body || "",
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
