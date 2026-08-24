'use client';

import React from 'react';
import { Icon } from './Icon';
import { useStore } from '@/lib/store';

/** เข้าระบบได้แล้วแต่ดึงข้อมูลไม่สำเร็จ
 *  เคสนี้ต้องแยกจาก "ยังไม่มีสมุด" ให้ชัด ไม่งั้นผู้ใช้ที่มีสมุดอยู่แล้ว
 *  จะเจอหน้ากรอกข้อมูลใหม่ นึกว่าของเดิมหาย แล้วกรอกซ้ำจนได้สมุดสองเล่ม */
export function LoadError() {
  const { state, actions } = useStore();

  return (
    <div className="full">
      <div className="full-inner">
        <div className="o-card warn" style={{ marginTop: 40 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <Icon name="alert" size={24} color="var(--color-accent-700)" />
            <h3 style={{ margin: 0 }}>โหลดข้อมูลไม่สำเร็จ</h3>
          </div>
          <p style={{ margin: 0 }}>
            เข้าระบบได้แล้ว แต่ดึงสมุดจากคลาวด์ไม่ได้ — <strong>ข้อมูลยังอยู่ครบ</strong> ไม่ได้หายไปไหน
          </p>
          <p className="subtle" style={{ margin: '10px 0 0', wordBreak: 'break-word' }}>
            {state.loadError}
          </p>
        </div>

        <button type="button" className="o-btn primary block"
          onClick={() => { void actions.retryLoad(); }}>
          ลองใหม่อีกครั้ง
        </button>

        <div className="o-card" style={{ marginTop: 16 }}>
          <h3>ถ้ายังไม่ได้</h3>
          <ul style={{ margin: '8px 0 0', paddingInlineStart: 20 }}>
            <li>เช็คสัญญาณอินเทอร์เน็ต แล้วกดลองใหม่</li>
            <li>ปิดแอปแล้วเปิดใหม่</li>
          </ul>
          {state.userEmail && (
            <p className="subtle" style={{ marginTop: 12 }}>
              เข้าระบบด้วย <strong>{state.userEmail}</strong>
            </p>
          )}
        </div>

        <button type="button" className="o-btn ghost block"
          onClick={() => { void actions.signOut(); }}>
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}
