/*
 * Service worker cho bản web (PWA): mở được khi mất mạng.
 * - Trang + JS/CSS: lấy từ cache trước (file có hash nên không cũ), tải mới thì lưu lại.
 * - API giá (GET /api/...): lấy mạng trước, mất mạng thì dùng bản đã lưu gần nhất.
 * Sổ thu chi nằm trong IndexedDB nên không cần mạng.
 */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const API = `api-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== API).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackUrl ?? request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackUrl ?? request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Luôn thử lấy bản mới của trang, mất mạng thì dùng trang đã lưu
    event.respondWith(networkFirst(request, SHELL, '/'));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
