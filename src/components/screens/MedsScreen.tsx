'use client';

import React, { useState } from 'react';
import { ComboField } from '../ComboField';
import { Icon } from '../Icon';
import { MEAL_LABEL, MEAL_ORDER, SLOT_LABEL, SLOT_ORDER } from '@/lib/format';
import { hospitalOfDoctor, mealTimingOf, medFieldOptions } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { Book, DoseSlot, MealTiming, Medication } from '@/lib/types';

/** ยาหนึ่งตัว: อ่านอย่างเดียว จนกว่าจะกดแก้ไข
 *  ตอนแก้ใช้สำเนาในเครื่อง แล้วบันทึกทีเดียวตอนกดเสร็จ — ถ้าบันทึกทุกตัวอักษร
 *  ข้อมูลจากคลาวด์จะไหลกลับมาทับสิ่งที่กำลังพิมพ์ และการ์ดจะหลุดจากตัวกรองกลางคัน */
function MedCard({ med, book, onFilterCleared }: {
  med: Medication; book: Book; onFilterCleared: () => void;
}) {
  const { state, actions } = useStore();
  const [draft, setDraft] = useState<Medication | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const options = medFieldOptions(state, book.id);
  const timing = mealTimingOf(med);
  const detail = [med.prescriber, med.tag, med.hospital].filter(Boolean).join(' · ');

  const set = (patch: Partial<Medication>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const pickDoctor = (name: string) => {
    const hospital = hospitalOfDoctor(state, book.id, name);
    set(hospital ? { prescriber: name, hospital } : { prescriber: name });
  };

  const save = () => {
    if (!draft) return;
    actions.updateMedication(med.id, {
      name: draft.name, helps: draft.helps, how_to_take: draft.how_to_take,
      prescriber: draft.prescriber, tag: draft.tag, hospital: draft.hospital,
      timing: draft.timing, slots: draft.slots,
    });
    setDraft(null);
    onFilterCleared();
  };

  return (
    <div className="o-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <h3>{med.name}</h3>
        {med.tag && <span className="o-tag sage" style={{ height: 'fit-content' }}>{med.tag}</span>}
      </div>
      {med.helps && (
        <p style={{ margin: '6px 0' }}>
          <strong style={{ color: 'var(--color-accent-700)' }}>ช่วยอะไร:</strong> {med.helps}
        </p>
      )}
      {med.how_to_take && <p className="subtle" style={{ margin: '2px 0 0' }}>{med.how_to_take}</p>}
      {detail && <p className="subtle" style={{ margin: '2px 0 0' }}>{detail}</p>}
      {med.slots.length > 0 && (
        <p className="subtle" style={{ margin: '2px 0 0' }}>
          มื้อ: {med.slots.map((s) => SLOT_LABEL[s]).join(' · ')}
          {timing && ` · ${MEAL_LABEL[timing]}`}
        </p>
      )}
      {med.duplicate_flag && (
        <p style={{ margin: '8px 0 0', color: 'var(--color-accent-700)', fontWeight: 600 }}>
          ⚑ ติดธงยาซ้ำ
        </p>
      )}

      {!draft && (
        <button type="button" className="o-btn ghost"
          style={{ marginTop: 12, padding: '8px 18px', minHeight: 38 }}
          onClick={() => { setDraft({ ...med }); setConfirmingDelete(false); }}>
          แก้ไข
        </button>
      )}

      {draft && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--color-neutral-200)', paddingTop: 4 }}>
          <label className="o-label" htmlFor={`md-name-${med.id}`}>ชื่อยา</label>
          <input id={`md-name-${med.id}`} className="o-input" value={draft.name}
            onChange={(e) => set({ name: e.target.value })} />

          <label className="o-label" htmlFor={`md-helps-${med.id}`}>ช่วยอะไร (ภาษาบ้านๆ)</label>
          <input id={`md-helps-${med.id}`} className="o-input" placeholder="เช่น ลดความดัน ขยายหลอดเลือด"
            value={draft.helps} onChange={(e) => set({ helps: e.target.value })} />

          <label className="o-label" htmlFor={`md-how-${med.id}`}>วิธีกิน</label>
          <input id={`md-how-${med.id}`} className="o-input" value={draft.how_to_take}
            onChange={(e) => set({ how_to_take: e.target.value })} />

          <ComboField id={`md-doc-${med.id}`} label="ชื่อหมอ" value={draft.prescriber}
            options={options.prescribers} placeholder="เลือกหมอ…" onChange={pickDoctor} />

          <ComboField id={`md-tag-${med.id}`} label="แผนก" value={draft.tag}
            options={options.tags} placeholder="เลือกแผนก…" onChange={(tag) => set({ tag })} />

          <ComboField id={`md-hosp-${med.id}`} label="โรงพยาบาล / คลินิก" value={draft.hospital}
            options={options.hospitals} placeholder="เลือกโรงพยาบาล…"
            onChange={(hospital) => set({ hospital })} />

          <label className="o-label">ก่อน / หลังอาหาร</label>
          <div className="o-chips">
            {MEAL_ORDER.filter((t) => t !== '').map((t) => (
              <button key={t} type="button" className="o-chip" aria-pressed={draft.timing === t}
                onClick={() => set({ timing: (draft.timing === t ? '' : t) as MealTiming })}>
                {MEAL_LABEL[t]}
              </button>
            ))}
          </div>

          <label className="o-label">มื้อที่ต้องกิน</label>
          <div className="o-chips">
            {SLOT_ORDER.map((slot: DoseSlot) => (
              <button key={slot} type="button" className="o-chip" aria-pressed={draft.slots.includes(slot)}
                onClick={() => set({
                  slots: draft.slots.includes(slot)
                    ? draft.slots.filter((x) => x !== slot)
                    : [...draft.slots, slot],
                })}>
                {SLOT_LABEL[slot]}
              </button>
            ))}
          </div>

          <div className="o-row" style={{ marginTop: 18 }}>
            <button type="button" className="o-btn ghost" onClick={() => setDraft(null)}>ยกเลิก</button>
            <button type="button" className="o-btn primary" onClick={save}>บันทึก</button>
          </div>

          {confirmingDelete ? (
            <>
              <p className="subtle" style={{ margin: '16px 0 8px' }}>
                เอา {med.name} ออกจากรายการ · ประวัติกินยาที่บันทึกไว้ยังเก็บอยู่
              </p>
              <div className="o-row">
                <button type="button" className="o-btn ghost" onClick={() => setConfirmingDelete(false)}>
                  ไม่ลบ
                </button>
                <button type="button" className="o-btn danger"
                  onClick={() => {
                    actions.removeMedication(med.id);
                    actions.toast(`เอา ${med.name} ออกแล้ว`);
                  }}>
                  ยืนยันลบ
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="o-btn ghost block" style={{ marginTop: 12 }}
              onClick={() => setConfirmingDelete(true)}>
              <Icon name="x" size={17} /> เอายานี้ออก
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function MedsScreen({ book, onScan, onAddMed }: {
  book: Book; onScan: () => void; onAddMed: () => void;
}) {
  const { state } = useStore();
  const [filter, setFilter] = useState('');

  const allMeds = state.medications.filter((m) => m.book_id === book.id);
  // จัดกลุ่มตามหมอที่สั่ง — ถ้าไม่ได้กรอกก็ใช้แผนกแทน
  const groupOf = (m: Medication) => m.prescriber || m.tag || 'ไม่ระบุ';
  const groups = Array.from(new Set(allMeds.map(groupOf))).sort();
  const meds = filter ? allMeds.filter((m) => groupOf(m) === filter) : allMeds;

  // เตือนยาซ้ำนับจากยาทั้งเล่มเสมอ ยาซ้ำข้ามหมอคือเคสที่อันตรายที่สุด
  // ถ้านับเฉพาะที่กรองอยู่ คำเตือนจะถูกตัวกรองบังหายไปพอดี
  const dupePairs = Array.from(
    allMeds.filter((m) => m.duplicate_flag).reduce((acc, m) => {
      const k = m.name.trim().split(/[\s\d]/)[0];
      acc.set(k, [...(acc.get(k) ?? []), m.name]);
      return acc;
    }, new Map<string, string[]>()).values(),
  );

  return (
    <div className="screen">
      <p className="kicker">Doolaekan</p>
      <h2>ยาของ{book.owner_name}</h2>
      <p className="subtle">
        {filter ? `${meds.length} จาก ${allMeds.length} รายการ · ${filter}` : `${allMeds.length} รายการ`}
      </p>

      {groups.length > 1 && (
        <div className="o-chips" style={{ marginTop: 12 }}>
          <button type="button" className="o-chip" aria-pressed={!filter} onClick={() => setFilter('')}>
            ทั้งหมด {allMeds.length}
          </button>
          {groups.map((g) => (
            <button key={g} type="button" className="o-chip" aria-pressed={filter === g}
              onClick={() => setFilter(filter === g ? '' : g)}>
              {g} {allMeds.filter((m) => groupOf(m) === g).length}
            </button>
          ))}
        </div>
      )}

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
          filter ? (
            <button type="button" className="o-empty" onClick={() => setFilter('')}>
              ไม่มียาของ {filter} — แตะเพื่อดูทั้งหมด
            </button>
          ) : (
            <button type="button" className="o-empty" onClick={onScan}>
              ยังไม่มียาในสมุด — แตะเพื่อสแกนถุงยา
            </button>
          )
        )}
        {meds.map((m) => (
          <MedCard key={m.id} med={m} book={book}
            onFilterCleared={() => {
              // แก้ชื่อหมอแล้วยาอาจหลุดจากตัวกรอง จนดูเหมือนการ์ดหายไปเฉยๆ
              if (filter) setFilter('');
            }} />
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
