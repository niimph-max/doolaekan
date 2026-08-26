'use client';

import React, { useState } from 'react';
import { Sheet } from '../Sheet';
import { AvatarPicker } from '../Avatar';
import { DraftInput } from '../DraftInput';
import { WatchRuleEditor } from '../WatchRuleEditor';
import { ConnectionCheck } from '../ConnectionCheck';
import { Icon } from '../Icon';
import { ageFromBirthDate, todayKey } from '@/lib/format';
import { buildLabel } from '@/lib/build';
import { useStore } from '@/lib/store';
import type { Book, Doctor } from '@/lib/types';

export function ProfileSheet({ open, book, onClose }: {
  open: boolean; book: Book; onClose: () => void;
}) {
  const { state, actions } = useStore();
  const [dr, setDr] = useState({ name: '', hospital: '', hn: '', phone: '', clinic_hours: '' });
  // แก้บนสำเนาในเครื่อง แล้วบันทึกทีเดียวตอนกดบันทึก — เหมือนการ์ดยา
  // ถ้าบันทึกทุกตัวอักษร นอกจากตัวอักษรจะหายแล้ว การ์ดยังถูกจัดกลุ่มใหม่ตามชื่อหมอ
  // ทุกครั้งที่พิมพ์ การ์ดเดิมจึงถูกถอดออกแล้วสร้างใหม่ คีย์บอร์ดปิดกลางคัน
  const [draft, setDraft] = useState<Doctor | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const doctors = state.doctors.filter((d) => d.book_id === book.id);
  const computedAge = ageFromBirthDate(book.birth_date);

  // หมอคนเดียวออกตรวจได้หลายที่ เก็บเป็นคนละแถวเพราะ HN เบอร์โทร และเวลาออกตรวจ
  // เป็นคนละชุด แต่บนจอต้องอ่านเป็นหมอคนเดียว ไม่ใช่หมอสามคนที่ชื่อบังเอิญเหมือนกัน
  const byDoctor = doctors.reduce((acc, d) => {
    const key = d.name.trim() || 'ยังไม่ได้ตั้งชื่อ';
    acc.set(key, [...(acc.get(key) ?? []), d]);
    return acc;
  }, new Map<string, typeof doctors>());

  const set = (patch: Partial<Book>) => actions.updateBook(book.id, patch);

  return (
    <Sheet open={open} title="โปรไฟล์ &amp; หมอ" onClose={onClose}>
      <label className="o-label" style={{ marginTop: 0 }}>รูปโปรไฟล์</label>
      <AvatarPicker book={book} />

      <label className="o-label" htmlFor="pf-name">ชื่อเรียกในสมุด</label>
      <DraftInput id="pf-name" value={book.owner_name}
        onCommit={(v) => set({ owner_name: v })} />

      <label className="o-label" htmlFor="pf-full">ชื่อ–นามสกุลจริง</label>
      <DraftInput id="pf-full" value={book.full_name}
        onCommit={(v) => set({ full_name: v })} />

      <label className="o-label" htmlFor="pf-birth">วันเดือนปีเกิด</label>
      <DraftInput id="pf-birth" type="date" max={todayKey()}
        value={book.birth_date} onCommit={(v) => set({ birth_date: v })} />
      {computedAge && (
        <p className="subtle" style={{ margin: '6px 0 0' }}>
          อายุ {computedAge} ปี — แอปคำนวณให้เอง ไม่ต้องมาแก้ทุกปี
        </p>
      )}

      <div className="o-row">
        <div>
          <label className="o-label" htmlFor="pf-age">
            {computedAge ? 'อายุ (คำนวณแล้ว)' : 'อายุ (ถ้าจำวันเกิดไม่ได้)'}
          </label>
          <DraftInput id="pf-age" inputMode="numeric"
            value={computedAge || book.age}
            disabled={Boolean(computedAge)}
            placeholder="เช่น 74"
            onCommit={(v) => set({ age: v })} />
        </div>
        <div>
          <label className="o-label" htmlFor="pf-blood">กรุ๊ปเลือด</label>
          <DraftInput id="pf-blood" value={book.blood_type}
            onCommit={(v) => set({ blood_type: v })} />
        </div>
      </div>

      <label className="o-label" htmlFor="pf-addr">ที่อยู่</label>
      <DraftInput id="pf-addr" value={book.address}
        onCommit={(v) => set({ address: v })} />

      <label className="o-label" htmlFor="pf-allergy">แพ้ยา</label>
      <DraftInput id="pf-allergy" value={book.allergy}
        onCommit={(v) => set({ allergy: v })} />

      <label className="o-label" htmlFor="pf-contact">เบอร์ติดต่อลูก</label>
      <DraftInput id="pf-contact" value={book.emergency_contact}
        onCommit={(v) => set({ emergency_contact: v })} />

      <h3 style={{ fontSize: 19, margin: '22px 0 8px' }}>หมอที่รักษา</h3>
      {byDoctor.size === 0 && (
        <p className="subtle" style={{ margin: '0 0 8px' }}>ยังไม่ได้เพิ่มหมอ</p>
      )}
      {Array.from(byDoctor.entries()).map(([name, places]) => (
        <div key={name} className="o-card" style={{ padding: 16 }}>
          <strong>{name}</strong>
          {places.length > 1 && (
            <span className="subtle"> · ออกตรวจ {places.length} ที่</span>
          )}

          {places.map((d) => {
            const isEditing = draft?.id === d.id;
            const isConfirmingDelete = deletingId === d.id;
            const setField = (patch: Partial<Doctor>) =>
              setDraft((cur) => (cur ? { ...cur, ...patch } : cur));
            return (
              <div key={d.id} style={{
                marginTop: 12, paddingTop: 12,
                borderTop: '1px solid var(--color-neutral-200)',
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>{d.hospital || 'ยังไม่ได้ระบุโรงพยาบาล'}</div>
                    <div className="subtle">
                      {[d.hn && `HN ${d.hn}`, d.clinic_hours].filter(Boolean).join(' · ') || '—'}
                    </div>
                    {d.phone && (
                      <a className="o-btn secondary" href={`tel:${d.phone.replace(/[^\d+]/g, '')}`}
                        style={{ marginTop: 8, padding: '6px 16px', minHeight: 36, textDecoration: 'none' }}>
                        <Icon name="phone" size={17} /> {d.phone}
                      </a>
                    )}
                  </div>
                  {!isEditing && (
                    <button type="button" className="o-btn ghost" style={{ padding: '8px 14px', minHeight: 36 }}
                      onClick={() => { setDraft({ ...d }); setDeletingId(null); }}>
                      แก้ไข
                    </button>
                  )}
                </div>

                {isEditing && draft && (
                  <div style={{ marginTop: 12 }}>
                    <label className="o-label" htmlFor={`dr-name-${d.id}`}>หมอ / แผนก</label>
                    <input id={`dr-name-${d.id}`} className="o-input" value={draft.name}
                      onChange={(e) => setField({ name: e.target.value })} />

                    <label className="o-label" htmlFor={`dr-hosp-${d.id}`}>โรงพยาบาล / คลินิก</label>
                    <input id={`dr-hosp-${d.id}`} className="o-input" value={draft.hospital}
                      onChange={(e) => setField({ hospital: e.target.value })} />

                    <label className="o-label" htmlFor={`dr-hn-${d.id}`}>เลข HN ที่นี่</label>
                    <input id={`dr-hn-${d.id}`} className="o-input" value={draft.hn}
                      onChange={(e) => setField({ hn: e.target.value })} />

                    <label className="o-label" htmlFor={`dr-phone-${d.id}`}>เบอร์โทรที่นี่</label>
                    <input id={`dr-phone-${d.id}`} className="o-input" type="tel" inputMode="tel"
                      placeholder="เช่น 039-324-975" value={draft.phone}
                      onChange={(e) => setField({ phone: e.target.value })} />

                    <label className="o-label" htmlFor={`dr-hours-${d.id}`}>เวลาออกตรวจ</label>
                    <input id={`dr-hours-${d.id}`} className="o-input" placeholder="เช่น พุธ 09:00–12:00"
                      value={draft.clinic_hours}
                      onChange={(e) => setField({ clinic_hours: e.target.value })} />

                    <div className="o-row" style={{ marginTop: 14 }}>
                      <button type="button" className="o-btn ghost" onClick={() => setDraft(null)}>
                        ยกเลิก
                      </button>
                      <button type="button" className="o-btn primary"
                        onClick={() => {
                          actions.updateDoctor(d.id, {
                            name: draft.name, hospital: draft.hospital, hn: draft.hn,
                            phone: draft.phone, clinic_hours: draft.clinic_hours,
                          });
                          setDraft(null);
                          actions.toast('บันทึกข้อมูลหมอแล้ว');
                        }}>
                        บันทึก
                      </button>
                    </div>

                    {isConfirmingDelete ? (
                      <div className="o-row" style={{ marginTop: 14 }}>
                        <button type="button" className="o-btn ghost" onClick={() => setDeletingId(null)}>
                          ไม่ลบ
                        </button>
                        <button type="button" className="o-btn danger"
                          onClick={() => {
                            actions.removeDoctor(d.id);
                            setDeletingId(null);
                            setDraft(null);
                            actions.toast(`ลบ ${d.name}${d.hospital ? ` ที่${d.hospital}` : ''} แล้ว`);
                          }}>
                          ยืนยันลบ
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="o-btn ghost block" style={{ marginTop: 14 }}
                        onClick={() => setDeletingId(d.id)}>
                        <Icon name="x" size={17} />
                        {places.length > 1 ? ' ลบเฉพาะที่นี่' : ' ลบหมอคนนี้'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* หมอคนเดิมที่โรงพยาบาลอื่น — ชื่อเติมให้เลย จะได้ไม่พิมพ์เพี้ยนจนกลายเป็นคนละคน */}
          <button type="button" className="o-btn ghost block" style={{ marginTop: 12 }}
            onClick={() => {
              setDr({ name, hospital: '', hn: '', phone: '', clinic_hours: '' });
              document.getElementById('pf-dr-hospital')?.focus();
            }}>
            <Icon name="plus" size={17} /> เพิ่มโรงพยาบาลอีกที่ของ{name}
          </button>
        </div>
      ))}

      <label className="o-label" htmlFor="pf-dr-name">เพิ่มหมอ</label>
      <input id="pf-dr-name" className="o-input" placeholder="หมอ / แผนก"
        value={dr.name} onChange={(e) => setDr({ ...dr, name: e.target.value })} />
      <input id="pf-dr-hospital" className="o-input" style={{ marginTop: 8 }} placeholder="โรงพยาบาล / คลินิก"
        value={dr.hospital} onChange={(e) => setDr({ ...dr, hospital: e.target.value })} />
      <input className="o-input" style={{ marginTop: 8 }} placeholder="เลข HN ที่นี่"
        value={dr.hn} onChange={(e) => setDr({ ...dr, hn: e.target.value })} />
      <input className="o-input" style={{ marginTop: 8 }} type="tel" inputMode="tel"
        placeholder="เบอร์โทรที่นี่ เช่น 039-324-975"
        value={dr.phone} onChange={(e) => setDr({ ...dr, phone: e.target.value })} />
      <input className="o-input" style={{ marginTop: 8 }} placeholder="เวลาออกตรวจ"
        value={dr.clinic_hours} onChange={(e) => setDr({ ...dr, clinic_hours: e.target.value })} />
      <button type="button" className="o-btn secondary block" style={{ marginTop: 10 }}
        disabled={!dr.name.trim()}
        onClick={() => {
          actions.addDoctor(book.id, dr);
          setDr({ name: '', hospital: '', hn: '', phone: '', clinic_hours: '' });
          actions.toast(`เพิ่ม ${dr.name}${dr.hospital ? ` ที่${dr.hospital}` : ''} แล้ว`);
        }}>
        <Icon name="plus" size={19} /> เพิ่มหมอคนนี้
      </button>

      <WatchRuleEditor book={book} />

      <button type="button" className="o-btn primary block" style={{ marginTop: 22 }} onClick={onClose}>
        เสร็จแล้ว
      </button>

      {/* เลขรุ่น + อีเมลที่เข้าระบบอยู่ + สมุดที่เปิดค้าง — สามอย่างนี้ตอบได้เกือบทุกคำถาม
          เวลาบันทึกไม่ผ่าน ว่าเป็นเพราะรันของเก่า เข้าคนละบัญชี หรือสมุดไม่ตรง */}
      <p className="subtle" style={{ marginTop: 14, textAlign: 'center', fontSize: 14 }}>
        {buildLabel}
        {state.userEmail && <><br />เข้าระบบ: {state.userEmail}</>}
        <br />รหัสสมุดนี้: {book.id}
      </p>

      {state.mode === 'cloud' && <ConnectionCheck book={book} />}

      {state.mode === 'cloud' && (
        <>
          <p className="subtle" style={{ marginTop: 18, textAlign: 'center' }}>
            ข้อมูลซิงก์กับครอบครัวผ่านคลาวด์อยู่
          </p>
          <button type="button" className="o-btn ghost block" style={{ marginTop: 8 }}
            onClick={() => { void actions.signOut(); }}>
            ออกจากระบบ
          </button>
        </>
      )}
    </Sheet>
  );
}
