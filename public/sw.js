// ══════════════════════════════════════════════════════════════
//  GGC Service Worker — App-Shell Cache
//  Cached: statische Assets (CSS, Fonts, Icons)
//  NICHT cached: API-Calls, HTML-Seiten (immer frisch vom Server)
// ══════════════════════════════════════════════════════════════

const CACHE_NAME = 'ggc-shell-v5';

const SHELL_ASSETS = [
    '/styles.css',
    '/navheader.js',
    '/assets/goldengoat.png',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
    'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css',
];

// ── Install: Shell cachen ─────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // addAll schlägt fehl wenn ein Asset nicht ladbar ist — daher einzeln
            return Promise.allSettled(
                SHELL_ASSETS.map(url => cache.add(url).catch(() => {}))
            );
        })
    );
    self.skipWaiting();
});

// ── Activate: Alte Caches löschen ────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// ── Fetch: Cache-First für Shell-Assets, Network-First für alles andere ──
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // API-Calls und HTML-Navigationen immer vom Netzwerk
    if (event.request.mode === 'navigate') return;
    if (url.pathname.startsWith('/users/') && !url.pathname.match(/\.(css|js|png|jpg|svg|ico|woff2?)$/)) return;

    // Für bekannte Shell-Assets: Cache-First
    if (SHELL_ASSETS.some(a => event.request.url.includes(a.replace('https://', '')))) {
        event.respondWith(
            caches.match(event.request).then(cached => cached || fetch(event.request))
        );
        return;
    }

    // JS-Dateien: Network-First (immer frische Version), Cache als Offline-Fallback
    if (url.pathname.match(/\.js$/) && url.origin === self.location.origin) {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // Bilder & sonstige statische Assets: Cache-First mit Network-Fallback
    if (url.pathname.match(/\.(css|png|jpg|svg|ico|woff2?|json)$/) && url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
        );
    }
});
