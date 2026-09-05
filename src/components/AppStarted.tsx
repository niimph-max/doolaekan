'use client';

import { useEffect } from 'react';

/** บอกตัวกู้ในหน้า HTML ว่า "แอปเริ่มทำงานแล้ว ไม่ต้องมากู้"
 *
 *  คู่กับสคริปต์ตัวกู้ใน `src/app/layout.tsx` ซึ่งฝังอยู่ในไฟล์ HTML ตรงๆ
 *  ไม่ได้อยู่ในก้อน JavaScript ของแอป — เพราะเคสที่ต้องกู้คือ "ก้อนนั้นโหลดไม่ได้"
 *
 *  ถ้าไม่มีตัวนี้ ตัวกู้จะแยกไม่ออกระหว่าง "แอปตายสนิท" กับ "แอปทำงานอยู่แต่ช้า"
 *  แล้วอาจไปล้างแคชของเครื่องที่ปกติดีทิ้ง */
export function AppStarted() {
  useEffect(() => {
    (window as unknown as { __doolaekanStarted?: boolean }).__doolaekanStarted = true;
    // เปิดได้แล้วก็ลบรอยการกู้รอบก่อนทิ้ง ครั้งหน้าถ้าพังอีกจะได้กู้ให้ใหม่
    try { sessionStorage.removeItem('doolaekan-rescue'); } catch { /* โหมดส่วนตัวห้ามเขียน */ }
  }, []);
  return null;
}
