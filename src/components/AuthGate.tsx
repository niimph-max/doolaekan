'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { getSupabase } from '@/lib/supabase';

/** เข้าสู่ระบบด้วยรหัส 6 หลักทางอีเมล — ไม่ต้องจำรหัสผ่าน เหมาะกับเครื่องกลางที่บ้าน */
// ความยาวรหัสตั้งได้ที่ Supabase (Auth → Sessions) ค่าเริ่มต้น 6 แต่บางโปรเจกต์เป็น 8
const OTP_MIN = 6;
const OTP_MAX = 10;
/** คำขอทางเน็ตต้องมีเส้นตายเสมอ ไม่งั้นปุ่มค้างที่ "กำลังตรวจ…" โดยไม่มีทางออก
 *
 *  การส่งอีเมลต้องให้เวลามากกว่าการตรวจรหัสมาก เพราะฝั่งเซิร์ฟเวอร์ต้องไปคุยกับ
 *  ผู้ให้บริการอีเมลอีกทอด บ่อยครั้งเกินสิบวินาที ตั้งสั้นไปแล้วจะไปสรุปว่า
 *  "เน็ตไม่ติด" ทั้งที่คำขอส่งสำเร็จและอีเมลกำลังเดินทางมา */
const SEND_TIMEOUT_MS = 30000;
const VERIFY_TIMEOUT_MS = 20000;
/** กันกดขอรหัสรัวๆ ซึ่งทำให้รหัสที่เพิ่งส่งไปใช้ไม่ได้ และไปชนลิมิตของผู้ให้บริการ */
const RESEND_COOLDOWN_S = 30;

type Fail = { kind: 'code' | 'network' | 'nouser' | 'pending' | 'other'; text: string };

/** ข้อความที่ไลบรารีโยนมาเมื่อเราเป็นฝ่ายเลิกรอเอง — ต่างจากเน็ตพังจริง */
const TIMED_OUT = 'เกินเวลารอ';

/** แยกให้ออกว่า "รหัสผิดจริง" กับ "ต่อไม่ติด" เพราะทางแก้คนละทางกันคนละเรื่อง
 *  ของเดิมเหมารวมทุกอย่างเป็น "รหัสไม่ถูกต้อง" ผู้ใช้จึงไปขอรหัสใหม่ทั้งที่รหัสเดิมยังดี
 *  แล้วการขอใหม่ก็ไปยกเลิกรหัสเดิมที่กำลังส่งมา กลายเป็นวนไม่จบ */
function classify(message: string): Fail {
  if (/failed to fetch|networkerror|load failed|timeout|เกินเวลา/i.test(message)) {
    return { kind: 'network', text: '' };   // ข้อความเลือกตามหน้าที่ยืนอยู่ ดู networkText()
  }
  if (/signups not allowed|user not found|invalid login credentials/i.test(message)) {
    return { kind: 'nouser', text: '' };
  }
  if (/(invalid|expired).*(token|otp|code)|(token|otp|code).*(invalid|expired)/i.test(message)) {
    return { kind: 'code', text: 'รหัสนี้ใช้ไม่ได้แล้ว — ถ้าเพิ่งกดขอรหัสใหม่ ให้ใช้รหัสอันล่าสุดที่ได้รับ' };
  }
  if (/rate limit|too many/i.test(message)) {
    return { kind: 'other', text: 'ขอรหัสถี่เกินไป รออีกสักครู่แล้วลองใหม่' };
  }
  return { kind: 'other', text: message };
}

/** เน็ตพังตอนขอรหัส กับตอนตรวจรหัส ต้องบอกคนละอย่าง
 *  ของเดิมใช้ข้อความเดียวว่า "รหัสเดิมยังใช้ได้" ซึ่งไม่มีความหมายเลยตอนอยู่หน้าใส่อีเมล
 *  เพราะยังไม่เคยมีรหัสสักอัน */
function networkText(step: 'email' | 'code'): string {
  return step === 'code'
    ? 'ต่ออินเทอร์เน็ตไม่ติดตอนนี้ — รหัสเดิมยังใช้ได้ กดลองอีกครั้งได้เลย'
    : 'ส่งคำขอไม่ออก — เช็คสัญญาณแล้วกดส่งรหัสอีกครั้ง';
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(TIMED_OUT)), ms)),
  ]);
}

