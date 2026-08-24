'use client';

import React, { useState } from 'react';
import { Sheet } from '../Sheet';
import { Icon } from '../Icon';
import { useStore } from '@/lib/store';
import type { Book, Doctor } from '@/lib/types';

type Field = 'prescriber' | 'tag' | 'hospital';

/** ชื่อใน dropdown มาจากสองที่: ค่าที่ยาใช้อยู่ กับรายชื่อหมอในโปรไฟล์
 *  ช่องไหนของรายชื่อหมอที่ตรงกับหมวดนี้ (แผนกไม่มีในรายชื่อหมอ จึงเป็น null) */
const DOCTOR_FIELD: Record<Field, 'name' | 'hospital' | null> = {
  prescriber: 'name',
  tag: null,
  hospital: 'hospital',
};

const SECTIONS: { field: Field; title: string; hint: string }[] = [
  { field: 'prescriber', title: 'ชื่อหมอ', hint: 'ชื่อเดียวกันสะกดต่างกันนิดเดียว จะกลายเป็นหมอคนละคนทันที' },
  { field: 'tag', title: 'แผนก', hint: '' },
  { field: 'hospital', title: 'โรงพยาบาล / คลินิก', hint: '' },
];

/** ชื่อที่ต่างกันแค่ช่องว่างคือชื่อเดียวกัน — "รพ.กรุงเทพจันท์" กับ "รพ.กรุงเทพจันท์ "
 *  ควรเป็นบรรทัดเดียวในรายการ ไม่ใช่สองบรรทัดที่หน้าตาเหมือนกันเป๊ะจนงง */
const norm = (v: string) => v.trim().replace(/\s+/g, ' ');

interface Entry {
  name: string;
  medCount: number;
  doctors: Doctor[];
  variants: string[];   // รูปแบบการสะกดดิบๆ ที่เจอ ถ้ามีมากกว่าหนึ่งคือมีช่องว่างเกินปนอยู่
}

/** จัดระเบียบชื่อที่โผล่ใน dropdown
 *  ทุกชื่อในรายการต้องจัดการได้หมด ไม่ใช่มีบางบรรทัดที่แตะอะไรไม่ได้เลย */
