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
