import type { AppState, Appointment, Book, DoseSlot, MealTiming, Medication, MedLog, RecordItem, RecordKind, ShareLevel, WatchRule } from './types';
import { MEAL_ORDER, SLOT_ORDER, daysUntil, inferMealTiming, todayKey } from './format';

export interface Dose {
  key: string;
  medication: Medication;
  slot: DoseSlot;
  log?: MedLog;
}

/** ยาที่ต้องกินวันนี้ของสมุดเล่มหนึ่ง เรียงตามมื้อ (ข้าม prn ที่กินเมื่อมีอาการ) */
export function todayDoses(state: AppState, bookId: string, day = todayKey()): Dose[] {
  // ยาที่พักไว้ยังอยู่ในสมุด แต่วันนี้ไม่ต้องกิน จึงไม่ควรโผล่ในรายการยาวันนี้
  const meds = state.medications.filter((m) => m.book_id === bookId && !m.paused);
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
    // บันทึกประจำวัน (ออกกำลังกาย/อาหาร) มีแท็บของตัวเองแล้ว และจดกันแทบทุกวัน
    // ถ้าปล่อยให้ไหลมากองในไทม์ไลน์สุขภาพ เรื่องที่ต้องรีบเห็นอย่างอาการหรือ
    // ความดันจะถูกดันหายไปข้างล่างภายในไม่กี่วัน
    .filter((r) => r.book_id === bookId && !ACTIVITY_KINDS.includes(r.kind))
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
  const places = state.doctors.filter(
    (d) => d.book_id === bookId && (d.name === name || `หมอ${d.name}` === name),
  );
  // หมอคนเดียวออกตรวจหลายที่ — เดาแทนไม่ได้ว่ายาถุงนี้ได้มาจากที่ไหน
  // เติมให้เองเฉพาะตอนที่มีที่เดียว ไม่งั้นจะกรอกผิดให้โดยที่ผู้ใช้ไม่ทันสังเกต
  const hospitals = Array.from(new Set(places.map((d) => d.hospital.trim()).filter(Boolean)));
  return hospitals.length === 1 ? hospitals[0] : '';
}

export const SHARE_LABEL: Record<string, string> = {
  full: 'ทุกคนเห็น',
  appointments: 'แชร์บางส่วน',
  none: 'ส่วนตัว',
};

/** สรุปสถานะสั้นๆ ใต้ชื่อสมุดในแท็บ "สมุด" */
export function bookSummary(state: AppState, bookId: string): string {
  const doses = todayDoses(state, bookId);
  const next = nextAppointment(state, bookId);
  const parts: string[] = [];
  // ── ไม่บอกจำนวนมื้อที่ "ยังไม่กิน" ──
  // ปุ่มกดกินยาไม่ได้ถูกกดตามจริงทุกมื้อ คนที่บ้านกินยาไปแล้วแต่ไม่มีใครกด เป็นเรื่องปกติ
  // ตัวเลขนั้นจึงแปลว่า "ยังไม่มีใครกด" ไม่ใช่ "ยังไม่ได้กิน" ซึ่งคนละเรื่องกันเลย
  // แล้วมันไปเด่นอยู่หน้าแรกเหมือนเรื่องน่ากังวลทุกวัน ทั้งที่ไม่ใช่
  if (doses.length && doses.every((d) => d.log)) parts.push('กินยาครบแล้ววันนี้');
  if (next) parts.push(`นัด ${next.title.split(' — ')[0]} ${daysUntil(next.date)} วัน`);
  return parts.join(' · ') || `ยา ${doses.length} มื้อวันนี้`;
}

// ─────────────────────────── แท็บกิจกรรม (บันทึกประจำวัน) ───────────────────────────

/** ชนิดบันทึกที่อยู่ในแท็บกิจกรรม — ไม่ปนกับอาการ ความดัน เอกสาร หรือการไปหาหมอ */
export const ACTIVITY_KINDS: RecordKind[] = ['exercise', 'food', 'note'];

