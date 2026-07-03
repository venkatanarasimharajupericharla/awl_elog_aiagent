/* ============================================================
   AWL ELog AI Agent — Service Worker (PWA offline support)
   ============================================================ */

const CACHE_NAME = "awl-elog-v2";

// Core app shell files to cache for offline use
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./Component.js",
  "./manifest.json",
  "./css/style.css",
  "./controller/App.controller.js",
  "./model/JouleEngine.js",
  "./model/FormRenderer.js",
  "./model/catalog.json",
  "./view/App.view.xml",
  "./i18n/i18n.properties",
  "./img/awl-logo.svg",
  "./img/awl-logo-white.svg",
  "./img/awl-mark-white.svg",
  "./img/icon-192.jpg",
  "./img/icon-512.jpg"
];

// Install — pre-cache the app shell
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      console.log("[SW] Pre-caching app shell");
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) {
            console.log("[SW] Removing old cache:", name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch — network-first for API/CDN, cache-first for app shell
self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // For OpenUI5 CDN resources — cache after first fetch (stale-while-revalidate)
  if (url.hostname === "sdk.openui5.org") {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(event.request).then(function (cached) {
          var fetchPromise = fetch(event.request).then(function (response) {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function () {
            return cached;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // For same-origin requests — stale-while-revalidate so app updates
  // (CSS/JS/JSON) reach returning users on the next load, while staying offline-capable
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(event.request).then(function (cached) {
          var fetchPromise = fetch(event.request).then(function (response) {
            if (response && response.status === 200 && response.type === "basic") {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function () {
            if (event.request.mode === "navigate") {
              return caches.match("./index.html");
            }
            return cached;
          });
          return cached || fetchPromise;
        });
      }).catch(function () {
        // Offline fallback for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      })
    );
    return;
  }

  // All other requests — network only
  event.respondWith(fetch(event.request));
});
