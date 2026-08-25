'use client';

import React, { useRef, useState } from 'react';
import { ComboField } from '../ComboField';
import { EscortPicker } from '../EscortPicker';
import { Icon } from '../Icon';
import { daysLabel, daysUntil, fmtDate } from '@/lib/format';
import { bookAppointments } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { Appointment, Book } from '@/lib/types';

function Step({ n, title, body, done, children }: {
  n: string; title: string; body: string; done?: boolean; children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
      <div style={{
        flex: '0 0 28px', height: 28, borderRadius: '50%',
        background: done ? 'var(--color-accent-2-200)' : 'var(--color-neutral-200)',
        color: done ? 'var(--color-accent-2-700)' : 'var(--color-neutral-800)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14,
      }}>
        {done ? '✓' : n}
      </div>
      <div style={{ flex: 1 }}>
        <strong>{title}</strong>
        <div className="subtle">{body}</div>
        {children}
      </div>
    </div>
  );
}

/** แก้นัดที่บันทึกไว้แล้ว — พิมพ์ชื่อหมอเองทำให้ "หมอศุภฤกษ์/โรคกระดูก" กับ
 *  "หมอศุภฤกษ์ / โรคกระดูก" กลายเป็นคนละนัดคนละหมอ เลือกจากรายการเดิมแทน */
function EditAppt({ appt, book, onDone }: { appt: Appointment; book: Book; onDone: () => void }) {
  const { state, actions } = useStore();
  const [draft, setDraft] = useState<Appointment>({ ...appt });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const uniq = (list: string[]) => Array.from(new Set(list.map((v) => v.trim()).filter(Boolean))).sort();
  const doctors = state.doctors.filter((d) => d.book_id === book.id);
  const titles = uniq([
    ...doctors.map((d) => d.name),
    ...state.appointments.filter((a) => a.book_id === book.id).map((a) => a.title),
  ]);
  const places = uniq([
    ...doctors.map((d) => d.hospital),
    ...state.appointments.filter((a) => a.book_id === book.id).map((a) => a.place),
  ]);

  const set = (p: Partial<Appointment>) => setDraft((d) => ({ ...d, ...p }));

  const pickTitle = (title: string) => {
    const doc = doctors.find((d) => d.name === title);
    set(doc?.hospital ? { title, place: doc.hospital } : { title });
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--color-neutral-300)', paddingTop: 4 }}>
      <ComboField id={`ap-title-${appt.id}`} label="หมอ / เรื่องที่ไป" value={draft.title}
        options={titles} placeholder="เลือกหมอ…" onChange={pickTitle} />

      <label className="o-label" htmlFor={`ap-date-${appt.id}`}>วันที่</label>
      <input id={`ap-date-${appt.id}`} className="o-input" type="date" value={draft.date}
        onChange={(e) => set({ date: e.target.value })} />

      <label className="o-label" htmlFor={`ap-time-${appt.id}`}>เวลา</label>
      <input id={`ap-time-${appt.id}`} className="o-input" type="time" value={draft.time}
        onChange={(e) => set({ time: e.target.value })} />

      <ComboField id={`ap-place-${appt.id}`} label="สถานที่" value={draft.place}
        options={places} placeholder="เลือกสถานที่…" onChange={(place) => set({ place })} />

      <label className="o-label">ขั้นตรวจเลือดล่วงหน้า</label>
      <div className="o-chips">
        <button type="button" className="o-chip" aria-pressed={draft.blood_test_before}
          onClick={() => set({ blood_test_before: !draft.blood_test_before })}>
          ต้องตรวจเลือดก่อนนัด
        </button>
      </div>

      <div className="o-row" style={{ marginTop: 18 }}>
        <button type="button" className="o-btn ghost" onClick={onDone}>ยกเลิก</button>
        <button type="button" className="o-btn primary"
          disabled={!draft.title.trim() || !draft.date}
          onClick={() => {
            actions.updateAppointment(appt.id, {
              title: draft.title.trim(), date: draft.date, time: draft.time || '09:00',
              place: draft.place.trim(), blood_test_before: draft.blood_test_before,
            });
            actions.toast('แก้นัดแล้ว');
            onDone();
          }}>
          บันทึก
        </button>
      </div>

      {confirmingDelete ? (
        <>
          <p className="subtle" style={{ margin: '16px 0 8px' }}>ลบนัด {appt.title} ออกจากสมุด</p>
          <div className="o-row">
            <button type="button" className="o-btn ghost" onClick={() => setConfirmingDelete(false)}>
              ไม่ลบ
            </button>
            <button type="button" className="o-btn danger"
              onClick={() => {
                actions.removeAppointment(appt.id);
                actions.toast(`ลบนัด ${appt.title} แล้ว`);
              }}>
              ยืนยันลบ
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="o-btn ghost block" style={{ marginTop: 12 }}
          onClick={() => setConfirmingDelete(true)}>
          <Icon name="x" size={17} /> ลบนัดนี้
        </button>
      )}
    </div>
  );
}

