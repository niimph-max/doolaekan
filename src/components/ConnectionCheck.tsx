'use client';

import React, { useState } from 'react';
import { diagnose, type Diagnosis } from '@/lib/remote';
import { useStore } from '@/lib/store';
import type { Book } from '@/lib/types';

/** ตรวจการเชื่อมต่อในเครื่องนั้นเลย — บอกว่าเข้าระบบด้วยบัญชีไหน เห็นสมุดกี่เล่ม
 *  สมุดที่เปิดอยู่ตรงกับในฐานข้อมูลไหม และเขียนลงไปได้จริงหรือเปล่า
 *
 *  มีไว้เพราะเวลาบันทึกไม่ขึ้น สาเหตุอยู่คนละที่กับที่ผู้ใช้เห็น การไล่ทีละอย่าง
 *  ผ่านการถามตอบใช้เวลาหลายรอบมาก ปุ่มนี้ตอบได้ครบในกดครั้งเดียว */
export function ConnectionCheck({ book }: { book?: Book }) {
  const { actions } = useStore();
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);

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

          {book && !result.activeBookReadable && (
            <>
              <p className="subtle" style={{ margin: '10px 0 0' }}>
                {result.writeOk
                  ? 'เขียนขึ้นคลาวด์ได้ แต่สมุดเล่มนี้ยังไม่เคยขึ้นไป — กดปุ่มข้างล่างส่งขึ้นได้เลย'
                  : 'สมุดเล่มนี้ยังอยู่แค่ในเครื่อง และตอนนี้เขียนขึ้นคลาวด์ไม่ได้ ลองใหม่อีกครั้งเมื่อสัญญาณดีขึ้น'}
              </p>
              <button type="button" className="o-btn primary block" style={{ marginTop: 12 }}
                disabled={sending}
                onClick={async () => {
                  setSending(true);
                  await actions.resyncToCloud();
                  setResult(null);
                  setSending(false);
                }}>
                {sending ? 'กำลังส่ง…' : 'ส่งข้อมูลในเครื่องขึ้นคลาวด์'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
