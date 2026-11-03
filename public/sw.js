/* Public assets only. Never store requests by URL pattern or navigation response. */
const CACHE = 'webmail-public-v4';
const PUBLIC = [
    '/offline.html',
    '/favicon.svg?v=3',
    '/icon-192.png?v=3',
    '/icon-512.png?v=3',
];
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC)));
});
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter(
                            (key) =>
                                (key.startsWith('webmail-public-') ||
                                    key.startsWith('webmail-public-')) &&
                                key !== CACHE,
                        )
                        .map((key) => caches.delete(key)),
                ),
            ),
    );
});
self.addEventListener('fetch', (event) => {
    const request = event.request,
        url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (PUBLIC.includes(url.pathname + url.search)) {
        event.respondWith(
            caches
                .open(CACHE)
                .then(
                    async (cache) =>
                        (await cache.match(request)) || fetch(request),
                ),
        );
        return;
    }
    if (request.mode === 'navigate')
        event.respondWith(
            fetch(request).catch(() => caches.match('/offline.html')),
        );
});
// No skipWaiting, background sync, push, private cache, or forced reload.
