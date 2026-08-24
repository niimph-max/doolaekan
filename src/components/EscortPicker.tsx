'use client';

import React, { useState } from 'react';
import { Icon } from './Icon';
import { escortOptions } from '@/lib/selectors';
import { useStore } from '@/lib/store';

/** เลือกคนพาไปหาหมอ — รายชื่อมาจากสมาชิกกลุ่ม เพิ่มคนนอกกลุ่มเองได้
 *  ชื่อที่พิมพ์เพิ่มจะถูกจำไว้ในนัดนั้น ครั้งหน้าจึงโผล่มาให้เลือกเลย */
export function EscortPicker({ value, onChange }: {
  value: string;
  onChange: (name: string) => void;
}) {
  const { state } = useStore();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const options = escortOptions(state);
  // ชื่อที่เลือกอยู่แต่ยังไม่อยู่ในรายการ (เพิ่งพิมพ์เพิ่ม) ต้องแสดงด้วย
  const all = value && !options.includes(value)
    ? [...options.filter((n) => n !== 'ไปเอง'), value, 'ไปเอง']
    : options;

  const confirmAdd = () => {
    const name = draft.trim();
    if (!name) return;
    onChange(name);
    setDraft('');
    setAdding(false);
  };

  return (
    <>
      <div className="o-chips">
        {all.map((n) => (
          <button key={n} type="button" className="o-chip" aria-pressed={value === n}
            onClick={() => onChange(value === n ? '' : n)}>
            {n}
          </button>
        ))}
        {!adding && (
          <button type="button" className="o-chip" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> เพิ่มชื่อ
          </button>
        )}
      </div>

      {adding && (
        <div className="o-row" style={{ marginTop: 10 }}>
          <input
            className="o-input"
            placeholder="ชื่อคนพาไป เช่น หลานเอ"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); }}
          />
          <button type="button" className="o-btn secondary" style={{ flex: '0 0 auto' }}
            disabled={!draft.trim()} onClick={confirmAdd}>
            ใช้ชื่อนี้
          </button>
        </div>
      )}
    </>
  );
}
