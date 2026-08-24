'use client';

import React, { useState } from 'react';
import { Icon } from '../Icon';
import { MEAL_LABEL, MEAL_ORDER, SLOT_LABEL, SLOT_ORDER } from '@/lib/format';
import { mealTimingOf } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { Book, DoseSlot } from '@/lib/types';

export function MedsScreen({ book, onScan, onAddMed }: {
  book: Book; onScan: () => void; onAddMed: () => void;
}) {
  const { state, actions } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const allMeds = state.medications.filter((m) => m.book_id === book.id);
  // แท็กที่กรอกไว้เอง ถ้าไม่ได้กรอกก็ใช้ชื่อหมอที่สั่งแทน
  const groupOf = (m: { tag: string; prescriber: string }) => m.tag || m.prescriber || 'ไม่ระบุ';
  const groups = Array.from(new Set(allMeds.map(groupOf))).sort();
  const meds = filter ? allMeds.filter((m) => groupOf(m) === filter) : allMeds;
  const dupes = allMeds.filter((m) => m.duplicate_flag);

  // จัดกลุ่มยาซ้ำตามตัวยาหลัก เพื่อบอกเป็นคู่ว่าอะไรซ้ำกับอะไร
  const dupePairs = Array.from(
    dupes.reduce((acc, m) => {
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

      {/* กรองตามหมอ/แผนก — เตรียมไปหาหมอคนไหน ก็ดูเฉพาะยาของหมอคนนั้น */}
      {groups.length > 1 && (
        <div className="o-chips" style={{ marginTop: 12 }}>
          <button type="button" className="o-chip" aria-pressed={!filter}
            onClick={() => setFilter('')}>
            ทั้งหมด {allMeds.length}
          </button>
          {groups.map((g) => (
            <button key={g} type="button" className="o-chip" aria-pressed={filter === g}
              onClick={() => { setFilter(filter === g ? '' : g); setEditingId(null); }}>
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
        {meds.map((m) => {
          const isEditing = editingId === m.id;
          const isConfirmingDelete = deletingId === m.id;
          const toggleSlot = (slot: DoseSlot) => actions.updateMedication(m.id, {
            slots: m.slots.includes(slot) ? m.slots.filter((x) => x !== slot) : [...m.slots, slot],
          });
          return (
            <div key={m.id} className="o-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <h3>{m.name}</h3>
                {m.tag && (
                  <button type="button" className="o-tag sage"
                    style={{ height: 'fit-content', border: 0, cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: 600 }}
                    title={`ดูเฉพาะยาของ ${m.tag}`}
                    onClick={() => { setFilter(filter === m.tag ? '' : m.tag); setEditingId(null); }}>
                    {m.tag}
                  </button>
                )}
              </div>
              {m.helps && (
                <p style={{ margin: '6px 0' }}>
                  <strong style={{ color: 'var(--color-accent-700)' }}>ช่วยอะไร:</strong> {m.helps}
                </p>
              )}
              <p className="subtle" style={{ margin: '2px 0 0' }}>
                {[m.how_to_take, m.prescriber].filter(Boolean).join(' · ')}
              </p>
              {m.slots.length > 0 && (
                <p className="subtle" style={{ margin: '2px 0 0' }}>
                  มื้อ: {m.slots.map((s) => SLOT_LABEL[s]).join(' · ')}
                  {mealTimingOf(m) && ` · ${MEAL_LABEL[mealTimingOf(m)]}`}
                </p>
              )}
              {m.duplicate_flag && (
                <p style={{ margin: '8px 0 0', color: 'var(--color-accent-700)', fontWeight: 600 }}>
                  ⚑ ติดธงยาซ้ำ
                </p>
              )}

              <button type="button" className="o-btn ghost" style={{ marginTop: 12, padding: '8px 18px', minHeight: 38 }}
                onClick={() => { setEditingId(isEditing ? null : m.id); setDeletingId(null); }}>
                {isEditing ? 'เสร็จ' : 'แก้ไข'}
              </button>

              {isEditing && (
                <div style={{ marginTop: 4 }}>
                  <label className="o-label" htmlFor={`md-name-${m.id}`}>ชื่อยา</label>
                  <input id={`md-name-${m.id}`} className="o-input" value={m.name}
                    onChange={(e) => actions.updateMedication(m.id, { name: e.target.value })} />

                  <label className="o-label" htmlFor={`md-helps-${m.id}`}>ช่วยอะไร (ภาษาบ้านๆ)</label>
                  <input id={`md-helps-${m.id}`} className="o-input" placeholder="เช่น ลดความดัน ขยายหลอดเลือด"
                    value={m.helps}
                    onChange={(e) => actions.updateMedication(m.id, { helps: e.target.value })} />

                  <label className="o-label" htmlFor={`md-how-${m.id}`}>วิธีกิน</label>
                  <input id={`md-how-${m.id}`} className="o-input" value={m.how_to_take}
                    onChange={(e) => actions.updateMedication(m.id, { how_to_take: e.target.value })} />

                  <label className="o-label" htmlFor={`md-doc-${m.id}`}>หมอที่สั่ง</label>
                  <input id={`md-doc-${m.id}`} className="o-input" value={m.prescriber}
                    onChange={(e) => actions.updateMedication(m.id, { prescriber: e.target.value })} />

                  <label className="o-label" htmlFor={`md-tag-${m.id}`}>แผนก</label>
                  <input id={`md-tag-${m.id}`} className="o-input" placeholder="เช่น หัวใจ / ตา / เบาหวาน"
                    value={m.tag}
                    onChange={(e) => actions.updateMedication(m.id, { tag: e.target.value })} />

                  <label className="o-label">ก่อน / หลังอาหาร</label>
                  <div className="o-chips">
                    {MEAL_ORDER.filter((t) => t !== '').map((t) => (
                      <button key={t} type="button" className="o-chip"
                        aria-pressed={mealTimingOf(m) === t}
                        onClick={() => actions.updateMedication(m.id, {
                          timing: mealTimingOf(m) === t ? '' : t,
                        })}>
                        {MEAL_LABEL[t]}
                      </button>
                    ))}
                  </div>

                  <label className="o-label">มื้อที่ต้องกิน</label>
                  <div className="o-chips">
                    {SLOT_ORDER.map((slot) => (
                      <button key={slot} type="button" className="o-chip"
                        aria-pressed={m.slots.includes(slot)} onClick={() => toggleSlot(slot)}>
                        {SLOT_LABEL[slot]}
                      </button>
                    ))}
                  </div>

                  {isConfirmingDelete ? (
                    <>
                      <p className="subtle" style={{ margin: '14px 0 8px' }}>
                        เอา {m.name} ออกจากรายการ · ประวัติกินยาที่บันทึกไว้ยังเก็บอยู่
                      </p>
                      <div className="o-row">
                        <button type="button" className="o-btn ghost" onClick={() => setDeletingId(null)}>
                          ไม่ลบ
                        </button>
                        <button type="button" className="o-btn danger"
                          onClick={() => {
                            actions.removeMedication(m.id);
                            setDeletingId(null);
                            setEditingId(null);
                            actions.toast(`เอา ${m.name} ออกแล้ว`);
                          }}>
                          ยืนยันลบ
                        </button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="o-btn ghost block" style={{ marginTop: 14 }}
                      onClick={() => setDeletingId(m.id)}>
                      <Icon name="x" size={17} /> เอายานี้ออก
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
