/**
 * sw.js - Service Worker
 * Nice Serviceman 日報
 * キャッシュ戦略: Stale-While-Revalidate
 */

const CACHE_NAME = 'nippo-v32';

const PRECACHE_URLS = [
  '/nippo/',
  '/nippo/index.html',
  '/nippo/css/style.css',
  '/nippo/js/holidaysConfig.js',
  '/nippo/js/kgiDeadlineConfig.js',
  '/nippo/js/utils.js',
  '/nippo/js/api.js',
  '/nippo/js/app.js',
  '/nippo/manifest.json',
  '/nippo/icons/icon-192.png',
  '/nippo/icons/icon-512.png',
];

// インストール: コアファイルを事前キャッシュ
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// フェッチ: Stale-While-Revalidate
self.addEventListener('fetch', function(event) {
  var req = event.request;

  // POST / 非GETはスキップ（Apps Script API含む）
  if (req.method !== 'GET') return;

  // Google Apps Script URLはキャッシュしない（動的データ）
  if (req.url.includes('script.google.com')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(req).then(function(cached) {
        var fetchPromise = fetch(req).then(function(response) {
          // 有効なレスポンスのみキャッシュ更新
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(req, response.clone());
          }
          return response;
        }).catch(function() {
          return null;
        });
        // キャッシュがあれば即返す（バックグラウンドで更新）
        return cached || fetchPromise;
      });
    })
  );
});
