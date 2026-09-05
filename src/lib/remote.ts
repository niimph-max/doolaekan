import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type {
  Appointment, AppState, Book, BookShare, Doctor, Group, Medication, MedLog, RecordItem, WatchRule,
} from './types';

/** ข้อมูลทั้งหมดที่โหลดมาแสดง (ตัดส่วนที่เป็นสถานะของหน้าจอออก) */
export type CloudData = Pick<
  AppState,
  'books' | 'doctors' | 'medications' | 'medLogs' | 'appointments'
  | 'records' | 'watchRules' | 'groups' | 'shares'
> & {
  /** ของหนัก (ไทม์ไลน์ / ประวัติกินยา) ดึงไม่สำเร็จ — ที่เหลือใช้ได้ตามปกติ */
  partial?: boolean;
};

/** ไทม์ไลน์ย้อนหลังแค่ไหนถึงพอใช้จริง — หน้าจอแสดงรายการล่าสุดกับกราฟความดัน 7 ครั้ง
 *  ดึงมาทั้งตารางไม่มีประโยชน์ และยิ่งใช้ไปนานวันยิ่งหนักจนเปิดแอปไม่ได้ */
const RECORDS_LIMIT = 300;
/** บันทึกประจำวัน (ออกกำลังกาย/อาหาร) ดึงแยกโควตาของตัวเอง
 *
 *  ถ้ารวมอยู่ในโควตาเดียวกับไทม์ไลน์สุขภาพ การจดทุกวันวันละหลายรายการจะกิน
 *  โควตาหมดภายในไม่กี่เดือน แล้วอาการกับความดันของเก่าจะค่อยๆ หายไปจากแอป
 *  โดยไม่มีใครรู้ตัว — ของสองอย่างนี้โตคนละอัตรา จึงต้องแยกโควตากัน */
const ACTIVITY_LIMIT = 300;
const ACTIVITY_KINDS = ['exercise', 'food', 'note'];
/** ประวัติกินยาใช้แค่เช็คว่าวันนี้กินมื้อไหนไปแล้ว ย้อนหลังเดือนเดียวเหลือเฟือ */
const MED_LOG_DAYS = 30;

const SCANS = 'scans';
const MED_PHOTOS = 'med-photos';

function db(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  return client;
}

/** ข้อมูล error ที่ postgrest ส่งกลับมา — message อย่างเดียวมักไม่พอหาสาเหตุ */
type PgError = { message: string; code?: string; details?: string | null; hint?: string | null } | null;

/** โยนต่อพร้อมบอกว่าพังตอนเขียนตารางไหน เพื่อให้ข้อความบนจอชี้จุดได้เลย */
function check(where: string, error: PgError): void {
  if (!error) return;
  const parts = [error.message];
  if (error.details) parts.push(String(error.details));
  if (error.hint) parts.push(`แนะนำ: ${error.hint}`);
  if (typeof console !== 'undefined') console.error(`[Supabase] ${where}`, error);
  throw new Error(`${where}: ${parts.join(' — ')}${error.code ? ` (code ${error.code})` : ''}`);
}

/** โยน error ของ supabase ต่อ เพื่อให้ชั้นบนตัดสินใจ (แจ้งผู้ใช้ + โหลดใหม่)
 *
 *  ต้องติดชื่อตารางไปด้วยเสมอ ตอนโหลดยิงพร้อมกันสิบคำสั่ง ถ้าเหลือแต่ข้อความ
 *  อย่าง "statement timeout" ลอยๆ จะไม่มีทางรู้เลยว่าคำสั่งไหนพัง แล้วต้องเดา */
function unwrap<T>(where: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${where}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

// ─────────────────────────── row → app ───────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const toBook = (r: any, userId: string): Book => ({
  id: r.id,
  owner_id: r.owner_id,
  owner_name: r.display_name,
  full_name: r.full_name ?? '',
  address: r.address ?? '',
  allergy: r.allergy ?? '',
  conditions: r.conditions ?? [],
  blood_type: r.blood_group ?? '',
  birth_date: r.birth_date ?? '',
  age: r.age ?? '',
  emergency_contact: r.emergency_contact ?? '',
  avatar: r.avatar ?? '',
  is_mine: r.owner_id === userId,
});

const toDoctor = (r: any): Doctor => ({
  id: r.id, book_id: r.book_id, name: r.name,
  hospital: r.hospital ?? '', hn: r.hn ?? '', phone: r.phone ?? '',
  clinic_hours: r.clinic_hours ?? '',
});

const toMedication = (r: any): Medication => ({
  id: r.id, book_id: r.book_id, name: r.name,
  helps: r.helps ?? '', how_to_take: r.how_to_take ?? '',
  prescriber: r.prescriber ?? '', tag: r.tag ?? '', hospital: r.hospital ?? '',
  slots: r.slots ?? [], timing: r.timing ?? '', duplicate_flag: r.duplicate_flag ?? false,
  paused: r.paused ?? false, paused_note: r.paused_note ?? '',
  photo: undefined,   // ไม่ได้ดึงคอลัมน์รูปมาแล้ว รูปถุงยาดูได้จากไทม์ไลน์
});

const toMedLog = (r: any): MedLog => ({
  id: r.id, book_id: r.book_id, medication_id: r.medication_id,
  day: r.dose_day, slot: r.slot, status: r.status,
  reason: r.reason ?? '', at: r.logged_at, actor_name: r.actor_name,
});

