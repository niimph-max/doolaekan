'use client';

import React, { useState } from 'react';
import { Icon } from '../Icon';
import { fmtDate, fmtTime, todayKey } from '@/lib/format';
import { activityDays, activityEntries } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { ActivityEntry } from '@/lib/selectors';
import type { Book, RecordItem, RecordKind } from '@/lib/types';

/** ดูเฉพาะกลุ่ม — ไดอารี่ที่จดทุกวันจะยาวเร็วมาก และคำถามจริงมักเจาะจง
 *  "อาทิตย์นี้กินอะไรบ้าง" หรือ "เข้ายิมครั้งก่อนเมื่อไหร่" ไม่ใช่ "ขอดูทุกอย่าง" */
const FILTERS: { id: 'all' | RecordKind; label: string; kinds?: RecordKind[] }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'exercise', label: 'ออกกำลังกาย', kinds: ['exercise'] },
  { id: 'food', label: 'อาหาร', kinds: ['food'] },
  { id: 'note', label: 'อื่นๆ', kinds: ['note'] },
];

const KIND_LABEL: Record<string, string> = {
  exercise: 'ออกกำลังกาย',
  food: 'อาหาร',
  note: 'บันทึก',
};

/** รูปหนึ่งใบ — ยังไม่โหลดจนกว่าจะกดดู
 *
 *  รูปคือของหนักที่สุดในแอป ถ้าดึงทุกใบทุกครั้งที่เปิดแท็บ บันทึกที่จดทุกวัน
 *  จะกลายเป็นภาระที่โตขึ้นเรื่อยๆ จนเปิดแอปช้า จึงโหลดเฉพาะใบที่อยากดูจริง */
function Photo({ rec }: { rec: RecordItem }) {
  const { actions } = useStore();
  const [busy, setBusy] = useState(false);

  const box: React.CSSProperties = {
    width: 104, height: 104, borderRadius: 14, flex: '0 0 auto',
  };

  if (rec.file) {
    return <img src={rec.file} alt={rec.title} style={{ ...box, objectFit: 'cover', display: 'block' }} />;
  }
  if (!rec.file_path) return null;

  return (
    <button type="button" disabled={busy}
      onClick={async () => {
        setBusy(true);
        await actions.loadPhoto(rec.file_path!);
        setBusy(false);
      }}
      style={{
        ...box, display: 'grid', placeItems: 'center', gap: 4, cursor: 'pointer',
        border: '1px dashed var(--color-neutral-400)', background: 'transparent',
        color: 'var(--color-neutral-700)', fontSize: 12, fontWeight: 600,
      }}>
      <Icon name="camera" size={20} />
      {busy ? 'กำลังโหลด…' : 'ดูรูป'}
    </button>
  );
}

function EntryCard({ entry, onEdit }: { entry: ActivityEntry; onEdit: () => void }) {
  const { actions } = useStore();
  const [confirming, setConfirming] = useState(false);
  const { head, photos } = entry;

  return (
    <div className="o-card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <h3 style={{ margin: 0 }}>{head.title}</h3>
        <span className="o-tag" style={{ height: 'fit-content', flex: '0 0 auto' }}>
          {KIND_LABEL[head.kind] ?? 'บันทึก'}
        </span>
      </div>
      <p className="subtle" style={{ margin: '2px 0 0' }}>
        {fmtTime(head.at)} น.{head.actor_name ? ` · ${head.actor_name}จด` : ''}
      </p>
      {head.body && <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{head.body}</p>}

      {photos.length > 0 && (
        // รูปเป็นแถวเล็กๆ เลื่อนดูได้ ไม่ใช่เต็มความกว้าง — ไดอารี่ต้องกวาดตา
        // ดูทั้งวันได้ในหน้าจอเดียว ไม่ใช่เลื่อนผ่านรูปทีละใบเท่าตัวเครื่อง
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {photos.map((r) => <Photo key={r.id} rec={r} />)}
        </div>
      )}

      {confirming ? (
        // ── ถามก่อนลบเสมอ ──
        // ของที่จดไว้แล้วลบทิ้งคือของที่เอากลับมาไม่ได้ ปุ่มลบที่กดพลาดได้ทันที
        // ในไดอารี่ที่มีการ์ดเรียงกันเป็นสิบใบคือเรื่องของเวลา ไม่ใช่ความเป็นไปได้
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 140 }}>
            ลบบันทึกนี้?{photos.length > 0 && ` (รูป ${photos.length} ใบจะหายไปด้วย)`}
          </span>
          <button type="button" className="o-btn ghost" onClick={() => setConfirming(false)}>
            ไม่ลบ
          </button>
          <button type="button" className="o-btn danger"
            onClick={() => {
              actions.removeRecords(entry.ids);
              actions.toast('ลบแล้ว');
            }}>
            ลบ
          </button>
        </div>
      ) : (
        <div className="o-row" style={{ marginTop: 12 }}>
          <button type="button" className="o-btn ghost" onClick={onEdit}>แก้ไข</button>
          <button type="button" className="o-btn ghost" onClick={() => setConfirming(true)}>ลบ</button>
        </div>
      )}
    </div>
  );
}

