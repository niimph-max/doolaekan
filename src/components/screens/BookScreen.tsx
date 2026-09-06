'use client';

import React, { useState } from 'react';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Kicker } from '../Kicker';
import { bpRecordFields, daysUntil, fmtDate, fmtShortDate, fmtTime, isPdf } from '@/lib/format';
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
  { id: 'doc', label: 'พบหมอ/เอกสาร' },
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

      {/* ── ปุ่มบันทึกการพบหมอต้องอยู่บนไทม์ไลน์ ไม่ใช่ใต้ ──
          เดิมอยู่ล่างสุดของหน้า ต้องเลื่อนผ่านบันทึกทั้งหมดกว่าจะเจอ ซึ่งยิ่งใช้
          ไปนานวันยิ่งไกลขึ้นเรื่อยๆ ไม่มีวันสั้นลง ผู้ใช้บอกตรงๆ ว่าหายากมาก
          ปุ่มที่ต้องกดบ่อยต้องอยู่ที่เดิมเสมอ ไม่ใช่ขยับหนีไปตามจำนวนข้อมูล */}
      <h3 style={{ fontSize: 19, margin: '22px 0 10px' }}>ไทม์ไลน์</h3>
      <button type="button" className="o-btn primary block" onClick={onAddDoc}>
        <Icon name="camera" size={20} /> พบหมอ / เอกสาร
      </button>
      <p className="subtle" style={{ margin: '8px 0 14px', textAlign: 'center' }}>
        ไปหาหมอ ฉีดยา ทำแผล หรือเก็บผลตรวจ — ไม่มีรูปก็บันทึกได้
      </p>

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
              <TimelineCard record={r} />
            </div>
          </div>
        ))
      )}

    </div>
  );
}

/** การ์ดหนึ่งใบในไทม์ไลน์ พร้อมทางแก้เมื่อจดผิด
 *
 *  ที่ต้องมี เพราะเรื่องนี้เกิดขึ้นจริงแล้ว: คนในบ้านเปิดสมุดค้างไว้เล่มหนึ่ง
 *  แล้วจดความดันของตัวเองลงไป กว่าจะรู้ตัวก็บันทึกไปแล้ว และไม่มีทางเอาออก
 *  ค่าที่ผิดจะอยู่ในไทม์ไลน์ของอีกคนตลอดไป ปนอยู่กับค่าจริงจนกราฟเพี้ยนตาม
 *  — ของที่ "แก้ไม่ได้เลย" อันตรายกว่าของที่ "แก้ได้แต่ต้องยืนยันก่อน" มาก
 *
 *  ใครที่เห็นสมุดเล่มนี้แบบเต็มระดับก็แก้และลบได้ ตรงกับกติกาสิทธิ์ฝั่งฐานข้อมูล
 *  (records_rw ใช้ can_access_book ระดับ full) ไม่ได้จำกัดแค่คนที่จดเอง เพราะ
 *  คนที่จดผิดอาจเป็นคนที่ไม่ถนัดแก้เอง แล้วต้องรอให้ลูกหลานมาช่วย */