export interface ActivityDay {
  day: string;              // 'YYYY-MM-DD'
  items: RecordItem[];      // ใหม่ก่อนเก่า
  minutes: number;          // รวมนาทีออกกำลังกายของวันนั้น
  kcal: number;             // รวมเฉพาะรายการที่กรอกแคลไว้จริง
  kcalOf: number;           // มีรายการอาหารกี่รายการในวันนั้น
  kcalFrom: number;         // ในนั้นกรอกแคลไว้กี่รายการ
}

/** บันทึกประจำวันของสมุดเล่มหนึ่ง จัดกลุ่มเป็นวันๆ วันใหม่อยู่บน
 *
 *  ยอดแคลรวมนับเฉพาะรายการที่กรอกไว้จริง และรายงานด้วยว่ามาจากกี่รายการ
 *  เพราะการกรอกแคลเป็นเรื่องไม่บังคับ ถ้าเอา 3 ใน 7 รายการมาบวกแล้วเรียกว่า
 *  "แคลวันนี้" มันคือตัวเลขที่ต่ำกว่าความจริงเสมอ และคนอ่านไม่มีทางรู้ */
export function activityDays(state: AppState, bookId: string): ActivityDay[] {
  const byDay = new Map<string, RecordItem[]>();
  for (const r of state.records) {
    if (r.book_id !== bookId) continue;
    if (!ACTIVITY_KINDS.includes(r.kind)) continue;
    const day = todayKey(new Date(r.at));
    const list = byDay.get(day);
    if (list) list.push(r);
    else byDay.set(day, [r]);
  }

  const days: ActivityDay[] = [];
  for (const [day, items] of byDay) {
    items.sort((a, b) => b.at.localeCompare(a.at));
    let minutes = 0;
    let kcal = 0;
    let kcalOf = 0;
    let kcalFrom = 0;
    // รูปหลายใบที่จดพร้อมกันคือแถวหลายแถวแต่เป็นบันทึกเดียว — ต้องนับครั้งเดียว
    // ไม่งั้นจะบอกว่า "จด 1 ใน 3 รายการ" ทั้งที่บนจอมีสองมื้อ แล้วเลขไม่ตรงกับตา
    const counted = new Set<string>();
    for (const r of items) {
      const key = `${r.kind}|${r.at}|${r.title}`;
      if (counted.has(key)) continue;
      counted.add(key);
      if (r.kind === 'exercise') minutes += r.data?.minutes ?? 0;
      if (r.kind === 'food') {
        kcalOf += 1;
        if (typeof r.data?.kcal === 'number') { kcal += r.data.kcal; kcalFrom += 1; }
      }
    }
    days.push({ day, items, minutes, kcal, kcalOf, kcalFrom });
  }
  days.sort((a, b) => b.day.localeCompare(a.day));
  return days;
}

/** บันทึกออกกำลังกายครั้งล่าสุดของชนิดเดียวกัน (ไม่นับตัวที่กำลังจดอยู่)
 *
 *  นี่คือเหตุผลหลักที่ย้ายจากแอปโน้ตมาไว้ที่นี่ — ตอนยืนอยู่หน้าเครื่อง
 *  ต้องตอบได้ทันทีว่าคราวก่อนใช้น้ำหนักเท่าไหร่ กี่เซ็ต ไม่ใช่ต้องเลื่อนหาเอง */
export function lastExercise(
  state: AppState, bookId: string, activity: string,
): RecordItem | undefined {
  const key = activity.trim();
  if (!key) return undefined;
  return state.records
    .filter((r) => r.book_id === bookId && r.kind === 'exercise'
      && (r.data?.activity ?? '').trim() === key)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}

/** บรรทัดหนึ่งที่จดไว้ ผูกกับวันที่จด */
export interface EquipmentLine {
  name: string;   // ชื่อเครื่อง/ท่า ที่อ่านได้จากบรรทัดนั้น
  line: string;   // บรรทัดเต็มตามที่พิมพ์ไว้จริง
  at: string;     // ISO
}

