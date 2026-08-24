'use client';

import React, { useState } from 'react';

const NEW = '__new__';

/** ช่องกรอกที่เลือกจากค่าที่เคยใช้มาก่อนได้ หรือพิมพ์ค่าใหม่
 *  จุดประสงค์: ชื่อหมอพิมพ์ต่างกันนิดเดียว ("วิวัฒน์ /โรคหัวใจ" กับ "วิวัฒน์ โรคหัวใจ")
 *  จะกลายเป็นคนละคนทันที การเลือกจากรายการที่มีอยู่แล้วตัดปัญหานี้ทิ้ง */
export function ComboField({ id, label, value, options, placeholder, onChange }: {
  id: string;
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  // ค่าที่มีอยู่แต่ไม่อยู่ในรายการ (เพิ่งพิมพ์เอง) ต้องเลือกค้างไว้ได้
  const known = value && !options.includes(value) ? [...options, value] : options;
  const [typing, setTyping] = useState(false);

  if (!known.length || typing) {
    return (
      <>
        <label className="o-label" htmlFor={id}>{label}</label>
        <input id={id} className="o-input" placeholder={placeholder} value={value}
          autoFocus={typing}
          onChange={(e) => onChange(e.target.value)} />
        {known.length > 0 && (
          <button type="button" className="o-btn ghost" style={{ marginTop: 8, padding: '6px 16px', minHeight: 34 }}
            onClick={() => setTyping(false)}>
            เลือกจากรายการเดิม
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <label className="o-label" htmlFor={id}>{label}</label>
      <select id={id} className="o-select" value={value}
        onChange={(e) => {
          if (e.target.value === NEW) {
            onChange('');
            setTyping(true);
            return;
          }
          onChange(e.target.value);
        }}>
        <option value="">{placeholder ?? 'ยังไม่ระบุ'}</option>
        {known.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={NEW}>＋ พิมพ์ชื่อใหม่</option>
      </select>
    </>
  );
}