export function AuthGate() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<Fail | null>(null);
  const [askCreate, setAskCreate] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sentAt, setSentAt] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_S);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((n) => {
        if (n <= 1 && timerRef.current) clearInterval(timerRef.current);
        return n - 1;
      });
    }, 1000);
  };

  /** ส่งรหัส — createUser คุมด้วยตัวเอง ไม่ปล่อยให้สร้างบัญชีใหม่เงียบๆ
   *
   *  ของเดิมตั้ง shouldCreateUser: true ไว้ตลอด พิมพ์อีเมลผิดตัวเดียวก็ได้บัญชีใหม่
   *  ที่ไม่มีสมุดและไม่อยู่ในกลุ่ม โดยแอปไม่ทักอะไรเลย — คนที่เจอจะนึกว่าข้อมูลหายหมด */
  const send = async (createUser: boolean) => {
    const sb = getSupabase();
    if (!sb || !email.trim()) return;
    setBusy(true); setFail(null); setAskCreate(false);
    try {
      const { error: err } = await withTimeout(sb.auth.signInWithOtp({
        email: email.trim(), options: { shouldCreateUser: createUser },
      }), SEND_TIMEOUT_MS);
      if (err) {
        const f = classify(err.message);
        if (f.kind === 'nouser') setAskCreate(true);
        else setFail(f.kind === 'network' ? { kind: 'network', text: networkText('email') } : f);
      } else {
        setStep('code'); setCode(''); setSentAt(Date.now()); startCooldown();
      }
    } catch (e) {
      // ── เลิกรอเอง ≠ ส่งไม่สำเร็จ ──
      // เราเป็นฝ่ายตัดสินใจไม่รอต่อ ไม่ได้แปลว่าเซิร์ฟเวอร์ไม่ได้ส่ง อีเมลอาจกำลังมา
      // การทิ้งผู้ใช้ไว้หน้าเดิมพร้อมข้อความว่าเน็ตพัง ทำให้กดส่งซ้ำแล้วซ้ำอีก
      // ซึ่งทุกครั้งไปยกเลิกรหัสของรอบก่อนที่กำลังเดินทางมาพอดี
      const msg = (e as Error).message;
      if (msg === TIMED_OUT) {
        setStep('code'); setCode(''); setSentAt(Date.now()); startCooldown();
        setFail({ kind: 'pending', text: 'ส่งคำขอไปแล้วแต่เซิร์ฟเวอร์ยังไม่ตอบกลับ — ถ้ารหัสมาถึงอีเมล ให้กรอกได้เลย' });
      } else {
        const f = classify(msg);
        setFail(f.kind === 'network' ? { kind: 'network', text: networkText('email') } : f);
      }
    }
    setBusy(false);
  };

  const verify = async () => {
    const sb = getSupabase();
    if (!sb || code.trim().length < OTP_MIN) return;
    setBusy(true); setFail(null);
    try {
      const { error: err } = await withTimeout(sb.auth.verifyOtp({
        email: email.trim(), token: code.trim(), type: 'email',
      }), VERIFY_TIMEOUT_MS);
      if (err) {
        // ── สำคัญ: ต้องเช็คว่าเข้าได้จริงไหมก่อนจะบอกว่าพัง ──
        // เคยเจอกับตัวเองว่าขึ้น "รหัสไม่ถูกต้อง" ทั้งที่รหัสถูกและเข้าระบบสำเร็จแล้ว
        // (คำขอช้าจนไลบรารีคืน error มาก่อน แต่เซสชันตามมาทีหลัง) การเชื่อ error
        // ตรงๆ แล้วไล่ผู้ใช้ไปขอรหัสใหม่ คือต้นเหตุของวังวนทั้งหมด
        const { data } = await sb.auth.getSession();
        if (data.session) { setBusy(false); return; }
        const f = classify(err.message);
        setFail(f.kind === 'network' ? { kind: 'network', text: networkText('code') } : f);
      }
      // สำเร็จ = onAuthStateChange ใน store จะพาเข้าแอปเอง
    } catch (e) {
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        const f = classify((e as Error).message);
        setFail(f.kind === 'network' ? { kind: 'network', text: networkText('code') } : f);
      }
    }
    setBusy(false);
  };

  return (
    <div className="full">
      <div className="full-inner">
        <div style={{ margin: '32px 0 24px' }}>
          <Logo size={104} />
          <p className="subtle" style={{ textAlign: 'center', marginTop: 10 }}>สมุดสุขภาพ</p>
        </div>

        {step === 'email' ? (
          <>
            <label className="o-label" htmlFor="auth-email">อีเมลของคุณ</label>
            <input id="auth-email" className="o-input" type="email" inputMode="email"
              autoComplete="email" placeholder="you@example.com"
              value={email} onChange={(e) => { setEmail(e.target.value); setAskCreate(false); }} />
            <p className="subtle" style={{ marginTop: 8 }}>
              ใส่อีเมลเดิมที่เคยใช้ เราจะส่งรหัสไปให้ ไม่ต้องตั้งรหัสผ่าน
            </p>

            {askCreate ? (
              <div className="o-card warn" style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <Icon name="alert" size={20} color="var(--color-accent-700)" />
                  <strong>ยังไม่มีบัญชีของอีเมลนี้</strong>
                </div>
                <p style={{ margin: 0, wordBreak: 'break-all' }}>{email.trim()}</p>
                <p className="subtle" style={{ margin: '8px 0 0' }}>
                  ถ้าเคยใช้แอปนี้อยู่แล้ว ให้กลับไปตรวจตัวสะกดก่อน — สร้างบัญชีใหม่จะได้สมุดเปล่า
                  ไม่เห็นข้อมูลเดิมของครอบครัว
                </p>
                <button type="button" className="o-btn ghost block" style={{ marginTop: 12 }}
                  disabled={busy} onClick={() => { void send(true); }}>
                  ฉันเป็นคนใหม่ สร้างบัญชีให้เลย
                </button>
              </div>
            ) : (
              <button type="button" className="o-btn primary block" style={{ marginTop: 18 }}
                disabled={busy || !email.trim()} onClick={() => { void send(false); }}>
                {busy ? 'กำลังส่ง…' : 'ส่งรหัสเข้าอีเมล'}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="subtle" style={{ marginBottom: 4 }}>ส่งรหัสไปที่</p>
            <strong style={{ wordBreak: 'break-all' }}>{email}</strong>

            <label className="o-label" htmlFor="auth-code">รหัสจากอีเมล</label>
            <input id="auth-code" className="o-input" inputMode="numeric" autoComplete="one-time-code"
              maxLength={OTP_MAX} placeholder="กรอกรหัสที่ได้รับ"
              style={{ textAlign: 'center', letterSpacing: '.25em' }}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_MAX))} />
            <p className="subtle" style={{ marginTop: 8 }}>
              อีเมลบางทีมาช้าเป็นนาที ถ้ายังไม่มา ให้รอก่อน อย่าเพิ่งกดขอใหม่
            </p>

            <button type="button" className="o-btn primary block" style={{ marginTop: 18 }}
              disabled={busy || code.length < OTP_MIN} onClick={verify}>
              {busy ? 'กำลังตรวจ…' : 'เข้าใช้สมุด'}
            </button>

            {/* ขอรหัสใหม่ = รหัสเก่าใช้ไม่ได้ทันที ต้องบอกให้ชัดก่อนกด
                ไม่ใช่ให้ผู้ใช้ค้นพบเองตอนกรอกรหัสเก่าแล้วโดนบอกว่าผิด */}
            <button type="button" className="o-btn ghost block" style={{ marginTop: 10 }}
              disabled={busy || cooldown > 0} onClick={() => { void send(false); }}>
              {cooldown > 0 ? `ขอรหัสใหม่ได้ในอีก ${cooldown} วินาที` : 'ขอรหัสใหม่ (รหัสเดิมจะใช้ไม่ได้)'}
            </button>

            <button type="button" className="o-btn ghost block" style={{ marginTop: 10 }}
              onClick={() => { setStep('email'); setCode(''); setFail(null); setAskCreate(false); }}>
              ใช้อีเมลอื่น
            </button>
          </>
        )}

        {fail && (
          <div className="o-card warn" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Icon name="alert" size={20} color="var(--color-accent-700)" />
              <span>{fail.text}</span>
            </div>
            {fail.kind === 'code' && sentAt > 0 && (
              <p className="subtle" style={{ margin: '8px 0 0' }}>
                รหัสที่ใช้ได้คืออันที่ส่งล่าสุด — ถ้าในอีเมลมีหลายฉบับ ให้ดูฉบับใหม่สุด
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