/** อ่านชื่อเครื่องออกจากบรรทัดที่พิมพ์ไว้
 *
 *  ตั้งใจไม่ทำเป็นฟอร์มให้กรอกชื่อเครื่อง/น้ำหนัก/เซ็ต แยกช่อง เพราะของจริงที่
 *  คนจดหน้าเครื่องคือบรรทัดเดียวจบ เช่น "Leg press 85.7 ชิด 12-* 3 / ห่าง 12*3"
 *  ฟอร์มรับไม่ได้ครบและทำให้จดช้าลงจนเลิกจด — จึงให้พิมพ์อิสระเหมือนเดิม
 *  แล้วให้แอปอ่านชื่อเครื่องออกมาเอง ชื่อ = ส่วนหน้าก่อนตัวเลขตัวแรก
 *  คืนค่าว่างแปลว่าบรรทัดนั้นไม่ใช่รายการเครื่อง (เช่น "ท่า 1" ที่เป็นแค่หัวข้อ) */
export function equipmentName(rawLine: string): string {
  const line = rawLine.trim();
  if (!line) return '';
  // ตัดเลขลำดับหน้าบรรทัดทิ้ง — "ท่า 2", "3 ", "4." ไม่ใช่ชื่อเครื่อง
  const body = line.replace(/^(ท่า\s*\d+[.)]?|\d+[.)]?)\s+/, '').replace(/^ท่า\s*\d+[.)]?$/, '');
  const head = (body.match(/^[^\d]+/) ?? [''])[0]
    .replace(/[-*/·.,:;\s]+$/, '')
    .trim();
  // ยาวเกินไป = เป็นประโยคเล่าเรื่อง ไม่ใช่ชื่อเครื่อง
  if (!head || head.length > 40) return '';
  return head;
}

function exerciseLines(state: AppState, bookId: string): EquipmentLine[] {
  const out: EquipmentLine[] = [];
  for (const r of state.records) {
    if (r.book_id !== bookId || r.kind !== 'exercise' || !r.body) continue;
    for (const raw of r.body.split('\n')) {
      const name = equipmentName(raw);
      if (name) out.push({ name, line: raw.trim(), at: r.at });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** ชื่อเครื่อง/ท่าที่เคยจดไว้ เรียงจากที่เพิ่งใช้ล่าสุด
 *  รายการนี้โตขึ้นเองจากสิ่งที่ผู้ใช้พิมพ์ ไม่ต้องมาตั้งค่าคลังเครื่องไว้ก่อน */
export function knownEquipment(state: AppState, bookId: string, limit = 40): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const l of exerciseLines(state, bookId)) {
    const key = l.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(l.name);
    if (names.length >= limit) break;
  }
  return names;
}

/** ประวัติของเครื่องหนึ่ง — ครั้งล่าสุดอยู่บน ตอบคำถาม "คราวก่อนใช้เท่าไหร่" */
export function equipmentHistory(
  state: AppState, bookId: string, name: string, limit = 6,
): EquipmentLine[] {
  const key = name.trim().toLowerCase();
  if (!key) return [];
  return exerciseLines(state, bookId)
    .filter((l) => l.name.toLowerCase().includes(key))
    .slice(0, limit);
}

/** น้ำหนักที่ใช้ในบรรทัดนั้น = ตัวเลขตัวแรกหลังชื่อเครื่อง
 *  "Leg press 85.7 ชิด 12*3" → "85.7" — เอาไว้เติมให้ล่วงหน้าตอนจะจดครั้งใหม่ */
export function lastWeight(line: string): string {
  const name = equipmentName(line);
  if (!name) return '';
  const rest = line.slice(line.indexOf(name) + name.length);
  return (rest.match(/\d+(?:\.\d+)?/) ?? [''])[0];
}

/** ประกอบบรรทัดจากช่องที่กรอก — รูปแบบเดียวกับที่ผู้ใช้เขียนเองอยู่แล้ว
 *  ผลลัพธ์ไปต่อท้ายช่องข้อความ ซึ่งยังแก้ได้อิสระ ไม่ใช่ของตายตัว */
export function equipmentLine(
  name: string, weight: string, reps: string, sets: string,
): string {
  const parts = [name.trim()];
  if (weight.trim()) parts.push(weight.trim());
  if (reps.trim()) parts.push(sets.trim() ? `${reps.trim()}*${sets.trim()}` : reps.trim());
  else if (sets.trim()) parts.push(`${sets.trim()} เซ็ต`);
  return parts.join(' ');
}
