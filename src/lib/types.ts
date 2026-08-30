// โครงข้อมูลของแอป — ตรงกับ supabase_schema.sql (ตาราง = ชื่อ plural ของ type นี้)

export type ShareLevel = 'full' | 'appointments' | 'none';
export type DoseSlot = 'morning' | 'noon' | 'evening' | 'bedtime' | 'prn';
/** จังหวะกินเทียบกับมื้ออาหาร — ว่าง = ไม่ระบุ */
export type MealTiming = '' | 'before' | 'after' | 'with';
/** ชนิดบันทึกในไทม์ไลน์
 *  exercise/food/note = แท็บกิจกรรม (บันทึกประจำวัน) — ดู migration 0011 */
export type RecordKind = 'symptom' | 'bp' | 'doc' | 'visit' | 'exercise' | 'food' | 'note';

/** หมอหนึ่งคนที่โรงพยาบาลหนึ่งแห่ง — หมอคนเดียวออกตรวจหลายที่ = หลายแถว
 *  ชื่อเดียวกัน แต่ HN เบอร์โทร และเวลาออกตรวจเป็นคนละชุด */
export interface Doctor {
  id: string;
  book_id: string;
  name: string;          // "หมอหัวใจ"
  hospital: string;
  hn: string;            // HN ของโรงพยาบาลนี้ คนละเลขกับที่อื่น
  phone: string;         // เบอร์โรงพยาบาล/คลินิกนี้ — กดโทรจากในแอปได้เลย
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
  birth_date: string;    // 'YYYY-MM-DD' — ว่างได้ ผู้สูงอายุบางคนจำไม่แน่
  age: string;           // กรอกเองเมื่อไม่รู้วันเกิดชัดเจน
  emergency_contact: string;
  owner_id: string;        // profiles.id ของเจ้าของสมุด
  is_mine: boolean;        // สมุดของผู้ใช้เครื่องนี้เอง
  /** รูปโปรไฟล์ย่อขนาดเล็ก เก็บเป็น data URL มากับข้อมูลสมุดเลย
   *  ต้องเห็นทันทีที่เปิดแอป จึงไม่แยกไปที่เก็บไฟล์แบบรูปใบนัด */
  avatar: string;
}

/** การยินยอมแชร์ = สมุดเล่มหนึ่ง เข้ากลุ่มหนึ่ง ที่ระดับหนึ่ง (ตาราง book_shares) */
export interface BookShare {
  book_id: string;
  group_id: string;
  level: ShareLevel;
}

export interface Medication {
  id: string;
  book_id: string;
  name: string;
  helps: string;         // "ช่วยอะไร" — ภาษาบ้านๆ
  how_to_take: string;
  prescriber: string;    // ชื่อหมอที่สั่ง
  tag: string;           // แผนก เช่น "หัวใจ"
  hospital: string;      // โรงพยาบาล / คลินิก
  slots: DoseSlot[];
  timing: MealTiming;
  duplicate_flag: boolean;
  /** พักไว้ก่อน ยังไม่ได้เลิกกิน — เช่น หมออีกคนสั่งตัวเดียวกันแต่โดสสูงกว่า
   *  กินตัวใหม่ให้หมดก่อนแล้วค่อยกลับมากินตัวนี้ต่อ */
  paused: boolean;
  paused_note: string;   // "รอกิน progabilin 75 มก. ให้หมดก่อน"
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
  photo?: string;        // ลิงก์สำหรับแสดงผล (data URL ในเครื่อง / signed URL บนคลาวด์)
  photo_path?: string;   // path ใน Storage bucket 'scans'
}

export interface RecordItem {
  id: string;
  book_id: string;
  kind: RecordKind;
  title: string;
  body: string;
  data?: {
    sys?: number; dia?: number; pulse?: number; tags?: string[];
    /** exercise: ท่า/ชนิดที่เลือก เช่น "ยิม" — ใช้หาบันทึกครั้งก่อนของชนิดเดียวกัน */
    activity?: string;
    minutes?: number;
    /** food: มื้อ เช่น "เที่ยง" */
    meal?: string;
    /** ไม่บังคับกรอก — ไม่กรอกแล้วต้องไม่ถูกนับเป็น 0 ในยอดรวม */
    kcal?: number;
    /** วัคซีนที่เคยฉีด
     *
     *  เก็บไว้ใน data ของบันทึกชนิด 'visit' ไม่ได้สร้างชนิดใหม่ เพราะ data เป็น
     *  jsonb อยู่แล้ว จึงไม่ต้องแก้โครงฐานข้อมูล ใช้ได้ทันทีที่ deploy
     *  วันหลังถ้าจะย้ายไปเป็นชนิดของตัวเอง ข้อมูลก้อนนี้ย้ายตามได้ทั้งดุ้น */
    vaccine?: {
      name: string;
      /** เข็มที่เท่าไหร่ เช่น "เข็ม 2" หรือ "กระตุ้น" — ว่างได้ */
      dose?: string;
      place?: string;
      /** ครบกำหนดครั้งหน้า 'YYYY-MM-DD' — ไม่รู้ก็ไม่ต้องใส่ */
      next_due?: string;
      /** ความละเอียดของวันที่ฉีดที่ผู้ใช้รู้จริง
       *
       *  ผู้สูงอายุมักจำได้แค่ "ฉีดตอนโควิดระบาด" ถ้าบังคับให้เลือกวันเป๊ะ
       *  คนจะเดามั่วหรือไม่ลงเลย แล้วเราจะได้วันที่ที่ดูแม่นแต่ไม่จริง
       *  จึงเก็บไว้ว่ารู้แค่ไหน แล้วแสดงเท่าที่รู้ */
      precision?: 'day' | 'month' | 'year';
    };
  };
  file?: string;         // ลิงก์สำหรับแสดงผล: data URL (โหมดเครื่องเดียว) หรือ signed URL (คลาวด์)
  file_path?: string;    // path ใน Supabase Storage bucket 'scans'
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
  owner_id: string;
  members: GroupMember[];
}

export type Tab = 'home' | 'meds' | 'appts' | 'activity' | 'book';

/** local = เก็บในเครื่องอย่างเดียว, cloud = ต่อ Supabase (auth + realtime + storage) */
export type StoreMode = 'local' | 'cloud';

export interface AppState {
  ready: boolean;
  mode: StoreMode;
  userId: string;
  userEmail: string;
  /** โหลดข้อมูลจากคลาวด์ไม่สำเร็จ — ต่างจาก "โหลดได้แต่ยังไม่มีสมุด" คนละเรื่องกัน */
  loadError: string;
  /** ดึงข้อมูลจากคลาวด์สำเร็จจริงอย่างน้อยหนึ่งครั้งในรอบนี้
   *  ใช้แยก "เซิร์ฟเวอร์ตอบแล้วว่าไม่มีสมุด" ออกจาก "ยังไม่ได้คำตอบ" */
  loadOk: boolean;
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
  shares: BookShare[];
}
