'use client';

import React, { useRef, useState } from 'react';
import { Icon } from './Icon';
import { hasNativeCamera, shootPhoto } from '@/lib/camera';
import { readAsDataUrl } from '@/lib/photo';
import { useStore } from '@/lib/store';
import type { Book } from '@/lib/types';

/** ขนาดที่ย่อก่อนเก็บ — ต้องเล็กพอที่จะเก็บไปกับข้อมูลสมุดได้โดยไม่ทำให้
 *  สำเนาในเครื่องเขียนไม่ลง (เพดาน localStorage ราว 5 MB ทั้งเครื่อง)
 *  160px คุณภาพ 0.7 ได้ไฟล์ราว 6 KB ซึ่งคมพอสำหรับวงกลมขนาดจริงบนจอ */
const SIZE = 160;
const QUALITY = 0.7;

/** ย่อรูปจากมือถือ (หลายเมกะไบต์) ให้เหลือรูปเล็กสี่เหลี่ยมจัตุรัส
 *  ตัดตรงกลางเพื่อไม่ให้หน้าคนถูกบีบผิดสัดส่วนเวลาใส่ในวงกลม */
function shrink(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('ย่อรูปไม่ได้')); return; }
      ctx.drawImage(
        img,
        (img.width - side) / 2, (img.height - side) / 2, side, side,
        0, 0, SIZE, SIZE,
      );
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = () => reject(new Error('อ่านรูปไม่ได้'));
    img.src = dataUrl;
  });
}

/** วงกลมรูปโปรไฟล์ของสมุด — ไม่มีรูปก็แสดงอักษรตัวแรกของชื่อ */
export function Avatar({ book, size = 46 }: { book: Book; size?: number }) {
  const style: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', flex: `0 0 ${size}px`,
    objectFit: 'cover', display: 'block',
  };
  if (book.avatar) return <img src={book.avatar} alt={book.owner_name} style={style} />;
  return (
    <span
      className="ph"
      style={{
        ...style,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, fontWeight: 700, color: 'var(--color-accent-700)',
      }}
    >
      {book.owner_name.trim().charAt(0)}
    </span>
  );
}

/** ตั้ง / เปลี่ยน / ลบรูปโปรไฟล์ของสมุดเล่มนี้ */
export function AvatarPicker({ book }: { book: Book }) {
  const { actions } = useStore();
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  /** ทางเดียวที่รับรูป ไม่ว่าจะมาจากกล้องของเครื่องหรือจากช่องเลือกไฟล์ */
  const useImage = async (dataUrl: string) => {
    setBusy(true);
    try {
      const small = await shrink(dataUrl);
      actions.updateBook(book.id, { avatar: small });
      actions.toast('เปลี่ยนรูปโปรไฟล์แล้ว');
    } catch {
      actions.toast('ใช้รูปนี้ไม่ได้ ลองรูปอื่น');
    }
    setBusy(false);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await useImage(await readAsDataUrl(file));
    } catch {
      actions.toast('อ่านไฟล์รูปไม่ได้');
      setBusy(false);
    }
  };

  /** ในแอปใช้กล้องหน้าของเครื่องจริง ในเบราว์เซอร์กดผ่านช่องเลือกไฟล์ที่ซ่อนไว้ */
  const shoot = async () => {
    if (!hasNativeCamera()) { camRef.current?.click(); return; }
    try {
      const dataUrl = await shootPhoto({ front: true });
      if (dataUrl) await useImage(dataUrl);     // ว่าง = กดยกเลิก ไม่ใช่ความผิดพลาด
    } catch (e) {
      actions.toast(`เปิดกล้องไม่ได้ — ${(e as Error).message}`);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 4 }}>
      <Avatar book={book} size={72} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="o-row">
          <button type="button" className="o-btn ghost" disabled={busy}
            onClick={() => void shoot()}>
            <Icon name="camera" size={17} /> {busy ? 'กำลังย่อ…' : 'ถ่ายรูป'}
          </button>
          <button type="button" className="o-btn ghost" disabled={busy}
            onClick={() => pickRef.current?.click()}>
            เลือกรูป
          </button>
        </div>
        {book.avatar && (
          <button type="button" className="o-btn ghost block" style={{ marginTop: 8 }}
            onClick={() => {
              actions.updateBook(book.id, { avatar: '' });
              actions.toast('เอารูปโปรไฟล์ออกแล้ว');
            }}>
            <Icon name="x" size={16} /> เอารูปออก
          </button>
        )}
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="user"
        onChange={onFile} style={{ display: 'none' }} />
      <input ref={pickRef} type="file" accept="image/*"
        onChange={onFile} style={{ display: 'none' }} />
    </div>
  );
}
