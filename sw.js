// Offline support: keeps a copy of the app's files so it opens with no signal.
// Change CACHE whenever any file changes, so phones pick up the new version.
const CACHE = 'migraine-diary-v5';
const FILES = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/csv.js',
  'js/dates.js',
  'js/pdf.js',
  'js/report.js',
  'js/defaults.js',
  'js/stats.js',
  'js/store.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve from the saved copy first; fall back to the network for anything new.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch {
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    }),
  );
});
