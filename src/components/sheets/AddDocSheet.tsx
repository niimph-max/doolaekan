'use client';

import React, { useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { Icon } from '../Icon';
import { dataUrlSize, isPdf, todayKey } from '@/lib/format';
import { shrinkDoc } from '@/lib/photo';
import { VISIT_CHIPS } from '@/lib/seed';
import { useStore } from '@/lib/store';

/** ชนิดเอกสารที่เจอบ่อย ให้แตะเลือกแทนพิมพ์ พิมพ์เองก็ยังได้
 *  อยู่ต่อจากเรื่องที่ไปทำมา เพราะการไปหาหมอหนึ่งครั้งมักได้มาทั้งสองอย่าง */
const KINDS = [...VISIT_CHIPS, 'ผลตรวจเลือด', 'ผลตรวจตา', 'ผลเอกซเรย์', 'ใบรับรองแพทย์', 'ใบเสร็จ'];

/** PDF ที่โรงพยาบาลส่งมาทางอีเมลชัดกว่าการถ่ายรูปกระดาษเยอะ และเป็นต้นฉบับจริง
 *  แต่ย่อขนาดไม่ได้เหมือนรูป จึงกินพื้นที่เก็บไฟล์มากกว่ามาก เตือนไว้ให้เห็น
 *  ตอนที่ไฟล์ใหญ่จริงๆ ไม่ใช่ปล่อยให้รู้ตัวตอนพื้นที่เต็ม */
const BIG_FILE_MB = 3;

/** พบหมอ / เอกสาร — ทั้งเรื่องที่ไปทำมา และกระดาษที่ถือกลับบ้าน
 *
 *  ของเดิมเป็นปุ่มเลือกไฟล์อย่างเดียว ตั้งชื่อว่า "เอกสารจากหมอ" ทุกใบเหมือนกันหมด
 *  และลงวันที่เป็นวันที่กดเสมอ ซึ่งใช้ไม่ได้กับการย้อนไปเก็บผลตรวจครั้งก่อนๆ
 *  เพราะทุกใบจะกองอยู่ที่วันเดียวกันและแยกไม่ออกว่าใบไหนคืออะไร
 *
 *  และไม่บังคับว่าต้องมีรูป — ไปฉีดยามาแล้วไม่ได้กระดาษอะไรติดมือกลับมาเลย
 *  เป็นเรื่องปกติ แต่ยังเป็นเรื่องที่ต้องจดไว้ ถ้าบังคับให้มีรูปก่อนถึงจะกดได้
 *  คนจะถ่ายรูปอะไรก็ได้มาใส่ให้ผ่าน แล้วสมุดจะเต็มไปด้วยรูปที่ไม่มีความหมาย */
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
  const [busy, setBusy] = useState(0);

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const hasContent = Boolean(pages.length || title.trim() || note.trim());

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
  //
  // ── ย่อรูปก่อนเก็บ ──
  // เดิมเก็บเต็มขนาดที่ได้จากมือถือ ใบละ 3-8 MB ซึ่งเท่ากับรูปอาหารสามสิบใบ
  // เป็นตัวกินพื้นที่ที่แท้จริงของแอปนี้ และแอปนี้แจกฟรี ทุกไบต์คือเงินที่
  // เจ้าของจ่ายแทนคนอื่น ย่อที่ 1600px แล้วยังอ่านตัวเลขบนใบผลเลือดออกชัด
  //
  // PDF ย่อไม่ได้ ต้องเก็บตามเดิม — และเป็นต้นฉบับจริงจากโรงพยาบาลอยู่แล้ว
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setBusy((n) => n + files.length);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async () => {
        const raw = String(reader.result);
        const kept = isPdf(raw) ? raw : await shrinkDoc(raw);
        setPages((cur) => [...cur, kept]);
        setBusy((n) => n - 1);
      };
      reader.onerror = () => {
        actions.toast('อ่านไฟล์ไม่ได้');
        setBusy((n) => n - 1);
      };
      reader.readAsDataURL(file);
    }
  };

  const save = () => {
    // ── ไม่บังคับให้ตั้งชื่อ ──
    // เดิมต้องเลือกชื่อก่อนถึงจะกดเก็บได้ ปุ่มเลยกดไม่ติดโดยไม่บอกเหตุผล
    // ผู้ใช้ถ่ายรูปมาเป็นสิบใบแล้วกดไม่ได้ จึงทิ้งไปทั้งชุดแล้วถ่ายใหม่
    // ชื่อเป็นแค่ของช่วยหา ไม่ใช่ของจำเป็น ขาดได้ ตั้งให้เองไปก่อนแล้วแก้ทีหลัง
    if (!hasContent) return;
    // ไม่มีรูปแปลว่าเป็นการบันทึกว่าไปทำอะไรมา ไม่ใช่การเก็บกระดาษ
    // ชื่อตั้งต้นจึงต้องบอกตามนั้น ไม่ใช่เรียกว่าเอกสารทั้งที่ไม่มีเอกสารสักใบ
    const name = title.trim() || `${pages.length ? 'เอกสารจากหมอ' : 'พบหมอ'} ${date}`;
    // เวลาเที่ยงวันเพื่อกันเรื่องเขตเวลาทำให้วันเลื่อนไปวันก่อนหน้า
    const at = new Date(`${date}T12:00:00`).toISOString();
    const sheets: (string | undefined)[] = pages.length ? pages : [undefined];
    sheets.forEach((file, i) => {
      actions.addRecord(bookId, {
        kind: 'doc',
        title: sheets.length > 1 ? `${name} (แผ่น ${i + 1}/${sheets.length})` : name,
        body: note.trim(),
        file, at, important: true,
      });
    });
    actions.toast(`บันทึก ${name} แล้ว`);
    clear();
  };

  return (
    <Sheet open={open} title="พบหมอ / เอกสาร" onClose={close}>
      <label className="o-label" style={{ marginTop: 0 }}>เรื่องอะไร (ไม่เลือกก็ได้)</label>
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

      <label className="o-label" htmlFor="doc-date">วันที่</label>
      <input id="doc-date" className="o-input" type="date" value={date}
        onChange={(e) => setDate(e.target.value)} />
      <p className="subtle" style={{ margin: '6px 0 0' }}>
        วันที่ไปหาหมอ หรือวันที่บนใบจริง ของเก่าจะได้เรียงถูกที่
      </p>

      <label className="o-label" htmlFor="doc-note">โน้ต (ไม่ใส่ก็ได้)</label>
      <textarea id="doc-note" className="o-textarea" rows={3}
        placeholder="เช่น หมอบอกไขมันลดลง นัดอีก 3 เดือน"
        value={note} onChange={(e) => setNote(e.target.value)} />

      <label className="o-label">รูปเอกสาร หรือไฟล์ PDF (ไม่ใส่ก็ได้)</label>
      {pages.length > 0 && (
        <div className="o-card" style={{ marginTop: 0 }}>
          {pages.map((src, i) => (
            <div key={src.slice(-24)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0' }}>
              {isPdf(src) ? (
                <span style={{
                  width: 54, height: 54, borderRadius: 10, flex: '0 0 54px',
                  display: 'grid', placeItems: 'center',
                  border: '1.5px solid var(--color-neutral-400)',
                  fontSize: 12, fontWeight: 700, color: 'var(--color-neutral-700)',
                }}>PDF</span>
              ) : (
                <img src={src} alt={`แผ่นที่ ${i + 1}`}
                  style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 10, flex: '0 0 54px' }} />
              )}
              <span style={{ flex: 1 }}>
                แผ่นที่ {i + 1}
                {isPdf(src) && (
                  <span className="subtle" style={{ display: 'block', fontSize: 13 }}>
                    ไฟล์ PDF · {dataUrlSize(src)}
                  </span>
                )}
              </span>
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
          เลือกรูป / PDF
        </button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple
        onChange={onFiles} style={{ display: 'none' }} />
      <input ref={pickRef} type="file" accept="image/*,application/pdf" multiple
        onChange={onFiles} style={{ display: 'none' }} />

      {busy > 0 && <p className="subtle" style={{ marginTop: 8 }}>กำลังย่อรูป {busy} ใบ…</p>}

      {pages.some((src) => isPdf(src) && (src.length * 0.75) / 1024 / 1024 > BIG_FILE_MB) && (
        <p className="o-hint">
          มีไฟล์ PDF ที่ใหญ่กว่า {BIG_FILE_MB} MB — เก็บได้ปกติ แต่ไฟล์ใหญ่กินพื้นที่
          มากกว่ารูปถ่ายหลายเท่า ถ้าเป็นเอกสารหน้าเดียว ถ่ายรูปเอาจะเบากว่ามาก
        </p>
      )}

      <div className="o-row" style={{ marginTop: 18 }}>
        <button type="button" className="o-btn ghost"
          onClick={() => (hasContent ? setConfirmDiscard(true) : clear())}>
          ยกเลิก
        </button>
        <button type="button" className="o-btn primary"
          disabled={!hasContent || busy > 0} onClick={save}>
          บันทึก
        </button>
      </div>

      {/* ปุ่มที่กดไม่ได้โดยไม่บอกเหตุผล คือทางตัน ผู้ใช้จะนึกว่าแอปพัง
          ทั้งที่ขาดแค่ข้อมูลอีกอย่างเดียว บอกไปตรงๆ ว่าขาดอะไร */}
      {!hasContent && (
        <p className="subtle" style={{ margin: '10px 0 0', textAlign: 'center' }}>
          ยังกดบันทึกไม่ได้ — เลือกเรื่อง พิมพ์โน้ต หรือใส่รูป อย่างน้อยหนึ่งอย่าง
        </p>
      )}

      {/* ทิ้งรูปที่ถ่ายมาแล้วเป็นเรื่องที่เอาคืนไม่ได้ ต้องถามก่อนเสมอ */}
      {confirmDiscard && (
        <div className="o-card warn" style={{ marginTop: 14 }}>
          <strong>
            {pages.length ? `ทิ้งรูป ${pages.length} แผ่นที่ใส่ไว้?` : 'ทิ้งที่กรอกไว้?'}
          </strong>
          <p className="subtle" style={{ margin: '4px 0 10px' }}>
            ถ้าแค่อยากปิดไปทำอย่างอื่นก่อน กดปิดหน้านี้ได้เลย ของจะยังอยู่
          </p>
          <div className="o-row">
            <button type="button" className="o-btn ghost" onClick={close}>ปิดไว้ก่อน ของยังอยู่</button>
            <button type="button" className="o-btn danger" onClick={clear}>ทิ้งทั้งหมด</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
