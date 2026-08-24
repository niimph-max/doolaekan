'use client';

import React, { useState } from 'react';
import { Sheet } from '../Sheet';
import { useStore } from '@/lib/store';
import type { Book, Medication } from '@/lib/types';

type Field = 'prescriber' | 'tag' | 'hospital';

const SECTIONS: { field: Field; title: string }[] = [
  { field: 'prescriber', title: 'ชื่อหมอ' },
  { field: 'tag', title: 'แผนก' },
  { field: 'hospital', title: 'โรงพยาบาล / คลินิก' },
];

/** จัดระเบียบชื่อที่โผล่ใน dropdown
 *  ชื่อในรายการมาจากค่าที่ยาใช้อยู่จริง เพราะฉะนั้นการล้างรายการ = แก้ค่าในยา
 *  ทำทีละตัวในการ์ดยาก็ได้ แต่ถ้ามีชื่อสะกดเพี้ยนหลายตัวจะเสียเวลามาก */
export function TidyNamesSheet({ open, book, onClose }: {
  open: boolean; book: Book; onClose: () => void;
}) {
  const { state, actions } = useStore();
  const [editing, setEditing] = useState<{ field: Field; value: string } | null>(null);

  const meds = state.medications.filter((m) => m.book_id === book.id);
  const doctors = state.doctors.filter((d) => d.book_id === book.id);

  const valuesOf = (field: Field) => {
    const counts = new Map<string, number>();
    for (const m of meds) {
      const v = m[field].trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    // ชื่อหมอกับโรงพยาบาลที่บันทึกไว้ในโปรไฟล์ก็โผล่ใน dropdown ด้วย แม้ยังไม่มียาใช้
    if (field === 'prescriber') for (const d of doctors) if (d.name) counts.set(d.name, counts.get(d.name) ?? 0);
    if (field === 'hospital') for (const d of doctors) if (d.hospital) counts.set(d.hospital, counts.get(d.hospital) ?? 0);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };

  const apply = (field: Field, from: string, to: string) => {
    const n = actions.renameMedField(book.id, field, from, to);
    setEditing(null);
    if (!n) {
      actions.toast('ชื่อนี้ไม่มียาใช้อยู่ — ลบได้ที่ โปรไฟล์ & หมอ');
      return;
    }
    actions.toast(to ? `เปลี่ยน ${n} รายการเป็น "${to}"` : `ล้างค่าออกจาก ${n} รายการ`);
  };

  return (
    <Sheet open={open} title="จัดระเบียบชื่อ" onClose={() => { setEditing(null); onClose(); }}>
      <p className="subtle" style={{ marginBottom: 4 }}>
        ตัวเลขคือจำนวนยาที่ใช้ชื่อนั้นอยู่ · ชื่อที่ไม่มียาใช้จะไม่โผล่ใน dropdown อีก
      </p>

      {SECTIONS.map(({ field, title }) => {
        const values = valuesOf(field);
        const others = values.map(([v]) => v);
        return (
          <div key={field} style={{ marginTop: 18 }}>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>{title}</h3>
            {values.length === 0 && <p className="subtle">ยังไม่มีชื่อในหมวดนี้</p>}

            {values.map(([value, count]) => {
              const isEditing = editing?.field === field && editing.value === value;
              const fromProfile = count === 0;
              return (
                <div key={value} className="o-card" style={{ padding: 14, marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{value}</strong>
                      <span className="subtle" style={{ display: 'block' }}>
                        {fromProfile ? 'ไม่มียาใช้ · มาจากรายชื่อหมอในโปรไฟล์' : `${count} รายการ`}
                      </span>
                    </span>
                    {!fromProfile && (
                      <button type="button" className="o-btn ghost"
                        style={{ padding: '6px 14px', minHeight: 34, flex: '0 0 auto' }}
                        onClick={() => setEditing(isEditing ? null : { field, value })}>
                        {isEditing ? 'ปิด' : 'จัดการ'}
                      </button>
                    )}
                  </div>

                  {isEditing && (
                    <div style={{ marginTop: 12 }}>
                      <p className="o-label" style={{ marginTop: 0 }}>รวมเข้ากับชื่อนี้</p>
                      <div className="o-chips">
                        {others.filter((o) => o !== value).map((o) => (
                          <button key={o} type="button" className="o-chip"
                            onClick={() => apply(field, value, o)}>
                            {o}
                          </button>
                        ))}
                      </div>
                      <button type="button" className="o-btn ghost block" style={{ marginTop: 12 }}
                        onClick={() => apply(field, value, '')}>
                        ล้างค่านี้ออกจากยาทั้ง {count} รายการ
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <button type="button" className="o-btn primary block" style={{ marginTop: 20 }}
        onClick={() => { setEditing(null); onClose(); }}>
        เสร็จแล้ว
      </button>
    </Sheet>
  );
}
