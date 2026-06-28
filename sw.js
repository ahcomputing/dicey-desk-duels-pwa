/* simple app-shell cache — offline play once installed */
const CACHE = 'dice-duels-v6';
const SHELL = ['.', 'index.html', 'styles.css', 'content.js', 'engine.js', 'view.js', 'manifest.webmanifest',
  'favicon.ico', 'favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-192-maskable.png', 'icon-512-maskable.png'];
// NOTE: art/ files are intentionally NOT in SHELL — they may not exist yet, and a
// single 404 would reject the whole addAll() install. They're cached at runtime below.
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  // art/ sprites: cache-first, then opportunistically cache successful fetches (offline after first load).
  // A missing/404 art file just passes through — it must never break the page.
  if (e.request.method === 'GET' && /\/art\//.test(e.request.url)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return resp;
    }).catch(() => hit)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
