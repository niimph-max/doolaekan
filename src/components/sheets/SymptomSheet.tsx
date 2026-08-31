'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { Chips } from '../Chips';
import { Icon } from '../Icon';
import { NOTE_HEAD_CHIPS, SYMPTOM_CHIPS } from '@/lib/seed';
import { todayKey } from '@/lib/format';
import { shrinkPhoto } from '@/lib/photo';
import { matchWatchRules } from '@/lib/selectors';
import { useStore } from '@/lib/store';

/** เวลาปัจจุบันในรูปแบบที่ช่อง type="time" รับได้ */
function nowTime(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SymptomSheet({ open, bookId, onClose }: {
  open: boolean; bookId: string; onClose: () => void;
}) {
  const { state, actions } = useStore();
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [head, setHead] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState(nowTime());
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

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
  const hasContent = Boolean(selected.length || head.trim() || note.trim() || photos.length);

  // ── วันเวลาเริ่มต้น ──
  // ค่าตั้งต้นคือ "ตอนนี้" เพราะเกือบทุกครั้งคือจดสิ่งที่เพิ่งเกิด แต่ถ้าเปิดชีต
  // ค้างไว้ข้ามวันแล้วกลับมาเปิดใหม่ ตอนนี้ของเมื่อวานไม่ใช่ตอนนี้อีกแล้ว
  // จึงรีเซ็ตให้เฉพาะตอนที่ยังไม่มีอะไรค้างอยู่ — ของที่พิมพ์ไว้ต้องไม่โดนล้าง
  useEffect(() => {
    if (!open || hasContent) return;
    const d = new Date();
    setDate(todayKey(d));
    setTime(nowTime(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** ปิดชีตเฉยๆ — ของที่กรอกไว้ยังอยู่ครบ กลับมาเปิดใหม่แล้วจดต่อได้ */
  const close = () => { setConfirmDiscard(false); onClose(); };

  const clear = () => {
    setSelected([]); setHead(''); setNote(''); setPhotos([]);
    setDate(todayKey()); setTime(nowTime());
    setConfirmDiscard(false);
    onClose();
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setBusy((n) => n + files.length);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async () => {
        const small = await shrinkPhoto(String(reader.result));
        setPhotos((cur) => [...cur, small]);
        setBusy((n) => n - 1);
      };
      reader.onerror = () => {
        actions.toast('อ่านไฟล์รูปไม่ได้');
        setBusy((n) => n - 1);
      };
      reader.readAsDataURL(file);
    }
  };

  const save = () => {
    if (!hasContent) return;

    // เวลาที่ผู้ใช้เลือกเอง ถ้าช่องเวลาถูกล้างจนว่างก็ยังต้องบันทึกได้
    // ใช้เที่ยงวันแทนเพื่อกันเขตเวลาทำให้วันเลื่อนไปวันก่อนหน้า
    const stamp = new Date(`${date}T${/^\d{2}:\d{2}/.test(time) ? time : '12:00'}:00`);
    const at = (Number.isNaN(stamp.getTime()) ? new Date() : stamp).toISOString();

    // ── ชื่อบันทึก ──
    // ชีตนี้ถูกใช้จดเรื่องที่ไม่ใช่อาการด้วย (ไปฉีดยา ไปหาหมอ) ถ้าตั้งชื่อว่า
    // "อาการ:" ให้ทุกอัน ไทม์ไลน์จะโกหกว่าวันนั้นมีอาการ ทั้งที่ไปฉีดยาเฉยๆ
    const heading = head.trim();
    const tags = selected.join(' · ');
    const name = heading
      ? (tags ? `${heading} · อาการ: ${tags}` : heading)
      : `อาการ: ${tags || 'บันทึกเพิ่มเติม'}`;

    // ตารางเก็บได้รูปละหนึ่งแถว รูปหลายใบจึงเป็นหลายแถว เขียนข้อความไว้ที่ใบแรก
    // ใบเดียวไม่ต้องมีเลขกำกับ เพราะเลข (1/1) อ่านแล้วชวนหาใบที่สองที่ไม่มีอยู่
    const shots: (string | undefined)[] = photos.length ? photos : [undefined];
    shots.forEach((file, i) => {
      actions.addRecord(bookId, {
        kind: 'symptom',
        title: shots.length > 1 ? `${name} (รูป ${i + 1}/${shots.length})` : name,
        body: i === 0 ? note.trim() : '',
        data: { tags: selected },
        file,
        important: hits.length > 0,
        at,
      });
    });

    actions.toast(hits.length ? 'บันทึกแล้ว — แจ้งเตือนทุกคนในกลุ่มด่วน' : 'จดไว้แล้ว ทุกคนเห็นทันที');
    clear();
  };

  const cancel = () => {
    if (hasContent) { setConfirmDiscard(true); return; }
    clear();
  };

  return (
    <Sheet open={open} title="จดอาการวันนี้" onClose={cancel}>
      <Chips
        options={chips}
        selected={selected}
        onToggle={(v) => setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
      />

      {/* ── หัวข้อ ──
          ไม่ใช่ทุกอย่างที่จดในนี้เป็นอาการ บางวันคือไปฉีดยา บางวันคือไปหาหมอ
          ซึ่งเดิมขึ้นชื่อว่า "บันทึกเพิ่มเติม" เหมือนกันหมดจนย้อนหาไม่เจอ
          แต่ยังเป็นของที่ไม่ใส่ก็ได้ ไม่ควรมีช่องบังคับกรอกมาขวางการจดอาการ */}
      <label className="o-label" htmlFor="sym-head" style={{ marginTop: 18 }}>
        หัวข้อ (ไม่ใส่ก็ได้)
      </label>
      <Chips options={NOTE_HEAD_CHIPS} multi={false} selected={[head]}
        onToggle={(v) => setHead((cur) => (cur === v ? '' : v))} />
      <input id="sym-head" className="o-input" style={{ marginTop: 8 }} value={head}
        onChange={(e) => setHead(e.target.value)}
        placeholder="หรือพิมพ์เอง เช่น ไปฉีดยาที่คลินิก" />

      <label className="o-label" htmlFor="sym-note">เพิ่มเติม (พิมพ์เองได้)</label>
      <textarea id="sym-note" className="o-textarea" value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="เช่น เวียนหัวตอนลุกจากเตียง หายเองช่วงสาย" />

      {/* ── วันเวลา ──
          ค่าตั้งต้นคือตอนนี้ เพราะส่วนใหญ่จดสิ่งที่เพิ่งเกิด แต่บางเรื่องนึกได้
          ทีหลัง ถ้าย้อนวันไม่ได้คนจะจดลงวันที่ผิด แล้วไทม์ไลน์จะเล่าเรื่องผิด */}
      <div className="o-row" style={{ marginTop: 14, alignItems: 'flex-end' }}>
        <span style={{ flex: 1.3 }}>
          <label className="o-label" htmlFor="sym-date" style={{ marginTop: 0 }}>วันที่</label>
          <input id="sym-date" className="o-input" type="date" value={date} max={todayKey()}
            onChange={(e) => setDate(e.target.value || todayKey())} />
        </span>
        <span style={{ flex: 1 }}>
          <label className="o-label" htmlFor="sym-time" style={{ marginTop: 0 }}>เวลา</label>
          <input id="sym-time" className="o-input" type="time" value={time}
            onChange={(e) => setTime(e.target.value)} />
        </span>
      </div>
      <p className="o-hint">ปกติเป็นตอนนี้ — ถ้าเพิ่งนึกได้ทีหลัง เลื่อนย้อนวันได้</p>

      {/* ── รูป ── */}
      <label className="o-label">รูป (ไม่ใส่ก็ได้)</label>
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple
        hidden onChange={onFiles} />
      <input ref={pickRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <div className="o-row">
        <button type="button" className="o-btn secondary" onClick={() => camRef.current?.click()}>
          <Icon name="camera" size={19} /> ถ่ายรูป
        </button>
        <button type="button" className="o-btn ghost" onClick={() => pickRef.current?.click()}>
          เลือกรูป
        </button>
      </div>
      <p className="o-hint">เช่น ผื่นที่ขึ้น แผลที่เท้า ใบนัดที่หมอให้มา</p>

      {busy > 0 && <p className="subtle" style={{ marginTop: 8 }}>กำลังย่อรูป {busy} ใบ…</p>}

      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {photos.map((p, i) => (
            <span key={p.slice(-24) + i} style={{ position: 'relative' }}>
              <img src={p} alt={`รูปที่ ${i + 1}`}
                style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 14, display: 'block' }} />
              <button type="button" aria-label={`เอารูปที่ ${i + 1} ออก`}
                onClick={() => setPhotos((cur) => cur.filter((_, n) => n !== i))}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 26, height: 26,
                  borderRadius: '50%', border: 0, cursor: 'pointer',
                  background: 'var(--color-neutral-900)', color: 'var(--color-neutral-100)',
                  display: 'grid', placeItems: 'center',
                }}>
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      {hits.length > 0 && (
        <div className="o-card dark" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <Icon name="alert" size={21} color="var(--color-accent-400)" />
            <strong>เข้าข้อเฝ้าระวัง</strong>
          </div>
          {hits.map((w) => (
            <p key={w.id} style={{ margin: '4px 0' }}>
              {w.triggers.join(' / ')} → {w.action}
              {w.source && (
                <span className="subtle" style={{ color: 'var(--color-accent-300)' }}> ({w.source})</span>
              )}
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

      {confirmDiscard ? (
        <div className="o-card dark" style={{ marginTop: 16 }}>
          <p style={{ margin: '0 0 12px' }}>ทิ้งที่จดไว้?</p>
          <div className="o-row">
            <button type="button" className="o-btn secondary" onClick={close}>
              ปิดไว้ก่อน ของยังอยู่
            </button>
            <button type="button" className="o-btn ghost" onClick={clear}>ทิ้งทั้งหมด</button>
          </div>
        </div>
      ) : (
        <button type="button" className="o-btn primary block" style={{ marginTop: 16 }}
          disabled={!hasContent || busy > 0} onClick={save}>
          บันทึกอาการ
        </button>
      )}
    </Sheet>
  );
}
