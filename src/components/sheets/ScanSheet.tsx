'use client';

import React, { useRef, useState } from 'react';
import { ComboField } from '../ComboField';
import { Sheet } from '../Sheet';
import { Icon } from '../Icon';
import { MEAL_LABEL, MEAL_ORDER, SLOT_LABEL, SLOT_ORDER, inferMealTiming } from '@/lib/format';
import { hospitalOfDoctor, medFieldOptions } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { DoseSlot, MealTiming } from '@/lib/types';

/** สแกนถุงยา: ถ่ายรูป → ตรวจ/แก้ข้อความ → บันทึก + เช็คยาซ้ำอัตโนมัติ
 *  หมายเหตุ: ยังไม่ได้ต่อ OCR จริง ผู้ใช้ต้องยืนยันข้อความเองก่อนบันทึก */
export function ScanSheet({ open, bookId, onClose }: {
  open: boolean; bookId: string; onClose: () => void;
}) {
  const { state, actions } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState('');
  const [name, setName] = useState('');
  const [how, setHow] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [hospital, setHospital] = useState('');
  const [helps, setHelps] = useState('');
  const [slots, setSlots] = useState<DoseSlot[]>(['morning']);
  const [timing, setTiming] = useState<MealTiming>('');

  const close = () => {
    setPhoto(''); setName(''); setHow(''); setPrescriber(''); setHelps(''); setHospital(''); setSlots(['morning']); setTiming('');
    onClose();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(f);
  };

  // เตือนล่วงหน้าถ้าตัวยาหลักซ้ำกับที่มีอยู่แล้วในสมุดเล่มนี้
  const stem = name.trim().split(/[\s\d]/)[0];
  const clash = stem
    ? state.medications.filter((m) => m.book_id === bookId && m.name.startsWith(stem))
    : [];

  const save = () => {
    if (!name.trim()) return;
    const created = actions.addMedication(bookId, {
      name: name.trim(), how_to_take: how.trim(), prescriber: prescriber.trim(),
      helps: helps.trim(), tag: prescriber.replace('หมอ', '').trim(),
      hospital: hospital.trim(), slots,
      timing: timing || inferMealTiming(how),
    });
    if (photo) {
      actions.addRecord(bookId, {
        kind: 'doc', title: `สแกนถุงยา: ${created.name}`, body: how.trim(),
        file: photo, important: true,
      });
    }
    actions.toast(clash.length ? 'บันทึกแล้ว — ติดธงยาซ้ำไว้ถามหมอ' : 'บันทึกยาใหม่แล้ว');
    close();
  };

  return (
    <Sheet open={open} title="สแกนถุงยาใหม่" onClose={close}>
      {!photo ? (
        <>
          <button type="button" onClick={() => fileRef.current?.click()}
            style={{
              width: '100%', aspectRatio: '4 / 3', borderRadius: 24, cursor: 'pointer',
              border: '2px dashed var(--color-accent-500)', background: 'var(--color-neutral-200)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 10, color: 'var(--color-accent-700)',
            }}>
            <Icon name="camera" size={38} />
            <strong>ถ่ายรูปถุงยา</strong>
            <span className="subtle">วางถุงยาให้เห็นฉลากชัดๆ</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={onFile} style={{ display: 'none' }} />

          {/* รูปถุงยาไม่ได้มาจากกล้องเสมอไป — ผู้ช่วยหรือลูกหลานถ่ายส่งมาทางแชท
              แล้วอีกคนมานั่งกรอกให้ก็เป็นเรื่องปกติ ถ้าบังคับให้ถ่ายสดอย่างเดียว
              ต้องเอามือถือไปจ่อถุงยาจริงเท่านั้น ซึ่งบางทีของอยู่คนละบ้านกัน */}
          <button type="button" className="o-btn ghost block" style={{ marginTop: 12 }}
            onClick={() => pickRef.current?.click()}>
            <Icon name="camera" size={19} /> เลือกรูปที่ถ่ายไว้แล้ว
          </button>
          <input ref={pickRef} type="file" accept="image/*"
            onChange={onFile} style={{ display: 'none' }} />
        </>
      ) : (
        <>
          {}
          <img src={photo} alt="รูปถุงยาที่ถ่ายไว้" className="scan-img" style={{ marginTop: 0 }} />
          <p className="subtle" style={{ margin: '10px 0 0' }}>
            ตรวจข้อความให้ตรงกับฉลากก่อนบันทึก (ยังไม่ได้ต่อระบบอ่านฉลากอัตโนมัติ)
          </p>

          <label className="o-label" htmlFor="sc-name">ชื่อยา</label>
          <input id="sc-name" className="o-input" value={name} onChange={(e) => setName(e.target.value)} />

          <label className="o-label" htmlFor="sc-how">วิธีกิน</label>
          <input id="sc-how" className="o-input" value={how} onChange={(e) => setHow(e.target.value)} />

          <ComboField id="sc-doc" label="ชื่อหมอ" value={prescriber}
            options={medFieldOptions(state, bookId).prescribers} placeholder="เลือกหมอ…"
            onChange={(name) => {
              setPrescriber(name);
              const h = hospitalOfDoctor(state, bookId, name);
              if (h) setHospital(h);
            }} />

          <ComboField id="sc-hosp" label="โรงพยาบาล / คลินิก" value={hospital}
            options={medFieldOptions(state, bookId).hospitals} placeholder="เลือกโรงพยาบาล…"
            onChange={setHospital} />

          <label className="o-label" htmlFor="sc-helps">ช่วยอะไร</label>
          <input id="sc-helps" className="o-input" placeholder="อธิบายภาษาบ้านๆ ให้คนที่บ้านเข้าใจ"
            value={helps} onChange={(e) => setHelps(e.target.value)} />

          <label className="o-label">ก่อน / หลังอาหาร</label>
          <div className="o-chips">
            {MEAL_ORDER.filter((t) => t !== '').map((t) => (
              <button key={t} type="button" className="o-chip"
                aria-pressed={(timing || inferMealTiming(how)) === t}
                onClick={() => setTiming(timing === t ? '' : t)}>
                {MEAL_LABEL[t]}
              </button>
            ))}
          </div>

          <label className="o-label">มื้อที่ต้องกิน</label>
          <div className="o-chips">
            {SLOT_ORDER.map((s) => (
              <button key={s} type="button" className="o-chip" aria-pressed={slots.includes(s)}
                onClick={() => setSlots((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}>
                {SLOT_LABEL[s]}
              </button>
            ))}
          </div>

          {clash.length > 0 && (
            <div className="o-card warn" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Icon name="flag" size={20} color="var(--color-accent-700)" />
                <strong>อาจซ้ำกับยาที่มีอยู่</strong>
              </div>
              <p style={{ margin: 0 }}>
                {clash.map((m) => m.name + (m.paused ? ' (พักไว้)' : '')).join(' · ')}
                {clash.every((m) => m.paused)
                  ? ' — ตัวเดิมพักไว้อยู่แล้ว บันทึกตัวใหม่ได้เลย'
                  : ' — บันทึกแล้วจะติดธงไว้ถามหมอนัดหน้า'}
              </p>
              {clash.some((m) => !m.paused) && (
                <p className="subtle" style={{ margin: '6px 0 0' }}>
                  ถ้าเป็นตัวเดียวกันแต่เปลี่ยนโดส บันทึกตัวใหม่แล้วไปกด &quot;พักไว้ก่อน&quot; ที่ตัวเดิม
                </p>
              )}
            </div>
          )}

          <div className="o-row" style={{ marginTop: 16 }}>
            <button type="button" className="o-btn ghost" onClick={() => setPhoto('')}>ถ่ายใหม่</button>
            <button type="button" className="o-btn primary" disabled={!name.trim()} onClick={save}>
              บันทึกยานี้
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