export function ApptsScreen({ book, onAdd }: { book: Book; onAdd: () => void }) {
  const { state, actions } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const appts = bookAppointments(state, book.id);

  const renderSteps = (a: Appointment) => {
    const d = daysUntil(a.date);
    return (
      <div style={{ marginTop: 12, borderTop: '1px solid var(--color-neutral-300)', paddingTop: 4 }}>
        {a.blood_test_before && (
          <Step
            n="1"
            title="ตรวจเลือดล่วงหน้า"
            body={d <= 7 ? 'ถึงเวลาไปตรวจแล้ว (ภายใน 7 วันก่อนนัด)' : `เปิดให้ไปตรวจได้อีก ${d - 7} วัน`}
            done={a.blood_test_done}
          >
            {!a.blood_test_done && d <= 7 && (
              <button type="button" className="o-btn secondary" style={{ marginTop: 8 }}
                onClick={() => {
                  actions.updateAppointment(a.id, { blood_test_done: true });
                  actions.addRecord(book.id, { kind: 'visit', title: 'ตรวจเลือดก่อนนัด', body: a.title, important: false });
                  actions.toast('บันทึกว่าไปตรวจเลือดแล้ว');
                }}>
                ไปตรวจแล้ว
              </button>
            )}
          </Step>
        )}
        <Step
          n={a.blood_test_before ? '2' : '1'}
          title="พบหมอ"
          body={`${fmtDate(a.date)} · ${a.time} น. — เตือน 1 วันก่อน + เช้าวันนัด`}
        />
        <Step
          n={a.blood_test_before ? '3' : '2'}
          title="กลับบ้าน สแกนถุงยาใหม่"
          body="ให้แอปเช็คยาซ้ำกับของเดิมทันที"
        >
          <div style={{ marginTop: 8 }}>
            <div className="o-label" style={{ marginTop: 0 }}>ใครพาไป</div>
            <EscortPicker
              value={a.escort}
              onChange={(n) => {
                actions.updateAppointment(a.id, { escort: n });
                actions.toast(n ? `มอบหมาย ${n} พาไป` : 'ยกเลิกคนพาไปแล้ว');
              }}
            />
          </div>
        </Step>
      </div>
    );
  };

  return (
    <div className="screen">
      <p className="kicker">Doolaekan</p>
      <h2>นัดหมอ</h2>
      <p className="subtle">ของ{book.owner_name} · {appts.length} นัด</p>

      <div style={{ marginTop: 16 }}>
        {appts.length === 0 && (
          <button type="button" className="o-empty" onClick={onAdd}>
            ยังไม่มีนัดหมอ — แตะเพื่อเพิ่มนัด
          </button>
        )}
        {appts.map((a) => {
          const past = daysUntil(a.date) < 0;
          return (
            <div key={a.id} className="o-card" style={{ opacity: past ? .6 : 1 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{
                  flex: '0 0 44px', height: 44, borderRadius: '50%',
                  background: 'var(--color-accent-2-100)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name="calendar" size={22} color="var(--color-accent-2-700)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>{a.title}</h3>
                    <span className="o-tag accent" style={{ height: 'fit-content' }}>{daysLabel(a.date)}</span>
                  </div>
                  <p className="subtle" style={{ margin: '2px 0 0' }}>
                    {fmtDate(a.date)} · {a.time} น.{a.place ? ` · ${a.place}` : ''}
                  </p>
                </div>
                <button type="button" className="o-btn ghost"
                  style={{ padding: '6px 14px', minHeight: 34, flex: '0 0 auto' }}
                  onClick={() => setEditingId(editingId === a.id ? null : a.id)}>
                  {editingId === a.id ? 'ปิด' : 'แก้ไข'}
                </button>
              </div>
              {editingId === a.id
                ? <EditAppt appt={a} book={book} onDone={() => setEditingId(null)} />
                : !past && renderSteps(a)}

              <ApptPhoto appt={a} />
            </div>
          );
        })}
      </div>

      <button type="button" className="o-btn primary block" onClick={onAdd}>
        <Icon name="plus" size={20} /> เพิ่มนัดใหม่
      </button>
    </div>
  );
}

/** ภาพใบนัด — ใบกระดาษหายง่าย และมีข้อมูลที่แอปไม่ได้เก็บ เช่น เลขคิว ชั้น ห้องตรวจ
 *  หรือข้อความที่หมอเขียนมือไว้ ถ่ายเก็บไว้แล้วเปิดดูตอนไปถึงโรงพยาบาลได้เลย */
function ApptPhoto({ appt }: { appt: Appointment }) {
  const { actions } = useStore();
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  // เก็บไว้แล้วแต่ยังไม่ได้ดึงรูปมา — ดึงตอนกดดูเท่านั้น รูปเป็นของหนักที่สุดในแอป
  const stored = Boolean(appt.photo_path) && !appt.photo;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      actions.setAppointmentPhoto(appt.id, String(reader.result));
      actions.toast('เก็บภาพใบนัดแล้ว');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ marginTop: 12 }}>
      {appt.photo && (
        <a href={appt.photo} target="_blank" rel="noreferrer">
          <img src={appt.photo} alt={`ใบนัด ${appt.title}`} className="scan-img" />
        </a>
      )}
      {stored && (
        <button type="button" className="o-btn secondary block" disabled={loading}
          onClick={async () => {
            setLoading(true);
            await actions.loadPhoto(appt.photo_path as string);
            setLoading(false);
          }}>
          <Icon name="camera" size={18} /> {loading ? 'กำลังเปิด…' : 'ดูภาพใบนัดที่เก็บไว้'}
        </button>
      )}
      <div className="o-row" style={{ marginTop: (appt.photo || stored) ? 10 : 0 }}>
        <button type="button" className="o-btn ghost" onClick={() => camRef.current?.click()}>
          <Icon name="camera" size={18} /> {(appt.photo || stored) ? 'ถ่ายใหม่' : 'ถ่ายใบนัด'}
        </button>
        <button type="button" className="o-btn ghost" onClick={() => pickRef.current?.click()}>
          เลือกรูปที่มีอยู่
        </button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment"
        onChange={onFile} style={{ display: 'none' }} />
      <input ref={pickRef} type="file" accept="image/*"
        onChange={onFile} style={{ display: 'none' }} />
    </div>
  );
}
