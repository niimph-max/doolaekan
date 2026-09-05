'use client';

import React, { useState } from 'react';
import { Icon } from '../Icon';
import { Kicker } from '../Kicker';
import { REFUSE_REASONS } from '@/lib/seed';
import { MEAL_LABEL, SLOT_LABEL, SLOT_TIME, daysLabel, fmtDate, fmtTime, todayKey } from '@/lib/format';
import { nextAppointment, todayDoseGroups } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { Book, DoseSlot, MealTiming, Medication } from '@/lib/types';

export function TodayScreen({ book, onOpenActor, onOpenSymptom, onOpenEmergency, onAddAppt }: {
  book: Book;
  onOpenActor: () => void;
  onOpenSymptom: () => void;
  onOpenEmergency: () => void;
  onAddAppt: () => void;
}) {
  const { state, actions } = useStore();
  const [asking, setAsking] = useState<string | null>(null);
  const [bp, setBp] = useState({ sys: '', dia: '', pulse: '' });

  const day = todayKey();
  const groups = todayDoseGroups(state, book.id, day);
  const next = nextAppointment(state, book.id);
  const today = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const logSlot = (meds: Medication[], slot: DoseSlot, status: 'taken' | 'refused', reason: string) => {
    for (const m of meds) {
      actions.logDose({ book_id: book.id, medication_id: m.id, day, slot, status, reason });
    }
  };

  const saveBp = () => {
    const sys = Number(bp.sys);
    const dia = Number(bp.dia);
    if (!sys || !dia) return;
    const pulse = Number(bp.pulse) || undefined;
    const high = sys >= 140;
    actions.addRecord(book.id, {
      kind: 'bp',
      title: `ความดัน ${sys}/${dia}${pulse ? ` · ชีพจร ${pulse}` : ''}`,
      body: high ? 'สูงกว่าเกณฑ์ — แจ้งลูกๆ ทันที' : '',
      data: { sys, dia, pulse },
      important: high,
    });
    setBp({ sys: '', dia: '', pulse: '' });
    actions.toast(high ? 'บันทึกแล้ว — ความดันสูง แจ้งลูกๆ ทันที' : 'บันทึกแล้ว ทุกคนเห็นทันที');
  };

  return (
    <div className="screen">
      <Kicker book={book} />
      <h2>วันนี้</h2>
      <p className="subtle">{today}</p>

      <button type="button" className="o-btn ghost" style={{ marginTop: 10 }} onClick={onOpenActor}>
        คนกดตอนนี้: {state.actorName || 'ยังไม่ได้เลือก'} <Icon name="chevron" size={17} />
      </button>

      {/* นัดถัดไป */}
      <h3 style={{ fontSize: 19, margin: '22px 0 10px' }}>นัดถัดไป</h3>
      {next ? (
        <div className="o-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <h3>{next.title}</h3>
            <span className="o-tag accent" style={{ height: 'fit-content' }}>{daysLabel(next.date)}</span>
          </div>
          <p className="subtle" style={{ margin: '2px 0 8px' }}>
            {fmtDate(next.date)} · {next.time} น.{next.place ? ` · ${next.place}` : ''}
          </p>
          {next.note && (
            <p style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{next.note}</p>
          )}
          <p style={{ margin: 0, color: 'var(--color-accent-700)' }}>
            เตือนล่วงหน้า 1 วัน + เช้าวันนัด{next.escort ? ` · ${next.escort}พาไป` : ''}
          </p>
        </div>
      ) : (
        <button type="button" className="o-empty" onClick={onAddAppt}>
          ยังไม่มีนัดหมอ — แตะเพื่อเพิ่มนัด
        </button>
      )}

      {/* ยาวันนี้ */}
      <h3 style={{ fontSize: 19, margin: '22px 0 10px' }}>ยาวันนี้ของ{book.owner_name}</h3>
      {groups.length === 0 && (
        <button type="button" className="o-empty" onClick={() => actions.setTab('meds')}>
          ยังไม่มียาในสมุด — แตะเพื่อเพิ่มยา
        </button>
      )}
      {groups.map((g) => {
        const log = g.logs[0];
        const heading = g.timing
          ? `ยา${MEAL_LABEL[g.timing]}${SLOT_LABEL[g.slot]} — ${book.owner_name}`
          : `ยา${SLOT_LABEL[g.slot]} — ${book.owner_name}`;
        return (
          <div key={g.key} className={`o-card${g.status === 'pending' ? ' due' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <h3>{heading}</h3>
              <span className="o-tag" style={{ height: 'fit-content' }}>{SLOT_TIME[g.slot]}</span>
            </div>
            {/* ทีละแถว ไม่ต่อกันเป็นพืด — มื้อหนึ่งมียาได้เกือบสิบตัว ต้องกวาดตาหาให้เจอว่าครบไหม
                คำอธิบาย "ช่วยอะไร" ไปอ่านที่แท็บยา ใส่ตรงนี้การ์ดจะยาวจนเลื่อนไม่ไหว */}
            <ul className="med-list">
              {g.meds.map((m) => <li key={m.id}>{m.name}</li>)}
            </ul>

            {g.status === 'taken' && log && (
              <span className="o-pill-done">
                กินแล้ว {fmtTime(log.at)} น. ({log.actor_name}บันทึก)
              </span>
            )}
            {g.status === 'refused' && log && (
              <span className="o-pill-done" style={{ background: 'var(--color-accent-200)', color: 'var(--color-accent-700)' }}>
                ไม่ยอมกิน — {log.reason || 'ไม่ระบุ'} ({log.actor_name}บันทึก)
              </span>
            )}

            {g.status === 'pending' && asking !== g.key && (
              <div className="o-row">
                <button type="button" className="o-btn primary"
                  onClick={() => {
                    logSlot(g.meds, g.slot, 'taken', '');
                    actions.toast('บันทึกว่ากินแล้ว');
                  }}>
                  กินแล้ว
                </button>
                <button type="button" className="o-btn secondary" onClick={() => setAsking(g.key)}>
                  ไม่ยอมกิน
                </button>
              </div>
            )}

            {asking === g.key && (
              <>
                <p className="o-label" style={{ marginTop: 0 }}>เพราะอะไร</p>
                <div className="o-chips">
                  {REFUSE_REASONS.map((r) => (
                    <button key={r} type="button" className="o-chip"
                      onClick={() => {
                        logSlot(g.meds, g.slot, 'refused', r);
                        actions.addRecord(book.id, {
                          kind: 'symptom',
                          title: `ไม่ยอมกิน${heading.split(' — ')[0]}`,
                          body: `${r} — ${g.meds.map((m) => m.name).join(' · ')}`,
                          data: { tags: ['ไม่ยอมกินยา'] },
                          important: true,
                        });
                        setAsking(null);
                        actions.toast('บันทึกแล้ว — แจ้งลูกๆ ทุกคน');
                      }}>
                      {r}
                    </button>
                  ))}
                </div>
                <button type="button" className="o-btn ghost block" style={{ marginTop: 10 }}
                  onClick={() => setAsking(null)}>
                  ยกเลิก
                </button>
              </>
            )}
          </div>
        );
      })}

      {/* จดอาการ */}
      <button type="button" className="o-card" onClick={onOpenSymptom}
        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', border: 0, textAlign: 'left' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="activity" size={22} color="var(--color-accent-600)" />
          <strong>จดอาการวันนี้</strong>
        </span>
        <Icon name="chevron" size={19} style={{ transform: 'rotate(-90deg)' }} />
      </button>

      {/* วัดความดัน */}
      <div className="o-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="droplet" size={21} color="var(--color-accent-600)" />
          <h3 style={{ margin: 0 }}>วัดความดัน</h3>
        </div>
        <div className="bp-grid">
          <input inputMode="numeric" placeholder="ตัวบน" aria-label="ความดันตัวบน"
            value={bp.sys} onChange={(e) => setBp({ ...bp, sys: e.target.value })} />
          <input inputMode="numeric" placeholder="ตัวล่าง" aria-label="ความดันตัวล่าง"
            value={bp.dia} onChange={(e) => setBp({ ...bp, dia: e.target.value })} />
          <input inputMode="numeric" placeholder="ชีพจร" aria-label="ชีพจร"
            value={bp.pulse} onChange={(e) => setBp({ ...bp, pulse: e.target.value })} />
        </div>
        <button type="button" className="o-btn primary block" style={{ marginTop: 12 }}
          disabled={!bp.sys || !bp.dia} onClick={saveBp}>
          บันทึก — ทุกคนเห็นทันที
        </button>
        <button type="button" className="o-btn ghost block" style={{ marginTop: 8 }}
          onClick={() => actions.setTab('book')}>
          ดูย้อนหลัง
        </button>
      </div>

      {/* บัตรฉุกเฉิน */}
      <button type="button" className="o-card dark" onClick={onOpenEmergency}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, cursor: 'pointer', border: 0, textAlign: 'left' }}>
        <Icon name="alert" size={26} color="var(--color-accent-400)" />
        <span>
          <strong style={{ display: 'block' }}>บัตรสรุปฉุกเฉิน</strong>
          <span style={{ opacity: .85 }}>เปิดยื่นให้หมอดูได้ทันที</span>
        </span>
      </button>
    </div>
  );
}
