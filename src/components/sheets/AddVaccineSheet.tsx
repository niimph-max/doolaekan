'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { Chips } from '../Chips';
import { Icon } from '../Icon';
import { DOSE_CHIPS, VACCINE_CHIPS } from '@/lib/seed';
import { todayKey } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { RecordItem } from '@/lib/types';

/** ความละเอียดของวันที่ที่ผู้ใช้รู้จริง */
type Precision = 'day' | 'month' | 'year';

const PRECISION_LABEL: Record<Precision, string> = {
  day: 'รู้วันที่แน่นอน',
  month: 'จำได้แค่เดือน',
  year: 'จำได้แค่ปี',
};

const thisYear = new Date().getFullYear() + 543;

/** ลงประวัติวัคซีน
 *
 *  ต่างจากบันทึกอื่นในแอปตรงที่เป็นข้อมูลตลอดชีวิต ฉีดปีนี้ต้องหาเจอในอีกสิบปี
 *  จึงไม่ปล่อยให้ไหลลงไปในไทม์ไลน์ แต่ไปอยู่เป็นรายการถาวรในหน้าสมุด
 *
 *  และตั้งใจให้ "จำได้แค่ปี" เป็นคำตอบที่ถูกต้อง ไม่ใช่ข้อบกพร่อง เพราะของจริง
 *  ผู้สูงอายุมักจำได้แค่ "ฉีดตอนโควิดระบาด" ถ้าบังคับให้เลือกวันเป๊ะ คนจะเดามั่ว
 *  แล้วเราจะได้วันที่ที่ดูแม่นแต่ไม่จริง ซึ่งแย่กว่าการรู้ว่า "ราวๆ ปีนั้น" */