const toAppointment = (r: any): Appointment => ({
  id: r.id, book_id: r.book_id, title: r.title,
  date: r.appt_date, time: (r.appt_time ?? '09:00').slice(0, 5),
  place: r.place ?? '', escort: r.escort_name ?? '',
  note: r.note ?? '',
  blood_test_before: r.blood_test_before ?? false,
  blood_test_done: Boolean(r.blood_test_done_at),
  photo_path: r.photo_path ?? undefined,
});

const toRecord = (r: any): RecordItem => ({
  id: r.id, book_id: r.book_id, kind: r.kind, title: r.title,
  body: r.body ?? '', data: r.data ?? undefined,
  file_path: r.file_path ?? undefined,
  at: r.created_at, actor_name: r.actor_name ?? '', important: r.hit_watch_rule ?? false,
});

const toWatchRule = (r: any): WatchRule => ({
  id: r.id, book_id: r.book_id, triggers: r.triggers ?? [],
  action: r.action, source: r.source ?? '', severity: r.severity,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─────────────────────────── app → row ───────────────────────────

export const bookRow = (b: Book) => ({
  id: b.id, owner_id: b.owner_id, display_name: b.owner_name,
  full_name: b.full_name, address: b.address, allergy: b.allergy,
  conditions: b.conditions, blood_group: b.blood_type,
  birth_date: b.birth_date || null, age: b.age,
  emergency_contact: b.emergency_contact,
  avatar: b.avatar || null,
});

export const doctorRow = (d: Doctor) => ({
  id: d.id, book_id: d.book_id, name: d.name,
  hospital: d.hospital, hn: d.hn, phone: d.phone || null, clinic_hours: d.clinic_hours,
});

export const medicationRow = (m: Medication) => ({
  id: m.id, book_id: m.book_id, name: m.name, how_to_take: m.how_to_take,
  helps: m.helps, tag: m.tag, slots: m.slots, timing: m.timing || null,
  hospital: m.hospital || null, prescriber: m.prescriber,
  // คอลัมน์นี้มีไว้เก็บ "ที่อยู่ของไฟล์" ไม่ใช่ตัวรูป
  // เดิมยัด data URL (รูปเต็มเป็น base64) ลงไปตรงๆ ทำให้แถวยาแต่ละแถวใหญ่หลายเมกะไบต์
  // แล้วถูกดาวน์โหลดกลับมาทุกครั้งที่เปิดแอป ทั้งที่ไม่มีหน้าไหนเอารูปนั้นไปแสดงเลย
  // (ชีตสแกนเก็บรูปเดียวกันไว้ในไทม์ไลน์อยู่แล้ว ซึ่งขึ้นที่เก็บไฟล์จริงและถูกต้อง)
  photo_path: m.photo && !m.photo.startsWith('data:') ? m.photo : null,
  duplicate_flag: m.duplicate_flag,
  paused: m.paused, paused_note: m.paused_note || null,
});

export const medLogRow = (l: MedLog) => ({
  id: l.id, book_id: l.book_id, medication_id: l.medication_id,
  dose_day: l.day, slot: l.slot, status: l.status,
  reason: l.reason || null, actor_name: l.actor_name, logged_at: l.at,
});

export const appointmentRow = (a: Appointment) => ({
  id: a.id, book_id: a.book_id, title: a.title, appt_date: a.date,
  appt_time: a.time || null, place: a.place, escort_name: a.escort || null,
  note: a.note || null,
  blood_test_before: a.blood_test_before,
  blood_test_done_at: a.blood_test_done ? a.date : null,
  photo_path: a.photo_path ?? null,
});

export const recordRow = (r: RecordItem) => ({
  id: r.id, book_id: r.book_id, kind: r.kind, title: r.title,
  body: r.body || null, data: r.data ?? null, file_path: r.file_path ?? null,
  hit_watch_rule: r.important, actor_name: r.actor_name, created_at: r.at,
});

export const watchRuleRow = (w: WatchRule) => ({
  id: w.id, book_id: w.book_id, triggers: w.triggers,
  action: w.action, source: w.source || null, severity: w.severity,
});

// ─────────────────────────── โหลดทั้งหมด ───────────────────────────

/** ดึงทุกอย่างที่ผู้ใช้คนนี้มีสิทธิ์เห็น — RLS เป็นคนตัดสินว่าเห็นอะไรได้บ้าง */
export async function fetchAll(userId: string): Promise<CloudData> {
  const c = db();

  // ── ของจำเป็น ต้องได้ครบถึงจะเปิดแอปได้ ──
  // ทั้งหมดนี้เล็กและโตช้า: สมุด หมอ ยาที่ยังกินอยู่ นัด ข้อเฝ้าระวัง กลุ่ม
  const [books, doctors, meds, appts, rules, groups, members, shares] = await Promise.all([
    c.from('books').select('*').then((r) => unwrap('อ่านสมุด', r)),
    c.from('doctors').select('*').then((r) => unwrap('อ่านรายชื่อหมอ', r)),
    // ระบุคอลัมน์ให้ครบแทน select('*') เพื่อไม่ให้ photo_path ติดมาด้วย
    // ของเก่าที่เผลอเก็บรูป base64 ไว้ในคอลัมน์นั้นจะได้ไม่ถูกดาวน์โหลดซ้ำทุกครั้ง
    c.from('medications')
      .select('id, book_id, name, how_to_take, helps, tag, slots, prescriber, '
        + 'timing, hospital, duplicate_flag, paused, paused_note, active')
      .eq('active', true).then((r) => unwrap('อ่านรายการยา', r)),
    c.from('appointments').select('*').then((r) => unwrap('อ่านนัดหมอ', r)),
    c.from('watch_rules').select('*').then((r) => unwrap('อ่านข้อเฝ้าระวัง', r)),
    c.from('groups').select('*').then((r) => unwrap('อ่านกลุ่ม', r)),
    c.from('group_members').select('group_id, user_id, profiles(display_name)').then((r) => unwrap('อ่านสมาชิกกลุ่ม', r)),
    c.from('book_shares').select('*').then((r) => unwrap('อ่านการแชร์', r)),
  ]);

  // ── ของหนัก แยกออกมาและยอมให้พลาดได้ ──
  // ไทม์ไลน์กับประวัติกินยาโตทุกวันไม่มีเพดาน เดิมรวมอยู่ในชุดเดียวกับของจำเป็น
  // ตัวใดตัวหนึ่งช้าเกินเส้นตายจึงทำให้เปิดแอปไม่ได้เลย ทั้งที่ยากับนัดพร้อมอยู่แล้ว
  // ตอนนี้จำกัดปริมาณและปล่อยให้พลาดได้ ยาวันนี้กับนัดหมอสำคัญกว่าไทม์ไลน์ย้อนหลัง
  const sinceDay = new Date(Date.now() - MED_LOG_DAYS * 86400000).toISOString().slice(0, 10);
  let partial = false;
  const optional = async (
    label: string,
    q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  ): Promise<unknown[]> => {
    try {
      return unwrap(label, await q);
    } catch {
      partial = true;
      return [];
    }
  };
  const kindList = `(${ACTIVITY_KINDS.join(',')})`;
  const [logs, health, activity] = await Promise.all([
    optional('อ่านประวัติกินยา', c.from('med_logs').select('*').gte('dose_day', sinceDay)),
    optional('อ่านไทม์ไลน์', c.from('records').select('*').not('kind', 'in', kindList)
      .order('created_at', { ascending: false }).limit(RECORDS_LIMIT)),
    optional('อ่านบันทึกประจำวัน', c.from('records').select('*').in('kind', ACTIVITY_KINDS)
      .order('created_at', { ascending: false }).limit(ACTIVITY_LIMIT)),
  ]);
  const recs = [...health, ...activity];

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const groupList: Group[] = (groups as any[]).map((g) => ({
    id: g.id, name: g.name, invite_code: g.invite_code, owner_id: g.owner_id,
    members: (members as any[])
      .filter((m) => m.group_id === g.id)
      .map((m) => ({ id: m.user_id, name: m.profiles?.display_name ?? 'สมาชิก' })),
  }));

  const records = (recs as any[]).map(toRecord);
  const appointments = (appts as any[]).map(toAppointment);
  await Promise.all([attachSignedUrls(records), attachApptUrls(appointments)]);

  return {
    partial,
    books: (books as any[]).map((b) => toBook(b, userId)),
    doctors: (doctors as any[]).map(toDoctor),
    medications: (meds as any[]).map(toMedication),
    medLogs: (logs as any[]).map(toMedLog),
    appointments,
    records,
    watchRules: (rules as any[]).map(toWatchRule),
    groups: groupList,
    shares: (shares as any[]).map((s): BookShare => ({
      book_id: s.book_id, group_id: s.group_id, level: s.level,
    })),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** ขอลิงก์ดูรูปจากที่อยู่ของรูป — แยกออกมาให้เรียกได้ทุกเมื่อ
 *
 *  เดิมการขอลิงก์ฝังอยู่ในขั้นตอนดึงข้อมูลสดที่เดียว พอแอปเปิดจากสำเนาในเครื่อง
 *  (ซึ่งเก็บแต่ที่อยู่ของรูป ไม่เก็บตัวรูป) หรือดึงไทม์ไลน์ไม่สำเร็จ จะไม่มีใคร
 *  ไปขอลิงก์เลย รูปจึงหายทั้งที่ไฟล์อยู่ครบและที่อยู่ก็อยู่ในมือแล้ว
 *
 *  โยน error ออกมาด้วย ไม่กลืนเงียบเหมือนเดิม รูปหายต้องมีเหตุผลบอกได้เสมอ */
export async function signPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data, error } = await db().storage.from(SCANS).createSignedUrls(paths, 60 * 60);
  check('ขอลิงก์ดูรูป', error);
  for (const d of data ?? []) {
    if (d.signedUrl) out.set(d.path ?? '', d.signedUrl);
  }
  return out;
}

/** เติมลิงก์ชั่วคราวให้รูปในไทม์ไลน์ (bucket เป็น private) */
/** ใบนัดที่ถ่ายเก็บไว้ต้องได้ลิงก์ชั่วคราวเหมือนเอกสารสแกน ไม่งั้นเปิดดูไม่ได้ */
async function attachApptUrls(appts: Appointment[]): Promise<void> {
  const paths = appts.map((a) => a.photo_path).filter((p): p is string => Boolean(p));
  if (!paths.length) return;
  const { data } = await db().storage.from(SCANS).createSignedUrls(paths, 60 * 60);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  for (const a of appts) {
    if (a.photo_path) a.photo = byPath.get(a.photo_path) ?? undefined;
  }
}

async function attachSignedUrls(records: RecordItem[]): Promise<void> {
  const paths = records.map((r) => r.file_path).filter((p): p is string => Boolean(p));
  if (!paths.length) return;
  const { data } = await db().storage.from(SCANS).createSignedUrls(paths, 60 * 60);
  if (!data) return;
  const byPath = new Map(data.map((d) => [d.path, d.signedUrl]));
  for (const r of records) {
    if (r.file_path) r.file = byPath.get(r.file_path) ?? undefined;
  }
}

// ─────────────────────────── เขียน ───────────────────────────

/** ชื่อในโปรไฟล์คือชื่อที่คนอื่นในกลุ่มเห็น — ตั้งให้ตรงกับชื่อในสมุดตอน onboarding */
export async function upsertProfile(userId: string, displayName: string): Promise<void> {
  const { error } = await db().from('profiles').upsert({ id: userId, display_name: displayName });
  check('upsertProfile', error);
}

export async function upsertBook(b: Book): Promise<void> {
  // ── ห้ามใช้ upsert กับตารางสมุดเด็ดขาด ──
  // upsert คือ INSERT ... ON CONFLICT DO UPDATE ซึ่ง Postgres จะตรวจกติกาของ UPDATE
  // ด้วยเสมอ แม้แถวนั้นยังไม่มีอยู่จริงก็ตาม กติกา update ของสมุดคือ "ต้องเข้าถึง
  // สมุดเล่มนี้ได้ระดับ full" ซึ่งเป็นไปไม่ได้สำหรับสมุดที่กำลังจะถูกสร้าง เพราะยัง
  // ไม่มีสมุดให้เข้าถึง ผลคือสร้างสมุดใหม่ไม่ได้เลย และได้ 42501 ที่ชี้ไปผิดทาง
  // (ฟ้องเรื่องสิทธิ์ ทั้งที่สิทธิ์ถูกทุกอย่าง)
  //
  // แยกเป็นสองทางให้ชัด: สร้างใหม่ใช้ insert ล้วนๆ ถ้าชนว่ามีอยู่แล้วค่อยไปทางแก้ไข
  const { error } = await db().from('books').insert(bookRow(b));
  if (!error) return;
  if (error.code === '23505') { await updateBook(b); return; }   // มีเล่มนี้อยู่แล้ว
  check('upsertBook', error);
}

/** แก้ข้อมูลในสมุดที่มีอยู่แล้ว ต้องเป็น UPDATE ล้วนๆ ห้ามใช้ upsert
 *  เพราะ upsert = INSERT ... ON CONFLICT ซึ่งโดนตรวจด้วย policy ของ insert ด้วย
 *  (สร้างสมุดได้เฉพาะในชื่อตัวเอง) ลูกที่ดูแลพ่อแม่จึงแก้สมุดของพ่อแม่ไม่ผ่าน */
export async function updateBook(b: Book): Promise<void> {
  const { owner_id: _owner, ...fields } = bookRow(b);
  // ขอแถวที่แก้กลับมาด้วย — UPDATE ที่ไม่โดนแถวไหนเลย (เช่นสิทธิ์ไม่ถึง) PostgREST
  // ตอบว่าสำเร็จเฉยๆ ไม่มี error ข้อมูลจึงหายเงียบโดยไม่มีอะไรบอก
  const { data, error } = await db().from('books').update(fields).eq('id', b.id).select('id');
  check('updateBook', error);
  if (!data?.length) {
    throw new Error('บันทึกไม่ติด — ไม่มีสิทธิ์แก้สมุดเล่มนี้ หรือสมุดถูกลบไปแล้ว');
  }
}

export async function upsertDoctor(d: Doctor): Promise<void> {
  const row = doctorRow(d) as Record<string, unknown>;
  const { data, error } = await db().from('doctors').upsert(row).select('id');
  if (!error) {
    if (!data?.length) throw new Error('บันทึกไม่ติด — ไม่มีสิทธิ์แก้ข้อมูลหมอในสมุดเล่มนี้');
    return;
  }
  // ยังไม่ได้รัน 0007 — บันทึกส่วนที่เหลือให้ก่อน ดีกว่าแก้ชื่อหมอไม่ได้เลย
  if (error.code === 'PGRST204' && error.message.includes('phone')) {
    delete row.phone;
    const retry = await db().from('doctors').upsert(row);
    check('upsertDoctor', retry.error);
    return;
  }
  check('upsertDoctor', error);
}

export async function deleteDoctor(id: string): Promise<void> {
  const { error } = await db().from('doctors').delete().eq('id', id);
  check('deleteDoctor', error);
}

/** ฐานข้อมูลที่ยังไม่ได้รัน migration ล่าสุดจะไม่มีคอลัมน์ที่โค้ดใหม่ส่งไป
 *  PostgREST ตอบ PGRST204 พร้อมชื่อคอลัมน์ที่หาไม่เจอในข้อความ */
const NEWER_COLUMNS = ['timing', 'hospital', 'paused', 'paused_note', 'avatar'] as const;

function missingColumn(error: PgError): string | null {
  if (!error || error.code !== 'PGRST204') return null;
  return NEWER_COLUMNS.find((c) => error.message.includes(c)) ?? null;
}

/** ยาซ้ำคำนวณฝั่งแอป แล้วอัปเดตธงกลับทั้งเล่มในทีเดียว
 *
 *  ฐานข้อมูลที่ยังรัน migration ไม่ครบจะบันทึกไม่ผ่านทั้งรายการ ทั้งที่ติดแค่
 *  คอลัมน์เดียว — แก้ชื่อยาหรือลบยาก็ทำไม่ได้ตามไปด้วย จึงตัดคอลัมน์ที่หาไม่เจอ
 *  ออกทีละตัวแล้วลองใหม่ ส่วนที่เหลือได้บันทึกไว้ก่อน ดีกว่าเสียทั้งก้อน */
export async function upsertMedications(meds: Medication[]): Promise<void> {
  if (!meds.length) return;
  let rows = meds.map(medicationRow) as Record<string, unknown>[];

  for (let attempt = 0; attempt <= NEWER_COLUMNS.length; attempt += 1) {
    const { error } = await db().from('medications').upsert(rows);
    if (!error) return;
    const column = missingColumn(error);
    if (!column) {
      // บอกด้วยว่าติดที่ยาตัวไหน สมุดเล่มไหน ไม่งั้นได้แต่รู้ว่า "สิทธิ์ไม่พอ" ลอยๆ
      const where = meds.map((m) => m.name).join(', ');
      const books = Array.from(new Set(meds.map((m) => m.book_id))).join(', ');
      check(`upsertMedications [${where}] book=${books}`, error);
      return;
    }
    rows = rows.map((row) => {
      const copy = { ...row };
      delete copy[column];
      return copy;
    });
  }
}

/** เอายาออกจากรายการ = ปิด active ไม่ใช่ลบแถว
 *  เพราะ med_logs ผูกกับ medication แบบ on delete cascade — ลบยาทิ้ง
 *  ประวัติกินยาทั้งหมดของตัวนั้นจะหายไปด้วย ซึ่งเป็นข้อมูลที่เอาคืนไม่ได้ */
export async function deactivateMedication(id: string): Promise<void> {
  const { error } = await db().from('medications').update({ active: false }).eq('id', id);
  check('deactivateMedication', error);
}

export async function upsertMedLog(l: MedLog): Promise<void> {
  const { error } = await db()
    .from('med_logs')
    .upsert(medLogRow(l), { onConflict: 'medication_id,dose_day,slot' });
  check('upsertMedLog', error);
}

export async function upsertAppointment(a: Appointment): Promise<void> {
  const { error } = await db().from('appointments').upsert(appointmentRow(a));
  check('upsertAppointment', error);
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await db().from('appointments').delete().eq('id', id);
  check('deleteAppointment', error);
}

export async function insertRecord(r: RecordItem): Promise<void> {
  const { error } = await db().from('records').insert(recordRow(r));
  check('insertRecord', error);
}

/** ลบบันทึกหลายแถวในครั้งเดียว — รูปหลายใบของบันทึกเดียวคือหลายแถว */
export async function deleteRecords(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await db().from('records').delete().in('id', ids);
  check('deleteRecords', error);
}

/** ลบไฟล์รูปที่ไม่มีใครอ้างถึงแล้ว
 *
 *  ลบแค่แถวในตารางแล้วปล่อยไฟล์ทิ้งไว้ = พื้นที่เก็บไฟล์โตขึ้นตลอดโดยไม่มีทางลด
 *  และบนแพลนฟรีมีเพดาน 1 GB ซึ่งรูปที่ถ่ายทุกวันจะไปชนเข้าสักวัน */
export async function deleteImages(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await db().storage.from(SCANS).remove(paths);
  check('deleteImages', error);
}

/** แก้ไขบันทึกที่จดไว้แล้ว — แก้พร้อมกันหลายแถวเพื่อให้ชุดเดียวกันยังจับกลุ่มกันติด */
export async function updateRecords(
  ids: string[],
  patch: { title?: string; body?: string; data?: RecordItem['data']; at?: string },
): Promise<void> {
  if (!ids.length) return;
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.body !== undefined) row.body = patch.body || null;
  if (patch.data !== undefined) row.data = patch.data ?? null;
  if (patch.at !== undefined) row.created_at = patch.at;
  if (!Object.keys(row).length) return;
  const { error } = await db().from('records').update(row).in('id', ids);
  check('updateRecords', error);
}

export async function upsertWatchRule(w: WatchRule): Promise<void> {
  const { error } = await db().from('watch_rules').upsert(watchRuleRow(w));
  check('upsertWatchRule', error);
}

export async function deleteWatchRule(id: string): Promise<void> {
  const { error } = await db().from('watch_rules').delete().eq('id', id);
  check('deleteWatchRule', error);
}

export async function insertGroup(g: Group): Promise<void> {
  const c = db();
  const { error } = await c.from('groups')
    .insert({ id: g.id, name: g.name, owner_id: g.owner_id, invite_code: g.invite_code });
  check('insertGroup', error);
  const { error: memberError } = await c.from('group_members')
    .insert({ group_id: g.id, user_id: g.owner_id });
  check('insertGroup.group_members', memberError);
}

export async function upsertShare(s: BookShare): Promise<void> {
  const { error } = await db().from('book_shares').upsert(s, { onConflict: 'book_id,group_id' });
  check('upsertShare', error);
}

/** เข้ากลุ่มด้วยรหัส — ต้องผ่าน RPC เพราะ policy ซ่อนกลุ่มที่ยังไม่ได้เป็นสมาชิก */
export async function joinGroupByCode(code: string): Promise<Group> {
  const { data, error } = await db().rpc('join_group_by_code', { p_code: code });
  check('joinGroupByCode', error);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const g = data as any;
  return { id: g.id, name: g.name, invite_code: g.invite_code, owner_id: g.owner_id, members: [] };
}

// ─────────────────────────── รูป ───────────────────────────

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), ext: mime.split('/')[1] ?? 'jpg' };
}

