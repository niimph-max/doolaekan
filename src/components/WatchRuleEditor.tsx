'use client';

import React, { useState } from 'react';
import { Icon } from './Icon';
import { SYMPTOM_CHIPS } from '@/lib/seed';
import { useStore } from '@/lib/store';
import type { Book, WatchRule } from '@/lib/types';

const BLANK = { triggers: [] as string[], action: '', source: '', severity: 'urgent' as const };

/** ข้อเฝ้าระวังประจำตัว — "เคืองตา/เจ็บตา → พบหมอทันที (หมอตาสั่งไว้)"
 *  ตอนจดอาการ ถ้าตรงกับข้อไหนแอปจะเตือนด่วนทันทีพร้อมปุ่มโทร รพ.
 *  เดิมมีแต่ในข้อมูลตัวอย่าง ผู้ใช้จริงเพิ่มเองไม่ได้เลย */
export function WatchRuleEditor({ book }: { book: Book }) {
  const { state, actions } = useStore();
  const rules = state.watchRules.filter((w) => w.book_id === book.id);
  const doctors = state.doctors.filter((d) => d.book_id === book.id);

  const [draft, setDraft] = useState<Omit<WatchRule, 'id' | 'book_id'>>({ ...BLANK });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [customSymptom, setCustomSymptom] = useState('');
  const [adding, setAdding] = useState(false);

  const current = editingId ? rules.find((r) => r.id === editingId) : null;
  const value = current ?? draft;

  const set = (patch: Partial<WatchRule>) => {
    if (editingId) actions.updateWatchRule(editingId, patch);
    else setDraft((d) => ({ ...d, ...patch }));
  };

  const toggleTrigger = (symptom: string) => {
    const has = value.triggers.includes(symptom);
    set({ triggers: has ? value.triggers.filter((t) => t !== symptom) : [...value.triggers, symptom] });
  };

  const addCustom = () => {
    const s = customSymptom.trim();
    if (!s || value.triggers.includes(s)) return;
    set({ triggers: [...value.triggers, s] });
    setCustomSymptom('');
  };

  const saveNew = () => {
    if (!draft.triggers.length || !draft.action.trim()) return;
    actions.addWatchRule(book.id, { ...draft, action: draft.action.trim(), source: draft.source.trim() });
    actions.toast('เพิ่มข้อเฝ้าระวังแล้ว');
    setDraft({ ...BLANK });
    setAdding(false);
  };

  const form = (
    <>
      <label className="o-label">อาการที่ต้องเฝ้าระวัง (เลือกได้หลายอย่าง)</label>
      <div className="o-chips">
        {Array.from(new Set([...SYMPTOM_CHIPS, ...value.triggers])).map((s) => (
          <button key={s} type="button" className="o-chip" aria-pressed={value.triggers.includes(s)}
            onClick={() => toggleTrigger(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="o-row" style={{ marginTop: 10 }}>
        <input className="o-input" placeholder="อาการอื่น เช่น ตัวบวม"
          value={customSymptom}
          onChange={(e) => setCustomSymptom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
        <button type="button" className="o-btn secondary" style={{ flex: '0 0 auto' }}
          disabled={!customSymptom.trim()} onClick={addCustom}>
          เพิ่ม
        </button>
      </div>

      <label className="o-label">ถ้าเกิดอาการนี้ ต้องทำอะไร</label>
      <input className="o-input" placeholder="เช่น พบหมอทันที ห้ามรอ / โทร 1669"
        value={value.action} onChange={(e) => set({ action: e.target.value })} />

      <label className="o-label">ใครสั่งไว้</label>
      {doctors.length > 0 ? (
        <select className="o-select" value={value.source}
          onChange={(e) => set({ source: e.target.value })}>
          <option value="">ไม่ระบุ</option>
          {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      ) : (
        <input className="o-input" placeholder="เช่น หมอตาสั่งไว้"
          value={value.source} onChange={(e) => set({ source: e.target.value })} />
      )}

      <label className="o-label">ระดับความเร่งด่วน</label>
      <div className="o-chips">
        <button type="button" className="o-chip" aria-pressed={value.severity === 'urgent'}
          onClick={() => set({ severity: 'urgent' })}>
          ด่วน — เตือนทันที
        </button>
        <button type="button" className="o-chip" aria-pressed={value.severity === 'note'}
          onClick={() => set({ severity: 'note' })}>
          จดไว้เล่าหมอ
        </button>
      </div>
    </>
  );

  return (
    <>
      <h3 style={{ fontSize: 19, margin: '22px 0 4px' }}>ข้อเฝ้าระวังพิเศษ</h3>
      <p className="subtle" style={{ marginBottom: 10 }}>
        จดอาการที่ตรงกับข้อเหล่านี้เมื่อไหร่ แอปจะเตือนทันทีและแจ้งทุกคนในกลุ่ม
      </p>

      {rules.length === 0 && !adding && (
        <p className="subtle">ยังไม่มีข้อเฝ้าระวัง</p>
      )}

      {rules.map((r) => {
        const isEditing = editingId === r.id;
        const isConfirming = deletingId === r.id;
        return (
          <div key={r.id} className="o-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ color: r.severity === 'urgent' ? 'var(--color-accent-700)' : 'var(--color-accent-2-700)' }}>
                  {r.triggers.join(' / ') || 'ยังไม่ได้เลือกอาการ'}
                </strong>
                <div>→ {r.action || 'ยังไม่ได้ระบุว่าต้องทำอะไร'}</div>
                <div className="subtle">
                  {[r.source, r.severity === 'urgent' ? 'ด่วน' : 'จดไว้เล่าหมอ'].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button type="button" className="o-btn ghost" style={{ padding: '6px 14px', minHeight: 34 }}
                onClick={() => { setEditingId(isEditing ? null : r.id); setDeletingId(null); setAdding(false); }}>
                {isEditing ? 'เสร็จ' : 'แก้ไข'}
              </button>
            </div>

            {isEditing && (
              <div style={{ marginTop: 12 }}>
                {form}
                {isConfirming ? (
                  <div className="o-row" style={{ marginTop: 14 }}>
                    <button type="button" className="o-btn ghost" onClick={() => setDeletingId(null)}>ไม่ลบ</button>
                    <button type="button" className="o-btn danger"
                      onClick={() => {
                        actions.removeWatchRule(r.id);
                        setDeletingId(null);
                        setEditingId(null);
                        actions.toast('ลบข้อเฝ้าระวังแล้ว');
                      }}>
                      ยืนยันลบ
                    </button>
                  </div>
                ) : (
                  <button type="button" className="o-btn ghost block" style={{ marginTop: 14 }}
                    onClick={() => setDeletingId(r.id)}>
                    <Icon name="x" size={17} /> ลบข้อนี้
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <div className="o-card" style={{ padding: 16 }}>
          {form}
          <div className="o-row" style={{ marginTop: 16 }}>
            <button type="button" className="o-btn ghost"
              onClick={() => { setAdding(false); setDraft({ ...BLANK }); }}>
              ยกเลิก
            </button>
            <button type="button" className="o-btn primary"
              disabled={!draft.triggers.length || !draft.action.trim()} onClick={saveNew}>
              เพิ่มข้อนี้
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="o-btn secondary block" style={{ marginTop: 10 }}
          onClick={() => { setAdding(true); setEditingId(null); }}>
          <Icon name="plus" size={19} /> เพิ่มข้อเฝ้าระวัง
        </button>
      )}
    </>
  );
}
