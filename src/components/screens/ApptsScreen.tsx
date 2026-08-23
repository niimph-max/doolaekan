'use client';

import React from 'react';
import { Icon } from '../Icon';
import { daysLabel, daysUntil, fmtDate } from '@/lib/format';
import { bookAppointments } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { Appointment, Book } from '@/lib/types';

const ESCORTS = ['พี่หนึ่ง', 'น้องสอง', 'น้องสาม', 'ไปเอง'];

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

export function ApptsScreen({ book, onAdd }: { book: Book; onAdd: () => void }) {
  const { state, actions } = useStore();
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
            <div className="o-chips">
              {ESCORTS.map((n) => (
                <button key={n} type="button" className="o-chip" aria-pressed={a.escort === n}
                  onClick={() => {
                    actions.updateAppointment(a.id, { escort: a.escort === n ? '' : n });
                    actions.toast(a.escort === n ? 'ยกเลิกคนพาไปแล้ว' : `มอบหมาย ${n} พาไป`);
                  }}>
                  {n}
                </button>
              ))}
            </div>
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
              </div>
              {!past && renderSteps(a)}
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
