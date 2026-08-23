'use client';

import React, { useState } from 'react';
import { Sheet } from '../Sheet';
import { Icon } from '../Icon';
import { ageFromBirthDate, todayKey } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { Book } from '@/lib/types';

export function ProfileSheet({ open, book, onClose }: {
  open: boolean; book: Book; onClose: () => void;
}) {
  const { state, actions } = useStore();
  const [dr, setDr] = useState({ name: '', hospital: '', hn: '', clinic_hours: '' });
  const doctors = state.doctors.filter((d) => d.book_id === book.id);
  const computedAge = ageFromBirthDate(book.birth_date);

  const set = (patch: Partial<Book>) => actions.updateBook(book.id, patch);

  return (
    <Sheet open={open} title="โปรไฟล์ &amp; หมอ" onClose={onClose}>
      <label className="o-label" htmlFor="pf-name">ชื่อเรียกในสมุด</label>
      <input id="pf-name" className="o-input" value={book.owner_name}
        onChange={(e) => set({ owner_name: e.target.value })} />

      <label className="o-label" htmlFor="pf-full">ชื่อ–นามสกุลจริง</label>
      <input id="pf-full" className="o-input" value={book.full_name}
        onChange={(e) => set({ full_name: e.target.value })} />

      <label className="o-label" htmlFor="pf-birth">วันเดือนปีเกิด</label>
      <input id="pf-birth" className="o-input" type="date" max={todayKey()}
        value={book.birth_date} onChange={(e) => set({ birth_date: e.target.value })} />
      {computedAge && (
        <p className="subtle" style={{ margin: '6px 0 0' }}>
          อายุ {computedAge} ปี — แอปคำนวณให้เอง ไม่ต้องมาแก้ทุกปี
        </p>
      )}

      <div className="o-row">
        <div>
          <label className="o-label" htmlFor="pf-age">
            {computedAge ? 'อายุ (คำนวณแล้ว)' : 'อายุ (ถ้าจำวันเกิดไม่ได้)'}
          </label>
          <input id="pf-age" className="o-input" inputMode="numeric"
            value={computedAge || book.age}
            disabled={Boolean(computedAge)}
            placeholder="เช่น 74"
            onChange={(e) => set({ age: e.target.value })} />
        </div>
        <div>
          <label className="o-label" htmlFor="pf-blood">กรุ๊ปเลือด</label>
          <input id="pf-blood" className="o-input" value={book.blood_type}
            onChange={(e) => set({ blood_type: e.target.value })} />
        </div>
      </div>

      <label className="o-label" htmlFor="pf-addr">ที่อยู่</label>
      <input id="pf-addr" className="o-input" value={book.address}
        onChange={(e) => set({ address: e.target.value })} />

      <label className="o-label" htmlFor="pf-allergy">แพ้ยา</label>
      <input id="pf-allergy" className="o-input" value={book.allergy}
        onChange={(e) => set({ allergy: e.target.value })} />

      <label className="o-label" htmlFor="pf-contact">เบอร์ติดต่อลูก</label>
      <input id="pf-contact" className="o-input" value={book.emergency_contact}
        onChange={(e) => set({ emergency_contact: e.target.value })} />

      <h3 style={{ fontSize: 19, margin: '22px 0 8px' }}>หมอที่รักษา</h3>
      {doctors.map((d) => (
        <div key={d.id} className="o-card" style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <strong>{d.name}</strong>
            <div className="subtle">
              {[d.hospital, d.hn && `HN ${d.hn}`, d.clinic_hours].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" className="o-btn ghost" style={{ padding: 8, minHeight: 36 }}
            aria-label={`ลบ ${d.name}`} onClick={() => actions.removeDoctor(d.id)}>
            <Icon name="x" size={18} />
          </button>
        </div>
      ))}

      <label className="o-label" htmlFor="pf-dr-name">เพิ่มหมอ</label>
      <input id="pf-dr-name" className="o-input" placeholder="หมอ / แผนก"
        value={dr.name} onChange={(e) => setDr({ ...dr, name: e.target.value })} />
      <input className="o-input" style={{ marginTop: 8 }} placeholder="โรงพยาบาล / คลินิก"
        value={dr.hospital} onChange={(e) => setDr({ ...dr, hospital: e.target.value })} />
      <input className="o-input" style={{ marginTop: 8 }} placeholder="เลข HN"
        value={dr.hn} onChange={(e) => setDr({ ...dr, hn: e.target.value })} />
      <input className="o-input" style={{ marginTop: 8 }} placeholder="เวลาออกตรวจ"
        value={dr.clinic_hours} onChange={(e) => setDr({ ...dr, clinic_hours: e.target.value })} />
      <button type="button" className="o-btn secondary block" style={{ marginTop: 10 }}
        disabled={!dr.name.trim()}
        onClick={() => {
          actions.addDoctor(book.id, dr);
          setDr({ name: '', hospital: '', hn: '', clinic_hours: '' });
        }}>
        <Icon name="plus" size={19} /> เพิ่มหมอคนนี้
      </button>

      <button type="button" className="o-btn primary block" style={{ marginTop: 18 }} onClick={onClose}>
        เสร็จแล้ว
      </button>

      {state.mode === 'cloud' && (
        <>
          <p className="subtle" style={{ marginTop: 18, textAlign: 'center' }}>
            ข้อมูลซิงก์กับครอบครัวผ่านคลาวด์อยู่
          </p>
          <button type="button" className="o-btn ghost block" style={{ marginTop: 8 }}
            onClick={() => { void actions.signOut(); }}>
            ออกจากระบบ
          </button>
        </>
      )}
    </Sheet>
  );
}
