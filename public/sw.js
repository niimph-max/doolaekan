// Doolaekan service worker — ให้ติดตั้งลงหน้าจอได้ และเปิดแอปได้ตอนเน็ตหลุด
// (ขั้นถัดไปตาม notifications.md: รับ Web Push ที่นี่ด้วย)

const CACHE = 'doolaekan-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // หน้าเว็บ: เอาของใหม่ก่อน ถ้าเน็ตหลุดค่อยใช้ของที่แคชไว้
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/'))),
    );
    return;
  }

  // ไฟล์คงที่: ใช้ของที่แคชไว้ก่อน แล้วค่อยเติมแคชเบื้องหลัง
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    })),
  );
});
