'use client';

import React from 'react';
import { Logo } from './Logo';
import { useStore } from '@/lib/store';

/** หน้าจอหลังลบบัญชี — ค้างไว้จนกว่าผู้ใช้จะกดเอง
 *
 *  เดิมลบเสร็จแล้วเด้งกลับหน้าใส่อีเมลทันที ผู้ใช้ไม่เห็นเลยว่าเกิดอะไรขึ้น
 *  ต้องเดาเองว่าลบสำเร็จหรือกดพลาด ซึ่งกับเรื่องที่กู้คืนไม่ได้แบบนี้ยอมไม่ได้ */
export function DeletedNotice({ kind }: { kind: 'full' | 'data' }) {
  const { actions } = useStore();
  return (
    <div className="full">
      <div className="full-inner" style={{ textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
        <Logo size={84} />
        <h2 style={{ fontSize: 24, marginTop: 22 }}>ลบข้อมูลทั้งหมดแล้ว</h2>
        <p className="subtle" style={{ marginTop: 10, lineHeight: 1.65 }}>
          {kind === 'full'
            ? 'บัญชีและข้อมูลทั้งหมดถูกลบออกจากคลาวด์เรียบร้อยแล้ว ขอบคุณที่เคยใช้งาน'
            : 'ข้อมูลทั้งหมดถูกลบออกจากคลาวด์เรียบร้อยแล้ว '
              + 'ส่วนอีเมลที่ใช้เข้าระบบยังอยู่ — เข้าใหม่ได้แต่จะเจอสมุดเปล่า'}
        </p>
        <button type="button" className="o-btn secondary" style={{ marginTop: 22 }}
          onClick={actions.clearDeletedNotice}>
          กลับหน้าเข้าใช้งาน
        </button>
      </div>
    </div>
  );
}
