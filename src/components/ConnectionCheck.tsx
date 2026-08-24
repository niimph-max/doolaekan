'use client';

import React, { useState } from 'react';
import { diagnose, type Diagnosis } from '@/lib/remote';
import type { Book } from '@/lib/types';

/** ตรวจการเชื่อมต่อในเครื่องนั้นเลย — บอกว่าเข้าระบบด้วยบัญชีไหน เห็นสมุดกี่เล่ม
 *  สมุดที่เปิดอยู่ตรงกับในฐานข้อมูลไหม และเขียนลงไปได้จริงหรือเปล่า
 *
 *  มีไว้เพราะเวลาบันทึกไม่ขึ้น สาเหตุอยู่คนละที่กับที่ผู้ใช้เห็น การไล่ทีละอย่าง
 *  ผ่านการถามตอบใช้เวลาหลายรอบมาก ปุ่มนี้ตอบได้ครบในกดครั้งเดียว */
export function ConnectionCheck({ book }: { book?: Book }) {
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setResult(await diagnose(book?.id ?? ''));
    } catch (e) {
      setResult({
        email: '(ตรวจไม่สำเร็จ)', userId: '', readableBooks: [],
        activeBookId: book?.id ?? '', activeBookReadable: false,
        writeOk: false, writeError: (e as Error).message,
      });
    }
    setRunning(false);
  };

  const line = (label: string, value: string, bad = false) => (
    <p style={{ margin: '4px 0', wordBreak: 'break-all' }}>
      <strong>{label}:</strong>{' '}
      <span style={{ color: bad ? 'var(--color-accent-700)' : undefined }}>{value}</span>
    </p>
  );

  return (
    <div style={{ marginTop: 18 }}>
      <button type="button" className="o-btn ghost block" disabled={running} onClick={() => void run()}>
        {running ? 'กำลังตรวจ…' : 'ตรวจการเชื่อมต่อคลาวด์'}
      </button>

      {result && (
        <div className="o-card" style={{ marginTop: 10, padding: 16, fontSize: 15 }}>
          {line('เข้าระบบด้วย', result.email)}
          {line('สมุดที่เปิดอยู่', book
            ? `${book.owner_name} · ${result.activeBookId}`
            : 'ยังไม่มีสมุด (อยู่หน้ากรอกข้อมูลเริ่มต้น)')}
          {book && line(
            'สมุดเล่มนี้ในฐานข้อมูล',
            result.activeBookReadable ? 'เจอ' : 'ไม่เจอ — เป็นสมุดที่ค้างอยู่ในเครื่องเท่านั้น',
            !result.activeBookReadable,
          )}
          {line('สมุดที่เห็นได้ทั้งหมด', result.readableBooks.length
            ? result.readableBooks.map((b) => b.name).join(', ')
            : 'ไม่เห็นสักเล่ม', !result.readableBooks.length)}
          {line(
            'ลองเขียนลงคลาวด์',
            result.writeOk ? 'สำเร็จ' : `ไม่สำเร็จ — ${result.writeError}`,
            !result.writeOk,
          )}

          {book && !result.writeOk && !result.activeBookReadable && (
            <p className="subtle" style={{ margin: '10px 0 0' }}>
              สมุดที่เปิดอยู่ไม่มีในฐานข้อมูล ทุกอย่างที่บันทึกลงเล่มนี้จึงค้างอยู่ในเครื่อง
              ออกจากระบบแล้วเข้าใหม่จะดึงสมุดของจริงลงมา
            </p>
          )}
        </div>
      )}
    </div>
  );
}