/** อัปโหลดรูปเข้า Storage แล้วคืน path — ตั้งชื่อขึ้นต้นด้วย book_id ให้ policy เช็คสิทธิ์ได้ */
export async function uploadImage(
  bucket: 'scans' | 'med-photos', bookId: string, id: string, dataUrl: string,
): Promise<string> {
  const { blob, ext } = dataUrlToBlob(dataUrl);
  const path = `${bookId}/${id}.${ext}`;
  const { error } = await db().storage.from(bucket).upload(path, blob, { upsert: true });
  check('uploadImage', error);
  return path;
}

export async function signedUrl(bucket: 'scans' | 'med-photos', path: string): Promise<string> {
  const { data, error } = await db().storage.from(bucket).createSignedUrl(path, 60 * 60);
  check('signedUrl', error);
  if (!data) throw new Error(`signedUrl: ไม่ได้ลิงก์สำหรับ ${path}`);
  return data.signedUrl;
}

export const BUCKET_SCANS = SCANS;

/** ── ลบบัญชีพร้อมข้อมูลทั้งหมด ──
 *
 *  โครงฐานข้อมูลผูกกันเป็นทอดๆ ด้วย on delete cascade อยู่แล้ว
 *    auth.users → profiles → books → ยา/หมอ/นัด/บันทึก/กฎเฝ้าระวัง/การแชร์
 *                          → group_members
 *  ลบแถว profiles ของตัวเองแถวเดียว ข้อมูลทั้งหมดจึงหายตามไปเอง
 *  และ policy profiles_self (for all, id = auth.uid()) อนุญาตให้ทำได้อยู่แล้ว
 *  ไม่ต้องเพิ่มสิทธิ์อะไรใหม่
 *
 *  ที่ cascade ไม่ครอบคลุมคือ "ไฟล์ใน Storage" ต้องลบเองก่อน เพราะเป็นคนละระบบ
 *  จึงต้องรวบที่อยู่ไฟล์ทั้งหมดมาลบก่อนที่แถวข้อมูลจะหายไป ไม่งั้นไฟล์จะค้าง
 *  อยู่ในที่เก็บโดยไม่มีใครรู้ว่าเป็นของใคร และกินพื้นที่ไปตลอดกาล
 *
 *  ส่วนแถวใน auth.users (ตัวอีเมลที่ใช้เข้าระบบ) ลบจากฝั่งแอปไม่ได้ ต้องมีฟังก์ชัน
 *  ฝั่งฐานข้อมูล — ดู supabase/migrations/0012_delete_account.sql
 *  ถ้ายังไม่ได้รันไฟล์นั้น ข้อมูลจะถูกลบครบ แต่อีเมลยังเข้าระบบได้ (เจอสมุดเปล่า)
 *  ฟังก์ชันนี้จึงคืนค่ามาบอกว่าลบบัญชีได้จริงไหม เพื่อให้หน้าจอพูดตรงกับที่เกิดขึ้น */
