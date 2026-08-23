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
>;

const SCANS = 'scans';
const MED_PHOTOS = 'med-photos';

function db(): SupabaseClient {
  const client = getSupabase();
  if (!client) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  return client;
}

/** โยน error ของ supabase ต่อ เพื่อให้ชั้นบนตัดสินใจ (toast + โหลดใหม่) */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
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
  age: r.age ?? '',
  emergency_contact: r.emergency_contact ?? '',
  is_mine: r.owner_id === userId,
});

const toDoctor = (r: any): Doctor => ({
  id: r.id, book_id: r.book_id, name: r.name,
  hospital: r.hospital ?? '', hn: r.hn ?? '', clinic_hours: r.clinic_hours ?? '',
});

const toMedication = (r: any): Medication => ({
  id: r.id, book_id: r.book_id, name: r.name,
  helps: r.helps ?? '', how_to_take: r.how_to_take ?? '',
  prescriber: r.prescriber ?? '', tag: r.tag ?? '',
  slots: r.slots ?? [], duplicate_flag: r.duplicate_flag ?? false,
  photo: r.photo_path ?? undefined,
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
  blood_test_before: r.blood_test_before ?? false,
  blood_test_done: Boolean(r.blood_test_done_at),
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
  conditions: b.conditions, blood_group: b.blood_type, age: b.age,
  emergency_contact: b.emergency_contact,
});

export const doctorRow = (d: Doctor) => ({
  id: d.id, book_id: d.book_id, name: d.name,
  hospital: d.hospital, hn: d.hn, clinic_hours: d.clinic_hours,
});

export const medicationRow = (m: Medication) => ({
  id: m.id, book_id: m.book_id, name: m.name, how_to_take: m.how_to_take,
  helps: m.helps, tag: m.tag, slots: m.slots, prescriber: m.prescriber,
  photo_path: m.photo ?? null, duplicate_flag: m.duplicate_flag,
});

export const medLogRow = (l: MedLog) => ({
  id: l.id, book_id: l.book_id, medication_id: l.medication_id,
  dose_day: l.day, slot: l.slot, status: l.status,
  reason: l.reason || null, actor_name: l.actor_name, logged_at: l.at,
});

