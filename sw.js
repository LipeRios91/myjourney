const CACHE_NAME = 'jornada-do-heroi-v28';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './js/utils.js',
  './js/icons.js',
  './js/theme.js',
  './js/gamification-data.js',
  './js/habits-missions-data.js',
  './js/goals-data.js',
  './js/onboarding-data.js',
  './js/stats-data.js',
  './js/diet-data.js',
  './js/diet-foodsearch.js',
  './js/diet-ai.js',
  './js/gcal.js',
  './js/habits-missions-ui.js',
  './js/goals-ui.js',
  './js/diet-ui.js',
  './js/gcal-ui.js',
  './js/gamification-ui.js',
  './js/stats-ui.js',
  './js/home-ui.js',
  './js/onboarding-ui.js',
  './js/reminders.js',
  './js/sync.js',
  './js/sync-ui.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Só cacheia o próprio app shell — pedidos de terceiros (Google Identity
  // Services, Calendar API, Firebase, Open Food Facts, Gemini) sempre vão
  // direto pra rede, sem cache-first.
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
    })
  );
});
