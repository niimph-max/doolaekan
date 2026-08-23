'use client';

import React, { useState } from 'react';
import { Sheet } from '../Sheet';
import { useStore } from '@/lib/store';

const ESCORTS = ['พี่หนึ่ง', 'น้องสอง', 'น้องสาม', 'ไปเอง'];

export function AddApptSheet({ open, bookId, onClose }: {
  open: boolean; bookId: string; onClose: () => void;
}) {
  const { actions } = useStore();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [escort, setEscort] = useState('');

  // กติกา: นัดที่ชื่อมี "หัวใจ" ต้องตรวจเลือดล่วงหน้า ≤7 วัน — แอปแนบขั้นตอนให้เอง
  const needsBloodTest = title.includes('หัวใจ');

  const close = () => {
    setTitle(''); setDate(''); setTime(''); setPlace(''); setEscort('');
    onClose();
  };

  const save = () => {
    if (!title.trim() || !date) return;
    actions.addAppointment(bookId, {
      title: title.trim(), date, time: time || '09:00', place: place.trim(),
      escort, blood_test_before: needsBloodTest,
    });
    actions.toast(needsBloodTest ? 'เพิ่มนัดแล้ว + แนบขั้นตรวจเลือดล่วงหน้าให้' : 'เพิ่มนัดแล้ว แจ้งเตือนล่วงหน้า 1 วัน');
    close();
  };

  return (
    <Sheet open={open} title="เพิ่มนัดใหม่" onClose={close}>
      <label className="o-label" htmlFor="ap-title">หมอ / เรื่องที่ไป</label>
      <input id="ap-title" className="o-input" placeholder="เช่น หมอหัวใจ — เตี่ย"
        value={title} onChange={(e) => setTitle(e.target.value)} />

      <label className="o-label" htmlFor="ap-date">วันที่</label>
      <input id="ap-date" className="o-input" type="date" value={date}
        onChange={(e) => setDate(e.target.value)} />

      <label className="o-label" htmlFor="ap-time">เวลา</label>
      <input id="ap-time" className="o-input" type="time" value={time}
        onChange={(e) => setTime(e.target.value)} />

      <label className="o-label" htmlFor="ap-place">สถานที่</label>
      <input id="ap-place" className="o-input" placeholder="เช่น รพ.พระปกเกล้า จันทบุรี"
        value={place} onChange={(e) => setPlace(e.target.value)} />

      <label className="o-label" htmlFor="ap-escort">ใครพาไป</label>
      <div className="o-chips" id="ap-escort">
        {ESCORTS.map((n) => (
          <button key={n} type="button" className="o-chip" aria-pressed={escort === n}
            onClick={() => setEscort(escort === n ? '' : n)}>
            {n}
          </button>
        ))}
      </div>

      {needsBloodTest && (
        <p className="subtle" style={{ marginTop: 14, color: 'var(--color-accent-700)' }}>
          นัดหมอหัวใจ — แอปจะเพิ่มขั้น &ldquo;ตรวจเลือดล่วงหน้า ≤7 วันก่อนนัด&rdquo; ให้อัตโนมัติ
        </p>
      )}

      <button type="button" className="o-btn primary block" style={{ marginTop: 16 }}
        disabled={!title.trim() || !date} onClick={save}>
        บันทึกนัด
      </button>
    </Sheet>
  );
}