export const appointmentRow = (a: Appointment) => ({
  id: a.id, book_id: a.book_id, title: a.title, appt_date: a.date,
  appt_time: a.time || null, place: a.place, escort_name: a.escort || null,
  blood_test_before: a.blood_test_before,
  blood_test_done_at: a.blood_test_done ? a.date : null,
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
  const [books, doctors, meds, logs, appts, recs, rules, groups, members, shares] = await Promise.all([
    c.from('books').select('*').then(unwrap),
    c.from('doctors').select('*').then(unwrap),
    c.from('medications').select('*').eq('active', true).then(unwrap),
    c.from('med_logs').select('*').then(unwrap),
    c.from('appointments').select('*').then(unwrap),
    c.from('records').select('*').order('created_at', { ascending: false }).then(unwrap),
    c.from('watch_rules').select('*').then(unwrap),
    c.from('groups').select('*').then(unwrap),
    c.from('group_members').select('group_id, user_id, profiles(display_name)').then(unwrap),
    c.from('book_shares').select('*').then(unwrap),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const groupList: Group[] = (groups as any[]).map((g) => ({
    id: g.id, name: g.name, invite_code: g.invite_code, owner_id: g.owner_id,
    members: (members as any[])
      .filter((m) => m.group_id === g.id)
      .map((m) => ({ id: m.user_id, name: m.profiles?.display_name ?? 'สมาชิก' })),
  }));

  const records = (recs as any[]).map(toRecord);
  await attachSignedUrls(records);

  return {
    books: (books as any[]).map((b) => toBook(b, userId)),
    doctors: (doctors as any[]).map(toDoctor),
    medications: (meds as any[]).map(toMedication),
    medLogs: (logs as any[]).map(toMedLog),
    appointments: (appts as any[]).map(toAppointment),
    records,
    watchRules: (rules as any[]).map(toWatchRule),
    groups: groupList,
    shares: (shares as any[]).map((s): BookShare => ({
      book_id: s.book_id, group_id: s.group_id, level: s.level,
    })),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** เติมลิงก์ชั่วคราวให้รูปในไทม์ไลน์ (bucket เป็น private) */
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
  if (error) throw new Error(error.message);
}

export async function upsertBook(b: Book): Promise<void> {
  const { error } = await db().from('books').upsert(bookRow(b));
  if (error) throw new Error(error.message);
}

export async function insertDoctor(d: Doctor): Promise<void> {
  const { error } = await db().from('doctors').insert(doctorRow(d));
  if (error) throw new Error(error.message);
}

export async function deleteDoctor(id: string): Promise<void> {
  const { error } = await db().from('doctors').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** ยาซ้ำคำนวณฝั่งแอป แล้วอัปเดตธงกลับทั้งเล่มในทีเดียว */
export async function upsertMedications(meds: Medication[]): Promise<void> {
  if (!meds.length) return;
  const { error } = await db().from('medications').upsert(meds.map(medicationRow));
  if (error) throw new Error(error.message);
}

export async function upsertMedLog(l: MedLog): Promise<void> {
  const { error } = await db()
    .from('med_logs')
    .upsert(medLogRow(l), { onConflict: 'medication_id,dose_day,slot' });
  if (error) throw new Error(error.message);
}

export async function upsertAppointment(a: Appointment): Promise<void> {
  const { error } = await db().from('appointments').upsert(appointmentRow(a));
  if (error) throw new Error(error.message);
}

export async function insertRecord(r: RecordItem): Promise<void> {
  const { error } = await db().from('records').insert(recordRow(r));
  if (error) throw new Error(error.message);
}

export async function insertWatchRule(w: WatchRule): Promise<void> {
  const { error } = await db().from('watch_rules').insert(watchRuleRow(w));
  if (error) throw new Error(error.message);
}

export async function insertGroup(g: Group): Promise<void> {
  const c = db();
  const { error } = await c.from('groups')
    .insert({ id: g.id, name: g.name, owner_id: g.owner_id, invite_code: g.invite_code });
  if (error) throw new Error(error.message);
  const { error: memberError } = await c.from('group_members')
    .insert({ group_id: g.id, user_id: g.owner_id });
  if (memberError) throw new Error(memberError.message);
}

export async function upsertShare(s: BookShare): Promise<void> {
  const { error } = await db().from('book_shares').upsert(s, { onConflict: 'book_id,group_id' });
  if (error) throw new Error(error.message);
}

/** เข้ากลุ่มด้วยรหัส — ต้องผ่าน RPC เพราะ policy ซ่อนกลุ่มที่ยังไม่ได้เป็นสมาชิก */
export async function joinGroupByCode(code: string): Promise<Group> {
  const { data, error } = await db().rpc('join_group_by_code', { p_code: code });
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
  return path;
}

export async function signedUrl(bucket: 'scans' | 'med-photos', path: string): Promise<string> {
  const { data, error } = await db().storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export const BUCKET_SCANS = SCANS;
export const BUCKET_MED_PHOTOS = MED_PHOTOS;

// ─────────────────────────── ย้ายข้อมูลในเครื่องขึ้นคลาวด์ ───────────────────────────

/** ใช้ครั้งเดียวตอนเปลี่ยนจากโหมดเครื่องเดียวมาต่อคลาวด์ — id เป็น uuid อยู่แล้วจึงยกขึ้นตรงๆ ได้ */
export async function uploadLocalData(local: CloudData, userId: string): Promise<void> {
  const c = db();
  const myBooks = local.books.filter((b) => b.is_mine).map((b) => ({ ...b, owner_id: userId }));
  const bookIds = new Set(myBooks.map((b) => b.id));
  const mine = <T extends { book_id: string }>(rows: T[]) => rows.filter((r) => bookIds.has(r.book_id));

  if (!myBooks.length) return;

  const steps: { table: string; rows: object[] }[] = [
    { table: 'books', rows: myBooks.map(bookRow) },
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
    if (error) throw new Error(`${step.table}: ${error.message}`);
  }

  for (const g of local.groups) {
    await insertGroup({ ...g, owner_id: userId });
  }
  for (const s of local.shares) {
    if (bookIds.has(s.book_id)) await upsertShare(s);
  }
}
