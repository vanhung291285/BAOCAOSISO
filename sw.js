self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => Promise.all(cacheNames.map((name) => caches.delete(name)))),
      self.registration.unregister(),
    ])
  );
});

// Pass-through fetch handler so NO requests are blocked or cached
self.addEventListener('fetch', () => {
  // Let browser natively handle all requests
});
