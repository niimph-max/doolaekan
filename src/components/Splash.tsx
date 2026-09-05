'use client';

import React, { useEffect, useState } from 'react';
import { Logo } from './Logo';

/** หน้าจอระหว่างรอเช็คว่าเข้าระบบอยู่หรือยัง
 *  เดิมเป็น div ว่างเปล่า ถ้าเช็คช้าหรือค้างจะเห็นเป็นจอขาวโดยไม่รู้ว่าเกิดอะไรขึ้น */
export function Splash() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    // ป้ายนี้เป็นตัวชี้ให้ตัวกู้ใน layout รู้ว่า "จอยังเป็นหน้ารออยู่"
    // ห้ามใช้วิธีอ่านข้อความบนจอแทน เพราะ textContent ของ body รวมข้อความในแท็ก
    // script ด้วย ตัวกู้จึงจะเจอคำที่ตัวเองเขียนไว้แล้วนึกว่าแอปค้างตลอดเวลา
    <div className="full" data-boot-splash="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="full-inner" style={{ textAlign: 'center' }}>
        <Logo size={96} />
        <p className="subtle" style={{ marginTop: 18 }}>
          {slow ? 'ใช้เวลานานกว่าปกติ…' : 'กำลังเปิดสมุด…'}
        </p>
        {slow && (
          <>
            <p className="subtle" style={{ marginTop: 6 }}>
              เช็คสัญญาณอินเทอร์เน็ต แล้วลองโหลดหน้าใหม่
            </p>
            <button type="button" className="o-btn primary" style={{ marginTop: 16 }}
              onClick={() => window.location.reload()}>
              โหลดหน้าใหม่
            </button>
          </>
        )}
      </div>
    </div>
  );
}
