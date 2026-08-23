'use client';

import React, { useState } from 'react';
import { Icon } from './Icon';
import { ageFromBirthDate, fmtBirthDate } from '@/lib/format';
import { bookWatchRules } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { Book } from '@/lib/types';

/** บัตรสรุปฉุกเฉิน — เปิดเต็มจอยื่นให้หมอดูได้เลย */
export function EmergencyCard({ book, onClose }: { book: Book; onClose: () => void }) {
  const { state } = useStore();
  const [zoom, setZoom] = useState(false);
  const meds = state.medications.filter((m) => m.book_id === book.id);
  const docs = state.doctors.filter((d) => d.book_id === book.id);
  const rules = bookWatchRules(state, book.id);
  const age = ageFromBirthDate(book.birth_date) || book.age;

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 14 }}>
      <div className="kicker" style={{ color: 'var(--color-accent-700)' }}>{label}</div>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  );

  return (
    <div className="full card-bg" style={{ fontSize: zoom ? '1.25em' : '1em' }}>
      <div className="full-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <button type="button" className="o-btn ghost" onClick={onClose}>
            <Icon name="x" size={19} /> ปิด
          </button>
          <button type="button" className="o-btn secondary" onClick={() => setZoom((z) => !z)}>
            {zoom ? 'ตัวหนังสือปกติ' : 'ขยายตัวหนังสือ'}
          </button>
        </div>

        <h2 style={{ fontSize: 27 }}>{book.full_name || book.owner_name}</h2>
        <p className="subtle" style={{ marginTop: 2 }}>
          {[
            age && `อายุ ${age} ปี`,
            book.birth_date && `เกิด ${fmtBirthDate(book.birth_date)}`,
            book.blood_type && `กรุ๊ปเลือด ${book.blood_type}`,
          ].filter(Boolean).join(' · ') || 'ยังไม่ได้กรอกวันเกิด/กรุ๊ปเลือด'}
        </p>

        <div className="o-card" style={{ border: '2px solid var(--color-accent-500)', marginTop: 16 }}>
          <div className="kicker" style={{ color: 'var(--color-accent-700)' }}>แพ้ยา</div>
          <strong style={{ fontSize: 19 }}>{book.allergy || 'ไม่มีที่ทราบ'}</strong>
        </div>

        <div className="o-card">
          <Row label="โรคประจำตัว">
            {book.conditions.length
              ? <div className="o-chips">{book.conditions.map((c) => <span key={c} className="o-tag accent">{c}</span>)}</div>
              : <span className="subtle">—</span>}
          </Row>

          <Row label="ยาที่กินอยู่">
            {meds.length ? meds.map((m) => m.name).join(' · ') : <span className="subtle">—</span>}
          </Row>

          <Row label="ข้อเฝ้าระวัง">
            {rules.length
              ? rules.map((w) => (
                <div key={w.id}>{w.triggers.join(' / ')} → {w.action}</div>
              ))
              : <span className="subtle">—</span>}
          </Row>

          <Row label="หมอประจำ">
            {docs.length
              ? docs.map((d) => (
                <div key={d.id}>{d.name} — {d.hospital}{d.hn ? ` (HN ${d.hn})` : ''}</div>
              ))
              : <span className="subtle">—</span>}
          </Row>

          <Row label="ที่อยู่">{book.address || <span className="subtle">—</span>}</Row>

          <Row label="เบอร์ติดต่อลูก">
            {book.emergency_contact
              ? <a href={`tel:${book.emergency_contact.replace(/[^\d+]/g, '')}`}>{book.emergency_contact}</a>
              : <span className="subtle">—</span>}
          </Row>
        </div>

        <p className="subtle" style={{ textAlign: 'center' }}>
          อัปเดตล่าสุด {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}
