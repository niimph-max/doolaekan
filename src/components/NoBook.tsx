'use client';

import React, { useEffect, useState } from 'react';
import { ConnectionCheck } from './ConnectionCheck';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { Onboarding } from './Onboarding';
import { currentUserId } from '@/lib/remote';
import { useStore } from '@/lib/store';
import { forgetHadBook, hadBookBefore } from '@/lib/storage';

const AUTO_TRIES = 2;
/** ช้าสุดที่ยอมให้หน้านี้ยังบอกว่า "กำลังดึง" อยู่
 *
 *  นับจากเวลาจริงเสมอ ไม่ใช่นับจากรอบที่ลองเสร็จ เพราะคำขอทางเน็ตค้างได้นาน
 *  เกินคาดเสมอ ถ้าผูกกับรอบที่ลองเสร็จ ผู้ใช้อาจติดหน้ารอโดยไม่มีปุ่มให้กดเลย
 *  ซึ่งเป็นทางตันแบบเดียวกับที่หน้านี้ตั้งใจจะแก้ */
const SETTLE_MS = 7000;
/** เวลาสูงสุดที่ยอมรอคำตอบว่า token ยังใช้ได้ไหม */
const PROBE_TIMEOUT_MS = 6000;

/** เข้าระบบแล้วแต่ยังไม่เห็นสมุดสักเล่ม — ที่ให้ "รอ" ก่อนถึงหน้ากรอกข้อมูล
 *
 *  เดิมเคสนี้ตกไปหน้ากรอกข้อมูลเริ่มต้นทันที ซึ่งอันตรายมาก เพราะสาเหตุที่พบบ่อย
 *  ไม่ใช่ "ยังไม่มีสมุด" แต่เป็น "อ่านไม่ติดชั่วคราว" (token หมดอายุแล้วต่อไม่ทัน
 *  ฐานข้อมูลจึงตอบว่าว่างโดยไม่นับเป็น error) คนที่มีสมุดอยู่แล้วเห็นหน้ากรอก
 *  ก็จะนึกว่าข้อมูลหาย แล้วกรอกใหม่จนได้สมุดซ้ำสองเล่มในกลุ่ม
 *
 *  หน้านี้จึงลองดึงข้อมูลเองเงียบๆ ก่อนสองรอบ ถ้ายังไม่ได้ค่อยให้ผู้ใช้เลือกเอง
 *  และการสร้างสมุดใหม่ต้องกดยืนยันเสมอ ไม่ใช่สิ่งที่หลุดเข้าไปเจอโดยบังเอิญ */
