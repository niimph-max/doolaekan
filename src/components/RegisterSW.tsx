'use client';

import { useEffect } from 'react';

/** ลงทะเบียน service worker ให้ติดตั้งลงหน้าจอได้ (PWA) และเปิดใช้ตอนเน็ตหลุด
 *
 *  ที่ผ่านมาผู้ใช้ต้องรีเฟรชสองครั้งกว่าจะได้ของใหม่: รอบแรกยังเป็นไฟล์ชุดเก่าที่
 *  service worker ตัวเดิมเสิร์ฟอยู่ ตัวใหม่เพิ่งจะเข้าคุมตอนท้าย รอบสองถึงได้ของจริง
 *  ผลคือแก้อะไรไปก็เหมือนไม่ได้แก้ จนกว่าจะบังเอิญรีเฟรชครบสองที
 *
 *  ตอนนี้พอตัวใหม่เข้าคุมเมื่อไหร่ ให้โหลดหน้าใหม่ให้เองทันทีหนึ่งครั้ง */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    // ติดตั้งครั้งแรกก็นับเป็นการเปลี่ยนตัวคุมเหมือนกัน แต่ของบนจอใหม่อยู่แล้ว
    // ไม่ต้องโหลดซ้ำ (และกันวนโหลดไม่รู้จบ)
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // ต้องผูกกับรากเว็บ ไม่ใช่สัมพัทธ์ ไม่งั้นเปิดจากหน้าที่อยู่ลึกลงไป (เช่น /welcome/)
    // จะไปลงทะเบียน /welcome/sw.js ซึ่งไม่มีอยู่ และ scope จะครอบแค่หน้านั้น
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    let reg: ServiceWorkerRegistration | null = null;
    // updateViaCache: 'none' สำคัญมาก — ไม่งั้นเบราว์เซอร์เก็บ sw.js ไว้ใน HTTP cache
    // ได้ถึง 24 ชั่วโมง เช็คหารุ่นใหม่กี่ครั้งก็เจอแต่ไฟล์เดิม แอปเลยค้างรุ่นเก่าทั้งวัน
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/`, updateViaCache: 'none' })
      .then((r) => { reg = r; return r.update(); })
      .catch(() => { /* ติดตั้งไม่ได้ก็ยังใช้แอปได้ตามปกติ */ });

    // กลับมาเปิดแอปอีกครั้ง (สลับแท็บ/ปลดล็อกจอ) ถือโอกาสเช็คว่ามีรุ่นใหม่ไหม
    const onVisible = () => {
      if (document.visibilityState === 'visible') reg?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
