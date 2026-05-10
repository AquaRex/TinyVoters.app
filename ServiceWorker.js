// Bump APP_VERSION on every deploy. This is the single source of truth that
// invalidates the old cache and forces clients to pick up the new build.
const APP_VERSION = "0.1.9";
const cacheName = `LitterBoxGames-TinyVoters.app-${APP_VERSION}`;

// Long-lived assets that are safe to cache aggressively. The HTML shell
// (index.html / manifest) is intentionally NOT in here — it goes through the
// network-first path below so a new build is picked up immediately.
const contentToCache = [
    "Build/Release.loader.js",
    "Build/Release.framework.js.unityweb",
    "Build/Release.data.unityweb",
    "Build/Release.wasm.unityweb",
    "TemplateData/style.css"
];

self.addEventListener('install', function (e) {
    console.log(`[Service Worker] Install ${APP_VERSION}`);
    // Activate this worker as soon as installation finishes, instead of
    // waiting for every tab/PWA window to be closed.
    self.skipWaiting();
    e.waitUntil((async function () {
        const cache = await caches.open(cacheName);
        await cache.addAll(contentToCache);
    })());
});

self.addEventListener('activate', function (e) {
    console.log(`[Service Worker] Activate ${APP_VERSION}`);
    e.waitUntil((async function () {
        // Drop every cache that doesn't match the current version so old
        // Unity build files don't linger in storage.
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== cacheName).map(k => caches.delete(k)));
        // Take control of already-open clients without requiring a reload.
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', function (e) {
    const req = e.request;

    // Only handle GETs; let the browser deal with POST/PUT/etc.
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const isHtml =
        req.mode === 'navigate' ||
        req.destination === 'document' ||
        url.pathname.endsWith('/') ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.webmanifest');

    if (isHtml) {
        // Network-first for the HTML shell + manifest so a new deploy is
        // picked up on the very next load. Fall back to cache when offline.
        e.respondWith((async function () {
            try {
                const fresh = await fetch(req, { cache: 'no-store' });
                const cache = await caches.open(cacheName);
                cache.put(req, fresh.clone());
                return fresh;
            } catch (err) {
                const cached = await caches.match(req);
                if (cached) return cached;
                throw err;
            }
        })());
        return;
    }

    // Cache-first for the heavy Unity build assets. They're effectively
    // immutable per APP_VERSION because the activate step purges old caches.
    e.respondWith((async function () {
        const cached = await caches.match(req);
        if (cached) return cached;

        const response = await fetch(req);
        if (response && response.ok && url.origin === self.location.origin) {
            const cache = await caches.open(cacheName);
            cache.put(req, response.clone());
        }
        return response;
    })());
});
