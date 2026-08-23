'use client';

import React from 'react';
import { Icon } from '../Icon';
import { SLOT_LABEL } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { Book } from '@/lib/types';

export function MedsScreen({ book, onScan, onAddMed }: {
  book: Book; onScan: () => void; onAddMed: () => void;
}) {
  const { state } = useStore();
  const meds = state.medications.filter((m) => m.book_id === book.id);
  const dupes = meds.filter((m) => m.duplicate_flag);

  // จัดกลุ่มยาซ้ำตามตัวยาหลัก เพื่อบอกเป็นคู่ว่าอะไรซ้ำกับอะไร
  const dupePairs = Array.from(
    dupes.reduce((acc, m) => {
      const k = m.name.trim().split(/[\s\d]/)[0];
      acc.set(k, [...(acc.get(k) ?? []), m.name]);
      return acc;
    }, new Map<string, string[]>()).values(),
  );

  return (
    <div className="screen">
      <p className="kicker">Doolaekan</p>
      <h2>ยาของ{book.owner_name}</h2>
      <p className="subtle">{meds.length} รายการ</p>

      {dupePairs.length > 0 && (
        <div className="o-card warn" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Icon name="flag" size={21} color="var(--color-accent-700)" />
            <h3 style={{ margin: 0 }}>เจอยาที่อาจซ้ำกัน</h3>
          </div>
          {dupePairs.map((names) => (
            <p key={names.join()} style={{ margin: '4px 0' }}>{names.join(' + ')}</p>
          ))}
          <p className="subtle" style={{ margin: '8px 0 0' }}>
            ติดธงไว้ถามหมอนัดหน้าแล้ว — อย่าเพิ่งหยุดยาเอง
          </p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {meds.length === 0 && (
          <button type="button" className="o-empty" onClick={onScan}>
            ยังไม่มียาในสมุด — แตะเพื่อสแกนถุงยา
          </button>
        )}
        {meds.map((m) => (
          <div key={m.id} className="o-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <h3>{m.name}</h3>
              {m.tag && <span className="o-tag sage" style={{ height: 'fit-content' }}>{m.tag}</span>}
            </div>
            {m.helps && (
              <p style={{ margin: '6px 0' }}>
                <strong style={{ color: 'var(--color-accent-700)' }}>ช่วยอะไร:</strong> {m.helps}
              </p>
            )}
            <p className="subtle" style={{ margin: '2px 0 0' }}>
              {[m.how_to_take, m.prescriber].filter(Boolean).join(' · ')}
            </p>
            {m.slots.length > 0 && (
              <p className="subtle" style={{ margin: '2px 0 0' }}>
                มื้อ: {m.slots.map((s) => SLOT_LABEL[s]).join(' · ')}
              </p>
            )}
            {m.duplicate_flag && (
              <p style={{ margin: '8px 0 0', color: 'var(--color-accent-700)', fontWeight: 600 }}>
                ⚑ ติดธงยาซ้ำ
              </p>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="o-btn primary block" style={{ marginTop: 6 }} onClick={onScan}>
        <Icon name="camera" size={20} /> สแกนถุงยาใหม่
      </button>
      <button type="button" className="o-btn ghost block" style={{ marginTop: 10 }} onClick={onAddMed}>
        <Icon name="plus" size={20} /> พิมพ์เพิ่มยาเอง
      </button>
    </div>
  );
}