export function NoBook() {
  const { state, actions } = useStore();
  const [creating, setCreating] = useState(false);
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState(false);
  const [authOk, setAuthOk] = useState<boolean | null>(null);
  const knew = hadBookBefore(state.userId);

  // ── ถามเซิร์ฟเวอร์ตรงๆ ว่ายังรู้จักเราอยู่ไหม ──
  // "อ่านได้ 0 เล่ม" เกิดได้จากสองสาเหตุที่ต่างกันคนละเรื่อง แต่หน้าตาเหมือนกันเป๊ะ
  // คือยังไม่มีสมุดจริงๆ กับ session หมดอายุจนคำขอถูกส่งไปแบบไม่มีตัวตน
  // (ฐานข้อมูลไม่รู้ว่าเราคือใคร กติกาจึงไม่คืนแถวไหนเลย และไม่นับเป็น error)
  // ถ้าเดาผิดทางแล้วชวนผู้ใช้สร้างสมุดใหม่ จะได้สมุดซ้ำทั้งที่ของเดิมอยู่ครบ
  // การเรียก getUser คุยกับเซิร์ฟเวอร์เข้าระบบโดยตรง จึงแยกสองกรณีนี้ได้ขาด
  useEffect(() => {
    if (!state.userId) return;
    let done = false;
    Promise.race([
      currentUserId(),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), PROBE_TIMEOUT_MS)),
    ])
      .then((id) => { if (!done) setAuthOk(id === 'timeout' ? null : id === state.userId); })
      .catch(() => { if (!done) setAuthOk(false); });
    return () => { done = true; };
  }, [state.userId]);

  // ลองดึงเองเงียบๆ ก่อน เพราะสาเหตุที่พบบ่อยที่สุดหายเองได้ในไม่กี่วินาที
  useEffect(() => {
    if (creating || tries >= AUTO_TRIES) return;
    const t = setTimeout(async () => {
      setBusy(true);
      await actions.retryLoad();
      setBusy(false);
      setTries((n) => n + 1);
    }, tries === 0 ? 1200 : 3000);
    return () => clearTimeout(t);
  }, [tries, creating, actions]);

  // นาฬิกาแยกอีกตัว เดินตามเวลาจริง ไม่รอผลของคำขอที่อาจค้าง
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, []);

  if (creating) return <Onboarding />;

  const trying = !settled;

  return (
    <div className="full has-footer">
      <div className="full-inner">
        <div style={{ margin: '24px 0 18px' }}>
          <Logo size={84} />
        </div>

        {trying ? (
          <>
            <h2 style={{ fontSize: 24, margin: '4px 0 8px', textAlign: 'center' }}>
              กำลังดึงสมุดของคุณ…
            </h2>
            <p className="subtle" style={{ textAlign: 'center', margin: 0 }}>
              รอสักครู่ ไม่ต้องกรอกอะไรใหม่
            </p>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 24, margin: '4px 0 8px', textAlign: 'center' }}>
              {authOk === false
                ? 'หมดเวลาเข้าระบบแล้ว'
                : (knew ? 'ยังดึงสมุดกลับมาไม่ได้' : 'ยังไม่เจอสมุดของบัญชีนี้')}
            </h2>
            {state.userEmail && (
              <p className="subtle" style={{ textAlign: 'center', margin: 0, wordBreak: 'break-all' }}>
                {state.userEmail}
              </p>
            )}

            {authOk === false ? (
              <>
                <div className="o-card warn" style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <Icon name="alert" size={22} color="var(--color-accent-700)" />
                    <strong>ข้อมูลไม่ได้หาย</strong>
                  </div>
                  <p style={{ margin: 0 }}>
                    ข้อมูลอยู่ครบในคลาวด์ แค่ต้องเข้าระบบใหม่อีกครั้ง
                    <strong> อย่าสร้างสมุดใหม่</strong> เพราะจะได้สมุดซ้ำสองเล่ม
                  </p>
                </div>
                <button type="button" className="o-btn primary block" style={{ marginTop: 16 }}
                  onClick={() => { void actions.signOut(); }}>
                  เข้าระบบใหม่ด้วย {state.userEmail || 'บัญชีเดิม'}
                </button>
                <ConnectionCheck />
              </>
            ) : knew ? (
              <div className="o-card warn" style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                  <Icon name="alert" size={22} color="var(--color-accent-700)" />
                  <strong>ข้อมูลไม่ได้หาย</strong>
                </div>
                <p style={{ margin: 0 }}>
                  เครื่องนี้เคยเปิดสมุดของบัญชีนี้ได้ ตอนนี้แค่ต่อกับคลาวด์ไม่ติด
                  ลองอีกครั้งเมื่อสัญญาณดีขึ้น
                </p>
              </div>
            ) : (
              <p className="subtle" style={{ marginTop: 18 }}>
                ถ้าเพิ่งเคยใช้ครั้งแรก ให้กดสร้างสมุดของคุณได้เลย
                แต่ถ้าเคยมีสมุดอยู่แล้ว อย่าเพิ่งสร้างใหม่ — ให้กดลองใหม่ก่อน
                เพราะบางทีแค่ต่อกับคลาวด์ไม่ติดชั่วคราว
              </p>
            )}

            {authOk !== false && (
            <>
            <button type="button" className="o-btn primary block" style={{ marginTop: 16 }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await actions.retryLoad();
                setBusy(false);
              }}>
              {busy ? 'กำลังลอง…' : 'ลองดึงสมุดอีกครั้ง'}
            </button>

            <button type="button" className={knew ? 'o-btn ghost block' : 'o-btn secondary block'}
              style={{ marginTop: 10 }}
              onClick={() => {
                // ยืนยันแล้วว่าจะเริ่มใหม่จริง — ล้างความจำเดิมทิ้ง ไม่งั้นคราวหน้า
                // จะโดนเตือนซ้ำว่าเคยมีสมุด ทั้งที่ตั้งใจสร้างใหม่ไปแล้ว
                forgetHadBook(state.userId);
                setCreating(true);
              }}>
              <Icon name="plus" size={18} /> {knew ? 'ยืนยันสร้างสมุดใหม่' : 'สร้างสมุดของฉัน'}
            </button>
            </>
            )}

            {authOk !== false && state.mode === 'cloud' && state.userEmail && <ConnectionCheck />}
          </>
        )}
      </div>
    </div>
  );
}
