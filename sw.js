const CACHE = 'seshat-v18';

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
    // NETWORK FIRST for pages — always fetch the newest, so home-screen
    // apps update themselves with no reinstall.
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

  // Images & other assets: STALE-WHILE-REVALIDATE.
  // Serve cached instantly if good, always refresh in the background, and
  // never store a failed response — so a newly-uploaded image self-heals
  // on the next load with no reinstall.
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
        if (cached) { networkFetch; return cached; }
        return networkFetch.then(res => res || cached);
      })
    )
  );
});
