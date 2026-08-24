// Doolaekan service worker — ให้ติดตั้งลงหน้าจอได้ และเปิดแอปได้ทันทีแม้เน็ตช้า
// (ขั้นถัดไปตาม notifications.md: รับ Web Push ที่นี่ด้วย)

// เลขรุ่นถูกแทนที่ตอน deploy ด้วยเลข build จริง ทุก deploy จึงได้ service worker
// ที่เนื้อไฟล์ต่างจากเดิมเสมอ เบราว์เซอร์เห็นว่าเปลี่ยนแล้วติดตั้งตัวใหม่ให้ทันที
// ถ้าไม่ทำแบบนี้ deploy ที่ไม่ได้แตะ sw.js จะไม่มีอะไรกระตุ้นให้เครื่องอัปเดตเลย
const BUILD = '__BUILD__';
const VERSION = BUILD === ('__' + 'BUILD__') ? 'dev' : BUILD;
const CACHE = `doolaekan-shell-v${VERSION}`;
// เก็บของรอบก่อนไว้ด้วยหนึ่งรุ่น — หน้าเว็บที่หยิบจากแคชอ้างถึงไฟล์ js/css ชุดเก่า
// ซึ่ง GitHub Pages ลบทิ้งไปแล้วตอน deploy รอบใหม่ ถ้าล้างแคชเก่าด้วยจะเหลือจอขาว
const KEEP = [CACHE, `doolaekan-shell-v${Number(VERSION) - 1}`];

// scope คือโฟลเดอร์ที่แอปถูกวางไว้ ('/' บนโดเมนของตัวเอง, '/doolaekan/' บน GitHub Pages)
const BASE = new URL(self.registration.scope).pathname;
const SHELL = ['', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']
  .map((f) => BASE + f);

// เน็ตช้ากว่านี้ ไม่ต้องรอแล้ว เอาของที่เก็บไว้ขึ้นจอก่อน
const NETWORK_TIMEOUT_MS = 1200;

self.addEventListener('install', (event) => {
  // addAll ล้มทั้งชุดถ้ามีไฟล์เดียวโหลดไม่ผ่าน แล้วตัวใหม่จะติดตั้งไม่จบ
  // เครื่องนั้นก็ค้างอยู่กับรุ่นเก่าตลอดไป ทั้งที่ deploy ของใหม่ไปแล้ว
  // เก็บได้เท่าไหร่เอาเท่านั้น แล้วเข้าคุมเลย ที่เหลือค่อยเก็บตอนใช้งานจริง
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** เก็บสำเนาไว้ใช้รอบหน้า — ทำเงียบๆ เบื้องหลัง ไม่ให้ค้างการแสดงผล */
function store(request, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // ห้ามเสิร์ฟตัวเองจากแคชเด็ดขาด ไม่งั้นจะไม่มีวันได้รุ่นใหม่
  if (url.pathname.endsWith('/sw.js')) return;

  // ── หน้าเว็บ ──
  // เดิมรอเน็ตตอบก่อนเสมอ จะใช้ของที่แคชไว้ก็ต่อเมื่อคำขอล้มเหลวไปเลยเท่านั้น
  // เน็ตที่ "ช้าแต่ไม่ถึงกับล่ม" จึงทำให้เปิดแอปทีต้องนั่งรอทุกครั้ง
  // ตอนนี้ให้แข่งกับเวลา: เกิน 1.2 วินาทีเอาของที่เก็บไว้ขึ้นจอก่อน
  // ส่วนของใหม่ที่ตามมาทีหลังก็เก็บไว้ ใช้ตอนเปิดครั้งถัดไป
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(request) || await caches.match(BASE);
      const fromNetwork = fetch(request).then((res) => store(request, res));

      if (!cached) return fromNetwork.catch(() => caches.match(BASE));

      // ถ้าเน็ตตอบทันในเวลาก็ใช้ของใหม่เลย ช้ากว่านั้นค่อยใช้ของเก่า
      const raced = await Promise.race([
        fromNetwork.catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS)),
      ]);
      // งานโหลดเบื้องหลังต้องไม่ถูกตัดทิ้งตอน respondWith จบ ไม่งั้นแคชไม่ได้อัปเดต
      event.waitUntil(fromNetwork.catch(() => {}));
      return raced || cached;
    })());
    return;
  }

  // ── ไฟล์คงที่ ── ชื่อไฟล์มี hash อยู่แล้ว ของเดิมจึงใช้ได้เสมอ
  // caches.match ค้นทุกแคชรวมรุ่นก่อนหน้า หน้าเว็บรุ่นเก่าจึงยังหาไฟล์ของตัวเองเจอ
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => store(request, res))),
  );
});
