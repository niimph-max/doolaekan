'use client';

import React from 'react';
import type { Book } from '@/lib/types';

/** บรรทัดบนสุดของทุกแท็บ — ชื่อแอป · ชื่อสมุดที่กำลังดูอยู่
 *
 *  เดิมหน้าส่วนใหญ่ขึ้นแค่ "Doolaekan" ทุกแท็บเหมือนกันหมด ซึ่งบอกอะไรไม่ได้เลย
 *  ทั้งที่คำถามที่สำคัญที่สุดตอนกดดูข้อมูลคนอื่นคือ "ตอนนี้ดูสมุดใครอยู่"
 *  โดยเฉพาะเวลาสลับไปมาระหว่างสมุดเตี่ย แม่ และของตัวเอง แล้วกดบันทึกอะไรลงไป */
export function Kicker({ book }: { book: Book }) {
  return (
    <p className="kicker">
      Doolaekan{book.owner_name ? ` · ${book.owner_name}` : ''}
    </p>
  );
}
