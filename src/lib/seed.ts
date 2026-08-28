import type { AppState, Appointment, Book, BookShare, Doctor, Group, Medication, RecordItem, WatchRule } from './types';
import { todayKey } from './format';

/** ข้อมูล "โหมดตัวอย่าง" — ครอบครัวสมมติชุดเดียวกับต้นแบบ ใช้ดูหน้าตาแอปตอนมีข้อมูลจริง */
export function demoState(): Omit<AppState, 'ready'> {
  const d = (n: number) => {
    const t = new Date();
    t.setDate(t.getDate() + n);
    return todayKey(t);
  };
  const ago = (n: number, hour = 9, minute = 15) => {
    const t = new Date();
    t.setDate(t.getDate() - n);
    t.setHours(hour, minute, 0, 0);
    return t.toISOString();
  };

  const books: Book[] = [
    {
      id: 'b_dad', owner_name: 'เตี่ย', full_name: 'นายสมชาย ใจดี',
      address: '12/3 ถ.เบญจมราชูทิศ ต.วัดใหม่ อ.เมือง จ.จันทบุรี',
      allergy: 'เพนิซิลลิน (ผื่นทั้งตัว)',
      conditions: ['หัวใจขาดเลือด', 'ต้อกระจก', 'กระดูกพรุน'],
      blood_type: 'O', birth_date: '1952-03-12', age: '', emergency_contact: '081-234-5678 (พี่หนึ่ง)',
      avatar: '',
      owner_id: 'u1', is_mine: false,
    },
    {
      id: 'b_mom', owner_name: 'แม่', full_name: 'นางสมศรี ใจดี',
      address: '12/3 ถ.เบญจมราชูทิศ ต.วัดใหม่ อ.เมือง จ.จันทบุรี',
      allergy: 'ไม่มีที่ทราบ',
      conditions: ['ความดันสูง', 'หัวใจเต้นผิดจังหวะ'],
      blood_type: 'B', birth_date: '1956-08-04', age: '', emergency_contact: '081-234-5678 (พี่หนึ่ง)',
      avatar: '',
      owner_id: 'u1', is_mine: false,
    },
    {
      id: 'b_me', owner_name: 'พี่หนึ่ง', full_name: 'นางสาวหนึ่ง ใจดี',
      address: '45 ซ.ลาดพร้าว 71 กรุงเทพฯ',
      allergy: 'ไม่มีที่ทราบ', conditions: ['ภูมิแพ้อากาศ'],
      blood_type: 'O', birth_date: '1981-01-27', age: '', emergency_contact: '089-999-1111 (น้องสอง)',
      avatar: '',
      owner_id: 'u1', is_mine: true,
    },
  ];

  const doctors: Doctor[] = [
    { id: 'dr1', book_id: 'b_dad', name: 'หมอหัวใจ', hospital: 'รพ.พระปกเกล้า จันทบุรี', hn: '58-0012345', phone: '039-324-975', clinic_hours: 'พุธ 09:00–12:00' },
    { id: 'dr2', book_id: 'b_dad', name: 'หมอตา', hospital: 'รพ.พระปกเกล้า จันทบุรี', hn: '58-0012345', phone: '039-324-975', clinic_hours: 'ศุกร์ 09:00–12:00' },
    { id: 'dr3', book_id: 'b_dad', name: 'หมอกระดูก', hospital: 'รพ.พระปกเกล้า จันทบุรี', hn: '58-0012345', phone: '039-324-975', clinic_hours: 'อังคาร 13:00–16:00' },
    { id: 'dr4', book_id: 'b_mom', name: 'หมอหัวใจ', hospital: 'รพ.พระปกเกล้า จันทบุรี', hn: '60-0088123', phone: '039-324-975', clinic_hours: 'ศุกร์ 09:00–12:00' },
    { id: 'dr6', book_id: 'b_dad', name: 'หมอหัวใจ', hospital: 'คลินิกหมอหัวใจ ท่าใหม่', hn: 'C-2291', phone: '081-455-0192', clinic_hours: 'เสาร์ 17:00–20:00' },
    { id: 'dr5', book_id: 'b_me', name: 'หมอฟัน', hospital: 'คลินิกฟันดี', hn: '—', phone: '039-311-2020', clinic_hours: 'จ.–ส. 17:00–20:00' },
  ];

  const medications: Medication[] = [
    { id: 'm1', book_id: 'b_dad', name: 'แอสไพริน 81 มก.', helps: 'ป้องกันเลือดจับตัวเป็นลิ่ม ลดเสี่ยงหัวใจขาดเลือด', how_to_take: 'เช้า 1 เม็ด หลังอาหาร', prescriber: 'หมอหัวใจ', tag: 'หัวใจ', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['morning'], timing: 'after', duplicate_flag: false, paused: false, paused_note: '' },
    { id: 'm2', book_id: 'b_dad', name: 'บิโซโพรลอล 2.5 มก.', helps: 'คุมจังหวะหัวใจไม่ให้เต้นเร็วเกิน ช่วยลดความดัน', how_to_take: 'เช้า 1 เม็ด', prescriber: 'หมอหัวใจ', tag: 'หัวใจ', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['morning'], timing: '', duplicate_flag: false, paused: false, paused_note: '' },
    { id: 'm3', book_id: 'b_dad', name: 'อะทอร์วาสแตติน 40 มก.', helps: 'ลดไขมันในเลือด ป้องกันเส้นเลือดตีบ', how_to_take: 'ก่อนนอน 1 เม็ด', prescriber: 'หมอหัวใจ', tag: 'หัวใจ', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['bedtime'], timing: '', duplicate_flag: true, paused: false, paused_note: '' },
    { id: 'm4', book_id: 'b_dad', name: 'ซิมวาสแตติน 20 มก.', helps: 'ลดไขมันในเลือด (ฤทธิ์เดียวกับอะทอร์วาสแตติน)', how_to_take: 'ก่อนนอน 1 เม็ด', prescriber: 'หมออายุรกรรม', tag: 'ไขมัน', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['bedtime'], timing: '', duplicate_flag: true, paused: false, paused_note: '' },
    { id: 'm5', book_id: 'b_dad', name: 'น้ำตาเทียม', helps: 'เพิ่มความชุ่มชื้น แก้ตาแห้งแสบตา', how_to_take: 'หยอด 1 หยดทั้งสองข้าง วันละ 4 ครั้ง', prescriber: 'หมอตา', tag: 'ตา', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['morning', 'noon', 'evening', 'bedtime'], timing: '', duplicate_flag: false, paused: false, paused_note: '' },
    { id: 'm6', book_id: 'b_dad', name: 'แคลเซียม + วิตามินดี', helps: 'เสริมมวลกระดูก ลดเสี่ยงกระดูกหักจากการล้ม', how_to_take: 'เย็น 1 เม็ด พร้อมอาหาร', prescriber: 'หมอกระดูก', tag: 'กระดูก', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['evening'], timing: 'with', duplicate_flag: false, paused: false, paused_note: '' },
    { id: 'm7', book_id: 'b_mom', name: 'บิโซโพรลอล 2.5 มก.', helps: 'คุมจังหวะหัวใจ ช่วยลดความดัน', how_to_take: 'เช้า 1 เม็ด หลังอาหาร', prescriber: 'หมอหัวใจ', tag: 'หัวใจ', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['morning'], timing: 'after', duplicate_flag: false, paused: false, paused_note: '' },
    { id: 'm8', book_id: 'b_mom', name: 'ซิมวาสแตติน 20 มก.', helps: 'ลดไขมันในเลือด', how_to_take: 'ก่อนนอน 1 เม็ด', prescriber: 'หมอหัวใจ', tag: 'หัวใจ', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['bedtime'], timing: '', duplicate_flag: false, paused: false, paused_note: '' },
    { id: 'm10', book_id: 'b_dad', name: 'พรีกาบาลิน 75 มก.', helps: 'ลดปวดปลายประสาท ชาตามปลายมือปลายเท้า', how_to_take: 'ก่อนนอน 1 เม็ด', prescriber: 'หมอกระดูก', tag: 'กระดูก', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['bedtime'], timing: '', duplicate_flag: false, paused: false, paused_note: '' },
    { id: 'm11', book_id: 'b_dad', name: 'พรีกาบาลิน 25 มก.', helps: 'ลดปวดปลายประสาท (โดสเดิม)', how_to_take: 'ก่อนนอน 1 เม็ด', prescriber: 'หมอวิวัฒน์', tag: 'ปลายประสาท', hospital: 'รพ.พระปกเกล้า จันทบุรี', slots: ['bedtime'], timing: '', duplicate_flag: false, paused: true, paused_note: 'รอกินโดส 75 มก. ให้หมดก่อน แล้วค่อยกลับมากินตัวนี้ต่อ' },
    { id: 'm9', book_id: 'b_me', name: 'ลอราทาดีน 10 มก.', helps: 'แก้แพ้ ลดผื่นคัน น้ำมูกไหล', how_to_take: 'กินเมื่อมีอาการ', prescriber: 'ซื้อเอง', tag: 'ภูมิแพ้', hospital: '', slots: ['prn'], timing: '', duplicate_flag: false, paused: false, paused_note: '' },
  ];

  const appointments: Appointment[] = [
    { id: 'a1', book_id: 'b_dad', title: 'หมอหัวใจ — เตี่ย', date: d(4), time: '09:00', place: 'รพ.พระปกเกล้า จันทบุรี', escort: 'พี่หนึ่ง', blood_test_before: true, blood_test_done: true },
    { id: 'a2', book_id: 'b_dad', title: 'หมอตา — เตี่ย', date: d(83), time: '10:00', place: 'รพ.พระปกเกล้า จันทบุรี', escort: 'น้องสอง', blood_test_before: false, blood_test_done: false },
    { id: 'a3', book_id: 'b_mom', title: 'หมอหัวใจ — แม่', date: d(20), time: '10:30', place: 'รพ.พระปกเกล้า จันทบุรี', escort: 'พี่หนึ่ง', blood_test_before: true, blood_test_done: false },
    { id: 'a4', book_id: 'b_me', title: 'หมอฟัน — ฉัน', date: d(11), time: '17:00', place: 'คลินิกฟันดี', escort: '', blood_test_before: false, blood_test_done: false },
  ];

  const records: RecordItem[] = [
    { id: 'r1', book_id: 'b_dad', kind: 'visit', title: 'ตรวจเลือดก่อนนัด', body: 'พี่หนึ่งพาไป · ผลรอที่ห้องตรวจวันนัด', at: ago(1, 8, 40), actor_name: 'พี่หนึ่ง', important: false },
    { id: 'r2', book_id: 'b_dad', kind: 'doc', title: 'ผลตรวจเลือด', body: 'ไขมัน LDL 98 · น้ำตาลปกติ', at: ago(34, 15, 5), actor_name: 'พี่หนึ่ง', important: true },
    { id: 'r3', book_id: 'b_dad', kind: 'visit', title: 'พบหมอตา', body: 'เปลี่ยนน้ำตาเทียมยี่ห้อใหม่ · นัดอีก 3 เดือน', at: ago(9, 10, 20), actor_name: 'น้องสอง', important: false },
    { id: 'r4', book_id: 'b_dad', kind: 'symptom', title: 'อาการ: เวียนหัวตอนเช้า', body: 'หายเองช่วงสาย — เตรียมเล่าหมอหัวใจ', data: { tags: ['เวียนหัว'] }, at: ago(21, 7, 50), actor_name: 'น้องสอง', important: false },
    { id: 'r5', book_id: 'b_dad', kind: 'bp', title: 'ความดัน 128/76 · ชีพจร 70', body: '', data: { sys: 128, dia: 76, pulse: 70 }, at: ago(6, 7, 10), actor_name: 'พี่แจ๋ว', important: false },
    { id: 'r6', book_id: 'b_dad', kind: 'bp', title: 'ความดัน 135/80 · ชีพจร 74', body: '', data: { sys: 135, dia: 80, pulse: 74 }, at: ago(5, 7, 5), actor_name: 'พี่แจ๋ว', important: false },
    { id: 'r7', book_id: 'b_dad', kind: 'bp', title: 'ความดัน 142/84 · ชีพจร 78', body: 'สูงกว่าเกณฑ์ — แจ้งลูกๆ แล้ว', data: { sys: 142, dia: 84, pulse: 78 }, at: ago(4, 6, 55), actor_name: 'พี่แจ๋ว', important: true },
    { id: 'r8', book_id: 'b_dad', kind: 'bp', title: 'ความดัน 138/82 · ชีพจร 76', body: '', data: { sys: 138, dia: 82, pulse: 76 }, at: ago(3, 7, 20), actor_name: 'พี่หนึ่ง', important: false },
    { id: 'r9', book_id: 'b_dad', kind: 'bp', title: 'ความดัน 131/78 · ชีพจร 72', body: '', data: { sys: 131, dia: 78, pulse: 72 }, at: ago(2, 7, 0), actor_name: 'พี่แจ๋ว', important: false },
    { id: 'r10', book_id: 'b_dad', kind: 'bp', title: 'ความดัน 129/77 · ชีพจร 71', body: '', data: { sys: 129, dia: 77, pulse: 71 }, at: ago(1, 7, 15), actor_name: 'พี่แจ๋ว', important: false },
    { id: 'r11', book_id: 'b_mom', kind: 'visit', title: 'พบหมอหัวใจ', body: 'ความดันคุมได้ดี · คงยาเดิม', at: ago(39, 11, 0), actor_name: 'พี่หนึ่ง', important: false },
    { id: 'r12', book_id: 'b_mom', kind: 'bp', title: 'ความดัน 124/74 · ชีพจร 70', body: '', data: { sys: 124, dia: 74, pulse: 70 }, at: ago(3, 8, 5), actor_name: 'พี่แจ๋ว', important: false },
    { id: 'r13', book_id: 'b_mom', kind: 'bp', title: 'ความดัน 122/72 · ชีพจร 68', body: '', data: { sys: 122, dia: 72, pulse: 68 }, at: ago(1), actor_name: 'พี่แจ๋ว', important: false },
    { id: 'r14', book_id: 'b_me', kind: 'visit', title: 'ขูดหินปูน', body: 'คลินิกฟันดี', at: ago(74, 18, 30), actor_name: 'พี่หนึ่ง', important: false },
  ];

  const watchRules: WatchRule[] = [
    { id: 'w1', book_id: 'b_dad', triggers: ['เคืองตา', 'เจ็บตา'], action: 'พบหมอทันที ห้ามรอ', source: 'หมอตาสั่งไว้', severity: 'urgent' },
    { id: 'w2', book_id: 'b_dad', triggers: ['เจ็บหน้าอก'], action: 'โทร 1669 ทันที', source: 'หมอหัวใจ', severity: 'urgent' },
    { id: 'w3', book_id: 'b_dad', triggers: ['ล้ม'], action: 'จดไว้เล่าหมอกระดูก แม้ไม่เจ็บ', source: 'หมอกระดูก', severity: 'note' },
    { id: 'w4', book_id: 'b_mom', triggers: ['ใจสั่น', 'เจ็บหน้าอก'], action: 'โทรหาลูกและไป รพ. ทันที', source: 'หมอหัวใจ', severity: 'urgent' },
  ];

  const groups: Group[] = [
    {
      id: 'g1', name: 'บ้านเตี่ย–แม่', invite_code: 'DLK-4821', owner_id: 'u1',
      members: [
        { id: 'u1', name: 'พี่หนึ่ง' }, { id: 'u2', name: 'น้องสอง' },
        { id: 'u3', name: 'น้องสาม' }, { id: 'u4', name: 'พี่แจ๋ว (คนดูแล)' },
      ],
    },
  ];

  const shares: BookShare[] = [
    { book_id: 'b_dad', group_id: 'g1', level: 'full' },
    { book_id: 'b_mom', group_id: 'g1', level: 'full' },
    { book_id: 'b_me', group_id: 'g1', level: 'appointments' },
  ];

  return {
    mode: 'local', userId: '', userEmail: '', loadError: '', loadOk: true, onboarded: true, tab: 'home',
    actorName: 'พี่แจ๋ว', bigText: false,
    activeBookId: 'b_dad', activeGroupId: 'g1',
    books, doctors, medications, medLogs: [], appointments, records, watchRules, groups, shares,
  };
}

/** อาการที่ให้เลือกในชีต "จดอาการ" */
export const SYMPTOM_CHIPS = [
  'เวียนหัว', 'ใจสั่น', 'เจ็บหน้าอก', 'เคืองตา', 'เจ็บตา', 'เหนื่อยง่าย',
  'นอนไม่หลับ', 'เบื่ออาหาร', 'ปวดหัว', 'ผื่นแพ้', 'ล้ม', 'ท้องผูก',
];

/** โรคประจำตัวที่ให้เลือกตอน onboarding */
export const CONDITION_CHIPS = [
  'ความดันสูง', 'เบาหวาน', 'โรคหัวใจ', 'ไขมันสูง', 'ต้อกระจก', 'กระดูกพรุน', 'ภูมิแพ้',
];

/** เหตุผลที่ "ไม่ยอมกินยา" */
export const REFUSE_REASONS = ['บอกว่าขม', 'อิ่มเกิน', 'อารมณ์ไม่ดี', 'ลืม', 'บอกว่าไม่สบายตัว'];
