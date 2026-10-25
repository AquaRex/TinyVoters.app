// Tiny Agents service worker: offline app shell. Built assets are content-hashed, so cache-first is safe;
// the page itself is network-first so a new deploy shows up on the next visit.
// The site shares its origin (and cache storage) with TinyVoters, so only our own caches are ever deleted.
// It also shows phone alerts (web push from the tiny-push Edge Function), with the app closed too.
// On localhost (vite dev) it caches nothing, so dev modules are never served stale.
// Bumped to drop what earlier workers cached (the page from before a deploy, unhashed files like sounds).
const CACHE = 'tiny-agents-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icons/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('tiny-agents-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const dev = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
  if (dev || e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) {
    return;
  }
  if (e.request.mode === 'navigate') {
    // always revalidated, so a deploy shows on the next load instead of after the host's 10-minute cache
    e.respondWith(
      fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ??
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(d.title || 'Tiny Agents', {
      body: d.body || '',
      tag: d.tag,
      renotify: !!d.tag,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
    }),
  );
});

// Push and in-app alerts (src/ui/notify.ts): focus the open tab, and for in-app alerts tell it which agent to select.
self.addEventListener('notificationclick', (e) => {
  const agent = e.notification.data?.tinySelect;
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      if (!open) {
        return self.clients.openWindow(self.registration.scope);
      }
      if (typeof agent === 'string') {
        open.postMessage({ tinySelect: agent });
      }
      return open.focus();
    }),
  );
});
