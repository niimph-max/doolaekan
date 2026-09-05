'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../Sheet';
import { Chips } from '../Chips';
import { Icon } from '../Icon';
import { EXERCISE_CHIPS, MEAL_CHIPS } from '@/lib/seed';
import { fmtShortDate, todayKey } from '@/lib/format';
import { shrinkPhoto } from '@/lib/photo';
import { equipmentHistory, equipmentLine, knownEquipment, lastExercise, lastWeight } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import type { ActivityEntry } from '@/lib/selectors';
import type { RecordKind } from '@/lib/types';

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
export function AddActivitySheet({ open, bookId, edit, onClose }: {
  open: boolean; bookId: string; edit?: ActivityEntry; onClose: () => void;
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
  // รูปเดิมที่ผู้ใช้เอาออกระหว่างแก้ไข — ลบจริงตอนกดบันทึก ไม่ใช่ตอนกดกากบาท
  // จะได้กดยกเลิกแล้วรูปกลับมาครบ
  const [dropped, setDropped] = useState<string[]>([]);

  // ── สลับระหว่าง "แก้ของเดิม" กับ "จดใหม่" ──
  // จำไว้ว่ารอบก่อนเปิดมาแก้อันไหน แล้วล้างฟอร์มเฉพาะตอนที่เป้าหมายเปลี่ยนจริง
  // ถ้าล้างทุกครั้งที่เปิด จะเสียคุณสมบัติ "ปิดแล้วเปิดใหม่ ของที่พิมพ์ไว้ยังอยู่"
  // ถ้าไม่ล้างเลย เปิดแก้ของเดิมค้างไว้แล้วไปกดจดใหม่ ข้อความเดิมจะติดมาด้วย
  // แล้วกลายเป็นบันทึกใหม่ที่ผู้ใช้ไม่ได้ตั้งใจ
  const editKey = edit ? edit.key : '';
  const lastTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (lastTarget.current === editKey) return;
    lastTarget.current = editKey;

    const h = edit?.head;
    setMode(h ? (h.kind === 'food' ? 'food' : h.kind === 'note' ? 'note' : 'exercise') : 'exercise');
    setActivity(h?.data?.activity ?? '');
    setMinutes(h?.data?.minutes ? String(h.data.minutes) : '');
    setMeal(h?.data?.meal ?? '');
    setKcal(typeof h?.data?.kcal === 'number' ? String(h.data.kcal) : '');
    setNote(h?.body ?? '');
    setDate(h ? h.at.slice(0, 10) : todayKey());
    setPhotos([]);
    setDropped([]);
    setEqName(''); setEqWeight(''); setEqReps(''); setEqSets('');
    setConfirmDiscard(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editKey]);

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

  const keptPhotos = edit ? edit.photos.filter((r) => !dropped.includes(r.id)) : [];
  // บันทึกเก่าที่ทำไว้ก่อนมีกติกานี้อาจมีหลายรูป — ไม่ไปลบให้ แค่ไม่ให้เพิ่มอีก
  const photoCount = photos.length + keptPhotos.length;
  const hasContent = Boolean(
    note.trim() || photos.length || activity || meal || keptPhotos.length,
  );

  const close = () => { setConfirmDiscard(false); onClose(); };

  const clear = () => {
    setActivity(''); setMinutes(''); setMeal(''); setKcal('');
    setNote(''); setPhotos([]); setDate(todayKey()); setDropped([]);
    setEqName(''); setEqWeight(''); setEqReps(''); setEqSets('');
    setConfirmDiscard(false);
    onClose();
  };

  // ── บันทึกประจำวันใส่ได้รูปเดียว ──
  // แอปนี้แจกฟรี พื้นที่เก็บรูปคือเงินที่เจ้าของจ่ายแทนผู้ใช้ทุกคน และรูปอาหาร
  // กับรูปในยิมมีไว้ให้จำได้ว่าวันนั้นทำอะไร ใบเดียวก็ทำหน้าที่นั้นได้แล้ว
  // (ต่างจากเอกสารจากหมอ ที่ผลตรวจใบเดียวมักมีหลายแผ่นจริงๆ จึงยังใส่ได้หลายใบ)
  //
  // มีรูปอยู่แล้วจะไม่เขียนทับให้เงียบๆ — ของที่ผู้ใช้เพิ่งถ่ายห้ามหายเพราะกดพลาด
  // บอกไปตรงๆ ว่าต้องเอาใบเดิมออกก่อน
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    if (photoCount > 0) {
      actions.toast('ใส่ได้รูปเดียว — เอารูปเดิมออกก่อนถ้าจะเปลี่ยน');
      return;
    }
    if (files.length > 1) actions.toast('ใส่ได้รูปเดียว — เก็บใบแรกให้');
    const only = files.slice(0, 1);
    setBusy((n) => n + only.length);
    for (const file of only) {
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

    // เที่ยงวันเพื่อกันเขตเวลาทำให้วันเลื่อนไปวันก่อนหน้า — ยกเว้นวันนี้ที่ใช้เวลาจริง
    // เพื่อให้หลายรายการในวันเดียวกันเรียงตามลำดับที่จดจริง
    const sameDay = edit && edit.head.at.slice(0, 10) === date;
    const at = sameDay
      ? edit.head.at
      : date === todayKey()
        ? new Date().toISOString()
        : new Date(`${date}T12:00:00`).toISOString();

    const mins = Number(minutes) || undefined;
    const cal = Number(kcal) || undefined;

    const title = mode === 'exercise'
      ? [activity.trim() || 'ออกกำลังกาย', mins ? `${mins} นาที` : ''].filter(Boolean).join(' · ')
      : mode === 'food'
        ? [meal ? `มื้อ${meal}` : 'อาหาร', cal ? `${cal} แคล` : ''].filter(Boolean).join(' · ')
        : note.trim().split('\n')[0].slice(0, 60) || 'บันทึก';

    const data = mode === 'exercise'
      ? { activity: activity.trim() || undefined, minutes: mins }
      : mode === 'food'
        ? { meal: meal || undefined, kcal: cal }
        : undefined;

    if (edit) {
      // แก้ทุกแถวในชุดพร้อมกัน ชื่อกับเวลาคือกุญแจที่ใช้จับกลุ่ม ถ้าแก้ไม่ครบ
      // บันทึกเดียวจะแตกเป็นสองการ์ดทันทีที่ผู้ใช้แก้ชื่อหรือวันที่
      const keptIds = edit.ids.filter((id) => !dropped.includes(id));
      actions.updateRecords(keptIds, { title, body: note.trim(), data, at });
      if (dropped.length) actions.removeRecords(dropped);
      // รูปที่เพิ่งใส่เพิ่มระหว่างแก้ไข = แถวใหม่ที่ใช้ชื่อและเวลาเดียวกัน
      for (const file of photos) {
        actions.addRecord(bookId, { kind: mode, title, body: '', data, file, important: false, at });
      }
      actions.toast('แก้ไขแล้ว');
      clear();
      return;
    }

    // ตารางเก็บได้รูปละหนึ่งแถว รูปหลายใบจึงเป็นหลายแถว แต่ทุกแถวใช้เวลาเดียวกัน
    // และชื่อเดียวกัน เพื่อให้หน้าจอจับกลับมารวมเป็นบันทึกเดียวได้ — ถ่ายอาหาร
    // มื้อเดียวสามใบต้องเห็นเป็นมื้อเดียว ไม่ใช่สามรายการเรียงกันลงไป
    const shots: (string | undefined)[] = photos.length ? photos : [undefined];
    shots.forEach((file, i) => {
      actions.addRecord(bookId, {
        kind: mode,
        title,
        body: i === 0 ? note.trim() : '',
        data,
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
    <Sheet open={open} title={edit ? 'แก้บันทึก' : 'จดบันทึกวันนี้'} onClose={cancel}>
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
      <input ref={camRef} type="file" accept="image/*" capture="environment"
        hidden onChange={onFiles} />
      <input ref={pickRef} type="file" accept="image/*" hidden onChange={onFiles} />
      <div className="o-row" style={{ marginTop: 12 }}>
        <button type="button" className="o-btn secondary" disabled={photoCount > 0}
          onClick={() => camRef.current?.click()}>
          <Icon name="camera" size={19} /> ถ่ายรูป
        </button>
        <button type="button" className="o-btn ghost" disabled={photoCount > 0}
          onClick={() => pickRef.current?.click()}>
          เลือกรูป
        </button>
      </div>
      {/* ปุ่มที่กดไม่ได้ต้องบอกเหตุผลเสมอ ไม่งั้นผู้ใช้นึกว่าแอปพัง */}
      <p className="o-hint">
        {photoCount > 0
          ? 'ใส่ได้รูปเดียว — กดกากบาทที่รูปเพื่อเปลี่ยนเป็นใบอื่น'
          : 'ใส่ได้รูปเดียว'}
      </p>

      {busy > 0 && <p className="subtle" style={{ marginTop: 8 }}>กำลังย่อรูป {busy} ใบ…</p>}

      {/* รูปเดิมของบันทึกนี้ — เอาออกได้ทีละใบ แต่ยังไม่ลบจริงจนกว่าจะกดบันทึก
          กดกากบาทพลาดแล้วรูปหายทันทีคือของที่เอากลับมาไม่ได้ */}
      {keptPhotos.length > 0 && (
        <>
          <p className="o-label" style={{ marginTop: 12 }}>รูปที่มีอยู่</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {keptPhotos.map((r) => (
              <span key={r.id} style={{ position: 'relative' }}>
                {r.file ? (
                  <img src={r.file} alt={r.title}
                    style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 14, display: 'block' }} />
                ) : (
                  <span style={{
                    width: 84, height: 84, borderRadius: 14, display: 'grid', placeItems: 'center',
                    border: '1px dashed var(--color-neutral-400)', fontSize: 12,
                    color: 'var(--color-neutral-700)', textAlign: 'center', padding: 4,
                  }}>
                    รูปที่เก็บไว้
                  </span>
                )}
                <button type="button" aria-label="เอารูปนี้ออก"
                  onClick={() => setDropped((cur) => [...cur, r.id])}
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
        </>
      )}

      {edit && dropped.length > 0 && (
        <p className="subtle" style={{ marginTop: 8 }}>
          เอารูปออก {dropped.length} ใบ — จะลบจริงตอนกดบันทึก
          <button type="button" className="o-btn ghost" style={{ marginLeft: 8 }}
            onClick={() => setDropped([])}>
            เอากลับคืน
          </button>
        </p>
      )}

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
          <p style={{ margin: '0 0 12px' }}>{edit ? 'ทิ้งที่แก้ไว้?' : 'ทิ้งที่จดไว้?'}</p>
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
          {edit ? 'บันทึกการแก้ไข' : 'จดไว้'}
        </button>
      )}
    </Sheet>
  );
}
