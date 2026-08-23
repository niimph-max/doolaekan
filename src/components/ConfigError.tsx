'use client';

import React from 'react';
import { Icon } from './Icon';
import { configError } from '@/lib/supabase';

/** ใส่ค่า Supabase ไว้แล้วแต่ค่าผิด — บอกให้ชัดว่าผิดตรงไหน ดีกว่าปล่อยให้ fetch พังแบบงงๆ */
export function ConfigError() {
  return (
    <div className="full">
      <div className="full-inner">
        <div className="o-card warn" style={{ marginTop: 48 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <Icon name="alert" size={24} color="var(--color-accent-700)" />
            <h3 style={{ margin: 0 }}>ตั้งค่า Supabase ไม่ถูกต้อง</h3>
          </div>
          <p style={{ margin: 0 }}>{configError}</p>
        </div>

        <div className="o-card">
          <h3>วิธีแก้</h3>
          <ol style={{ margin: '8px 0 0', paddingInlineStart: 20 }}>
            <li>เปิดไฟล์ <code>.env.local</code> ที่โฟลเดอร์โปรเจกต์</li>
            <li>ก๊อป anon key ใหม่จาก Supabase → Project Settings → API Keys</li>
            <li>วางให้เป็นบรรทัดเดียว ไม่มีเครื่องหมายคำพูดครอบ ไม่มีเว้นวรรค</li>
            <li>บันทึกไฟล์ แล้วหยุด <code>npm run dev</code> (Ctrl+C) และรันใหม่</li>
          </ol>
          <p className="subtle" style={{ marginTop: 10 }}>
            Next.js อ่านไฟล์ <code>.env.local</code> แค่ตอนเริ่มทำงาน แก้แล้วต้องรันใหม่เสมอ
          </p>
        </div>
      </div>
    </div>
  );
}
