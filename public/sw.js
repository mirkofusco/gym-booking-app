const CACHE = "easyfit-v3";
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const reqUrl = new URL(event.request.url);
  const isSameOrigin = reqUrl.origin === self.location.origin;
  const pathname = reqUrl.pathname || "/";
  const isAdminAsset = pathname.startsWith("/admin");
  const isCriticalAsset = pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".html");

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
