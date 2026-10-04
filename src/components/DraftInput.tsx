'use client';

import React, { useEffect, useRef, useState } from 'react';

/** ช่องกรอกที่เก็บสิ่งที่พิมพ์ไว้ในเครื่องก่อน แล้วค่อยบันทึกตอนพิมพ์เสร็จ (ออกจากช่อง)
 *
 *  ถ้าบันทึกทุกตัวอักษร จะเจอสองอาการนี้:
 *  1. ตัวอักษรหาย — พิมพ์เลข HN เร็วๆ ค่าที่ยิงขึ้นคลาวด์ตัวก่อนหน้าไหลกลับมาทับ
 *     ช่องที่กำลังพิมพ์อยู่ ตัวที่พิมพ์ระหว่างนั้นจึงหายไป
 *  2. แก้แล้วกลับมาดูใหม่ค่าเดิม — คนอื่นในบ้านบันทึกอะไรสักอย่าง realtime สั่ง
 *     โหลดข้อมูลใหม่ทั้งชุด ค่าที่พิมพ์ค้างอยู่โดนของเก่าจากเซิร์ฟเวอร์ทับ
 *
 *  ระหว่างที่เคอร์เซอร์ยังอยู่ในช่อง จะไม่รับค่าจากข้างนอกมาทับเด็ดขาด */
/** ตรรกะร่างข้อความอยู่ที่เดียว ช่องบรรทัดเดียวกับกล่องหลายบรรทัดใช้ร่วมกัน
 *  ถ้าเขียนแยกกัน วันหนึ่งจะมีฝั่งเดียวที่ยังโดนค่าจากคลาวด์ทับระหว่างพิมพ์ */
function useDraft(value: string, onCommit: (v: string) => void) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  // ค่าจากคลาวด์เปลี่ยน (คนอื่นแก้) ให้ตามด้วย — แต่เฉพาะตอนที่ไม่ได้พิมพ์อยู่
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  return {
    value: local,
    onFocus: () => { focused.current = true; },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLocal(e.target.value),
    onBlur: () => {
      focused.current = false;
      if (local !== value) onCommit(local);
    },
  };
}

export function DraftInput({ value, onCommit, ...rest }: {
  value: string;
  onCommit: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'onFocus'>) {
  return <input {...rest} className={rest.className ?? 'o-input'} {...useDraft(value, onCommit)} />;
}

/** กล่องหลายบรรทัดที่เก็บร่างแบบเดียวกัน — ใช้กับช่องที่ข้อความยาวเกินหนึ่งบรรทัดจริงๆ
 *
 *  ช่องบรรทัดเดียวซ่อนข้อความส่วนเกินไว้นอกจอ ต้องเลื่อนทีละตัวอักษรถึงจะอ่านครบ
 *  ซึ่งกับช่องแพ้ยาคือของอันตราย เพราะคนเปิดดูจะเห็นแค่ตัวแรกแล้วนึกว่ามีแค่นั้น */
export function DraftTextarea({ value, onCommit, ...rest }: {
  value: string;
  onCommit: (value: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur' | 'onFocus'>) {
  return <textarea {...rest} className={rest.className ?? 'o-textarea'} {...useDraft(value, onCommit)} />;
}
