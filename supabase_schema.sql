-- Doolaekan — Supabase schema (Postgres + RLS)
-- หลักการ: ทุกอย่างผูกกับ "book" (สมุดสุขภาพ 1 เล่ม/คน) — ส่วนตัวโดยค่าเริ่มต้น
-- แชร์เข้ากลุ่มเป็นราย book ด้วยระดับ full / appointments / none

-- ผู้ใช้ (ต่อยอดจาก auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,          -- ชื่อเรียก เช่น "พี่หนึ่ง"
  line_user_id text,                   -- สำหรับแจ้งเตือนผ่าน LINE
  created_at timestamptz default now()
);

-- สมุดสุขภาพ (ปกติ 1 คน 1 เล่ม; owner คือผู้ใช้เจ้าของ)
create table books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  display_name text not null,          -- "เตี่ย"
  full_name text, address text, blood_group text, birth_date date,
  allergy text, conditions text[],     -- โรคประจำตัว
  emergency_contact text,              -- เบอร์ลูก
  created_at timestamptz default now()
);

-- หมอที่รักษา (หมอคนเดียวหลายที่ = หลายแถว: ชื่อเดิม ที่/เวลา/HN ต่างกัน)
create table doctors (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  name text not null,                  -- "หมอหัวใจ"
  hospital text, hn text, clinic_hours text,  -- "พุธ 09:00–12:00"
  created_at timestamptz default now()
);

-- กลุ่มครอบครัว (1 คนอยู่ได้หลายกลุ่ม แยกกันสนิท)
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id),
  invite_code text unique default encode(gen_random_bytes(6), 'hex'), -- ทำเป็น QR/ลิงก์
  created_at timestamptz default now()
);
create table group_members (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- การแชร์รายสมุดเข้ากลุ่ม = การยินยอม
create type share_level as enum ('full', 'appointments', 'none');
create table book_shares (
  book_id uuid references books(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,
  level share_level not null default 'none',
  primary key (book_id, group_id)
);

-- ยา
create table medications (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  name text not null, how_to_take text, helps text,      -- "ช่วยอะไร"
  doctor_id uuid references doctors(id),
  photo_path text,                                        -- storage: รูปถุงยา
  duplicate_flag boolean default false,                   -- ⚑ ยาซ้ำ รอถามหมอ
  active boolean default true,
  created_by uuid references profiles(id), created_at timestamptz default now()
);

-- บันทึกกินยา (รวมไม่ยอมกิน) — actor_name เผื่อกดจากเครื่องกลาง ("คนกดตอนนี้")
create type dose_status as enum ('taken', 'refused');
create table med_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references medications(id) on delete cascade,
  status dose_status not null,
  reason text,                          -- "บอกว่าขม"
  actor_user uuid references profiles(id),
  actor_name text not null,             -- ชื่อคนกดจริง
  logged_at timestamptz default now()
);

-- นัดหมอ
create table appointments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  title text not null, appt_date date not null, appt_time time,
  place text, doctor_id uuid references doctors(id),
  escort_user uuid references profiles(id),               -- ใครพาไป
  blood_test_before boolean default false,                -- แนบขั้นตรวจเลือด ≤7 วัน
  blood_test_done_at date,
  remind_day_before boolean default true, remind_morning boolean default true,
  created_by uuid references profiles(id), created_at timestamptz default now()
);

-- ไทม์ไลน์รวม: อาการ / ความดัน / เอกสารสแกน / บันทึกพบหมอ
create type record_kind as enum ('symptom', 'bp', 'doc', 'visit', 'note');
create table records (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  kind record_kind not null,
  title text not null, body text,
  data jsonb,                       -- bp: {"sys":132,"dia":78,"pulse":72} / symptom: {"tags":[...]}
  file_path text,                   -- storage: เอกสารสแกน
  hit_watch_rule boolean default false,
  actor_user uuid references profiles(id), actor_name text,
  created_at timestamptz default now()
);

-- ข้อเฝ้าระวังประจำตัว ("เคืองตา/เจ็บตา → พบหมอทันที")
create table watch_rules (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  triggers text[] not null,          -- ['เคืองตา','เจ็บตา']
  action text not null,              -- "พบหมอทันที ห้ามรอ"
  source text,                       -- "หมอตาสั่งไว้"
  severity text default 'urgent'     -- urgent | note
);

-- push subscriptions (Web Push / PWA)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz default now()
);

-- ─────────────────────────── RLS ───────────────────────────
-- helper: ระดับสิทธิ์สูงสุดที่ user มีต่อ book ผ่านกลุ่มที่อยู่ร่วมกัน
create or replace function can_access_book(p_book uuid, p_level share_level)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from books b where b.id = p_book and b.owner_id = auth.uid()
  ) or exists (
    select 1 from book_shares bs
    join group_members gm on gm.group_id = bs.group_id and gm.user_id = auth.uid()
    where bs.book_id = p_book
      and (bs.level = 'full' or (p_level = 'appointments' and bs.level in ('full','appointments')))
  );
$$;

alter table books enable row level security;
create policy books_select on books for select using (can_access_book(id, 'appointments'));
create policy books_owner  on books for all    using (owner_id = auth.uid());

-- ตารางลูกของ book: อ่าน/เขียนได้เมื่อแชร์ระดับ full (เจ้าของได้เสมอ)
-- ทำ pattern เดียวกันกับ doctors, medications, med_logs, records, watch_rules:
alter table medications enable row level security;
create policy meds_rw on medications for all
  using (can_access_book(book_id, 'full')) with check (can_access_book(book_id, 'full'));

-- appointments: อ่านได้ตั้งแต่ระดับ appointments, เขียนได้ระดับ full
alter table appointments enable row level security;
create policy appt_read  on appointments for select using (can_access_book(book_id, 'appointments'));
create policy appt_write on appointments for insert with check (can_access_book(book_id, 'full'));
create policy appt_update on appointments for update using (can_access_book(book_id, 'full'));

-- groups: สมาชิกเห็นเฉพาะกลุ่มตัวเอง — กลุ่มอื่นล่องหนสนิท
alter table groups enable row level security;
create policy groups_member on groups for select
  using (exists (select 1 from group_members where group_id = id and user_id = auth.uid()));

-- Storage buckets: 'scans' (เอกสาร), 'med-photos' (ถุงยา) — policy อิง can_access_book(book_id,'full')
-- Realtime: เปิด publication บน med_logs, records, appointments เพื่อให้ทุกเครื่องอัปเดตทันที
