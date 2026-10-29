// sw.js — lets the app open without internet.
// Strategy: network first (so updates show up right away), fall back to the saved copy when offline.
// Firestore's own data cache handles the results; this only saves the app files and libraries.
const CACHE = "result-tracker-v1";
const CORE = [
  "./", "index.html", "style.css", "script.js", "calc.js", "parser.js", "chart.js", "exporter.js", "firebase-config.js",
];
const EXTRA_HOSTS = ["www.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "cdn-icons-png.flaticon.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(CORE.map((url) => cache.add(url).catch(() => {})))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !EXTRA_HOSTS.includes(url.hostname)) return; // e.g. Firestore / Auth calls: never touch

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: sameOrigin });
        if (hit) return hit;
        if (req.mode === "navigate") return (await caches.match("index.html")) || (await caches.match("./"));
        return Response.error();
      })
  );
});
