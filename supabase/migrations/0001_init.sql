-- Doolaekan — สคีมาเริ่มต้น (Postgres + RLS)
-- ต่อยอดจาก supabase_schema.sql ในชุด handoff โดยเติมส่วนที่ย่อไว้ให้รันได้จริง:
-- RLS ครบทุกตาราง, ดัชนี, storage bucket, และ realtime publication
-- ไฟล์นี้รันซ้ำได้ (idempotent) — รันแล้วพลาดกลางทาง รันใหม่ทับได้เลย ไม่ต้องล้างฐาน
--
-- หลักการ: ทุกอย่างผูกกับ "book" (สมุดสุขภาพ 1 เล่ม/คน) — ส่วนตัว 100% โดยค่าเริ่มต้น
-- แชร์เข้ากลุ่มเป็นราย book ด้วยระดับ full / appointments / none

-- ─────────────────────────── enums ───────────────────────────
do $$
begin
  create type share_level as enum ('full', 'appointments', 'none');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type dose_status as enum ('taken', 'refused');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type dose_slot as enum ('morning', 'noon', 'evening', 'bedtime', 'prn');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type record_kind as enum ('symptom', 'bp', 'doc', 'visit', 'note');
exception when duplicate_object then null;
end $$;

-- ─────────────────────────── ตาราง ───────────────────────────

-- ผู้ใช้ (ต่อยอดจาก auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,            -- ชื่อเรียก เช่น "พี่หนึ่ง"
  line_user_id text,                     -- สำหรับแจ้งเตือนผ่าน LINE (ดู notifications.md)
  created_at timestamptz not null default now()
);

-- สมุดสุขภาพ (ปกติ 1 คน 1 เล่ม; owner คือผู้ใช้เจ้าของ)
create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  display_name text not null,            -- "เตี่ย"
  full_name text,
  address text,
  blood_group text,
  birth_date date,
  age text,                              -- ผู้สูงอายุหลายคนจำปีเกิดไม่แน่ แต่บอกอายุได้
  allergy text,
  conditions text[] not null default '{}',
  emergency_contact text,                -- เบอร์ลูก
  created_at timestamptz not null default now()
);
create index if not exists books_owner_idx on books(owner_id);

-- หมอที่รักษา (หมอคนเดียวออกตรวจหลายที่ = หลายแถว ชื่อเดิม HN/เวลาต่างกัน)
create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  name text not null,                    -- "หมอหัวใจ"
  hospital text,
  hn text,
  clinic_hours text,                     -- "พุธ 09:00–12:00"
  created_at timestamptz not null default now()
);
create index if not exists doctors_book_idx on doctors(book_id);

-- กลุ่มครอบครัว (1 คนอยู่ได้หลายกลุ่ม แยกกันสนิท)
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  -- ใช้ gen_random_uuid() ซึ่งเป็นของ Postgres แกนกลาง (13+) ไม่ต้องพึ่ง extension
  invite_code text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on group_members(user_id);

-- การแชร์รายสมุดเข้ากลุ่ม = การยินยอม
create table if not exists book_shares (
  book_id uuid references books(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,
  level share_level not null default 'none',
  primary key (book_id, group_id)
);

-- ยา
create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  name text not null,
  how_to_take text,
  helps text,                            -- "ช่วยอะไร" — ภาษาบ้านๆ
  tag text,                              -- แผนก เช่น "หัวใจ"
  slots dose_slot[] not null default '{}',
  doctor_id uuid references doctors(id) on delete set null,
  prescriber text,                       -- ชื่อหมอที่สั่ง เผื่อยังไม่ได้ผูก doctor_id
  photo_path text,                       -- storage: รูปถุงยา
  duplicate_flag boolean not null default false,   -- ⚑ ยาซ้ำ รอถามหมอ
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists medications_book_idx on medications(book_id);

-- บันทึกกินยา (รวม "ไม่ยอมกิน") — actor_name เผื่อกดจากเครื่องกลางที่บ้าน
-- book_id เก็บซ้ำไว้เพื่อให้ RLS/เรียลไทม์ไม่ต้อง join ทุกครั้ง
create table if not exists med_logs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  medication_id uuid not null references medications(id) on delete cascade,
  dose_day date not null default current_date,
  slot dose_slot not null,
  status dose_status not null,
  reason text,                           -- "บอกว่าขม"
  actor_user uuid references profiles(id) on delete set null,
  actor_name text not null,              -- ชื่อคนกดจริง
  logged_at timestamptz not null default now(),
  -- กดซ้ำมื้อเดิมของวันเดิม = แก้ของเดิม ไม่ใช่เพิ่มแถวใหม่
  unique (medication_id, dose_day, slot)
);
create index if not exists med_logs_book_day_idx on med_logs(book_id, dose_day);

