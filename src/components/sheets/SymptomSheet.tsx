'use client';

import React, { useMemo, useState } from 'react';
import { Sheet } from '../Sheet';
import { Chips } from '../Chips';
import { Icon } from '../Icon';
import { SYMPTOM_CHIPS } from '@/lib/seed';
import { matchWatchRules } from '@/lib/selectors';
import { useStore } from '@/lib/store';

export function SymptomSheet({ open, bookId, onClose }: {
  open: boolean; bookId: string; onClose: () => void;
}) {
  const { state, actions } = useStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');

  // อาการที่หมอสั่งให้เฝ้าระวังของสมุดเล่มนี้ ต้องกดได้ด้วย ไม่ใช่มีแต่รายการมาตรฐาน
  // เอาขึ้นก่อน เพราะเป็นอาการที่ต้องรีบรู้ที่สุด
  const chips = useMemo(() => {
    const watched = state.watchRules
      .filter((w) => w.book_id === bookId)
      .flatMap((w) => w.triggers)
      .map((t) => t.trim())
      .filter(Boolean);
    return Array.from(new Set([...watched, ...SYMPTOM_CHIPS]));
  }, [state.watchRules, bookId]);

  const hits = matchWatchRules(state, bookId, selected);

  const close = () => { setSelected([]); setNote(''); onClose(); };

  const save = () => {
    if (!selected.length && !note.trim()) return;
    actions.addRecord(bookId, {
      kind: 'symptom',
      title: `อาการ: ${selected.join(' · ') || 'บันทึกเพิ่มเติม'}`,
      body: note.trim(),
      data: { tags: selected },
      important: hits.length > 0,
    });
    actions.toast(hits.length ? 'บันทึกแล้ว — แจ้งเตือนทุกคนในกลุ่มด่วน' : 'จดอาการแล้ว ทุกคนเห็นทันที');
    close();
  };

  return (
    <Sheet open={open} title="จดอาการวันนี้" onClose={close}>
      <Chips
        options={chips}
        selected={selected}
        onToggle={(v) => setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
      />

      <label className="o-label" htmlFor="sym-note">เพิ่มเติม (พิมพ์เองได้)</label>
      <textarea id="sym-note" className="o-textarea" value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="เช่น เวียนหัวตอนลุกจากเตียง หายเองช่วงสาย" />

      {hits.length > 0 && (
        <div className="o-card dark" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <Icon name="alert" size={21} color="var(--color-accent-400)" />
            <strong>เข้าข้อเฝ้าระวัง</strong>
          </div>
          {hits.map((w) => (
            <p key={w.id} style={{ margin: '4px 0' }}>
              {w.triggers.join(' / ')} → {w.action}
              <span className="subtle" style={{ color: 'var(--color-accent-300)' }}> ({w.source})</span>
            </p>
          ))}
          <div className="o-row" style={{ marginTop: 12 }}>
            <a className="o-btn primary" href="tel:1669" style={{ textDecoration: 'none' }}>
              <Icon name="phone" size={19} /> โทรหาโรงพยาบาล
            </a>
            <button type="button" className="o-btn secondary"
              onClick={() => actions.toast('แจ้งพี่น้องทุกคนแล้ว')}>
              แจ้งพี่น้องทุกคน
            </button>
          </div>
        </div>
      )}

      <button type="button" className="o-btn primary block" style={{ marginTop: 16 }}
        disabled={!selected.length && !note.trim()} onClick={save}>
        บันทึกอาการ
      </button>
    </Sheet>
  );
}
