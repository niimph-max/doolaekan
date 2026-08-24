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
