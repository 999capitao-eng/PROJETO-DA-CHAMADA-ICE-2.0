const CACHE_NAME = 'ice-ebd-casco-v27';
const CASCO = [
  './',
  './index.html',
  './css/estilo.css',
  './js/app.js',
  './supabase/config.js',
  './manifest.json',
  './img/logo_igreja.png',
  './img/apple-touch-icon.png',
  './img/icon-192.png',
  './img/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CASCO).catch(function (e) { console.warn('SW: falha no pre-cache', e); });
    }).then(function () { self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE_NAME) return caches.delete(k); }));
    }).then(function () { self.clients.claim(); })
  );
});

function ehSupabase(url) {
  return /supabase\.co/i.test(url) || /\/rest\//i.test(url) || /\/functions\//i.test(url) || /\/auth\//i.test(url);
}

function ehCodigoOuHtml(url) {
  return /\.(html|js|css)(\?|$)/i.test(url) || /\/$/.test(url);
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (ehSupabase(req.url)) return;

  if (ehCodigoOuHtml(req.url)) {
    event.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return resp;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || Response.error();
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return resp;
      }).catch(function () {
        return Response.error();
      });
    })
  );
});
