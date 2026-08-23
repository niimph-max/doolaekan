// โครงข้อมูลของแอป — ตรงกับ supabase_schema.sql (ตาราง = ชื่อ plural ของ type นี้)

export type ShareLevel = 'full' | 'appointments' | 'none';
export type DoseSlot = 'morning' | 'noon' | 'evening' | 'bedtime' | 'prn';
export type RecordKind = 'symptom' | 'bp' | 'doc' | 'visit';

export interface Doctor {
  id: string;
  book_id: string;
  name: string;          // "หมอหัวใจ"
  hospital: string;
  hn: string;
  clinic_hours: string;  // "พุธ 09:00–12:00"
}

export interface Book {
  id: string;
  owner_name: string;    // ชื่อเรียกในสมุด เช่น "เตี่ย"
  full_name: string;
  address: string;
  allergy: string;
  conditions: string[];
  blood_type: string;
  age: string;
  emergency_contact: string;
  share_level: ShareLevel; // ระดับที่ยินยอมแชร์เข้ากลุ่มปัจจุบัน
  is_mine: boolean;        // สมุดของผู้ใช้เครื่องนี้เอง
}

export interface Medication {
  id: string;
  book_id: string;
  name: string;
  helps: string;         // "ช่วยอะไร" — ภาษาบ้านๆ
  how_to_take: string;
  prescriber: string;    // หมอที่สั่ง
  tag: string;           // แผนก เช่น "หัวใจ"
  slots: DoseSlot[];
  duplicate_flag: boolean;
  photo?: string;        // data URL รูปถุงยา (ของจริง = Supabase Storage)
}

export interface MedLog {
  id: string;
  book_id: string;
  medication_id: string;
  day: string;           // 'YYYY-MM-DD'
  slot: DoseSlot;
  status: 'taken' | 'refused';
  reason: string;
  at: string;            // ISO
  actor_name: string;    // ชื่อ "คนกดตอนนี้"
}

export interface Appointment {
  id: string;
  book_id: string;
  title: string;
  date: string;          // 'YYYY-MM-DD'
  time: string;          // 'HH:mm'
  place: string;
  escort: string;
  blood_test_before: boolean;
  blood_test_done: boolean;
}

export interface RecordItem {
  id: string;
  book_id: string;
  kind: RecordKind;
  title: string;
  body: string;
  data?: { sys?: number; dia?: number; pulse?: number; tags?: string[] };
  file?: string;         // data URL ของเอกสารสแกน
  at: string;            // ISO
  actor_name: string;
  important: boolean;    // เข้าข้อเฝ้าระวัง / เป็นเอกสารสำคัญ → จุดส้ม
}

export interface WatchRule {
  id: string;
  book_id: string;
  triggers: string[];
  action: string;
  source: string;
  severity: 'urgent' | 'note';
}

export interface GroupMember {
  id: string;
  name: string;
}

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  members: GroupMember[];
  book_ids: string[];    // สมุดที่ถูกแชร์เข้ากลุ่มนี้
}

export type Tab = 'home' | 'meds' | 'appts' | 'book';

export interface AppState {
  ready: boolean;
  onboarded: boolean;
  tab: Tab;
  actorName: string;
  bigText: boolean;
  activeBookId: string;
  activeGroupId: string;
  books: Book[];
  doctors: Doctor[];
  medications: Medication[];
  medLogs: MedLog[];
  appointments: Appointment[];
  records: RecordItem[];
  watchRules: WatchRule[];
  groups: Group[];
}