-- นัดหมอ
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  title text not null,
  appt_date date not null,
  appt_time time,
  place text,
  doctor_id uuid references doctors(id) on delete set null,
  escort_user uuid references profiles(id) on delete set null,
  escort_name text,                                  -- ใครพาไป (ยังไม่ต้องมีบัญชีก็ได้)
  blood_test_before boolean not null default false,  -- แนบขั้นตรวจเลือด ≤7 วัน
  blood_test_done_at date,
  remind_day_before boolean not null default true,
  remind_morning boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists appointments_book_date_idx on appointments(book_id, appt_date);

-- ไทม์ไลน์รวม: อาการ / ความดัน / เอกสารสแกน / บันทึกพบหมอ
create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  kind record_kind not null,
  title text not null,
  body text,
  data jsonb,                       -- bp: {"sys":132,"dia":78,"pulse":72} / symptom: {"tags":[...]}
  file_path text,                   -- storage: เอกสารสแกน
  hit_watch_rule boolean not null default false,
  actor_user uuid references profiles(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists records_book_created_idx on records(book_id, created_at desc);

-- ข้อเฝ้าระวังประจำตัว ("เคืองตา/เจ็บตา → พบหมอทันที")
create table if not exists watch_rules (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  triggers text[] not null,          -- ['เคืองตา','เจ็บตา']
  action text not null,              -- "พบหมอทันที ห้ามรอ"
  source text,                       -- "หมอตาสั่งไว้"
  severity text not null default 'urgent' check (severity in ('urgent', 'note'))
);
create index if not exists watch_rules_book_idx on watch_rules(book_id);

-- push subscriptions (Web Push / PWA)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- กันแจ้งเตือนซ้ำ (pg_cron สแกนทุก 15 นาที — ดู notifications.md)
create table if not exists notified_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  event_key text not null,           -- เช่น 'appt:<id>:day_before'
  sent_at timestamptz not null default now(),
  unique (user_id, event_key)
);

-- โปรไฟล์เกิดเองเมื่อมีผู้ใช้ใหม่
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'ผู้ใช้ใหม่'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────── RLS ───────────────────────────
-- helper: ผู้ใช้ปัจจุบันเข้าถึง book นี้ได้ถึงระดับที่ขอหรือไม่
-- เจ้าของเข้าถึงได้เสมอ; คนอื่นต้องอยู่กลุ่มเดียวกันและเจ้าของแชร์ไว้ถึงระดับนั้น
create or replace function can_access_book(p_book uuid, p_level share_level)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from books b where b.id = p_book and b.owner_id = auth.uid()
  ) or exists (
    select 1 from book_shares bs
    join group_members gm on gm.group_id = bs.group_id and gm.user_id = auth.uid()
    where bs.book_id = p_book
      and (bs.level = 'full'
        or (p_level = 'appointments' and bs.level in ('full', 'appointments')))
  );
$$;

-- helper: อยู่กลุ่มนี้ไหม — ต้องเป็น security definer ไม่งั้น policy ของ group_members
-- จะเรียกตัวเองซ้ำจนวนไม่รู้จบ
create or replace function is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = p_group and gm.user_id = auth.uid()
  );
$$;

-- helper: อยู่กลุ่มเดียวกับผู้ใช้คนนี้ไหม (ใช้กับ policy ของ profiles)
create or replace function shares_group_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members me
    join group_members them on them.group_id = me.group_id
    where me.user_id = auth.uid() and them.user_id = p_user
  );
$$;

alter table profiles          enable row level security;
alter table books             enable row level security;
alter table doctors           enable row level security;
alter table groups            enable row level security;
alter table group_members     enable row level security;
alter table book_shares       enable row level security;
alter table medications       enable row level security;
alter table med_logs          enable row level security;
alter table appointments      enable row level security;
alter table records           enable row level security;
alter table watch_rules       enable row level security;
alter table push_subscriptions enable row level security;
alter table notified_log      enable row level security;

-- profiles: เห็นตัวเอง + คนที่อยู่กลุ่มเดียวกัน
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_same_group on profiles;
create policy profiles_same_group on profiles for select using (shares_group_with(id));

