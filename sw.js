/* sw.js — service worker for offline / installable PWA support.
 *
 * Strategy:
 *   - Precache the local app shell on install (works at any hosting sub-path
 *     because the URLs are relative to this script).
 *   - Navigations: network-first, falling back to the cached shell so the app
 *     still opens with no connection (and picks up updates when online).
 *   - Same-origin assets (our JS/CSS): network-first, cache as offline fallback,
 *     so a new deploy is picked up on the next online load.
 *   - Cross-origin assets (the CDN libraries + Tesseract OCR model/wasm):
 *     cache-first with runtime caching, so after the first successful use they
 *     are available offline too.
 *
 * Bump CACHE_VERSION whenever the app shell changes to force an update.
 */
const CACHE_VERSION = "wcsm-v10";
const SHELL_CACHE = CACHE_VERSION + "-shell";
const RUNTIME_CACHE = CACHE_VERSION + "-runtime";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/storage.js",
  "./js/importer.js",
  "./js/stickers.js",
  "./js/ocr.js",
  "./js/matcher.js",
  "./js/trade.js",
  "./js/app.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./sample-data/sample-master-list.csv",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // App navigations: network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  const sameOrigin = new URL(req.url).origin === self.location.origin;

  if (sameOrigin) {
    // Our own JS/CSS/assets: network-first so a new deploy shows up on the very
    // next load when online; fall back to cache only when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cross-origin (CDN libraries + Tesseract OCR model/wasm): cache-first, since
  // they're large and versioned by URL.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
