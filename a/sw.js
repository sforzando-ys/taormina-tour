// [taormina patch N] the tour's caches share one owned prefix; activation deletes only this tour's
// retired caches, never another application's on the same origin (patch G's version deleted all)
const CACHE_PREFIX = 'taormina-tour-';
const CACHE_NAME = CACHE_PREFIX + 'v3'; // [taormina patch G, N] v3 retires the earlier builds' v2
const URLS_TO_CACHE = [
    './',
    './index.html',
    './config.json',
    './scripts/main.js',
    './scripts/audio.js',
    './scripts/map.js',
    'https://aframe.io/releases/1.4.2/aframe.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    // Add other critical assets here if needed, but not all large images
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

self.addEventListener('fetch', event => {
    // Strategy: Stale While Revalidate for most things, but Cache First for large assets?
    // Let's use simpler Cache First for assets, Network First for JSON maybe?
    // For now: Cache First, falling back to network.
    // [taormina patch G] same-origin GET: network first (fresh page, settings, scripts and data
    // after a rebuild), cache refreshed, cached copy only when offline. Other hosts: stock rule.
    const req = event.request;
    const sameOrigin = new URL(req.url).origin === self.location.origin;
    if (sameOrigin && req.method === 'GET') {
        event.respondWith(
            fetch(req)
                .then(response => {
                    const small = /(\/|\.html|\.json|\.csv|\.js|\.svg)$/.test(new URL(req.url).pathname);
                    if (small && response && response.status === 200 && response.type === 'basic') {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => { });
                    }
                    return response;
                })
                .catch(() => caches.match(req).then(r => r || Response.error()))
        );
        return;
    }
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // [taormina patch N] owned (prefix) and retired (not current) caches only
                    if (cacheName.startsWith(CACHE_PREFIX) && cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
