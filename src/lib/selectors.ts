import type { AppState, Appointment, Book, DoseSlot, MealTiming, Medication, MedLog, RecordItem, ShareLevel, WatchRule } from './types';
import { MEAL_ORDER, SLOT_ORDER, daysUntil, inferMealTiming, todayKey } from './format';

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
  key: string;
  slot: DoseSlot;
  timing: MealTiming;
  meds: Medication[];
  logs: MedLog[];
  status: 'taken' | 'refused' | 'pending';
}

/** จังหวะกินของยาตัวนี้ — ใช้ค่าที่ตั้งไว้ก่อน ถ้าไม่มีค่อยอ่านจากข้อความวิธีกิน */
export function mealTimingOf(m: Medication): MealTiming {
  return m.timing || inferMealTiming(m.how_to_take);
}

/** ยาวันนี้จัดเป็นมื้อแบบที่คนที่บ้านคิด — แยก "ก่อนอาหารเช้า" กับ "หลังอาหารเช้า"
 *  ออกจากกัน เพราะเป็นคนละเวลาจริงๆ กินพร้อมกันไม่ได้ */
export function todayDoseGroups(state: AppState, bookId: string, day = todayKey()): DoseGroup[] {
  const groups: DoseGroup[] = [];
  for (const dose of todayDoses(state, bookId, day)) {
    const timing = mealTimingOf(dose.medication);
    const key = `${dose.slot}:${timing}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, slot: dose.slot, timing, meds: [], logs: [], status: 'pending' };
      groups.push(g);
    }
    g.meds.push(dose.medication);
    if (dose.log) g.logs.push(dose.log);
  }
  for (const g of groups) {
    if (g.logs.some((l) => l.status === 'refused')) g.status = 'refused';
    else if (g.logs.length === g.meds.length && g.meds.length > 0) g.status = 'taken';
  }
  // เรียงตามมื้อก่อน แล้วค่อย ก่อนอาหาร → พร้อมอาหาร → ไม่ระบุ → หลังอาหาร
  return groups.sort((a, b) => (
    SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)
    || MEAL_ORDER.indexOf(a.timing) - MEAL_ORDER.indexOf(b.timing)
  ));
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

/** ระดับที่สมุดเล่มนี้ยินยอมแชร์เข้ากลุ่มหนึ่ง (ค่าเริ่มต้น = ยังไม่แชร์) */
export function shareLevel(state: AppState, bookId: string, groupId = state.activeGroupId): ShareLevel {
  return state.shares.find((s) => s.book_id === bookId && s.group_id === groupId)?.level ?? 'none';
}

/** สมุดที่มองเห็นในกลุ่มปัจจุบัน (ของตัวเองเห็นเสมอ) */
export function visibleBooks(state: AppState): Book[] {
  return state.books.filter((b) => b.is_mine || shareLevel(state, b.id) !== 'none');
}

export function activeBook(state: AppState): Book | undefined {
  return state.books.find((b) => b.id === state.activeBookId) ?? state.books[0];
}

/** ชื่อคนที่เลือกเป็น "คนพาไปหาหมอ" ได้
 *  = สมาชิกกลุ่มปัจจุบัน + ชื่อที่เคยพิมพ์เพิ่มเองในนัดก่อนๆ (คนนอกกลุ่ม เช่น หลาน คนขับรถ)
 *  พิมพ์ครั้งเดียวแล้วครั้งหน้าเลือกได้เลย ไม่ต้องพิมพ์ซ้ำ */
export function escortOptions(state: AppState): string[] {
  const group = state.groups.find((g) => g.id === state.activeGroupId);
  const members = (group?.members ?? []).map((m) => m.name.replace(' (คนดูแล)', ''));
  const own = state.books.filter((b) => b.is_mine).map((b) => b.owner_name);
  const used = state.appointments.map((a) => a.escort);
  const names = Array.from(new Set([...members, ...own, ...used].filter(Boolean)))
    .filter((n) => n !== 'ไปเอง');
  return [...names, 'ไปเอง'];
}

/** ค่าที่เคยใช้มาก่อนในสมุดเล่มนี้ สำหรับให้เลือกแทนการพิมพ์ใหม่ทุกครั้ง
 *  รวมจากรายชื่อหมอในโปรไฟล์ และจากยาที่บันทึกไว้แล้ว */
export function medFieldOptions(state: AppState, bookId: string) {
  const doctors = state.doctors.filter((d) => d.book_id === bookId);
  const meds = state.medications.filter((m) => m.book_id === bookId);
  const uniq = (list: string[]) => Array.from(new Set(list.map((v) => v.trim()).filter(Boolean))).sort();
  return {
    prescribers: uniq([...doctors.map((d) => d.name), ...meds.map((m) => m.prescriber)]),
    tags: uniq(meds.map((m) => m.tag)),
    hospitals: uniq([...doctors.map((d) => d.hospital), ...meds.map((m) => m.hospital)]),
  };
}

/** เลือกชื่อหมอแล้วเติมโรงพยาบาลให้ ถ้าหมอคนนั้นมีอยู่ในโปรไฟล์ */
export function hospitalOfDoctor(state: AppState, bookId: string, doctorName: string): string {
  const name = doctorName.trim();
  if (!name) return '';
  const doc = state.doctors.find(
    (d) => d.book_id === bookId && (d.name === name || `หมอ${d.name}` === name),
  );
  return doc?.hospital ?? '';
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
