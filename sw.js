/* simple app-shell cache — offline play once installed */
const CACHE = 'dice-duels-v12';
const SHELL = ['.', 'index.html', 'styles.css', 'content.js', 'engine.js', 'audio.js', 'music.js', 'view.js', 'manifest.webmanifest',
  'favicon.ico', 'favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-192-maskable.png', 'icon-512-maskable.png'];
// NOTE: art/ files are intentionally NOT in SHELL — they may not exist yet, and a
// single 404 would reject the whole addAll() install. They're cached at runtime below.
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// cache-first: serve from cache, else fetch and stash (fast + offline, for assets that rarely change)
function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(resp => {
    if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return resp;
  }).catch(() => hit));
}
// network-first: always try the network so shell CODE updates land immediately; fall back to cache offline.
// This is the fix for stale JS — cache-first used to keep serving old engine.js/view.js after a change.
function networkFirst(req) {
  return fetch(req).then(resp => {
    if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return resp;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html')));
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // cross-origin: leave to the browser
  // art sprites + binary media: cache-first (rarely change, keep instant + offline; a 404 just passes through)
  if (/\/art\//.test(url.pathname) || /\.(png|ico|jpe?g|webp|gif)$/i.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  // app shell (html/js/css/svg/manifest) + navigations: network-first so fresh code always wins online
  e.respondWith(networkFirst(req));
});
