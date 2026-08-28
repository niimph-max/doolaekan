'use client';

import React, { useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { Icon } from '../Icon';
import { todayKey } from '@/lib/format';
import { useStore } from '@/lib/store';

/** ประเภทที่เจอบ่อย ให้แตะเลือกแทนพิมพ์ พิมพ์เองก็ยังได้ */
const KINDS = ['ผลตรวจเลือด', 'ผลตรวจตา', 'ผลเอกซเรย์', 'ใบรับรองแพทย์', 'ใบเสร็จ'];

/** เก็บเอกสารจากหมอ — ผลตรวจเลือด ผลตรวจตา ฯลฯ
 *
 *  ของเดิมเป็นปุ่มเลือกไฟล์อย่างเดียว ตั้งชื่อว่า "เอกสารจากหมอ" ทุกใบเหมือนกันหมด
 *  และลงวันที่เป็นวันที่กดเสมอ ซึ่งใช้ไม่ได้กับการย้อนไปเก็บผลตรวจครั้งก่อนๆ
 *  เพราะทุกใบจะกองอยู่ที่วันเดียวกันและแยกไม่ออกว่าใบไหนคืออะไร */
export function AddDocSheet({ open, bookId, onClose }: {
  open: boolean; bookId: string; onClose: () => void;
}) {
  const { actions } = useStore();
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKey());
  const [pages, setPages] = useState<string[]>([]);

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  /** ปิดชีตเฉยๆ — เก็บรูปที่ถ่ายไว้ต่อ เปิดกลับมาแล้วยังอยู่ครบ
   *  ถ่ายเอกสารสิบกว่าใบแล้วเผลอปิด ต้องไม่ต้องเริ่มถ่ายใหม่ทั้งหมด */
  const close = () => { setConfirmDiscard(false); onClose(); };

  /** ล้างทิ้งจริงๆ ใช้เมื่อเก็บสำเร็จ หรือผู้ใช้ยืนยันว่าจะทิ้ง */
  const clear = () => {
    setTitle(''); setNote(''); setDate(todayKey()); setPages([]);
    setConfirmDiscard(false);
    onClose();
  };

  // ผลตรวจเลือดมักมีหลายแผ่น เลือกทีเดียวหลายไฟล์ได้ ไม่ต้องกดซ้ำทีละใบ
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => setPages((cur) => [...cur, String(reader.result)]);
      reader.readAsDataURL(file);
    }
  };

  const save = () => {
    // ── ไม่บังคับให้ตั้งชื่อ ──
    // เดิมต้องเลือกชื่อก่อนถึงจะกดเก็บได้ ปุ่มเลยกดไม่ติดโดยไม่บอกเหตุผล
    // ผู้ใช้ถ่ายรูปมาเป็นสิบใบแล้วกดไม่ได้ จึงทิ้งไปทั้งชุดแล้วถ่ายใหม่
    // ชื่อเป็นแค่ของช่วยหา ไม่ใช่ของจำเป็น ขาดได้ ตั้งให้เองไปก่อนแล้วแก้ทีหลัง
    const name = title.trim() || `เอกสารจากหมอ ${date}`;
    if (!pages.length) return;
    // เวลาเที่ยงวันเพื่อกันเรื่องเขตเวลาทำให้วันเลื่อนไปวันก่อนหน้า
    const at = new Date(`${date}T12:00:00`).toISOString();
    pages.forEach((file, i) => {
      actions.addRecord(bookId, {
        kind: 'doc',
        title: pages.length > 1 ? `${name} (แผ่น ${i + 1}/${pages.length})` : name,
        body: note.trim(),
        file, at, important: true,
      });
    });
    actions.toast(`เก็บ ${name} แล้ว`);
    clear();
  };

  return (
    <Sheet open={open} title="เก็บเอกสารจากหมอ" onClose={close}>
      <label className="o-label" style={{ marginTop: 0 }}>เอกสารอะไร (ไม่เลือกก็ได้)</label>
      <div className="o-chips">
        {KINDS.map((k) => (
          <button key={k} type="button" className="o-chip" aria-pressed={title === k}
            onClick={() => setTitle(title === k ? '' : k)}>
            {k}
          </button>
        ))}
      </div>
      <input id="doc-title" className="o-input" style={{ marginTop: 10 }}
        placeholder="หรือพิมพ์ชื่อเอง" value={title} onChange={(e) => setTitle(e.target.value)} />

      <label className="o-label" htmlFor="doc-date">วันที่ของเอกสาร</label>
      <input id="doc-date" className="o-input" type="date" value={date}
        onChange={(e) => setDate(e.target.value)} />
      <p className="subtle" style={{ margin: '6px 0 0' }}>
        ใส่วันที่บนใบจริงได้เลย เอกสารเก่าจะได้เรียงถูกที่
      </p>

      <label className="o-label" htmlFor="doc-note">โน้ต (ไม่ใส่ก็ได้)</label>
      <input id="doc-note" className="o-input" placeholder="เช่น หมอบอกไขมันลดลง"
        value={note} onChange={(e) => setNote(e.target.value)} />

      <label className="o-label">รูปเอกสาร</label>
      {pages.length > 0 && (
        <div className="o-card" style={{ marginTop: 0 }}>
          {pages.map((src, i) => (
            <div key={src.slice(-24)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0' }}>
              {}
              <img src={src} alt={`แผ่นที่ ${i + 1}`}
                style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 10, flex: '0 0 54px' }} />
              <span style={{ flex: 1 }}>แผ่นที่ {i + 1}</span>
              <button type="button" className="o-btn ghost" style={{ padding: '4px 12px', minHeight: 32 }}
                onClick={() => setPages((cur) => cur.filter((_, n) => n !== i))}>
                <Icon name="x" size={15} /> เอาออก
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="o-row" style={{ marginTop: 10 }}>
        <button type="button" className="o-btn ghost" onClick={() => camRef.current?.click()}>
          <Icon name="camera" size={18} /> ถ่ายรูป
        </button>
        <button type="button" className="o-btn ghost" onClick={() => pickRef.current?.click()}>
          เลือกรูป
        </button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple
        onChange={onFiles} style={{ display: 'none' }} />
      <input ref={pickRef} type="file" accept="image/*" multiple
        onChange={onFiles} style={{ display: 'none' }} />

      <div className="o-row" style={{ marginTop: 18 }}>
        <button type="button" className="o-btn ghost"
          onClick={() => (pages.length ? setConfirmDiscard(true) : clear())}>
          ยกเลิก
        </button>
        <button type="button" className="o-btn primary"
          disabled={!pages.length} onClick={save}>
          เก็บเอกสาร
        </button>
      </div>

      {/* ปุ่มที่กดไม่ได้โดยไม่บอกเหตุผล คือทางตัน ผู้ใช้จะนึกว่าแอปพัง
          ทั้งที่ขาดแค่ข้อมูลอีกอย่างเดียว บอกไปตรงๆ ว่าขาดอะไร */}
      {!pages.length && (
        <p className="subtle" style={{ margin: '10px 0 0', textAlign: 'center' }}>
          ยังกดเก็บไม่ได้ — ใส่รูปเอกสารก่อน
        </p>
      )}

      {/* ทิ้งรูปที่ถ่ายมาแล้วเป็นเรื่องที่เอาคืนไม่ได้ ต้องถามก่อนเสมอ */}
      {confirmDiscard && (
        <div className="o-card warn" style={{ marginTop: 14 }}>
          <strong>ทิ้งรูป {pages.length} แผ่นที่ใส่ไว้?</strong>
          <p className="subtle" style={{ margin: '4px 0 10px' }}>
            ถ้าแค่อยากปิดไปทำอย่างอื่นก่อน กดปิดหน้านี้ได้เลย รูปจะยังอยู่
          </p>
          <div className="o-row">
            <button type="button" className="o-btn ghost" onClick={close}>ปิดไว้ก่อน รูปยังอยู่</button>
            <button type="button" className="o-btn danger" onClick={clear}>ทิ้งรูปทั้งหมด</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