export async function deleteMyAccount(userId: string): Promise<{ authRemoved: boolean }> {
  const c = db();

  // ── 1. รวบที่อยู่ไฟล์ทั้งหมดของสมุดที่เราเป็นเจ้าของ ──
  const { data: books } = await c.from('books').select('id').eq('owner_id', userId);
  const bookIds = (books ?? []).map((b: { id: string }) => b.id);

  if (bookIds.length) {
    const [recs, appts, meds] = await Promise.all([
      c.from('records').select('file_path').in('book_id', bookIds).not('file_path', 'is', null),
      c.from('appointments').select('photo_path').in('book_id', bookIds).not('photo_path', 'is', null),
      c.from('medications').select('photo_path').in('book_id', bookIds).not('photo_path', 'is', null),
    ]);
    const scans = [
      ...((recs.data ?? []) as { file_path: string }[]).map((r) => r.file_path),
      ...((appts.data ?? []) as { photo_path: string }[]).map((r) => r.photo_path),
    ].filter(Boolean);
    const medPhotos = ((meds.data ?? []) as { photo_path: string }[])
      .map((r) => r.photo_path).filter(Boolean);

    // ลบไฟล์ไม่สำเร็จ ไม่ควรขวางการลบข้อมูล — ผู้ใช้ขอลบบัญชีแล้วต้องได้ลบ
    // ไฟล์ที่ค้างเป็นเรื่องที่ตามเก็บทีหลังได้ แต่ข้อมูลที่ลบไม่ออกคือการไม่ทำตามที่ขอ
    if (scans.length) await c.storage.from(SCANS).remove(scans).catch(() => undefined);
    if (medPhotos.length) await c.storage.from('med-photos').remove(medPhotos).catch(() => undefined);
  }

  // ── 2. ลบแถว profile ของตัวเอง — ที่เหลือหายตาม cascade ──
  const { error } = await c.from('profiles').delete().eq('id', userId);
  check('ลบข้อมูลบัญชี', error);

  // ── 3. ลบตัวบัญชีเข้าระบบ ถ้าฝั่งฐานข้อมูลเตรียมฟังก์ชันไว้แล้ว ──
  const { error: rpcError } = await c.rpc('delete_my_account');
  return { authRemoved: !rpcError };
}
export const BUCKET_MED_PHOTOS = MED_PHOTOS;

