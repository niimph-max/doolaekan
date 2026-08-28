'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { Chips } from '../Chips';
import { Icon } from '../Icon';
import { EXERCISE_CHIPS, MEAL_CHIPS } from '@/lib/seed';
import { fmtShortDate, todayKey } from '@/lib/format';
import { equipmentHistory, equipmentLine, knownEquipment, lastExercise, lastWeight } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { RecordKind } from '@/lib/types';

/** ย่อรูปก่อนเก็บ
 *
 *  รูปอาหารมีไว้ให้จำได้ว่ากินอะไร ไม่ได้มีไว้อ่านตัวหนังสือเล็กๆ แบบผลตรวจเลือด
 *  จึงย่อได้โดยไม่เสียประโยชน์ และรูปคือของหนักที่สุดในแอปนี้ — เคยกิน egress
 *  ไป 32 GB มาแล้วเพราะเก็บรูปเต็มขนาด ของที่จดทุกวันยิ่งต้องเบา */
const MAX_SIDE = 1000;
const QUALITY = 0.72;

function shrink(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      // ย่อไม่ได้ก็ยังต้องเก็บรูปให้ได้ ดีกว่าทิ้งของที่ผู้ใช้เพิ่งถ่ายมา
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

type Mode = Extract<RecordKind, 'exercise' | 'food' | 'note'>;

const MODES: { id: Mode; label: string }[] = [
  { id: 'exercise', label: 'ออกกำลังกาย' },
  { id: 'food', label: 'อาหาร' },
  { id: 'note', label: 'บันทึกทั่วไป' },
];

/** จดบันทึกประจำวัน — ออกกำลังกาย อาหาร หรือเรื่องทั่วไป
 *
 *  เจตนาคือแทนที่การจดลงแอปโน้ต จึงเป็นช่องพิมพ์เปล่าเป็นหลัก ไม่ใช่ฟอร์ม
 *  ที่บังคับกรอกเซ็ต/เรป/น้ำหนักทีละช่อง เพราะของจริงที่คนจดหน้าเครื่องคือ
 *  "Leg press 85.7 ชิด 12*3 / ห่าง 12*3" ซึ่งไม่มีฟอร์มไหนรับได้ครบ */
export function AddActivitySheet({ open, bookId, onClose }: {
  open: boolean; bookId: string; onClose: () => void;
}) {
  const { state, actions } = useStore();
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('exercise');
  const [activity, setActivity] = useState('');
  const [minutes, setMinutes] = useState('');
  const [meal, setMeal] = useState('');
  const [kcal, setKcal] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKey());
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // ช่องช่วยพิมพ์รายเครื่อง — ไม่ใช่ช่องที่ต้องกรอกให้ครบก่อนถึงจะบันทึกได้
  const [eqName, setEqName] = useState('');
  const [eqWeight, setEqWeight] = useState('');
  const [eqReps, setEqReps] = useState('');
  const [eqSets, setEqSets] = useState('');

  // ครั้งก่อนที่ทำท่านี้ ใช้น้ำหนักเท่าไหร่ — ต้องเห็นตอนกำลังจะจด ไม่ใช่ต้องไปหาเอง
  const previous = useMemo(
    () => (mode === 'exercise' ? lastExercise(state, bookId, activity) : undefined),
    [state, bookId, activity, mode],
  );

  // เครื่องที่เคยจดไว้ อ่านมาจากบรรทัดที่ผู้ใช้พิมพ์เอง ไม่ต้องตั้งคลังเครื่องไว้ก่อน
  const equipment = useMemo(
    () => (mode === 'exercise' ? knownEquipment(state, bookId, 12) : []),
    [state, bookId, mode],
  );
  // ครั้งล่าสุดของเครื่องที่กำลังจะจด — โผล่ทันทีที่พิมพ์ชื่อ ไม่ต้องไปกดค้นแยก
  const eqLast = useMemo(
    () => (mode === 'exercise' ? equipmentHistory(state, bookId, eqName, 1)[0] : undefined),
    [state, bookId, eqName, mode],
  );

  const hasContent = Boolean(note.trim() || photos.length || activity || meal);

  const close = () => { setConfirmDiscard(false); onClose(); };

  const clear = () => {
    setActivity(''); setMinutes(''); setMeal(''); setKcal('');
    setNote(''); setPhotos([]); setDate(todayKey());
    setEqName(''); setEqWeight(''); setEqReps(''); setEqSets('');
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
        const small = await shrink(String(reader.result));
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

    // เที่ยงวันเพื่อกันเขตเวลาทำให้วันเลื่อนไปวันก่อนหน้า — ยกเว้นวันนี้ที่ใช้เวลาจริง
    // เพื่อให้หลายรายการในวันเดียวกันเรียงตามลำดับที่จดจริง
    const at = date === todayKey()
      ? new Date().toISOString()
      : new Date(`${date}T12:00:00`).toISOString();

    const mins = Number(minutes) || undefined;
    const cal = Number(kcal) || undefined;

    const title = mode === 'exercise'
      ? [activity.trim() || 'ออกกำลังกาย', mins ? `${mins} นาที` : ''].filter(Boolean).join(' · ')
      : mode === 'food'
        ? [meal ? `มื้อ${meal}` : 'อาหาร', cal ? `${cal} แคล` : ''].filter(Boolean).join(' · ')
        : note.trim().split('\n')[0].slice(0, 60) || 'บันทึก';

    // ตารางเก็บได้รูปละหนึ่งแถว รูปหลายใบจึงเป็นหลายแถว แต่ทุกแถวใช้เวลาเดียวกัน
    // และชื่อเดียวกัน เพื่อให้หน้าจอจับกลับมารวมเป็นบันทึกเดียวได้ — ถ่ายอาหาร
    // มื้อเดียวสามใบต้องเห็นเป็นมื้อเดียว ไม่ใช่สามรายการเรียงกันลงไป
    const shots = photos.length ? photos : [undefined];
    shots.forEach((file, i) => {
      actions.addRecord(bookId, {
        kind: mode,
        title,
        body: i === 0 ? note.trim() : '',
        data: mode === 'exercise'
          ? { activity: activity.trim() || undefined, minutes: mins }
          : mode === 'food'
            ? { meal: meal || undefined, kcal: cal }
            : undefined,
        file,
        important: false,
        at,
      });
    });

    actions.toast('จดไว้แล้ว');
    clear();
  };

  const cancel = () => {
    if (hasContent) { setConfirmDiscard(true); return; }
    clear();
  };

  return (
    <Sheet open={open} title="จดบันทึกวันนี้" onClose={cancel}>
      <Chips options={MODES.map((m) => m.label)} multi={false}
        selected={[MODES.find((m) => m.id === mode)!.label]}
        onToggle={(label) => setMode(MODES.find((m) => m.label === label)!.id)} />

      {mode === 'exercise' && (
        <>
          <label className="o-label" style={{ marginTop: 14 }}>ทำอะไร</label>
          <Chips options={EXERCISE_CHIPS} multi={false} selected={[activity]}
            onToggle={(v) => setActivity((cur) => (cur === v ? '' : v))} />
          <input className="o-input" style={{ marginTop: 8 }} value={activity}
            onChange={(e) => setActivity(e.target.value)}
            placeholder="หรือพิมพ์เอง เช่น ตีแบด" />

          {previous && (
            <div className="o-card" style={{ marginTop: 12 }}>
              <p className="subtle" style={{ margin: '0 0 6px' }}>
                ครั้งก่อน · {fmtShortDate(previous.at)}
                {previous.data?.minutes ? ` · ${previous.data.minutes} นาที` : ''}
              </p>
              {previous.body ? (
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{previous.body}</p>
              ) : (
                <p className="subtle" style={{ margin: 0 }}>ครั้งนั้นไม่ได้จดรายละเอียดไว้</p>
              )}
              {previous.body && (
                <button type="button" className="o-btn ghost" style={{ marginTop: 10 }}
                  onClick={() => setNote(previous.body)}>
                  คัดลอกมาแก้ต่อ
                </button>
              )}
            </div>
          )}

          {/* ── ช่วยพิมพ์ทีละเครื่อง ──
              พิมพ์เองทั้งบรรทัดทุกเครื่องมันเยอะเกินไปตอนยืนอยู่หน้าเครื่อง
              และพิมพ์ชื่อเองทุกครั้งแปลว่าวันหนึ่งจะสะกดไม่เหมือนเดิม แล้วกลาย
              เป็นคนละเครื่องในสายตาแอป จึงเดาชื่อจากที่เคยจดให้ และเติมน้ำหนัก
              ครั้งก่อนไว้ให้ล่วงหน้า เหลือแค่แก้ตัวเลข
              ผลลัพธ์ไปต่อท้ายช่องข้อความข้างล่าง ซึ่งยังพิมพ์แก้เองได้ทุกอย่าง
              — เป็นเครื่องช่วยพิมพ์ ไม่ใช่ฟอร์มที่ต้องกรอกให้ครบก่อนถึงจะบันทึกได้ */}
          <div className="o-card" style={{ marginTop: 18 }}>
            <label className="o-label" htmlFor="act-eq" style={{ marginTop: 0 }}>
              เพิ่มทีละเครื่อง
            </label>
            <input id="act-eq" className="o-input" list="act-eq-list" value={eqName}
              onChange={(e) => {
                const v = e.target.value;
                setEqName(v);
                // เลือกเครื่องที่เคยจด → เติมน้ำหนักครั้งก่อนไว้ให้ก่อน แก้ต่อได้
                const prev = equipmentHistory(state, bookId, v, 1)[0];
                if (prev && !eqWeight) setEqWeight(lastWeight(prev.line));
              }}
              placeholder="ชื่อเครื่อง เช่น Leg press" />
            <datalist id="act-eq-list">
              {equipment.map((n) => <option key={n} value={n} />)}
            </datalist>

            {equipment.length > 0 && (
              <Chips options={equipment} multi={false} selected={[eqName]}
                onToggle={(v) => {
                  const next = eqName === v ? '' : v;
                  setEqName(next);
                  const prev = next ? equipmentHistory(state, bookId, next, 1)[0] : undefined;
                  setEqWeight(prev ? lastWeight(prev.line) : '');
                }} />
            )}

            {eqName.trim() && (
              eqLast ? (
                <p className="subtle" style={{ margin: '10px 0 0' }}>
                  ครั้งก่อน {fmtShortDate(eqLast.at)} · {eqLast.line}
                </p>
              ) : (
                <p className="subtle" style={{ margin: '10px 0 0' }}>ยังไม่เคยจดเครื่องนี้ไว้</p>
              )
            )}

            <div className="o-row" style={{ marginTop: 10, gap: 8 }}>
              <span style={{ flex: 1.2 }}>
                <label className="o-label" htmlFor="act-w">น้ำหนัก</label>
                <input id="act-w" className="o-input" inputMode="decimal" value={eqWeight}
                  onChange={(e) => setEqWeight(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="85.7" />
              </span>
              <span style={{ flex: 1 }}>
                <label className="o-label" htmlFor="act-r">ครั้ง</label>
                <input id="act-r" className="o-input" inputMode="numeric" value={eqReps}
                  onChange={(e) => setEqReps(e.target.value.replace(/\D/g, ''))}
                  placeholder="12" />
              </span>
              <span style={{ flex: 1 }}>
                <label className="o-label" htmlFor="act-s">เซ็ต</label>
                <input id="act-s" className="o-input" inputMode="numeric" value={eqSets}
                  onChange={(e) => setEqSets(e.target.value.replace(/\D/g, ''))}
                  placeholder="3" />
              </span>
            </div>

            <button type="button" className="o-btn secondary block" style={{ marginTop: 12 }}
              disabled={!eqName.trim()}
              onClick={() => {
                const line = equipmentLine(eqName, eqWeight, eqReps, eqSets);
                setNote((cur) => (cur.trim() ? `${cur.replace(/\n+$/, '')}\n` : '') + line);
                setEqName(''); setEqWeight(''); setEqReps(''); setEqSets('');
              }}>
              <Icon name="plus" size={18} /> เพิ่มลงบันทึก
            </button>
          </div>

        </>
      )}

      {mode === 'food' && (
        <>
          <label className="o-label" style={{ marginTop: 14 }}>มื้อไหน</label>
          <Chips options={MEAL_CHIPS} multi={false} selected={[meal]}
            onToggle={(v) => setMeal((cur) => (cur === v ? '' : v))} />
        </>
      )}

      <label className="o-label" htmlFor="act-note" style={{ marginTop: 14 }}>
        {mode === 'exercise' ? 'จดไว้ยังไงก็ได้' : mode === 'food' ? 'จดเพิ่ม (ไม่ใส่ก็ได้)' : 'เขียนอะไรก็ได้'}
      </label>
      <textarea id="act-note" className="o-textarea" value={note} rows={mode === 'exercise' ? 6 : 3}
        onChange={(e) => setNote(e.target.value)}
        placeholder={mode === 'exercise'
          ? 'ท่า 1\nLeg press 85.7 ชิด 12*3 / ห่าง 12*3\nท่า 2\nLat pulldown 25 kg *12*3'
          : mode === 'food' ? 'ข้าวมันไก่ ไม่กินหนัง' : ''} />

      {/* ── รูป ── */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple
        hidden onChange={onFiles} />
      <input ref={pickRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <div className="o-row" style={{ marginTop: 12 }}>
        <button type="button" className="o-btn secondary" onClick={() => camRef.current?.click()}>
          <Icon name="camera" size={19} /> ถ่ายรูป
        </button>
        <button type="button" className="o-btn ghost" onClick={() => pickRef.current?.click()}>
          เลือกรูป
        </button>
      </div>

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

      <div className="o-row" style={{ marginTop: 14, alignItems: 'flex-end' }}>
        <span style={{ flex: 1 }}>
          <label className="o-label" htmlFor="act-date">วันที่</label>
          <input id="act-date" className="o-input" type="date" value={date} max={todayKey()}
            onChange={(e) => setDate(e.target.value || todayKey())} />
        </span>
        {mode === 'food' && (
          <span style={{ flex: 1 }}>
            <label className="o-label" htmlFor="act-kcal">แคลอรี่ (ไม่ใส่ก็ได้)</label>
            <input id="act-kcal" className="o-input" inputMode="numeric" value={kcal}
              onChange={(e) => setKcal(e.target.value.replace(/\D/g, ''))} placeholder="—" />
          </span>
        )}
        {/* นาทีไม่ใช่ของที่ต้องกรอกก่อนถึงจะจดได้ จึงไม่ควรขวางทางอยู่ข้างบน */}
        {mode === 'exercise' && (
          <span style={{ flex: 1 }}>
            <label className="o-label" htmlFor="act-min">กี่นาที (ไม่ใส่ก็ได้)</label>
            <input id="act-min" className="o-input" inputMode="numeric" value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} placeholder="45" />
          </span>
        )}
      </div>

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
          จดไว้
        </button>
      )}
    </Sheet>
  );
}