-- books: อ่านได้ตั้งแต่ระดับ appointments; แก้ได้เฉพาะเจ้าของ
drop policy if exists books_select on books;
create policy books_select on books for select using (can_access_book(id, 'appointments'));
drop policy if exists books_owner on books;
create policy books_owner on books for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ตารางลูกของ book ที่ต้องแชร์ระดับ full ถึงจะเห็น/แก้ได้
drop policy if exists doctors_rw on doctors;
create policy doctors_rw on doctors for all
  using (can_access_book(book_id, 'full')) with check (can_access_book(book_id, 'full'));
drop policy if exists meds_rw on medications;
create policy meds_rw on medications for all
  using (can_access_book(book_id, 'full')) with check (can_access_book(book_id, 'full'));
drop policy if exists med_logs_rw on med_logs;
create policy med_logs_rw on med_logs for all
  using (can_access_book(book_id, 'full')) with check (can_access_book(book_id, 'full'));
drop policy if exists records_rw on records;
create policy records_rw on records for all
  using (can_access_book(book_id, 'full')) with check (can_access_book(book_id, 'full'));
drop policy if exists watch_rules_rw on watch_rules;
create policy watch_rules_rw on watch_rules for all
  using (can_access_book(book_id, 'full')) with check (can_access_book(book_id, 'full'));

-- appointments: อ่านได้ตั้งแต่ระดับ appointments, เขียนได้ระดับ full
drop policy if exists appt_read on appointments;
create policy appt_read on appointments for select
  using (can_access_book(book_id, 'appointments'));
drop policy if exists appt_insert on appointments;
create policy appt_insert on appointments for insert
  with check (can_access_book(book_id, 'full'));
drop policy if exists appt_update on appointments;
create policy appt_update on appointments for update
  using (can_access_book(book_id, 'full')) with check (can_access_book(book_id, 'full'));
drop policy if exists appt_delete on appointments;
create policy appt_delete on appointments for delete
  using (can_access_book(book_id, 'full'));

-- groups: สมาชิกเห็นเฉพาะกลุ่มตัวเอง — กลุ่มอื่นล่องหนสนิท
drop policy if exists groups_member on groups;
create policy groups_member on groups for select using (is_group_member(id));
drop policy if exists groups_owner on groups;
create policy groups_owner on groups for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- group_members: เห็นสมาชิกกลุ่มที่ตัวเองอยู่; เพิ่ม/ลบได้เฉพาะแถวของตัวเอง (เข้า/ออกกลุ่มเอง)
drop policy if exists group_members_read on group_members;
create policy group_members_read on group_members for select using (is_group_member(group_id));
drop policy if exists group_members_self on group_members;
create policy group_members_self on group_members for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- book_shares: เจ้าของสมุดเป็นคนกำหนดการยินยอม; สมาชิกกลุ่มอ่านได้เพื่อรู้ว่าเห็นอะไรได้บ้าง
drop policy if exists book_shares_owner on book_shares;
create policy book_shares_owner on book_shares for all using (
  exists (select 1 from books b where b.id = book_shares.book_id and b.owner_id = auth.uid())
) with check (
  exists (select 1 from books b where b.id = book_shares.book_id and b.owner_id = auth.uid())
);
drop policy if exists book_shares_read on book_shares;
create policy book_shares_read on book_shares for select using (is_group_member(group_id));

-- ของส่วนตัวล้วน
drop policy if exists push_self on push_subscriptions;
create policy push_self on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notified_self on notified_log;
create policy notified_self on notified_log for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────── Storage ───────────────────────────
-- 'scans' = เอกสารจากหมอ, 'med-photos' = รูปถุงยา
-- ตั้งชื่อไฟล์เป็น <book_id>/<uuid>.<ext> เพื่อให้ policy เช็คสิทธิ์จากโฟลเดอร์แรกได้
insert into storage.buckets (id, name, public)
values ('scans', 'scans', false), ('med-photos', 'med-photos', false)
on conflict (id) do nothing;

drop policy if exists scans_rw on storage.objects;
create policy scans_rw on storage.objects for all
  using (bucket_id in ('scans', 'med-photos')
    and can_access_book((storage.foldername(name))[1]::uuid, 'full'))
  with check (bucket_id in ('scans', 'med-photos')
    and can_access_book((storage.foldername(name))[1]::uuid, 'full'));

-- ─────────────────────────── Realtime ───────────────────────────
-- ให้ทุกเครื่องในบ้านเห็นการบันทึกทันทีโดยไม่ต้องรีเฟรช
do $$
declare t text;
begin
  foreach t in array array['med_logs', 'records', 'appointments', 'medications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
