/* Offline-first.
   - App shell is precached on install, so the app opens with no network.
   - Navigations and same-origin assets are served from cache immediately.
   - A new service worker installs in the background; the page is told when
     it's ready and the user decides when to apply it. Nothing auto-reloads
     mid-game. */

const VERSION = "v7";
const CACHE = `bluff-${VERSION}`;

const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./favicon.ico",
  "./favicon.png",
];

self.addEventListener("install", (e) => {
  // Don't skipWaiting here. The new worker waits until the user accepts,
  // so a game in progress is never swapped out underneath.
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The page posts SKIP_WAITING when the user taps "Update now". */
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
  if (e.data === "GET_VERSION") {
    e.source && e.source.postMessage({ type: "VERSION", version: VERSION });
  }
});

const isHTML = (req) =>
  req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations: cache first so the app opens instantly offline,
     with a network refresh in the background for next time. */
  if (isHTML(req)) {
    e.respondWith(
      caches.match("./index.html").then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put("./index.html", copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  /* Everything else: serve from cache, refresh in background. */
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
