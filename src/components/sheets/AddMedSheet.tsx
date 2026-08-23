'use client';

import React, { useState } from 'react';
import { Sheet } from '../Sheet';
import { SLOT_LABEL, SLOT_ORDER } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { DoseSlot } from '@/lib/types';

export function AddMedSheet({ open, bookId, onClose }: {
  open: boolean; bookId: string; onClose: () => void;
}) {
  const { actions } = useStore();
  const [name, setName] = useState('');
  const [how, setHow] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [helps, setHelps] = useState('');
  const [tag, setTag] = useState('');
  const [slots, setSlots] = useState<DoseSlot[]>(['morning']);

  const close = () => {
    setName(''); setHow(''); setPrescriber(''); setHelps(''); setTag(''); setSlots(['morning']);
    onClose();
  };

  const save = () => {
    if (!name.trim()) return;
    actions.addMedication(bookId, {
      name: name.trim(), how_to_take: how.trim(), prescriber: prescriber.trim(),
      helps: helps.trim(), tag: tag.trim(), slots,
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

      <label className="o-label" htmlFor="md-doc">หมอที่สั่ง</label>
      <input id="md-doc" className="o-input" placeholder="เช่น หมอหัวใจ"
        value={prescriber} onChange={(e) => setPrescriber(e.target.value)} />

      <label className="o-label" htmlFor="md-helps">ช่วยอะไร (ภาษาบ้านๆ)</label>
      <input id="md-helps" className="o-input" placeholder="เช่น ลดความดัน ขยายหลอดเลือด"
        value={helps} onChange={(e) => setHelps(e.target.value)} />

      <label className="o-label" htmlFor="md-tag">แผนก</label>
      <input id="md-tag" className="o-input" placeholder="เช่น หัวใจ / ตา / กระดูก"
        value={tag} onChange={(e) => setTag(e.target.value)} />

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
