'use client';

import React from 'react';
import { Icon } from '../Icon';
import { fmtDate, fmtTime, todayKey } from '@/lib/format';
import { activityDays } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { Book, RecordItem } from '@/lib/types';

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
  const [busy, setBusy] = React.useState(false);

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

/** บันทึกหนึ่งครั้ง — รูปหลายใบที่จดพร้อมกันนับเป็นครั้งเดียว */
interface Entry {
  key: string;
  head: RecordItem;
  photos: RecordItem[];
}

/** จับแถวที่จดพร้อมกัน (ชนิดเดียวกัน เวลาเดียวกัน ชื่อเดียวกัน) กลับมาเป็นบันทึกเดียว
 *
 *  ตารางเก็บได้รูปละหนึ่งแถว ถ่ายอาหารมื้อเดียวสามใบจึงเป็นสามแถว
 *  ถ้าปล่อยให้แสดงเรียงลงมาสามการ์ด ไดอารี่จะอ่านไม่รู้เรื่องภายในไม่กี่วัน */
function toEntries(items: RecordItem[]): Entry[] {
  const out: Entry[] = [];
  const index = new Map<string, Entry>();
  for (const r of items) {
    const key = `${r.kind}|${r.at}|${r.title}`;
    const found = index.get(key);
    if (found) {
      if (r.file || r.file_path) found.photos.push(r);
      // ข้อความอยู่ที่แถวแรกของชุด แต่ถ้าแถวแรกบังเอิญไม่มี ก็เอาของแถวถัดมา
      if (!found.head.body && r.body) found.head = { ...found.head, body: r.body };
      continue;
    }
    const entry: Entry = { key, head: r, photos: r.file || r.file_path ? [r] : [] };
    index.set(key, entry);
    out.push(entry);
  }
  return out;
}

/** แท็บกิจกรรม — บันทึกประจำวันของสมุดเล่มนี้ เรียงเป็นวันๆ วันใหม่อยู่บน */
export function ActivityScreen({ book, onAdd }: { book: Book; onAdd: () => void }) {
  const { state } = useStore();
  const days = activityDays(state, book.id);
  const today = todayKey();

  return (
    <div className="screen">
      <p className="kicker">{book.owner_name}</p>
      <h2>กิจกรรม</h2>
      <p className="subtle">ออกกำลังกาย อาหาร และเรื่องที่อยากจดไว้</p>

      <button type="button" className="o-btn primary block" style={{ marginTop: 14 }} onClick={onAdd}>
        <Icon name="plus" size={19} /> จดบันทึกวันนี้
      </button>

      {days.length === 0 && (
        <button type="button" className="o-empty" style={{ marginTop: 18 }} onClick={onAdd}>
          ยังไม่มีบันทึก — แตะเพื่อจดครั้งแรก
        </button>
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

          {toEntries(d.items).map((e) => (
            <div key={e.key} className="o-card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <h3 style={{ margin: 0 }}>{e.head.title}</h3>
                <span className="o-tag" style={{ height: 'fit-content', flex: '0 0 auto' }}>
                  {KIND_LABEL[e.head.kind] ?? 'บันทึก'}
                </span>
              </div>
              <p className="subtle" style={{ margin: '2px 0 0' }}>
                {fmtTime(e.head.at)} น.{e.head.actor_name ? ` · ${e.head.actor_name}จด` : ''}
              </p>
              {e.head.body && (
                <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{e.head.body}</p>
              )}
              {e.photos.length > 0 && (
                // รูปเป็นแถวเล็กๆ เลื่อนดูได้ ไม่ใช่เต็มความกว้าง — ไดอารี่ต้องกวาดตา
                // ดูทั้งวันได้ในหน้าจอเดียว ไม่ใช่เลื่อนผ่านรูปทีละใบเท่าตัวเครื่อง
                <div style={{
                  display: 'flex', gap: 8, marginTop: 10,
                  overflowX: 'auto', paddingBottom: 2,
                }}>
                  {e.photos.map((r) => <Photo key={r.id} rec={r} />)}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
