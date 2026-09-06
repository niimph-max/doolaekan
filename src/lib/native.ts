'use client';

/** รันอยู่ในแอปที่ห่อด้วย Capacitor หรือในเบราว์เซอร์ธรรมดา
 *
 *  ตั้งใจไม่ `import { Capacitor } from '@capacitor/core'` ตรงๆ ด้วยสองเหตุผล
 *  1. หน้าเว็บถูกสร้างไว้ล่วงหน้าตอน build (output: 'export') โค้ดที่แตะ window
 *     ตั้งแต่ตอนโหลดโมดูลจะพังตั้งแต่ตอน build ไม่ใช่ตอนผู้ใช้เปิด
 *  2. คนที่เข้าผ่านเบราว์เซอร์ไม่ควรต้องโหลดโค้ดของฝั่งแอปติดไปด้วย
 *
 *  ตัวแปร Capacitor ถูกฉีดเข้ามาโดยตัวแอปเอง ไม่มีทางมีในเบราว์เซอร์ธรรมดา */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}
