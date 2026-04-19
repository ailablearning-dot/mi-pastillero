const CACHE_NAME = 'pastillero-v2';
const ASSETS = ['/', '/index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      });
    })
  );
});

// Recibe push desde servidor (Web Push / VAPID)
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title = data.title || '💊 Mi Pastillero';
  const options = {
    body: data.body || 'Es hora de tomar tu medicamento',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'pastillero',
    requireInteraction: true,
    data: { url: self.registration.scope }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Abre/enfoca la app al tocar la notificación
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client)
          return client.focus();
      }
      return clients.openWindow(target);
    })
  );
});