// ─────────────────────────── ย้ายข้อมูลในเครื่องขึ้นคลาวด์ ───────────────────────────

/** ใช้ครั้งเดียวตอนเปลี่ยนจากโหมดเครื่องเดียวมาต่อคลาวด์ — id เป็น uuid อยู่แล้วจึงยกขึ้นตรงๆ ได้ */
export async function uploadLocalData(local: CloudData, userId: string): Promise<void> {
  const c = db();
  const myBooks = local.books.filter((b) => b.is_mine).map((b) => ({ ...b, owner_id: userId }));
  const bookIds = new Set(myBooks.map((b) => b.id));
  const mine = <T extends { book_id: string }>(rows: T[]) => rows.filter((r) => bookIds.has(r.book_id));

  if (!myBooks.length) return;

  // สมุดต้องผ่าน upsertBook ที่แยก insert/update ไว้แล้ว ไม่ใช่ upsert รวมในลูป
  for (const b of myBooks) await upsertBook(b);

  const steps: { table: string; rows: object[] }[] = [
    { table: 'doctors', rows: mine(local.doctors).map(doctorRow) },
    { table: 'medications', rows: mine(local.medications).map(medicationRow) },
    { table: 'watch_rules', rows: mine(local.watchRules).map(watchRuleRow) },
    { table: 'appointments', rows: mine(local.appointments).map(appointmentRow) },
    { table: 'med_logs', rows: mine(local.medLogs).map(medLogRow) },
    // รูปในเครื่องเป็น data URL — ยกขึ้นแค่ข้อความ ไม่พารูปขึ้นไปด้วย
    { table: 'records', rows: mine(local.records).map((r) => ({ ...recordRow(r), file_path: null })) },
  ];

  for (const step of steps) {
    if (!step.rows.length) continue;
    const { error } = await c.from(step.table).upsert(step.rows);
    check(`uploadLocalData.${step.table}`, error);
  }

  for (const g of local.groups) {
    await insertGroup({ ...g, owner_id: userId });
  }
  for (const s of local.shares) {
    if (bookIds.has(s.book_id)) await upsertShare(s);
  }
}

