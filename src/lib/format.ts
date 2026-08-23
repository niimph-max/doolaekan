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

/** id เป็น uuid เสมอ เพื่อให้แถวที่สร้างในเครื่องยกขึ้น Postgres ได้ตรงๆ */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // เบราว์เซอร์เก่า / บริบทที่ไม่ใช่ secure context
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
