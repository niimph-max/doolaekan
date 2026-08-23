import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** ตัดช่องว่าง, BOM และอักขระล่องหนที่มักติดมาตอน copy-paste ค่าลง .env.local */
function clean(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/^﻿/, '')                 // BOM จาก PowerShell Set-Content -Encoding utf8
    .replace(/[​-‍⁠]/g, '')  // zero-width space/joiner ที่เว็บบางที่แทรกมา
    .trim()
    .replace(/^["']|["']$/g, '');           // เผลอใส่เครื่องหมายคำพูดครอบค่า
}

const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** ค่าที่ถูกส่งเป็น HTTP header ต้องเป็นตัวอักษรละตินล้วน ไม่งั้น fetch จะพังด้วยข้อความที่อ่านไม่รู้เรื่อง */
function badChars(value: string): string[] {
  return Array.from(new Set(
    Array.from(value).filter((ch) => ch.charCodeAt(0) > 255),
  ));
}

/** ข้อความอธิบายปัญหาใน .env.local — ว่างเปล่า = ไม่มีปัญหา */
export const configError: string = (() => {
  if (!url && !anonKey) return '';
  if (!url) return 'ไม่พบ NEXT_PUBLIC_SUPABASE_URL ใน .env.local';
  if (!anonKey) return 'ไม่พบ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน .env.local';

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
    return `NEXT_PUBLIC_SUPABASE_URL ไม่ถูกรูปแบบ: "${url}" (ต้องเป็น https://xxxx.supabase.co)`;
  }

  const bad = badChars(anonKey);
  if (bad.length) {
    const codes = bad.map((ch) => `U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
    return `NEXT_PUBLIC_SUPABASE_ANON_KEY มีตัวอักษรแปลกปนอยู่ (${codes.join(', ')}) `
      + 'มักเกิดตอน copy-paste — ให้สร้างไฟล์ .env.local ใหม่แล้ว restart npm run dev';
  }

  // anon key เป็น JWT: สามท่อนคั่นด้วยจุด
  if (anonKey.split('.').length !== 3) {
    return `NEXT_PUBLIC_SUPABASE_ANON_KEY ไม่ใช่คีย์ที่สมบูรณ์ (ยาว ${anonKey.length} ตัวอักษร) `
      + 'น่าจะ copy มาไม่ครบ — ก๊อปใหม่จาก Project Settings → API Keys';
  }

  return '';
})();

/** true เมื่อใส่ค่าใน .env.local ครบและใช้งานได้ — ยังไม่ใส่ = แอปทำงานโหมดเครื่องเดียว */
export const isSupabaseConfigured = Boolean(url && anonKey && !configError);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) client = createClient(url, anonKey);
  return client;
}

/** ตั้งค่าไว้แล้วแต่ค่าผิด — ต้องบอกผู้ใช้ ไม่ใช่เงียบๆ ถอยไปโหมดเครื่องเดียว */
export const hasBrokenConfig = Boolean((url || anonKey) && configError);
