'use client';

import React, { useRef, useState } from 'react';
import { Icon } from '../Icon';
import { fmtShortDate, fmtTime } from '@/lib/format';
import {
  SHARE_LABEL, bookRecords, bookSummary, bookWatchRules, bpHistory, shareLevel, visibleBooks,
} from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { Book, RecordKind, ShareLevel } from '@/lib/types';

const FILTERS: { id: 'all' | RecordKind; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'symptom', label: 'อาการ' },
  { id: 'bp', label: 'ความดัน' },
  { id: 'doc', label: 'เอกสาร' },
];

const DOT: Record<RecordKind, string> = {
  doc: 'var(--color-accent)',
  visit: 'var(--color-accent-2)',
  bp: 'var(--color-accent-2)',
  symptom: 'var(--color-neutral-400)',
};

export function BookScreen({ book, onOpenGroup, onOpenProfile }: {
  book: Book; onOpenGroup: () => void; onOpenProfile: () => void;
}) {
  const { state, actions } = useStore();
  const [filter, setFilter] = useState<'all' | RecordKind>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const group = state.groups.find((g) => g.id === state.activeGroupId);
  const books = visibleBooks(state);
  const rules = bookWatchRules(state, book.id);
  const bps = bpHistory(state, book.id);
  const records = bookRecords(state, book.id)
    .filter((r) => (filter === 'all' ? true : r.kind === filter));
  const maxSys = Math.max(160, ...bps.map((r) => r.data?.sys ?? 0));
  const myLevel = shareLevel(state, book.id);

  const onScanDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      actions.addRecord(book.id, {
        kind: 'doc', title: 'เอกสารจากหมอ', body: f.name, file: String(reader.result), important: true,
      });
      actions.toast('เก็บเอกสารเข้าไทม์ไลน์แล้ว');
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  return (
    <div className="screen">
      <p className="kicker">Doolaekan</p>
      <h2>สมุดสุขภาพ</h2>

      <div className="o-row" style={{ marginTop: 10 }}>
        <button type="button" className="o-btn ghost" onClick={onOpenGroup}>
          {group?.name ?? 'ยังไม่อยู่กลุ่ม'} <Icon name="chevron" size={17} />
        </button>
        <button type="button" className="o-btn secondary" onClick={onOpenProfile}>
          <Icon name="user" size={18} /> โปรไฟล์ &amp; หมอ
        </button>
      </div>

      {/* สมุดในกลุ่ม */}
      <h3 style={{ fontSize: 19, margin: '22px 0 10px' }}>สมุดในกลุ่มนี้</h3>
      {books.map((b) => (
        <button key={b.id} type="button" className="o-card"
          onClick={() => actions.setActiveBook(b.id)}
          style={{
            display: 'flex', width: '100%', gap: 12, alignItems: 'center', cursor: 'pointer',
            textAlign: 'left',
            border: b.id === book.id ? '2px solid var(--color-accent)' : '1.5px solid transparent',
          }}>
          <span className="ph" style={{ width: 46, height: 46 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: 'block' }}>{b.owner_name}{b.is_mine ? ' (ฉัน)' : ''}</strong>
            <span className="subtle">{bookSummary(state, b.id)}</span>
          </span>
          <span className="o-tag">{SHARE_LABEL[shareLevel(state, b.id)]}</span>
        </button>
      ))}

      <AddBookRow />

      {/* สิทธิ์การเห็น */}
      <div className="o-card">
        <h3>สิทธิ์การเห็นในกลุ่มนี้</h3>
        <p className="subtle" style={{ marginTop: 2 }}>
          สมุดของ{book.owner_name}ตอนนี้: <strong>{SHARE_LABEL[myLevel]}</strong>
        </p>
        <div className="o-chips" style={{ marginTop: 10 }}>
          {(['full', 'appointments', 'none'] as ShareLevel[]).map((lv) => (
            <button key={lv} type="button" className="o-chip" aria-pressed={myLevel === lv}
              onClick={() => {
                actions.setShareLevel(book.id, lv);
                actions.toast(`ตั้งสิทธิ์เป็น "${SHARE_LABEL[lv]}" แล้ว`);
              }}>
              {lv === 'full' ? 'ทั้งหมด' : lv === 'appointments' ? 'เฉพาะวันนัด' : 'ยังไม่แชร์'}
            </button>
          ))}
        </div>
      </div>

      {/* ข้อเฝ้าระวัง */}
      {rules.length > 0 && (
        <div className="o-card">
          <h3>ข้อเฝ้าระวังของ{book.owner_name}</h3>
          {rules.map((w) => (
            <p key={w.id} style={{ margin: '8px 0 0', color: w.severity === 'urgent' ? 'var(--color-accent-700)' : 'var(--color-accent-2-700)' }}>
              {w.triggers.join(' / ')} → {w.action}
              <span className="subtle" style={{ display: 'block' }}>{w.source}</span>
            </p>
          ))}
        </div>
      )}

      {/* กราฟความดัน */}
      {bps.length > 0 && (
        <div className="o-card">
          <h3>ความดันย้อนหลัง {bps.length} ครั้ง</h3>
          <div className="bp-bars" style={{ marginTop: 12 }}>
            {bps.map((r) => {
              const sys = r.data?.sys ?? 0;
              const high = sys >= 140;
              return (
                <div key={r.id} className="bp-bar">
                  <span style={{ fontSize: 13, fontWeight: 700, color: high ? 'var(--color-accent-600)' : 'var(--color-accent-2-700)' }}>
                    {sys}
                  </span>
                  <i style={{
                    height: `${Math.max(12, (sys / maxSys) * 100)}px`,
                    background: high ? 'var(--color-accent-600)' : 'var(--color-accent-2)',
                  }} />
                  <span className="subtle" style={{ fontSize: 11 }}>{fmtShortDate(r.at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ไทม์ไลน์ */}
      <h3 style={{ fontSize: 19, margin: '22px 0 10px' }}>ไทม์ไลน์</h3>
      <div className="o-chips" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="o-chip" aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {records.length === 0 ? (
        <p className="subtle" style={{ textAlign: 'center', padding: '18px 0' }}>ยังไม่มีบันทึกในหมวดนี้</p>
      ) : (
        records.map((r) => (
          <div key={r.id} className="tl-item">
            <span className="tl-dot" style={{ background: r.important ? 'var(--color-accent)' : DOT[r.kind] }} />
            <div>
              <div className="o-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{r.title}</strong>
                  <span className="subtle" style={{ whiteSpace: 'nowrap' }}>{fmtShortDate(r.at)}</span>
                </div>
                {r.body && <p style={{ margin: '4px 0 0' }}>{r.body}</p>}
                <p className="subtle" style={{ margin: '4px 0 0' }}>
                  {fmtTime(r.at)} น. · {r.actor_name}บันทึก
                </p>
                {}
                {r.file && <img src={r.file} alt={r.title} className="scan-img" />}
              </div>
            </div>
          </div>
        ))
      )}

      <button type="button" className="o-btn primary block" style={{ marginTop: 10 }}
        onClick={() => fileRef.current?.click()}>
        <Icon name="camera" size={20} /> สแกนเอกสารจากหมอ
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        onChange={onScanDoc} style={{ display: 'none' }} />
    </div>
  );
}

/** เปิดสมุดให้คนที่ไม่ได้ใช้แอปเอง — พ่อแม่หลายท่านไม่ถนัดมือถือ
 *  หรือไม่มีอีเมลของตัวเอง แต่ยังต้องมีสมุดยาและนัดหมอเป็นของตัวเอง */
function AddBookRow() {
  const { actions } = useStore();
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="o-btn ghost block" style={{ marginTop: 12 }}
        onClick={() => setOpen(true)}>
        <Icon name="plus" size={19} /> เพิ่มสมุดของคนอื่น
      </button>
    );
  }

  const save = () => {
    if (!name.trim()) return;
    actions.addBook(name);
    actions.toast(`เปิดสมุดของ${name.trim()}แล้ว`);
    setName('');
    setOpen(false);
  };

  return (
    <div className="o-card" style={{ marginTop: 12 }}>
      <label className="o-label" style={{ marginTop: 0 }} htmlFor="new-book-name">
        เรียกคนนี้ว่าอะไร
      </label>
      <input id="new-book-name" className="o-input" placeholder="เช่น แม่, ย่า, คุณตา"
        value={name} onChange={(e) => setName(e.target.value)} />
      <p className="subtle" style={{ margin: '8px 0 0' }}>
        คนนี้ไม่ต้องมีอีเมลหรือเข้าแอปเอง คุณดูแลสมุดให้ได้เลย
        และทุกคนในกลุ่มจะเห็นสมุดเล่มนี้ด้วย
      </p>
      <div className="o-row" style={{ marginTop: 12 }}>
        <button type="button" className="o-btn ghost" onClick={() => { setOpen(false); setName(''); }}>
          ยกเลิก
        </button>
        <button type="button" className="o-btn primary" disabled={!name.trim()} onClick={save}>
          เปิดสมุด
        </button>
      </div>
    </div>
  );
}