function TimelineCard({ record: r }: { record: RecordItem }) {
  const { actions } = useStore();
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');

  const [title, setTitle] = useState(r.title);
  const [body, setBody] = useState(r.body);
  const [sys, setSys] = useState(String(r.data?.sys ?? ''));
  const [dia, setDia] = useState(String(r.data?.dia ?? ''));
  const [pulse, setPulse] = useState(String(r.data?.pulse ?? ''));

  const openEdit = () => {
    // เปิดมาพร้อมค่าปัจจุบันเสมอ ไม่ใช่ค่าที่ค้างจากรอบก่อน
    setTitle(r.title); setBody(r.body);
    setSys(String(r.data?.sys ?? ''));
    setDia(String(r.data?.dia ?? ''));
    setPulse(String(r.data?.pulse ?? ''));
    setMode('edit');
  };

  const saveBp = () => {
    const s = Number(sys);
    const d = Number(dia);
    if (!s || !d) return;
    const fields = bpRecordFields(s, d, Number(pulse) || undefined);
    // เขียนทับ data ทั้งก้อนไม่ได้ ของอื่นใน data (เช่นวัคซีน) จะหายไปด้วย
    actions.updateRecords([r.id], {
      title: fields.title, body: fields.body, important: fields.important,
      data: { ...r.data, ...fields.data },
    });
    actions.toast('แก้ค่าความดันแล้ว');
    setMode('view');
  };

  const saveText = () => {
    if (!title.trim()) return;
    actions.updateRecords([r.id], { title: title.trim(), body: body.trim() });
    actions.toast('แก้บันทึกแล้ว');
    setMode('view');
  };

  const hasPhoto = Boolean(r.file_path || r.file);

  return (
    <div className="o-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{r.title}</strong>
        <span className="subtle" style={{ whiteSpace: 'nowrap' }}>{fmtShortDate(r.at)}</span>
      </div>
      {r.body && <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{r.body}</p>}
      <p className="subtle" style={{ margin: '4px 0 0' }}>
        {fmtTime(r.at)} น. · {r.actor_name}บันทึก
      </p>
      <RecordPhoto record={r} />

      {mode === 'edit' && (r.kind === 'bp' ? (
        <div style={{ marginTop: 12 }}>
          <div className="o-row">
            <div>
              <label className="o-label" style={{ marginTop: 0 }} htmlFor={`bp-sys-${r.id}`}>ตัวบน</label>
              <input id={`bp-sys-${r.id}`} className="o-input" inputMode="numeric"
                value={sys} onChange={(e) => setSys(e.target.value)} />
            </div>
            <div>
              <label className="o-label" style={{ marginTop: 0 }} htmlFor={`bp-dia-${r.id}`}>ตัวล่าง</label>
              <input id={`bp-dia-${r.id}`} className="o-input" inputMode="numeric"
                value={dia} onChange={(e) => setDia(e.target.value)} />
            </div>
            <div>
              <label className="o-label" style={{ marginTop: 0 }} htmlFor={`bp-pulse-${r.id}`}>ชีพจร</label>
              <input id={`bp-pulse-${r.id}`} className="o-input" inputMode="numeric"
                value={pulse} onChange={(e) => setPulse(e.target.value)} />
            </div>
          </div>
          <div className="o-row" style={{ marginTop: 12 }}>
            <button type="button" className="o-btn ghost" onClick={() => setMode('view')}>ยกเลิก</button>
            <button type="button" className="o-btn primary"
              disabled={!Number(sys) || !Number(dia)} onClick={saveBp}>
              บันทึก
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <label className="o-label" style={{ marginTop: 0 }} htmlFor={`tl-title-${r.id}`}>หัวข้อ</label>
          <input id={`tl-title-${r.id}`} className="o-input"
            value={title} onChange={(e) => setTitle(e.target.value)} />

          <label className="o-label" htmlFor={`tl-body-${r.id}`}>รายละเอียด</label>
          <textarea id={`tl-body-${r.id}`} className="o-textarea" rows={3}
            value={body} onChange={(e) => setBody(e.target.value)} />

          <div className="o-row" style={{ marginTop: 12 }}>
            <button type="button" className="o-btn ghost" onClick={() => setMode('view')}>ยกเลิก</button>
            <button type="button" className="o-btn primary" disabled={!title.trim()} onClick={saveText}>
              บันทึก
            </button>
          </div>
        </div>
      ))}

      {mode === 'confirm' && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 150 }}>
            ลบบันทึกนี้?{hasPhoto && ' (ไฟล์ที่แนบไว้จะหายไปด้วย)'}
          </span>
          <button type="button" className="o-btn ghost" onClick={() => setMode('view')}>ไม่ลบ</button>
          <button type="button" className="o-btn danger"
            onClick={() => { actions.removeRecords([r.id]); actions.toast('ลบแล้ว'); }}>
            ลบ
          </button>
        </div>
      )}

      {mode === 'view' && (
        <div className="o-row" style={{ marginTop: 12 }}>
          <button type="button" className="o-btn ghost" style={{ minHeight: 38 }} onClick={openEdit}>
            แก้ไข
          </button>
          <button type="button" className="o-btn ghost" style={{ minHeight: 38 }}
            onClick={() => setMode('confirm')}>
            ลบ
          </button>
        </div>
      )}
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
    // PDF เปิดในแท็ก img ไม่ได้ ถ้าใช้ทางเดียวกับรูปจะเห็นเป็นรูปแตก
    // จึงให้เป็นปุ่มเปิดในแท็บใหม่ ซึ่งเบราว์เซอร์ทุกตัวเปิด PDF ได้อยู่แล้ว
    if (isPdf(record.file) || isPdf(record.file_path)) {
      return (
        <a className="o-btn ghost block" style={{ marginTop: 8, textDecoration: 'none' }}
          href={record.file} target="_blank" rel="noreferrer">
          <Icon name="book" size={18} /> เปิดไฟล์ PDF
        </a>
      );
    }
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
