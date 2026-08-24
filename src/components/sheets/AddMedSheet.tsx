'use client';

import React, { useState } from 'react';
import { ComboField } from '../ComboField';
import { Sheet } from '../Sheet';
import { MEAL_LABEL, MEAL_ORDER, SLOT_LABEL, SLOT_ORDER } from '@/lib/format';
import { hospitalOfDoctor, medFieldOptions } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { DoseSlot, MealTiming } from '@/lib/types';

export function AddMedSheet({ open, bookId, onClose }: {
  open: boolean; bookId: string; onClose: () => void;
}) {
  const { state, actions } = useStore();
  const [name, setName] = useState('');
  const [how, setHow] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [helps, setHelps] = useState('');
  const [tag, setTag] = useState('');
  const [hospital, setHospital] = useState('');
  const [slots, setSlots] = useState<DoseSlot[]>(['morning']);
  const [timing, setTiming] = useState<MealTiming>('');

  const close = () => {
    setName(''); setHow(''); setPrescriber(''); setHelps(''); setTag(''); setHospital(''); setSlots(['morning']); setTiming('');
    onClose();
  };

  const save = () => {
    if (!name.trim()) return;
    actions.addMedication(bookId, {
      name: name.trim(), how_to_take: how.trim(), prescriber: prescriber.trim(),
      helps: helps.trim(), tag: tag.trim(), hospital: hospital.trim(), slots, timing,
    });
    actions.toast('เพิ่มยาแล้ว');
    close();
  };

  return (
    <Sheet open={open} title="พิมพ์เพิ่มยาเอง" onClose={close}>
      <label className="o-label" htmlFor="md-name">ชื่อยา</label>
      <input id="md-name" className="o-input" placeholder="เช่น แอมโลดิพีน 5 มก."
        value={name} onChange={(e) => setName(e.target.value)} />

      <label className="o-label" htmlFor="md-how">วิธีกิน</label>
      <input id="md-how" className="o-input" placeholder="เช่น เช้า 1 เม็ด หลังอาหาร"
        value={how} onChange={(e) => setHow(e.target.value)} />

      <ComboField id="md-doc" label="ชื่อหมอ" value={prescriber}
        options={medFieldOptions(state, bookId).prescribers} placeholder="เลือกหมอ…"
        onChange={(name) => {
          setPrescriber(name);
          const h = hospitalOfDoctor(state, bookId, name);
          if (h) setHospital(h);
        }} />

      <label className="o-label" htmlFor="md-helps">ช่วยอะไร (ภาษาบ้านๆ)</label>
      <input id="md-helps" className="o-input" placeholder="เช่น ลดความดัน ขยายหลอดเลือด"
        value={helps} onChange={(e) => setHelps(e.target.value)} />

      <ComboField id="md-tag" label="แผนก" value={tag}
        options={medFieldOptions(state, bookId).tags} placeholder="เลือกแผนก…" onChange={setTag} />

      <ComboField id="md-hosp" label="โรงพยาบาล / คลินิก" value={hospital}
        options={medFieldOptions(state, bookId).hospitals} placeholder="เลือกโรงพยาบาล…"
        onChange={setHospital} />

      <label className="o-label">ก่อน / หลังอาหาร</label>
      <div className="o-chips">
        {MEAL_ORDER.filter((t) => t !== '').map((t) => (
          <button key={t} type="button" className="o-chip" aria-pressed={timing === t}
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

      <button type="button" className="o-btn primary block" style={{ marginTop: 18 }}
        disabled={!name.trim()} onClick={save}>
        บันทึกยา
      </button>
    </Sheet>
  );
}
