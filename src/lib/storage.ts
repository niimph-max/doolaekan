import type { AppState } from './types';

const KEY = 'doolaekan_v1';        // ข้อมูลทั้งก้อน (โหมดเครื่องเดียว)
const PREFS_KEY = 'doolaekan_prefs'; // ค่าที่ผูกกับเครื่องนี้ ใช้ทั้งสองโหมด

/** ส่วนของ state ที่ต้องจำข้ามการเปิดแอป (ไม่เก็บสถานะชั่วคราวของหน้าจอ) */
export type Persisted = Omit<AppState, 'ready' | 'tab' | 'mode' | 'userId'>;

/** ค่าประจำเครื่อง: ใครกดอยู่, สมุด/กลุ่มที่เปิดค้าง, โหมดตัวหนังสือใหญ่ */
export interface Prefs {
  actorName: string;
  bigText: boolean;
  activeBookId: string;
  activeGroupId: string;
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* โควตาเต็ม / โหมดส่วนตัว — ข้ามไป ไม่ให้แอปพัง */
  }
}

export function loadLocal(): Persisted | null {
  return read<Persisted>(KEY);
}

export function saveLocal(state: AppState): void {
  const { ready: _ready, tab: _tab, mode: _mode, userId: _userId, ...rest } = state;
  write(KEY, rest);
}

export function clearLocal(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** สำเนาข้อมูลจากคลาวด์ครั้งล่าสุด — เปิดแอปแล้วเห็นของทันที ไม่ต้องนั่งรอโหลด
 *  แยกตามผู้ใช้ เพราะเครื่องเดียวอาจสลับบัญชีกันได้ */
const cacheKey = (userId: string) => `doolaekan_cache_${userId}`;

export type CloudCache = Pick<
  AppState,
  'books' | 'doctors' | 'medications' | 'medLogs' | 'appointments'
  | 'records' | 'watchRules' | 'groups' | 'shares'
>;

export function loadCloudCache(userId: string): CloudCache | null {
  if (!userId) return null;
  return read<CloudCache>(cacheKey(userId));
}

export function saveCloudCache(userId: string, data: CloudCache): void {
  if (!userId) return;
  // รูปสแกนเป็นลิงก์ชั่วคราวที่หมดอายุ เก็บไว้ก็ใช้ไม่ได้ ตัดทิ้งให้ไฟล์เล็กลงด้วย
  write(cacheKey(userId), {
    ...data,
    records: data.records.map(({ file: _file, ...rest }) => rest),
  });
}

export function clearCloudCache(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.removeItem(cacheKey(userId));
  } catch {
    /* ignore */
  }
}

/** ใครเข้าระบบค้างไว้เป็นคนล่าสุด — ใช้หยิบสำเนาขึ้นจอตั้งแต่วินาทีแรก
 *  ก่อนที่จะรู้ผลการเช็ค session (ซึ่งต้องรอเน็ต) */
const LAST_USER_KEY = 'doolaekan_last_user';

export function loadLastUserId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(LAST_USER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastUserId(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) window.localStorage.setItem(LAST_USER_KEY, userId);
    else window.localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function loadPrefs(): Partial<Prefs> {
  return read<Prefs>(PREFS_KEY) ?? {};
}

export function savePrefs(state: AppState): void {
  write(PREFS_KEY, {
    actorName: state.actorName,
    bigText: state.bigText,
    activeBookId: state.activeBookId,
    activeGroupId: state.activeGroupId,
  } satisfies Prefs);
}

/** บัญชีที่ "เครื่องนี้เคยเปิดสมุดได้จริง" มาก่อน
 *
 *  ใช้แยกสองกรณีที่หน้าตาเหมือนกันเป๊ะ คือได้สมุดกลับมา 0 เล่ม:
 *  ผู้ใช้ใหม่ที่ยังไม่มีสมุดจริงๆ กับผู้ใช้เดิมที่อ่านข้อมูลไม่ติดชั่วคราว
 *  (token หมดอายุแล้วต่อไม่ทัน ฐานข้อมูลจึงมองไม่เห็นว่าเราคือใคร แล้วตอบว่าว่าง
 *  โดยไม่นับเป็น error) ถ้าแยกไม่ออกจะพาผู้ใช้เดิมไปหน้ากรอกข้อมูลใหม่
 *  แล้วได้สมุดซ้ำสองเล่ม */
const HAD_BOOK_KEY = 'doolaekan_had_book';

export function hadBookBefore(userId: string): boolean {
  if (!userId) return false;
  return (read<string[]>(HAD_BOOK_KEY) ?? []).includes(userId);
}

export function markHadBook(userId: string): void {
  if (!userId || hadBookBefore(userId)) return;
  write(HAD_BOOK_KEY, [...(read<string[]>(HAD_BOOK_KEY) ?? []), userId]);
}

export function forgetHadBook(userId: string): void {
  if (!userId) return;
  write(HAD_BOOK_KEY, (read<string[]>(HAD_BOOK_KEY) ?? []).filter((id) => id !== userId));
}

/** ล้างใบเข้าระบบทั้งหมดในเครื่องนี้ทิ้ง โดยไม่พึ่งเซิร์ฟเวอร์เลย
 *
 *  ทางออกสุดท้ายสำหรับตอนที่ใบเข้าระบบเสียจนคุยกับเซิร์ฟเวอร์ไม่ได้ ซึ่งเป็นจังหวะ
 *  เดียวกับที่ผู้ใช้อยากออกจากระบบที่สุด ถ้าทางออกต้องรอเซิร์ฟเวอร์ก็จะไม่มีทางออก */
export function clearAuthStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const doomed = Object.keys(window.localStorage)
      .filter((k) => k.startsWith('sb-') || k.startsWith('supabase.') || k === LAST_USER_KEY);
    for (const k of doomed) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
