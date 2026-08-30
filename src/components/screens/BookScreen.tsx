'use client';

import React, { useState } from 'react';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Kicker } from '../Kicker';
import { daysUntil, fmtDate, fmtShortDate, fmtTime } from '@/lib/format';
import {
  SHARE_LABEL, bookRecords, bookSummary, bookVaccines, bookWatchRules, bpHistory,
  isVaccine, shareLevel, vaccineDateLabel, visibleBooks,
} from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { Book, RecordItem, RecordKind, ShareLevel } from '@/lib/types';

const FILTERS: { id: 'all' | RecordKind; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'symptom', label: 'อาการ' },
  { id: 'bp', label: 'ความดัน' },
  { id: 'doc', label: 'เอกสาร' },
];

// exercise/food/note อยู่แท็บกิจกรรม ไม่โผล่ในไทม์ไลน์นี้ แต่ต้องมีสีไว้กันพลาด
// เผื่อวันหลังเปิดให้แสดงร่วมกัน จะได้ไม่กลายเป็นจุดไม่มีสี
const DOT: Record<RecordKind, string> = {
  doc: 'var(--color-accent)',
  visit: 'var(--color-accent-2)',
  bp: 'var(--color-accent-2)',
  symptom: 'var(--color-neutral-400)',
  exercise: 'var(--color-neutral-400)',
  food: 'var(--color-neutral-400)',
  note: 'var(--color-neutral-400)',
};

export function BookScreen({
  book, onOpenGroup, onOpenProfile, onAddDoc,
  onAddVaccine, onEditVaccine, onAddApptFromVaccine,
}: {
  book: Book;
  onOpenGroup: () => void;
  onOpenProfile: () => void;
  onAddDoc: () => void;
  onAddVaccine: () => void;
  onEditVaccine: (rec: RecordItem) => void;
  onAddApptFromVaccine: (rec: RecordItem) => void;
}) {
  const { state, actions } = useStore();
  const [filter, setFilter] = useState<'all' | RecordKind>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const group = state.groups.find((g) => g.id === state.activeGroupId);
  const books = visibleBooks(state);
  const rules = bookWatchRules(state, book.id);
  const bps = bpHistory(state, book.id);
  const vaccines = bookVaccines(state, book.id);
  const records = bookRecords(state, book.id)
    // วัคซีนมีรายการถาวรของตัวเองข้างบนแล้ว ไม่ต้องมาซ้ำในไทม์ไลน์
    .filter((r) => !isVaccine(r))
    .filter((r) => (filter === 'all' ? true : r.kind === filter));
  const maxSys = Math.max(160, ...bps.map((r) => r.data?.sys ?? 0));
  const myLevel = shareLevel(state, book.id);

  return (
    <div className="screen">
      <Kicker book={book} />
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
          <Avatar book={b} size={46} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: 'block' }}>{b.owner_name}{b.is_mine ? ' (ฉัน)' : ''}</strong>
            <span className="subtle">{bookSummary(state, b.id)}</span>
          </span>
          <span className="o-tag">{SHARE_LABEL[shareLevel(state, b.id)]}</span>
        </button>
      ))}

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

      {/* ── วัคซีนที่เคยฉีด ──
          ข้อมูลตลอดชีวิต ไม่ใช่บันทึกประจำวัน จึงอยู่แบบเห็นตลอดเหมือนข้อเฝ้าระวัง
          ไม่ใช่ไหลลงไปในไทม์ไลน์ที่อีกสองปีก็เลื่อนหาไม่เจอ */}
      <div className="o-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>วัคซีนที่เคยฉีด</h3>
          <button type="button" className="o-btn ghost" onClick={onAddVaccine}>
            <Icon name="plus" size={17} /> ลงเข็ม
          </button>
        </div>

        {vaccines.length === 0 ? (
          <p className="subtle" style={{ margin: '10px 0 0' }}>
            ยังไม่ได้ลงไว้ — จำได้แค่ปีก็ลงได้
          </p>
        ) : (
          vaccines.map((v) => {
            const due = v.data?.vaccine?.next_due;
            const overdue = Boolean(due) && daysUntil(due!) < 0;
            const soon = Boolean(due) && !overdue && daysUntil(due!) <= 60;
            return (
              <div key={v.id} style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong>{v.data!.vaccine!.name}</strong>
                  {v.data?.vaccine?.dose && <span className="o-tag">{v.data.vaccine.dose}</span>}
                </div>
                <p className="subtle" style={{ margin: '2px 0 0' }}>
                  {vaccineDateLabel(v)}
                  {v.data?.vaccine?.place ? ` · ${v.data.vaccine.place}` : ''}
                </p>
                {due && (
                  <p style={{
                    margin: '4px 0 0',
                    color: overdue || soon ? 'var(--color-accent-700)' : 'var(--color-neutral-700)',
                  }}>
                    {overdue ? 'เลยกำหนดครั้งหน้าแล้ว' : 'ครบกำหนดครั้งหน้า'} {fmtDate(due)}
                    {' '}
                    <button type="button" className="o-btn ghost"
                      onClick={() => onAddApptFromVaccine(v)}>
                      ตั้งเป็นนัด
                    </button>
                  </p>
                )}
                <div className="o-row" style={{ marginTop: 8 }}>
                  <button type="button" className="o-btn ghost" onClick={() => onEditVaccine(v)}>
                    แก้ไข
                  </button>
                  <button type="button" className="o-btn ghost"
                    onClick={() => {
                      if (confirmDelete === v.id) {
                        actions.removeRecords([v.id]);
                        actions.toast('ลบแล้ว');
                        setConfirmDelete(null);
                      } else {
                        setConfirmDelete(v.id);
                      }
                    }}>
                    {confirmDelete === v.id ? 'แน่ใจนะ? กดอีกครั้งเพื่อลบ' : 'ลบ'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

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
                <RecordPhoto record={r} />
              </div>
            </div>
          </div>
        ))
      )}

      <button type="button" className="o-btn primary block" style={{ marginTop: 10 }}
        onClick={onAddDoc}>
        <Icon name="camera" size={20} /> เก็บเอกสารจากหมอ
      </button>
      <p className="subtle" style={{ margin: '8px 0 0', textAlign: 'center' }}>
        ผลตรวจเลือด ผลตรวจตา — ใส่วันที่บนใบจริงได้ เอกสารเก่าจะได้เรียงถูกที่
      </p>
    </div>
  );
}

/** รูปในไทม์ไลน์ — ดึงตอนกดดูเท่านั้น
 *  สำเนาในเครื่องเก็บแต่ที่อยู่ของรูป ไม่เก็บตัวรูป การไม่ดึงรูปล่วงหน้าคือเหตุผล
 *  ที่เปิดแอปได้เร็ว ส่วนใหญ่เลื่อนผ่านไทม์ไลน์เฉยๆ ไม่ได้เปิดดูรูปทุกใบ */
function RecordPhoto({ record }: { record: RecordItem }) {
  const { actions } = useStore();
  const [loading, setLoading] = useState(false);

  if (record.file) {
    return (
      <a href={record.file} target="_blank" rel="noreferrer">
        <img src={record.file} alt={record.title} className="scan-img" />
      </a>
    );
  }
  if (!record.file_path) return null;

  return (
    <button type="button" className="o-btn ghost block" style={{ marginTop: 8 }} disabled={loading}
      onClick={async () => {
        setLoading(true);
        await actions.loadPhoto(record.file_path as string);
        setLoading(false);
      }}>
      <Icon name="camera" size={17} /> {loading ? 'กำลังเปิด…' : 'ดูรูปที่แนบไว้'}
    </button>
  );
}
