'use client';

import { useEffect } from 'react';

/** ลงทะเบียน service worker ให้ติดตั้งลงหน้าจอได้ (PWA) และเปิดใช้ตอนเน็ตหลุด */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {
      /* ติดตั้งไม่ได้ก็ยังใช้แอปได้ตามปกติ */
    });
  }, []);
  return null;
}
