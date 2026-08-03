const CACHE = 'seshat-v4';

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept other origins (Supabase, fonts, CDNs).
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' ||
                 req.destination === 'document' ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('.html');

  if (isHTML) {
    // NETWORK FIRST for pages.
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Images and other assets: STALE-WHILE-REVALIDATE.
  // Serve the cached copy instantly if we have a GOOD one, but ALWAYS
  // fetch from the network in the background to refresh it. Critically,
  // we never store a failed (404/500) response, and a previously-missing
  // image will be picked up on the very next load — no reinstall needed.
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(cached => {
        const networkFetch = fetch(req)
          .then(res => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => null);

        // If we have a valid cached copy, serve it now and refresh in the
        // background. Otherwise wait for the network (first load, or the
        // image that used to 404 and is now available).
        if (cached) {
          networkFetch; // fire and forget — updates cache for next time
          return cached;
        }
        return networkFetch.then(res => res || cached);
      })
    )
  );
});
