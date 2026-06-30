/* ============================================================
   Service Worker — ДОOMUNALKA / Коммуналка
   Без этого файла приложение НЕ открывается в полном офлайне
   вообще: index.html — статическая страница на GitHub Pages,
   без него браузеру нечего показать без сети (см. разбор от
   2026-06-30). Этот файл закрывает именно этот пробел.

   Стратегия: network-first с откатом на кеш.
   - Если сеть есть — всегда отдаём свежую версию (и обновляем кеш).
   - Если сети нет — отдаём последнюю сохранённую копию.
   Это сознательный выбор: приложение меняется часто (см. историю
   правок), и мы не хотим, чтобы кто-то годами видел устаревшую
   версию из кеша, пока сеть есть. Кеш — это только страховка на
   случай отсутствия связи, не основной источник данных.
   ============================================================ */

const CACHE_VERSION = 'doomunalka-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Кешируем по одному — если один внешний ресурс недоступен
      // (например, CDN временно лёг), это не должно сорвать всю
      // установку Service Worker'а.
      return Promise.all(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Не удалось закешировать при установке:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Только GET — POST/PUT к Firestore и т.п. не перехватываем.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Сеть есть — отдаём свежее, параллельно обновляем кеш на будущее.
        const copy = networkResponse.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return networkResponse;
      })
      .catch(() => {
        // Сети нет — пробуем отдать сохранённую копию.
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Навигационный запрос (открытие страницы) без сети и без кеша —
          // отдаём хотя бы index.html, если он закешировался раньше.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 504, statusText: 'Offline и нет кеша' });
        });
      })
  );
});
