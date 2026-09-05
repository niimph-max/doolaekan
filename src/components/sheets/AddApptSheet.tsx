'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { EscortPicker } from '../EscortPicker';
import { useStore } from '@/lib/store';

const OTHER = '__other__';

export function AddApptSheet({ open, bookId, preset, onClose }: {
  open: boolean;
  bookId: string;
  /** เปิดมาพร้อมชื่อและวันที่ที่รู้อยู่แล้ว เช่น กดจากกำหนดฉีดวัคซีนครั้งหน้า */
  preset?: { title: string; date: string };
  onClose: () => void;
}) {
  const { state, actions } = useStore();

  const doctors = useMemo(
    () => state.doctors.filter((d) => d.book_id === bookId),
    [state.doctors, bookId],
  );
  // สถานที่ที่เคยกรอกไว้ในรายชื่อหมอ + ที่เคยใช้ในนัดเก่า
  const places = useMemo(() => Array.from(new Set([
    ...doctors.map((d) => d.hospital),
    ...state.appointments.filter((a) => a.book_id === bookId).map((a) => a.place),
  ].filter(Boolean))), [doctors, state.appointments, bookId]);

  const [doctorId, setDoctorId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [placeChoice, setPlaceChoice] = useState('');
  const [place, setPlace] = useState('');
  const [escort, setEscort] = useState('');
  const [note, setNote] = useState('');

  // เติมค่าที่ส่งมาให้ครั้งเดียวตอนเปิด — ไม่เขียนทับสิ่งที่ผู้ใช้กำลังพิมพ์อยู่
  const filled = useRef('');
  useEffect(() => {
    if (!open || !preset) return;
    const key = `${preset.title}|${preset.date}`;
    if (filled.current === key) return;
    filled.current = key;
    setTitle(preset.title);
    setDate(preset.date);
    // ถ้ามีรายชื่อหมออยู่ ช่องพิมพ์ชื่อจะถูกซ่อนไว้จนกว่าจะเลือก "อื่นๆ"
    // ชื่อที่เติมมาให้จึงต้องเปิดช่องนั้นด้วย ไม่งั้นผู้ใช้จะเห็นแต่ "เลือกหมอ…"
    // แล้วไม่รู้เลยว่าตอนนี้นัดนี้ชื่ออะไร
    setDoctorId(OTHER);
  }, [open, preset]);

  // กติกา: นัดที่ชื่อมี "หัวใจ" ต้องตรวจเลือดล่วงหน้า ≤7 วัน — แอปแนบขั้นตอนให้เอง
  const needsBloodTest = title.includes('หัวใจ');

  const close = () => {
    setDoctorId(''); setTitle(''); setDate(''); setTime('');
    setPlaceChoice(''); setPlace(''); setEscort(''); setNote('');
    onClose();
  };

  /** เลือกหมอจากรายชื่อ → เติมชื่อเรื่องและสถานที่ให้เลย */
  const pickDoctor = (id: string) => {
    setDoctorId(id);
    if (id === OTHER || !id) {
      setTitle('');
      return;
    }
    const d = doctors.find((x) => x.id === id);
    if (!d) return;
    setTitle(d.name);
    if (d.hospital) {
      setPlaceChoice(d.hospital);
      setPlace(d.hospital);
    }
  };

  const pickPlace = (value: string) => {
    setPlaceChoice(value);
    setPlace(value === OTHER ? '' : value);
  };

  const save = () => {
    if (!title.trim() || !date) return;
    actions.addAppointment(bookId, {
      title: title.trim(), date, time: time || '09:00', place: place.trim(),
      escort, note: note.trim(), blood_test_before: needsBloodTest,
    });
    actions.toast(needsBloodTest ? 'เพิ่มนัดแล้ว + แนบขั้นตรวจเลือดล่วงหน้าให้' : 'เพิ่มนัดแล้ว แจ้งเตือนล่วงหน้า 1 วัน');
    close();
  };

  return (
    <Sheet open={open} title="เพิ่มนัดใหม่" onClose={close}>
      <label className="o-label" htmlFor="ap-doctor">หมอ / เรื่องที่ไป</label>
      {doctors.length > 0 ? (
        <>
          <select id="ap-doctor" className="o-select" value={doctorId}
            onChange={(e) => pickDoctor(e.target.value)}>
            <option value="">เลือกหมอ…</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hospital ? `${d.name} — ${d.hospital}` : d.name}
              </option>
            ))}
            <option value={OTHER}>อื่นๆ (พิมพ์เอง)</option>
          </select>
          {doctorId === OTHER && (
            <input className="o-input" style={{ marginTop: 8 }} placeholder="เช่น หมอผิวหนัง / ฉีดวัคซีน"
              value={title} onChange={(e) => setTitle(e.target.value)} />
          )}
        </>
      ) : (
        <>
          <input id="ap-doctor" className="o-input" placeholder="เช่น หมอหัวใจ"
            value={title} onChange={(e) => setTitle(e.target.value)} />
          <p className="o-hint">
            เพิ่มหมอไว้ที่ สมุด → โปรไฟล์ &amp; หมอ แล้วครั้งหน้าจะเลือกจากรายชื่อได้เลย
          </p>
        </>
      )}

      <label className="o-label" htmlFor="ap-date">วันที่</label>
      <input id="ap-date" className="o-input" type="date" value={date}
        onChange={(e) => setDate(e.target.value)} />
      {!date && <p className="o-hint">แตะเพื่อเลือกวันที่</p>}

      <label className="o-label" htmlFor="ap-time">เวลา</label>
      <input id="ap-time" className="o-input" type="time" value={time}
        onChange={(e) => setTime(e.target.value)} />
      {!time && <p className="o-hint">แตะเพื่อเลือกเวลา · ไม่เลือกจะใช้ 09:00</p>}

      <label className="o-label" htmlFor="ap-place">สถานที่</label>
      {places.length > 0 ? (
        <>
          <select id="ap-place" className="o-select" value={placeChoice}
            onChange={(e) => pickPlace(e.target.value)}>
            <option value="">เลือกสถานที่…</option>
            {places.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value={OTHER}>อื่นๆ (พิมพ์เอง)</option>
          </select>
          {placeChoice === OTHER && (
            <input className="o-input" style={{ marginTop: 8 }} placeholder="เช่น คลินิกใกล้บ้าน"
              value={place} onChange={(e) => setPlace(e.target.value)} />
          )}
        </>
      ) : (
        <input id="ap-place" className="o-input" placeholder="เช่น รพ.พระปกเกล้า จันทบุรี"
          value={place} onChange={(e) => setPlace(e.target.value)} />
      )}

      <label className="o-label">ใครพาไป</label>
      <EscortPicker value={escort} onChange={setEscort} />

      {/* หมายเหตุ — ใบนัดจริงมีเรื่องต้องจำนอกจากวันเวลาเสมอ ถ้าไม่มีที่ให้จด
          คนจะไปยัดรวมในชื่อนัด แล้วชื่อบนการ์ดจะยาวจนอ่านไม่รู้เรื่อง */}
      <label className="o-label" htmlFor="ap-note">หมายเหตุ (ใส่หรือไม่ก็ได้)</label>
      <textarea id="ap-note" className="o-textarea" rows={3}
        placeholder="เช่น งดน้ำงดอาหารหลังเที่ยงคืน · เอาผลเลือดใบเดิมไปด้วย · จอดตึก B"
        value={note} onChange={(e) => setNote(e.target.value)} />

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
