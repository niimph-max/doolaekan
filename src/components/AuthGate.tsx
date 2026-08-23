'use client';

import React, { useState } from 'react';
import { Icon } from './Icon';
import { getSupabase } from '@/lib/supabase';

/** เข้าสู่ระบบด้วยรหัส 6 หลักทางอีเมล — ไม่ต้องจำรหัสผ่าน เหมาะกับเครื่องกลางที่บ้าน */
/** ข้อความ error จาก Supabase เป็นอังกฤษ — แปลเคสที่เจอบ่อยให้คนที่บ้านอ่านออก */
function friendly(message: string): string {
  if (/failed to fetch|network/i.test(message)) return 'ต่ออินเทอร์เน็ตไม่ได้ ลองใหม่อีกครั้ง';
  if (/invalid|expired/i.test(message) && /token|otp|code/i.test(message)) {
    return 'รหัสไม่ถูกต้องหรือหมดอายุแล้ว กดขอรหัสใหม่ได้';
  }
  if (/rate limit|too many/i.test(message)) return 'ขอรหัสถี่เกินไป รออีกสักครู่แล้วลองใหม่';
  if (/signups not allowed|not authorized/i.test(message)) return 'อีเมลนี้ยังไม่ได้รับอนุญาตให้เข้าใช้';
  return message;
}

export function AuthGate() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sendCode = async () => {
    const sb = getSupabase();
    if (!sb || !email.trim()) return;
    setBusy(true);
    setError('');
    const { error: err } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(friendly(err.message));
    else setStep('code');
  };

  const verify = async () => {
    const sb = getSupabase();
    if (!sb || code.trim().length < 6) return;
    setBusy(true);
    setError('');
    const { error: err } = await sb.auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: 'email',
    });
    setBusy(false);
    // สำเร็จ = onAuthStateChange ใน store จะพาเข้าแอปเอง
    if (err) setError(friendly(err.message));
  };

  return (
    <div className="full">
      <div className="full-inner">
        <div style={{ textAlign: 'center', margin: '32px 0 24px' }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%', background: 'var(--color-accent-200)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="heart" size={40} color="var(--color-accent-600)" />
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 36, margin: '16px 0 6px' }}>Doolaekan</h1>
          <p className="subtle">สมุดสุขภาพของครอบครัว</p>
        </div>

        {step === 'email' ? (
          <>
            <label className="o-label" htmlFor="auth-email">อีเมลของคุณ</label>
            <input id="auth-email" className="o-input" type="email" inputMode="email"
              autoComplete="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="subtle" style={{ marginTop: 8 }}>
              เราจะส่งรหัส 6 หลักไปที่อีเมลนี้ ไม่ต้องตั้งรหัสผ่าน
            </p>
            <button type="button" className="o-btn primary block" style={{ marginTop: 18 }}
              disabled={busy || !email.trim()} onClick={sendCode}>
              {busy ? 'กำลังส่ง…' : 'ส่งรหัสเข้าอีเมล'}
            </button>
          </>
        ) : (
          <>
            <p className="subtle" style={{ marginBottom: 4 }}>ส่งรหัสไปที่</p>
            <strong>{email}</strong>
            <label className="o-label" htmlFor="auth-code">รหัส 6 หลัก</label>
            <input id="auth-code" className="o-input" inputMode="numeric" autoComplete="one-time-code"
              maxLength={6} placeholder="123456" style={{ textAlign: 'center', letterSpacing: '.3em' }}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <button type="button" className="o-btn primary block" style={{ marginTop: 18 }}
              disabled={busy || code.length < 6} onClick={verify}>
              {busy ? 'กำลังตรวจ…' : 'เข้าใช้สมุด'}
            </button>
            <button type="button" className="o-btn ghost block" style={{ marginTop: 10 }}
              onClick={() => { setStep('email'); setCode(''); setError(''); }}>
              ใช้อีเมลอื่น
            </button>
          </>
        )}

        {error && (
          <div className="o-card warn" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Icon name="alert" size={20} color="var(--color-accent-700)" />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