export function AddVaccineSheet({ open, bookId, edit, onClose }: {
  open: boolean; bookId: string; edit?: RecordItem; onClose: () => void;
}) {
  const { actions } = useStore();
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [place, setPlace] = useState('');
  const [precision, setPrecision] = useState<Precision>('day');
  const [date, setDate] = useState(todayKey());
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [year, setYear] = useState(String(thisYear));
  const [nextDue, setNextDue] = useState('');
  const [photo, setPhoto] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const editKey = edit?.id ?? '';
  const lastTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (lastTarget.current === editKey) return;
    lastTarget.current = editKey;

    const v = edit?.data?.vaccine;
    setName(v?.name ?? '');
    setDose(v?.dose ?? '');
    setPlace(v?.place ?? '');
    setNextDue(v?.next_due ?? '');
    const p = v?.precision ?? 'day';
    setPrecision(p);
    const at = edit ? edit.at.slice(0, 10) : todayKey();
    setDate(at);
    setMonth(at.slice(0, 7));
    setYear(String(Number(at.slice(0, 4)) + 543));
    setPhoto('');
    setConfirmDiscard(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editKey]);

  const clear = () => {
    setName(''); setDose(''); setPlace(''); setPhoto(''); setNextDue('');
    setPrecision('day'); setDate(todayKey()); setMonth(todayKey().slice(0, 7));
    setYear(String(thisYear));
    setConfirmDiscard(false);
    onClose();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.onerror = () => actions.toast('อ่านไฟล์รูปไม่ได้');
    reader.readAsDataURL(file);
  };

  /** วันที่ที่จะเก็บจริง — ความละเอียดที่ไม่รู้ให้ตกไปกลางช่วงนั้น
   *  เพื่อให้เรียงลำดับได้ถูกโดยไม่ต้องแกล้งรู้วันที่ */
  const resolvedDate = (): string => {
    if (precision === 'day') return date;
    if (precision === 'month') return `${month}-15`;
    const ce = Number(year) - 543;
    return `${ce}-07-01`;
  };

  const valid = Boolean(name.trim())
    && (precision !== 'year' || /^\d{4}$/.test(year));

  const save = () => {
    if (!valid) return;
    const at = new Date(`${resolvedDate()}T12:00:00`).toISOString();
    const vaccine = {
      name: name.trim(),
      dose: dose.trim() || undefined,
      place: place.trim() || undefined,
      next_due: nextDue || undefined,
      precision,
    };
    const title = `วัคซีน${name.trim()}${dose.trim() ? ` · ${dose.trim()}` : ''}`;

    if (edit) {
      actions.updateRecords([edit.id], { title, body: '', data: { vaccine }, at });
      actions.toast('แก้ไขแล้ว');
      clear();
      return;
    }
    actions.addRecord(bookId, {
      kind: 'visit',
      title,
      body: '',
      data: { vaccine },
      file: photo || undefined,
      important: false,
      at,
    });
    actions.toast('ลงประวัติวัคซีนแล้ว');
    clear();
  };

  const cancel = () => {
    if (name.trim() || photo) { setConfirmDiscard(true); return; }
    clear();
  };

  return (
    <Sheet open={open} title={edit ? 'แก้ประวัติวัคซีน' : 'ลงประวัติวัคซีน'} onClose={cancel}>
      <label className="o-label" style={{ marginTop: 0 }}>วัคซีนอะไร</label>
      <Chips options={VACCINE_CHIPS} multi={false} selected={[name]}
        onToggle={(v) => setName((cur) => (cur === v ? '' : v))} />
      <input className="o-input" style={{ marginTop: 8 }} value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="หรือพิมพ์เอง" />

      <label className="o-label" style={{ marginTop: 14 }}>เข็มที่เท่าไหร่ (ไม่ใส่ก็ได้)</label>
      <Chips options={DOSE_CHIPS} multi={false} selected={[dose]}
        onToggle={(v) => setDose((cur) => (cur === v ? '' : v))} />

      {/* ── ฉีดเมื่อไหร่ ──
          "จำได้แค่ปี" คือคำตอบที่ถูกต้อง ไม่ใช่ข้อบกพร่อง จึงให้เลือกได้ตรงๆ
          ว่ารู้ละเอียดแค่ไหน แล้วหน้าจอจะแสดงเท่าที่รู้ ไม่เติมวันให้ดูแม่นเกินจริง */}
      <label className="o-label" style={{ marginTop: 16 }}>ฉีดเมื่อไหร่</label>
      <Chips options={(['day', 'month', 'year'] as Precision[]).map((p) => PRECISION_LABEL[p])}
        multi={false} selected={[PRECISION_LABEL[precision]]}
        onToggle={(label) => {
          const found = (['day', 'month', 'year'] as Precision[])
            .find((p) => PRECISION_LABEL[p] === label);
          if (found) setPrecision(found);
        }} />

      {precision === 'day' && (
        <input id="vac-date" className="o-input" style={{ marginTop: 8 }} type="date"
          value={date} max={todayKey()}
          onChange={(e) => setDate(e.target.value || todayKey())} />
      )}
      {precision === 'month' && (
        <input id="vac-month" className="o-input" style={{ marginTop: 8 }} type="month"
          value={month} max={todayKey().slice(0, 7)}
          onChange={(e) => setMonth(e.target.value || todayKey().slice(0, 7))} />
      )}
      {precision === 'year' && (
        <>
          <input id="vac-year" className="o-input" style={{ marginTop: 8 }} inputMode="numeric"
            value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={String(thisYear)} />
          <p className="o-hint">ปี พ.ศ. เช่น {thisYear}</p>
        </>
      )}

      <label className="o-label" htmlFor="vac-place" style={{ marginTop: 14 }}>
        ฉีดที่ไหน (ไม่ใส่ก็ได้)
      </label>
      <input id="vac-place" className="o-input" value={place}
        onChange={(e) => setPlace(e.target.value)}
        placeholder="เช่น รพ.พระปกเกล้า / ร้านยา" />

      <label className="o-label" htmlFor="vac-next" style={{ marginTop: 14 }}>
        ครบกำหนดครั้งหน้า (ไม่รู้ก็ไม่ต้องใส่)
      </label>
      <input id="vac-next" className="o-input" type="date" value={nextDue}
        onChange={(e) => setNextDue(e.target.value)} />
      <p className="o-hint">ไข้หวัดใหญ่ปีละครั้ง · บาดทะยักทุก 10 ปี</p>

      {!edit && (
        <>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          <input ref={pickRef} type="file" accept="image/*" hidden onChange={onFile} />
          <div className="o-row" style={{ marginTop: 14 }}>
            <button type="button" className="o-btn secondary" onClick={() => camRef.current?.click()}>
              <Icon name="camera" size={19} /> ถ่ายบัตรวัคซีน
            </button>
            <button type="button" className="o-btn ghost" onClick={() => pickRef.current?.click()}>
              เลือกรูป
            </button>
          </div>
          {photo && (
            <img src={photo} alt="บัตรวัคซีน" className="scan-img" style={{ marginTop: 10 }} />
          )}
        </>
      )}

      {confirmDiscard ? (
        <div className="o-card dark" style={{ marginTop: 16 }}>
          <p style={{ margin: '0 0 12px' }}>ทิ้งที่กรอกไว้?</p>
          <div className="o-row">
            <button type="button" className="o-btn secondary"
              onClick={() => { setConfirmDiscard(false); onClose(); }}>
              ปิดไว้ก่อน ของยังอยู่
            </button>
            <button type="button" className="o-btn ghost" onClick={clear}>ทิ้งทั้งหมด</button>
          </div>
        </div>
      ) : (
        <button type="button" className="o-btn primary block" style={{ marginTop: 16 }}
          disabled={!valid} onClick={save}>
          {edit ? 'บันทึกการแก้ไข' : 'ลงประวัติ'}
        </button>
      )}
    </Sheet>
  );
}