export function TidyNamesSheet({ open, book, onClose }: {
  open: boolean; book: Book; onClose: () => void;
}) {
  const { state, actions } = useStore();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const [confirming, setConfirming] = useState(false);

  const meds = state.medications.filter((m) => m.book_id === book.id);
  const doctors = state.doctors.filter((d) => d.book_id === book.id);

  const entriesOf = (field: Field): Entry[] => {
    const map = new Map<string, Entry>();
    const touch = (raw: string) => {
      const name = norm(raw);
      if (!name) return null;
      let e = map.get(name);
      if (!e) { e = { name, medCount: 0, doctors: [], variants: [] }; map.set(name, e); }
      if (!e.variants.includes(raw)) e.variants.push(raw);
      return e;
    };
    for (const m of meds) {
      const e = touch(m[field]);
      if (e) e.medCount += 1;
    }
    const df = DOCTOR_FIELD[field];
    if (df) {
      for (const d of doctors) touch(d[df])?.doctors.push(d);
    }
    return Array.from(map.values()).sort(
      (a, b) => (b.medCount + b.doctors.length) - (a.medCount + a.doctors.length)
        || a.name.localeCompare(b.name),
    );
  };

  const close = () => { setOpenKey(null); setConfirming(false); };

  /** เปลี่ยนชื่อทั้งในยาและในรายชื่อหมอพร้อมกัน — ถ้าแก้ที่เดียวชื่อเก่าจะค้างใน dropdown */
  const applyRename = (field: Field, from: string, to: string) => {
    const n = actions.renameMedField(book.id, field, from, to);
    const df = DOCTOR_FIELD[field];
    const dn = df ? actions.renameDoctorField(book.id, df, from, to) : 0;
    close();
    if (!n && !dn) { actions.toast('ไม่มีอะไรใช้ชื่อนี้อยู่แล้ว'); return; }
    const parts = [n && `ยา ${n} รายการ`, dn && `รายชื่อหมอ ${dn} รายการ`].filter(Boolean).join(' และ ');
    actions.toast(to ? `เปลี่ยน ${parts} เป็น "${to}"` : `เอาชื่อออกจาก ${parts} แล้ว`);
  };

  const removeEntry = (field: Field, e: Entry) => {
    // ชื่อที่มาจากรายชื่อหมอล้วนๆ (ไม่มียาใช้) = การ์ดหมอที่สร้างไว้แล้วไม่ได้ใช้
    // เอาชื่อออกเฉยๆ จะเหลือการ์ดเปล่าค้างอยู่ ลบทั้งการ์ดตรงกว่า
    if (e.medCount === 0 && e.doctors.length > 0 && field === 'prescriber') {
      for (const d of e.doctors) actions.removeDoctor(d.id);
      close();
      actions.toast(`ลบรายชื่อหมอ ${e.doctors.length} รายการแล้ว`);
      return;
    }
    applyRename(field, e.name, '');
  };

  return (
    <Sheet open={open} title="จัดระเบียบชื่อ" onClose={() => { close(); onClose(); }}>
      <p className="subtle" style={{ marginBottom: 4 }}>
        ชื่อพวกนี้คือตัวเลือกที่ขึ้นใน dropdown ตอนกรอกยาและนัด
        แก้ที่นี่ที่เดียว เปลี่ยนให้ทุกที่ที่ใช้ชื่อนั้นอยู่
      </p>

      {SECTIONS.map(({ field, title, hint }) => {
        const entries = entriesOf(field);
        return (
          <div key={field} style={{ marginTop: 18 }}>
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>{title}</h3>
            {hint && <p className="subtle" style={{ margin: '0 0 8px' }}>{hint}</p>}
            {entries.length === 0 && <p className="subtle">ยังไม่มีชื่อในหมวดนี้</p>}

            {entries.map((e) => {
              const key = `${field}:${e.name}`;
              const isOpen = openKey === key;
              const used = [
                e.medCount > 0 && `ยา ${e.medCount} รายการ`,
                e.doctors.length > 0 && `รายชื่อหมอ ${e.doctors.length} รายการ`,
              ].filter(Boolean).join(' · ') || 'ยังไม่มีอะไรใช้ชื่อนี้';

              return (
                <div key={key} className="o-card" style={{ padding: 14, marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{e.name}</strong>
                      <span className="subtle" style={{ display: 'block' }}>{used}</span>
                      {e.variants.length > 1 && (
                        <span className="subtle" style={{ display: 'block', color: 'var(--color-accent-700)' }}>
                          สะกดไม่ตรงกัน {e.variants.length} แบบ (ช่องว่างเกิน)
                        </span>
                      )}
                    </span>
                    <button type="button" className="o-btn ghost"
                      style={{ padding: '6px 14px', minHeight: 34, flex: '0 0 auto' }}
                      onClick={() => {
                        setOpenKey(isOpen ? null : key);
                        setRename(e.name);
                        setConfirming(false);
                      }}>
                      {isOpen ? 'ปิด' : 'จัดการ'}
                    </button>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 14, borderTop: '1px solid var(--color-neutral-200)', paddingTop: 12 }}>
                      {e.doctors.length > 0 && (
                        <p className="subtle" style={{ margin: '0 0 12px' }}>
                          รายชื่อหมอที่ใช้ชื่อนี้: {e.doctors.map((d) => (
                            field === 'prescriber' ? (d.hospital || 'ไม่ระบุโรงพยาบาล') : d.name
                          )).join(', ')}
                        </p>
                      )}

                      <label className="o-label" style={{ marginTop: 0 }} htmlFor={`tidy-${key}`}>
                        แก้ตัวสะกดให้ถูก
                      </label>
                      <input id={`tidy-${key}`} className="o-input" value={rename}
                        onChange={(ev) => setRename(ev.target.value)} />
                      <button type="button" className="o-btn primary block" style={{ marginTop: 8 }}
                        disabled={!rename.trim() || norm(rename) === e.name}
                        onClick={() => applyRename(field, e.name, norm(rename))}>
                        เปลี่ยนชื่อให้ทุกที่ที่ใช้อยู่
                      </button>

                      {entries.length > 1 && (
                        <>
                          <p className="o-label">หรือรวมเข้ากับชื่อที่มีอยู่แล้ว</p>
                          <div className="o-chips">
                            {entries.filter((o) => o.name !== e.name).map((o) => (
                              <button key={o.name} type="button" className="o-chip"
                                onClick={() => applyRename(field, e.name, o.name)}>
                                {o.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {confirming ? (
                        <div className="o-row" style={{ marginTop: 14 }}>
                          <button type="button" className="o-btn ghost" onClick={() => setConfirming(false)}>
                            ไม่เอาออก
                          </button>
                          <button type="button" className="o-btn danger" onClick={() => removeEntry(field, e)}>
                            ยืนยันเอาออก
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="o-btn ghost block" style={{ marginTop: 14 }}
                          onClick={() => setConfirming(true)}>
                          <Icon name="x" size={17} /> เอาชื่อนี้ออกจากรายการ
                        </button>
                      )}

                      {confirming && (
                        <p className="subtle" style={{ margin: '8px 0 0' }}>
                          {e.medCount === 0 && e.doctors.length > 0 && field === 'prescriber'
                            ? `จะลบรายชื่อหมอ ${e.doctors.length} รายการนี้ทิ้ง ยาและนัดที่บันทึกไว้ไม่หาย`
                            : `จะล้างชื่อนี้ออกจาก ${used} — ข้อมูลอื่นยังอยู่ครบ`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <button type="button" className="o-btn primary block" style={{ marginTop: 20 }}
        onClick={() => { close(); onClose(); }}>
        เสร็จแล้ว
      </button>
    </Sheet>
  );
}
