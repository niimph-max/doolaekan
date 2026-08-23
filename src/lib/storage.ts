import type { AppState } from './types';

const KEY = 'doolaekan_v1';

/** ส่วนของ state ที่ต้องจำข้ามการเปิดแอป (ไม่เก็บ tab/ready) */
export type Persisted = Omit<AppState, 'ready' | 'tab'>;

export function loadLocal(): Persisted | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

export function saveLocal(state: AppState): void {
  if (typeof window === 'undefined') return;
  try {
    const { ready: _ready, tab: _tab, ...rest } = state;
    window.localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* โควตาเต็ม / โหมดส่วนตัว — ข้ามไป ไม่ให้แอปพัง */
  }
}

export function clearLocal(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
