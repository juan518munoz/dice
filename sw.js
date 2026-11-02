const CACHE_NAME = 'dice-pwa-v16';
const ASSETS = [
  './',
  './index.html',
  './roller.html',
  './generala.html',
  './truco.html',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/notify-badge.png',
  './assets/notify-icon.png',
  './assets/fonts/m6x11plus.ttf',
  './css/base.css',
  './css/roller.css',
  './css/generala.css',
  './css/truco.css',
  './js/pwa.js',
  './js/dice-ui.js',
  './js/roller.js',
  './js/generala/rules.js',
  './js/generala/notifications.js',
  './js/generala/network.js',
  './js/generala/app.js',
  './js/truco/rules.js',
  './js/truco/cards-ui.js',
  './js/truco/network.js',
  './js/truco/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./generala.html');
      }
    })
  );
});