/** ผลตรวจการเชื่อมต่อ — ตอบให้ได้ว่า "ทำไมบันทึกไม่ขึ้น" ในหน้าจอเดียว
 *  โดยไม่ต้องให้ผู้ใช้ไปเปิด SQL editor เทียบรหัสเอง */
export interface Diagnosis {
  email: string;
  userId: string;
  readableBooks: { id: string; name: string }[];
  activeBookId: string;
  activeBookReadable: boolean;
  writeOk: boolean;
  writeError: string;
}

export async function diagnose(activeBookId: string): Promise<Diagnosis> {
  const c = db();
  const sb = getSupabase();
  const { data: userData } = await (sb ? sb.auth.getUser() : Promise.resolve({ data: { user: null } }));
  let user = userData?.user ?? null;
  // ถามเซิร์ฟเวอร์ไม่ทัน ให้ดูใบที่เก็บไว้ในเครื่องแทน แล้วบอกตามจริงว่ายังยืนยันไม่ได้
  // ห้ามรายงานว่า "ยังไม่ได้เข้าระบบ" ทั้งที่บรรทัดถัดไปอ่านสมุดได้และเขียนได้
  // แผงที่ขัดแย้งกันเองทำให้ผู้ใช้หลงไปแก้ผิดจุด
  let unconfirmed = false;
  if (!user && sb) {
    const { data: sess } = await sb.auth.getSession();
    if (sess.session) { user = sess.session.user; unconfirmed = true; }
  }

  const out: Diagnosis = {
    email: user?.email
      ? (unconfirmed ? `${user.email} (ยืนยันกับเซิร์ฟเวอร์ไม่ทัน)` : user.email)
      : '(ไม่พบ — ยังไม่ได้เข้าระบบ)',
    userId: user?.id ?? '',
    readableBooks: [],
    activeBookId,
    activeBookReadable: false,
    writeOk: false,
    writeError: '',
  };

  const { data: books, error: readError } = await c.from('books').select('id, display_name');
  if (readError) {
    out.writeError = `อ่านรายชื่อสมุดไม่ได้: ${readError.message}`;
    return out;
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  out.readableBooks = (books as any[]).map((b) => ({ id: b.id, name: b.display_name }));
  out.activeBookReadable = out.readableBooks.some((b) => b.id === activeBookId);

  // ทดสอบเขียนที่โปรไฟล์ของตัวเองเมื่อยังไม่มีสมุดในฐานข้อมูล
  // (ยังไม่ได้กรอกข้อมูล หรือกรอกแล้วแต่สมุดไม่เคยขึ้นคลาวด์)
  // เดิมเคสหลังจะเลิกทดสอบไปเลย แล้วบอกแค่ว่า "ยังไม่ได้ลองเขียน"
  // ซึ่งเป็นข้อมูลที่ไม่ช่วยอะไร ทั้งที่เป็นคำถามสำคัญที่สุดว่าเขียนได้ไหม
  if (!activeBookId || !out.activeBookReadable) {
    if (!user) { out.writeError = 'ไม่มี session — ต่อคลาวด์ในนามผู้ใช้ไม่ได้'; return out; }

    // ห้ามยัดข้อความสำหรับดีบักลงไป: ชื่อโปรไฟล์คือชื่อที่คนอื่นในกลุ่มเห็น
    // และไปโผล่เป็นตัวเลือก "ใครพาไป" ด้วย การตรวจต้องไม่เปลี่ยนข้อมูลจริง
    // จึงอ่านชื่อเดิมมาเขียนทับตัวเอง แบบเดียวกับที่ฝั่งสมุดทำข้างล่าง
    const { data: mine, error: readMineError } = await c
      .from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    if (readMineError) { out.writeError = readMineError.message; return out; }

    if (mine) {
      const { data: prof, error: profError } = await c
        .from('profiles').update({ display_name: mine.display_name }).eq('id', user.id).select('id');
      if (profError) out.writeError = profError.message;
      else if (!prof?.length) out.writeError = 'เขียนแล้วไม่โดนแถวไหนเลย — สิทธิ์ไม่ถึง';
      else out.writeOk = true;
      return out;
    }

    // ยังไม่มีแถวโปรไฟล์เลย จำเป็นต้องสร้างจริงถึงจะรู้ว่าเขียนได้ไหม
    // ตั้งชื่อจากอีเมลไว้ก่อน เดี๋ยวตอนกรอกข้อมูลเสร็จจะถูกเขียนทับด้วยชื่อที่ผู้ใช้ตั้งเอง
    const fallback = (user.email ?? '').split('@')[0] || 'สมาชิก';
    const { data: prof, error: profError } = await c
      .from('profiles').insert({ id: user.id, display_name: fallback }).select('id');
    if (profError) out.writeError = profError.message;
    else if (!prof?.length) out.writeError = 'เขียนแล้วไม่โดนแถวไหนเลย — สิทธิ์ไม่ถึง';
    else out.writeOk = true;
    return out;
  }

  // เขียนทดสอบแบบไม่เปลี่ยนข้อมูลจริง: เขียนชื่อเดิมทับตัวเอง
  const current = out.readableBooks.find((b) => b.id === activeBookId);
  if (!current) {
    out.writeError = 'สมุดที่เปิดอยู่ไม่มีในฐานข้อมูล จึงยังไม่ได้ลองเขียน';
    return out;
  }
  const { data: wrote, error: writeError } = await c
    .from('books').update({ display_name: current.name }).eq('id', activeBookId).select('id');
  if (writeError) out.writeError = writeError.message;
  else if (!wrote?.length) out.writeError = 'เขียนแล้วไม่โดนแถวไหนเลย — สิทธิ์ไม่ถึง';
  else out.writeOk = true;
  return out;
}

/** รหัสผู้ใช้ที่เซิร์ฟเวอร์ยอมรับจริง ณ วินาทีนี้
 *
 *  ห้ามใช้ค่าที่จำไว้ในเครื่องตอนสร้างของใหม่ เพราะกติกาของฐานข้อมูลเทียบกับ
 *  auth.uid() ของคำขอนั้นๆ ถ้าสองค่าไม่ตรงกันจะโดนปฏิเสธ (42501) โดยไม่มีทางรู้เลย
 *  ว่าเพราะอะไร — ค่าที่จำไว้เพี้ยนได้หลายทาง เช่นเครื่องเคยเข้าบัญชีอื่นมาก่อน */
export async function currentUserId(): Promise<string> {
  const sb = getSupabase();
  if (!sb) return '';
  const { data } = await sb.auth.getUser();
  if (data?.user?.id) return data.user.id;
  // ── ถามเซิร์ฟเวอร์ไม่ได้ ≠ ไม่ได้เข้าระบบ ──
  // getUser คุยกับเซิร์ฟเวอร์เข้าระบบทุกครั้ง ถ้าเน็ตช้าหรือฝั่งนั้นไม่ตอบ มันคืนค่าว่าง
  // กลับมาเฉยๆ โดยไม่นับเป็น error การเชื่อตามตรงๆ แล้วสรุปว่า "ยังไม่ได้เข้าระบบ"
  // ทำให้แอปไล่ผู้ใช้ไปเข้าระบบใหม่ทั้งที่ใบเข้าระบบยังใช้ได้ดี (อ่านเขียนได้ปกติ)
  const { data: sess } = await sb.auth.getSession();
  return sess.session?.user.id ?? '';
}

/** ตอบให้ชัดว่า "ยังเข้าระบบอยู่ไหม" โดยแยกกรณี "ตอบไม่ได้" ออกจาก "ไม่ได้เข้า"
 *  @returns true = เข้าอยู่แน่ / false = ไม่ได้เข้าแน่ / null = ยังตอบไม่ได้ อย่าเพิ่งสรุป */
export async function isSignedIn(): Promise<boolean | null> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb.auth.getUser();
    if (data?.user?.id) return true;
    // เซิร์ฟเวอร์บอกชัดว่าใบนี้ใช้ไม่ได้ = ไม่ได้เข้าระบบจริง
    if (error && /401|invalid|expired|jwt/i.test(error.message)) return false;
  } catch {
    /* ต่อไม่ติด — ยังสรุปไม่ได้ */
  }
  const { data: sess } = await sb.auth.getSession();
  return sess.session ? null : false;
}
