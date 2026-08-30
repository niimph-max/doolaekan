export const SLOT_LABEL: Record<string, string> = {
  morning: 'เช้า',
  noon: 'เที่ยง',
  evening: 'เย็น',
  bedtime: 'ก่อนนอน',
  prn: 'เมื่อมีอาการ',
};

export const SLOT_TIME: Record<string, string> = {
  morning: '07:30',
  noon: '12:00',
  evening: '17:30',
  bedtime: '21:00',
  prn: '',
};

export const SLOT_ORDER = ['morning', 'noon', 'evening', 'bedtime', 'prn'] as const;

export const MEAL_LABEL: Record<string, string> = {
  '': '',
  before: 'ก่อนอาหาร',
  after: 'หลังอาหาร',
  with: 'พร้อมอาหาร',
};

export const MEAL_ORDER = ['before', 'with', '', 'after'] as const;

/** ยาที่กรอกไว้ก่อนมีช่องนี้ มักเขียน "ก่อนอาหาร/หลังอาหาร" ไว้ในวิธีกินอยู่แล้ว
 *  อ่านจากตรงนั้นให้ ผู้ใช้จะได้ไม่ต้องกลับมาแก้ทีละตัว */
export function inferMealTiming(howToTake: string): '' | 'before' | 'after' | 'with' {
  const text = howToTake ?? '';
  if (text.includes('ก่อนอาหาร') || text.includes('ก่อนอ.')) return 'before';
  if (text.includes('พร้อมอาหาร') || text.includes('กับอาหาร')) return 'with';
  if (text.includes('หลังอาหาร') || text.includes('หลังอ.')) return 'after';
  return '';
}

export function todayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(`${iso}T00:00`).toLocaleDateString('th-TH', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function fmtShortDate(isoDateTime: string): string {
  try {
    return new Date(isoDateTime).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export function fmtTime(isoDateTime: string): string {
  try {
    return new Date(isoDateTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** จำนวนวันจากวันนี้ถึง date ('YYYY-MM-DD') — ลบ = ผ่านไปแล้ว */
export function daysUntil(date: string): number {
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${date}T00:00`).getTime() - t0.getTime()) / 864e5);
}

export function daysLabel(date: string): string {
  const n = daysUntil(date);
  if (n === 0) return 'วันนี้';
  if (n === 1) return 'พรุ่งนี้';
  return n > 0 ? `อีก ${n} วัน` : 'ผ่านไปแล้ว';
}

/** อายุจากวันเกิด — คืน '' ถ้าไม่ได้กรอกหรือวันที่ไม่สมเหตุสมผล */
export function ageFromBirthDate(birthDate: string): string {
  if (!birthDate) return '';
  const born = new Date(`${birthDate}T00:00`);
  if (Number.isNaN(born.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const beforeBirthday = today.getMonth() < born.getMonth()
    || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? String(age) : '';
}

/** วันเกิดแบบไทย เช่น "12 มีนาคม 2495" (พ.ศ. ตามระบบวันที่ไทย) */
export function fmtBirthDate(birthDate: string): string {
  if (!birthDate) return '';
  try {
    return new Date(`${birthDate}T00:00`).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return birthDate;
  }
}

/** id เป็น uuid เสมอ เพื่อให้แถวที่สร้างในเครื่องยกขึ้น Postgres ได้ตรงๆ */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // เบราว์เซอร์เก่า / บริบทที่ไม่ใช่ secure context
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** ไฟล์นี้เป็น PDF หรือไม่ — ดูได้ทั้งจาก data URL ตอนเพิ่งเลือกมา
 *  และจาก path ใน Storage ตอนโหลดกลับมาทีหลัง
 *
 *  ต้องแยกให้ออก เพราะ PDF เปิดในแท็ก img ไม่ได้ ถ้าปนกันผู้ใช้จะเห็นรูปแตก
 *  แทนที่จะเป็นเอกสารที่เพิ่งเก็บไป */
export function isPdf(fileOrPath?: string): boolean {
  if (!fileOrPath) return false;
  return fileOrPath.startsWith('data:application/pdf')
    || /\.pdf(\?|$)/i.test(fileOrPath);
}

/** ขนาดไฟล์จาก data URL — บอกตามจริง ไฟล์เล็กบอกเป็น KB ไม่ปัดขึ้นเป็น 1 MB
 *  ตัวเลขที่ปัดจนผิดความจริงคือสิ่งที่แอปนี้พยายามเลี่ยงมาตลอด */
export function dataUrlSize(dataUrl: string): string {
  const bytes = Math.round((dataUrl.split(',')[1]?.length ?? 0) * 0.75);
  if (bytes < 1024) return `${bytes} ไบต์`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
