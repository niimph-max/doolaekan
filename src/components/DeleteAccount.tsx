'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';

/** คำที่ต้องพิมพ์ยืนยัน — สั้นพอที่จะพิมพ์ได้ แต่ยาวพอที่จะไม่เกิดจากการกดพลาด */
const CONFIRM_WORD = 'ลบบัญชี';

/** ลบบัญชีพร้อมข้อมูลทั้งหมด — Google Play บังคับให้มีทางลบบัญชีได้เองในแอป
 *
 *  นี่คือปุ่มเดียวในแอปที่กดแล้วกู้คืนไม่ได้เลย จึงต้องผ่านสามด่าน
 *    1. กดเปิด (ปุ่มธรรมดา ไม่เด่น เพราะไม่ใช่ของที่ควรกดบ่อย)
 *    2. อ่านรายการที่จะถูกลบ ซึ่งบอกจำนวนจริงจากข้อมูลในเครื่อง ไม่ใช่คำพูดลอยๆ
 *    3. พิมพ์คำยืนยันเอง — กันการกดรัวและกันเด็กหรือผู้สูงอายุกดพลาด
 *
 *  และต้องบอกความจริงว่าเกิดอะไรขึ้นหลังกด ไม่ใช่ขึ้นว่า "ลบแล้ว" ลอยๆ
 *  ถ้าฝั่งฐานข้อมูลยังไม่ได้ติดตั้งฟังก์ชันลบบัญชี ข้อมูลจะถูกลบครบแต่ตัวอีเมล
 *  ยังเข้าระบบได้ ต้องพูดตรงนั้นออกมา ไม่ใช่ปล่อยให้เข้าใจว่าลบหมดแล้ว */
export function DeleteAccount() {
  const { state, actions } = useStore();
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'done'>('idle');
  const [typed, setTyped] = useState('');
  const [fail, setFail] = useState('');
  const [authRemoved, setAuthRemoved] = useState(false);

  if (state.mode !== 'cloud' || !state.userId) return null;

  // นับของจริงจากข้อมูลที่อยู่บนจอ ไม่ใช่พูดลอยๆ ว่า "ข้อมูลทั้งหมด"
  const myBooks = state.books.filter((b) => b.owner_id === state.userId || b.is_mine);
  const ids = myBooks.map((b) => b.id);
  const inMine = <T extends { book_id: string }>(rows: T[]) => rows.filter((r) => ids.includes(r.book_id));
  const counts = {
    books: myBooks.length,
    meds: inMine(state.medications).length,
    appts: inMine(state.appointments).length,
    records: inMine(state.records).length,
  };

  if (step === 'done') {
    return (
      <div className="o-card warn" style={{ marginTop: 18, textAlign: 'left' }}>
        <strong>ลบข้อมูลทั้งหมดแล้ว</strong>
        <p className="subtle" style={{ margin: '6px 0 0' }}>
          {authRemoved
            ? 'บัญชีและข้อมูลทั้งหมดถูกลบออกจากคลาวด์เรียบร้อย ขอบคุณที่เคยใช้งาน'
            : 'ข้อมูลทั้งหมดถูกลบออกจากคลาวด์เรียบร้อย ส่วนอีเมลที่ใช้เข้าระบบยังอยู่ '
              + '— เข้าใหม่ได้แต่จะเจอสมุดเปล่า ถ้าต้องการให้ลบอีเมลออกด้วย แจ้งผู้ดูแลได้'}
        </p>
      </div>
    );
  }

  if (step === 'idle') {
    return (
      <button type="button" className="o-btn ghost" style={{ marginTop: 4 }}
        onClick={() => { setStep('confirm'); setTyped(''); setFail(''); }}>
        ลบบัญชีและข้อมูลทั้งหมด
      </button>
    );
  }

  return (
    <div className="o-card warn" style={{ marginTop: 14, textAlign: 'left' }}>
      <strong>ลบบัญชีและข้อมูลทั้งหมด</strong>
      <p className="subtle" style={{ margin: '6px 0 10px' }}>
        สิ่งเหล่านี้จะถูกลบออกจากคลาวด์ถาวร <strong>กู้คืนไม่ได้</strong> และไม่มีถังขยะให้ย้อน
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 }}>
        <li>สมุด {counts.books} เล่มที่คุณเป็นเจ้าของ พร้อมข้อมูลในเล่มทั้งหมด</li>
        <li>ยา {counts.meds} รายการ และประวัติการกดกินยา</li>
        <li>นัดหมอ {counts.appts} นัด</li>
        <li>บันทึกในไทม์ไลน์ {counts.records} รายการ พร้อมรูปและไฟล์ที่แนบไว้</li>
        <li>การเข้ากลุ่มครอบครัวทั้งหมด</li>
      </ul>
      <p className="subtle" style={{ margin: '0 0 10px' }}>
        บันทึกที่คุณเคยกดไว้ในสมุดของคนอื่นจะไม่ถูกลบ เพราะเป็นข้อมูลในสมุดของเจ้าของเล่มนั้น
      </p>

      <label className="o-label" htmlFor="del-confirm" style={{ marginTop: 0 }}>
        พิมพ์คำว่า <strong>{CONFIRM_WORD}</strong> เพื่อยืนยัน
      </label>
      <input id="del-confirm" className="o-input" value={typed}
        autoComplete="off" placeholder={CONFIRM_WORD}
        onChange={(e) => { setTyped(e.target.value); setFail(''); }} />

      {fail && (
        <p style={{ margin: '10px 0 0', color: 'var(--color-accent-700)' }}>
          ลบไม่สำเร็จ — {fail}
          <span className="subtle" style={{ display: 'block', marginTop: 4 }}>
            ข้อมูลยังอยู่ครบ ไม่มีอะไรถูกลบไป ลองใหม่อีกครั้งได้
          </span>
        </p>
      )}

      <div className="o-row" style={{ marginTop: 14 }}>
        <button type="button" className="o-btn secondary" disabled={step === 'busy'}
          onClick={() => { setStep('idle'); setTyped(''); setFail(''); }}>
          ไม่ลบแล้ว
        </button>
        <button type="button" className="o-btn danger"
          disabled={typed.trim() !== CONFIRM_WORD || step === 'busy'}
          onClick={async () => {
            setStep('busy'); setFail('');
            const r = await actions.deleteAccount();
            if (!r.ok) { setStep('confirm'); setFail(r.error ?? 'ไม่ทราบสาเหตุ'); return; }
            setAuthRemoved(r.authRemoved);
            setStep('done');
          }}>
          {step === 'busy' ? 'กำลังลบ…' : 'ลบถาวร'}
        </button>
      </div>
    </div>
  );
}
