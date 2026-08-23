import type { AppState, Appointment, Book, DoseSlot, Medication, MedLog, RecordItem, WatchRule } from './types';
import { SLOT_ORDER, daysUntil, todayKey } from './format';

export interface Dose {
  key: string;
  medication: Medication;
  slot: DoseSlot;
  log?: MedLog;
}

/** ยาที่ต้องกินวันนี้ของสมุดเล่มหนึ่ง เรียงตามมื้อ (ข้าม prn ที่กินเมื่อมีอาการ) */
export function todayDoses(state: AppState, bookId: string, day = todayKey()): Dose[] {
  const meds = state.medications.filter((m) => m.book_id === bookId);
  const doses: Dose[] = [];
  for (const slot of SLOT_ORDER) {
    if (slot === 'prn') continue;
    for (const m of meds) {
      if (!m.slots.includes(slot)) continue;
      doses.push({
        key: `${m.id}:${slot}`,
        medication: m,
        slot,
        log: state.medLogs.find(
          (l) => l.medication_id === m.id && l.slot === slot && l.day === day,
        ),
      });
    }
  }
  return doses;
}

export interface DoseGroup {
  slot: DoseSlot;
  meds: Medication[];
  logs: MedLog[];
  status: 'taken' | 'refused' | 'pending';
}

/** ยาวันนี้จัดเป็น "มื้อ" แบบที่คนที่บ้านคิด — เช้า/เที่ยง/เย็น/ก่อนนอน กดทีเดียวทั้งมื้อ */
export function todayDoseGroups(state: AppState, bookId: string, day = todayKey()): DoseGroup[] {
  const groups: DoseGroup[] = [];
  for (const dose of todayDoses(state, bookId, day)) {
    let g = groups.find((x) => x.slot === dose.slot);
    if (!g) {
      g = { slot: dose.slot, meds: [], logs: [], status: 'pending' };
      groups.push(g);
    }
    g.meds.push(dose.medication);
    if (dose.log) g.logs.push(dose.log);
  }
  for (const g of groups) {
    if (g.logs.some((l) => l.status === 'refused')) g.status = 'refused';
    else if (g.logs.length === g.meds.length && g.meds.length > 0) g.status = 'taken';
  }
  return groups;
}

/** นัดถัดไป (วันนี้เป็นต้นไป) */
export function nextAppointment(state: AppState, bookId: string): Appointment | undefined {
  return state.appointments
    .filter((a) => a.book_id === bookId && daysUntil(a.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
}

export function bookAppointments(state: AppState, bookId: string): Appointment[] {
  return state.appointments
    .filter((a) => a.book_id === bookId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export function bookRecords(state: AppState, bookId: string): RecordItem[] {
  return state.records
    .filter((r) => r.book_id === bookId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** ค่าความดัน N ครั้งล่าสุด เรียงเก่า→ใหม่ สำหรับกราฟแท่ง */
export function bpHistory(state: AppState, bookId: string, limit = 7) {
  return state.records
    .filter((r) => r.book_id === bookId && r.kind === 'bp' && r.data?.sys)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-limit);
}

export function bookWatchRules(state: AppState, bookId: string): WatchRule[] {
  return state.watchRules.filter((w) => w.book_id === bookId);
}

/** ข้อเฝ้าระวังที่ตรงกับอาการที่เพิ่งจด — ใช้ตัดสินว่าต้องเตือนด่วนไหม */
export function matchWatchRules(state: AppState, bookId: string, symptoms: string[]): WatchRule[] {
  return bookWatchRules(state, bookId).filter(
    (w) => w.severity === 'urgent' && w.triggers.some((t) => symptoms.includes(t)),
  );
}

/** สมุดที่มองเห็นในกลุ่มปัจจุบัน (ของตัวเองเห็นเสมอ) */
export function visibleBooks(state: AppState): Book[] {
  const group = state.groups.find((g) => g.id === state.activeGroupId);
  if (!group) return state.books.filter((b) => b.is_mine);
  return state.books.filter((b) => b.is_mine || (group.book_ids.includes(b.id) && b.share_level !== 'none'));
}

export function activeBook(state: AppState): Book | undefined {
  return state.books.find((b) => b.id === state.activeBookId) ?? state.books[0];
}

export const SHARE_LABEL: Record<string, string> = {
  full: 'ทุกคนเห็น',
  appointments: 'แชร์บางส่วน',
  none: 'ส่วนตัว',
};

/** สรุปสถานะสั้นๆ ใต้ชื่อสมุดในแท็บ "สมุด" */
export function bookSummary(state: AppState, bookId: string): string {
  const doses = todayDoses(state, bookId);
  const pending = doses.filter((d) => !d.log).length;
  const next = nextAppointment(state, bookId);
  const parts: string[] = [];
  if (doses.length) parts.push(pending ? `ยังไม่กินยา ${pending} มื้อ` : 'กินยาครบแล้ววันนี้');
  if (next) parts.push(`นัด ${next.title.split(' — ')[0]} ${daysUntil(next.date)} วัน`);
  return parts.join(' · ') || 'ยังไม่มีข้อมูลวันนี้';
}
