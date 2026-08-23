'use client';

import React, { useState } from 'react';
import { Chips } from './Chips';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { CONDITION_CHIPS } from '@/lib/seed';
import { useStore, type OnboardingInput } from '@/lib/store';
import type { Doctor, ShareLevel } from '@/lib/types';

type DoctorDraft = Omit<Doctor, 'id' | 'book_id'>;

const SHARE_OPTIONS: { value: ShareLevel; label: string; desc: string }[] = [
  { value: 'full', label: 'ทั้งหมด', desc: 'ทุกคนในกลุ่มเห็นและช่วยบันทึกได้' },
  { value: 'appointments', label: 'เฉพาะวันนัด', desc: 'เห็นแค่ตารางนัด ไม่เห็นยา/อาการ' },
  { value: 'none', label: 'ยังไม่แชร์', desc: 'เก็บเป็นส่วนตัวก่อน เปลี่ยนทีหลังได้' },
];

export function Onboarding() {
  const { actions } = useStore();
  const [step, setStep] = useState(1);

  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');

  const [conditions, setConditions] = useState<string[]>([]);
  const [condOther, setCondOther] = useState('');
  const [allergy, setAllergy] = useState('');

  const [doctors, setDoctors] = useState<DoctorDraft[]>([]);
  const [dr, setDr] = useState<DoctorDraft>({ name: '', hospital: '', hn: '', clinic_hours: '' });

  const [groupChoice, setGroupChoice] = useState<OnboardingInput['groupChoice'] | null>(null);
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [shareLevel, setShareLevel] = useState<ShareLevel>('full');

  const finish = (choice: OnboardingInput['groupChoice']) =>
    actions.finishOnboarding({
      displayName, fullName, address,
      conditions: condOther.trim() ? [...conditions, condOther.trim()] : conditions,
      allergy, doctors, groupChoice: choice, groupName, inviteCode, shareLevel,
    });

  const addDoctor = () => {
    if (!dr.name.trim()) return;
    setDoctors((list) => [...list, dr]);
    setDr({ name: '', hospital: '', hn: '', clinic_hours: '' });
  };

  return (
    <div className="full">
      <div className="full-inner">
        {step === 1 && (
          <>
            <div style={{ margin: '24px 0 20px' }}>
              <Logo size={100} />
              <p className="subtle" style={{ textAlign: 'center', marginTop: 10 }}>
                สมุดสุขภาพ — ของใครของมัน แชร์เมื่อยินยอม
              </p>
            </div>

            <label className="o-label" htmlFor="ob-name">ชื่อเรียกในสมุด</label>
            <input id="ob-name" className="o-input" placeholder="เช่น เตี่ย / แม่ / พี่หนึ่ง"
              value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

            <label className="o-label" htmlFor="ob-full">ชื่อ–นามสกุลจริง</label>
            <input id="ob-full" className="o-input" placeholder="สำหรับบัตรสรุปฉุกเฉิน"
              value={fullName} onChange={(e) => setFullName(e.target.value)} />

            <label className="o-label" htmlFor="ob-addr">ที่อยู่</label>
            <input id="ob-addr" className="o-input" placeholder="ใช้ตอนยื่นบัตรให้หมอ"
              value={address} onChange={(e) => setAddress(e.target.value)} />

            <button type="button" className="o-btn primary block" style={{ marginTop: 22 }}
              disabled={!displayName.trim()} onClick={() => setStep(2)}>
              เริ่มใช้สมุดของฉัน
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="kicker">ขั้น 1/3</p>
            <h2 style={{ fontSize: 26, margin: '4px 0 14px' }}>โรคประจำตัว &amp; แพ้ยา</h2>
            <p className="subtle" style={{ marginBottom: 14 }}>เลือกได้หลายอย่าง หรือกดข้ามไปก่อนก็ได้</p>

            <Chips
              options={CONDITION_CHIPS}
              selected={conditions}
              onToggle={(v) => setConditions((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]))}
            />
            <label className="o-label" htmlFor="ob-cond">โรคอื่นๆ</label>
            <input id="ob-cond" className="o-input" placeholder="พิมพ์เพิ่มเองได้"
              value={condOther} onChange={(e) => setCondOther(e.target.value)} />

            <label className="o-label" htmlFor="ob-allergy">แพ้ยา / แพ้อะไรบ้าง</label>
            <input id="ob-allergy" className="o-input" placeholder="เช่น เพนิซิลลิน (ผื่นทั้งตัว)"
              value={allergy} onChange={(e) => setAllergy(e.target.value)} />

            <div className="o-row" style={{ marginTop: 22 }}>
              <button type="button" className="o-btn ghost" onClick={() => setStep(3)}>ข้ามไปก่อน</button>
              <button type="button" className="o-btn primary" onClick={() => setStep(3)}>ต่อไป</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="kicker">ขั้น 2/3</p>
            <h2 style={{ fontSize: 26, margin: '4px 0 14px' }}>หมอที่รักษา</h2>
            <p className="subtle" style={{ marginBottom: 14 }}>
              หมอคนเดียวออกตรวจหลายที่ ให้เพิ่มทีละแห่ง (เลข HN กับเวลาออกตรวจต่างกัน)
            </p>

            <label className="o-label" htmlFor="dr-name">หมอ / แผนก</label>
            <input id="dr-name" className="o-input" placeholder="เช่น หมอหัวใจ"
              value={dr.name} onChange={(e) => setDr({ ...dr, name: e.target.value })} />
            <label className="o-label" htmlFor="dr-hosp">โรงพยาบาล / คลินิก</label>
            <input id="dr-hosp" className="o-input" value={dr.hospital}
              onChange={(e) => setDr({ ...dr, hospital: e.target.value })} />
            <label className="o-label" htmlFor="dr-hn">เลข HN</label>
            <input id="dr-hn" className="o-input" value={dr.hn}
              onChange={(e) => setDr({ ...dr, hn: e.target.value })} />
            <label className="o-label" htmlFor="dr-hours">เวลาออกตรวจ</label>
            <input id="dr-hours" className="o-input" placeholder="เช่น พุธ 09:00–12:00"
              value={dr.clinic_hours} onChange={(e) => setDr({ ...dr, clinic_hours: e.target.value })} />

            <button type="button" className="o-btn secondary block" style={{ marginTop: 14 }}
              disabled={!dr.name.trim()} onClick={addDoctor}>
              <Icon name="plus" size={19} /> เพิ่มหมอคนนี้
            </button>

            {doctors.length > 0 && (
              <div className="o-card" style={{ marginTop: 16 }}>
                {doctors.map((d, i) => (
                  <div key={`${d.name}-${i}`} style={{ padding: '6px 0' }}>
                    <strong>{d.name}</strong>
                    <div className="subtle">
                      {[d.hospital, d.hn && `HN ${d.hn}`, d.clinic_hours].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="o-row" style={{ marginTop: 22 }}>
              <button type="button" className="o-btn ghost" onClick={() => setStep(4)}>ข้ามไปก่อน</button>
              <button type="button" className="o-btn primary" onClick={() => setStep(4)}>ต่อไป</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <p className="kicker">ขั้น 3/3</p>
            <h2 style={{ fontSize: 26, margin: '4px 0 14px' }}>ครอบครัว</h2>
            <p className="subtle" style={{ marginBottom: 14 }}>
              สมุดของคุณเป็นส่วนตัวเสมอ จะเห็นกันก็ต่อเมื่อคุณกดแชร์เข้ากลุ่มเท่านั้น
            </p>

            <button type="button" className="o-btn ghost block" style={{ marginBottom: 10 }}
              onClick={() => finish('solo')}>
              ใช้คนเดียวก่อน
            </button>
            <button type="button" className="o-btn primary block" style={{ marginBottom: 10 }}
              onClick={() => { setGroupChoice('create'); setStep(5); }}>
              สร้างกลุ่มครอบครัว
            </button>
            <button type="button" className="o-btn secondary block"
              onClick={() => { setGroupChoice('join'); setStep(5); }}>
              <Icon name="qr" size={19} /> สแกน QR / ใส่รหัสเข้ากลุ่ม
            </button>
          </>
        )}

        {step === 5 && (
          <>
            <h2 style={{ fontSize: 26, margin: '4px 0 12px' }}>เลือกระดับแชร์ก่อนเข้ากลุ่ม</h2>

            {groupChoice === 'create' ? (
              <>
                <label className="o-label" htmlFor="grp-name">ชื่อกลุ่ม</label>
                <input id="grp-name" className="o-input" placeholder="เช่น บ้านเตี่ย–แม่"
                  value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              </>
            ) : (
              <>
                <div className="o-card" style={{ textAlign: 'center' }}>
                  <div className="ph" style={{ width: 148, height: 148, borderRadius: 18, margin: '0 auto 10px' }} />
                  <p className="subtle">เล็งกล้องที่ QR ของกลุ่ม หรือพิมพ์รหัสด้านล่าง</p>
                </div>
                <label className="o-label" htmlFor="grp-code">รหัสเข้ากลุ่ม</label>
                <input id="grp-code" className="o-input" placeholder="เช่น DLK-4821"
                  value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
              </>
            )}

            <div style={{ marginTop: 18 }}>
              {SHARE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setShareLevel(o.value)}
                  className="o-card"
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                    border: shareLevel === o.value ? '2px solid var(--color-accent)' : '1.5px solid transparent',
                  }}
                >
                  <strong>{o.label}</strong>
                  <div className="subtle">{o.desc}</div>
                </button>
              ))}
            </div>

            <button type="button" className="o-btn primary block" style={{ marginTop: 8 }}
              onClick={() => finish(groupChoice ?? 'solo')}>
              เข้าใช้สมุดของฉัน
            </button>
          </>
        )}

        {step > 1 && step < 5 && (
          <button type="button" className="o-btn ghost block" style={{ marginTop: 12 }}
            onClick={() => setStep(step - 1)}>
            ย้อนกลับ
          </button>
        )}
      </div>
    </div>
  );
}
