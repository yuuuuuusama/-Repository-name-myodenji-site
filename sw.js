const CACHE_NAME = 'myodenji-v7';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/about.html',
  '/rituals.html',
  '/prayer.html',
  '/news.html',
  '/faq.html',
  '/newsletter.html',
  '/houji-form.html',
  '/kitou-form.html',
  '/mizuko-form.html',
  '/thanks.html',
  '/privacy.html',
  '/manifest.json',
  '/animations.css',
  '/animations.js',
  '/chatbot.css',
  '/chatbot.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/temple-logo.jpg',
  '/temple-crest.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;

  // ページ(HTML)は、まず新しいものを取りに行く(法輪で直した文面をすぐ出すため)。つながらないときだけ控えを出す
  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isPage) {
    event.respondWith(
      fetch(req).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