/** แท็บกิจกรรม — บันทึกประจำวันของสมุดเล่มนี้ เรียงเป็นวันๆ วันใหม่อยู่บน */
export function ActivityScreen({ book, onAdd, onEdit }: {
  book: Book; onAdd: () => void; onEdit: (entry: ActivityEntry) => void;
}) {
  const { state } = useStore();
  const [filter, setFilter] = useState<'all' | RecordKind>('all');
  const active = FILTERS.find((f) => f.id === filter);
  const days = activityDays(state, book.id, active?.kinds);
  const today = todayKey();

  return (
    <div className="screen">
      <p className="kicker">{book.owner_name}</p>
      <h2>กิจกรรม</h2>
      <p className="subtle">ออกกำลังกาย อาหาร และเรื่องที่อยากจดไว้</p>

      <button type="button" className="o-btn primary block" style={{ marginTop: 14 }} onClick={onAdd}>
        <Icon name="plus" size={19} /> จดบันทึกวันนี้
      </button>

      <div className="o-chips" style={{ marginTop: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="o-chip" aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {days.length === 0 && (
        filter === 'all' ? (
          <button type="button" className="o-empty" style={{ marginTop: 18 }} onClick={onAdd}>
            ยังไม่มีบันทึก — แตะเพื่อจดครั้งแรก
          </button>
        ) : (
          // บอกให้ชัดว่าไม่มีของ "กลุ่มนี้" ไม่ใช่ไม่มีอะไรเลย ไม่งั้นคนจะคิดว่าบันทึกหาย
          <p className="subtle" style={{ marginTop: 18 }}>
            ยังไม่มีบันทึกกลุ่ม{active?.label}
            <button type="button" className="o-btn ghost" style={{ marginLeft: 8 }}
              onClick={() => setFilter('all')}>
              ดูทั้งหมด
            </button>
          </p>
        )
      )}

      {days.map((d) => (
        <section key={d.day} style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 19, margin: '0 0 4px' }}>
            {d.day === today ? 'วันนี้' : fmtDate(d.day)}
          </h3>

          {/* สรุปสั้นๆ ของวัน — บอกเท่าที่รู้จริง ไม่เดาแทน
              แคลที่ไม่ได้กรอกไม่ใช่ศูนย์ จึงต้องบอกด้วยว่ายอดนี้มาจากกี่รายการ */}
          {(d.minutes > 0 || d.kcalFrom > 0) && (
            <p className="subtle" style={{ margin: '0 0 10px' }}>
              {d.minutes > 0 && `ออกกำลังกาย ${d.minutes} นาที`}
              {d.minutes > 0 && d.kcalFrom > 0 && ' · '}
              {d.kcalFrom > 0 && (
                d.kcalFrom === d.kcalOf
                  ? `${d.kcal.toLocaleString('th-TH')} แคล`
                  : `${d.kcal.toLocaleString('th-TH')} แคล (จด ${d.kcalFrom} ใน ${d.kcalOf} รายการ)`
              )}
            </p>
          )}

          {activityEntries(d.items).map((e) => (
            <EntryCard key={e.key} entry={e} onEdit={() => onEdit(e)} />
          ))}
        </section>
      ))}
    </div>
  );
}
