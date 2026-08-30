-- แจ้งเตือนเข้าเครื่อง (Web Push) — เตือนวันนัด / ความดันสูง / สรุปวันละครั้ง
--
-- ที่เจ็บจริงคือเรื่องที่ "ไม่มีใครอยู่ตรงนั้นตอนมันเกิด": เตี่ยวัดความดันได้ 168
-- ตอนบ่ายแล้วไม่มีใครรู้จนกลางคืน, ลืมว่านัดหมอหัวใจต้องไปเจาะเลือดล่วงหน้า
-- แล้วไปถึงวันนัดโดยไม่มีผลเลือด, หรือไม่มีใครเปิดแอปเลยทั้งวันเพราะไม่มีอะไรมาสะกิด
--
-- ตั้งใจ "ไม่" เตือนรายมื้อยา — เตือนวันละ 3-4 ครั้งทุกวันคือทางที่คนปิดแจ้งเตือนทิ้ง
-- แล้วพลาดเรื่องด่วนไปด้วย ยาที่ยังไม่ได้กดไปรวมอยู่ในสรุปวันละครั้งแทน
--
-- ของทั้งไฟล์นี้เงียบสนิทจนกว่าจะใส่ความลับสองตัวใน Vault (ดูท้ายไฟล์)
-- รันซ้ำได้ ไม่พัง

-- ─────────────────────────── ส่วนขยายที่ต้องใช้ ───────────────────────────
-- pg_net = ยิง HTTP ออกจากฐานข้อมูล (เรียก Edge Function), pg_cron = ตั้งเวลา
-- บางโปรเจกต์เปิดจากหน้า Dashboard → Database → Extensions ไว้แล้ว
-- ถ้าเปิดจากที่นี่ไม่ได้ (สิทธิ์ไม่ถึง) ก็ไม่ควรทำให้ทั้งไฟล์ล้ม ตารางที่เหลือยังต้องได้
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'เปิด pg_net ไม่ได้จากที่นี่ (%) — เปิดที่ Dashboard → Database → Extensions', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'เปิด pg_cron ไม่ได้จากที่นี่ (%) — เปิดที่ Dashboard → Database → Extensions', sqlerrm;
end $$;

-- ─────────────────────────── ตาราง ───────────────────────────

-- เครื่องที่ขอรับแจ้งเตือนไว้
--
-- endpoint คือที่อยู่จริงที่เบราว์เซอร์ให้มา และเป็นตัวชี้ขาดว่า "เครื่องเดียวกันไหม"
-- เดิมเก็บแต่ก้อน jsonb ทั้งก้อน กดเปิดแจ้งเตือนซ้ำสองครั้งจะได้สองแถวของเครื่องเดียว
-- แล้วเตี่ยจะได้แจ้งเตือนเด้งซ้อนสองอันทุกครั้ง
alter table push_subscriptions add column if not exists endpoint text;
alter table push_subscriptions add column if not exists origin text;
alter table push_subscriptions add column if not exists user_agent text;
alter table push_subscriptions add column if not exists label text;
alter table push_subscriptions add column if not exists updated_at timestamptz not null default now();

update push_subscriptions
set endpoint = subscription ->> 'endpoint'
where endpoint is null and subscription ? 'endpoint';

delete from push_subscriptions where endpoint is null;
alter table push_subscriptions alter column endpoint set not null;

create unique index if not exists push_subscriptions_endpoint_key on push_subscriptions(endpoint);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

comment on column push_subscriptions.endpoint is 'ที่อยู่รับ push ของเครื่องนั้น — ตัวชี้ขาดว่าเป็นเครื่องเดียวกัน';
comment on column push_subscriptions.origin is 'ที่อยู่เว็บที่สมัครไว้ — ย้ายโดเมนแล้วของเดิมใช้ไม่ได้ ต้องสมัครใหม่';
comment on column push_subscriptions.label is 'ชื่อเครื่องที่ผู้ใช้ตั้งเอง เช่น "เครื่องกลางที่บ้าน"';

-- ใครอยากได้อะไร — ไม่มีแถว = เอาทั้งสามอย่าง (ค่าเริ่มต้นที่ตกลงกันไว้)
create table if not exists notification_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  appointments boolean not null default true,     -- เตือนวันนัด (ล่วงหน้า 1 วัน + เช้าวันนัด + หน้าต่างเจาะเลือด)
  bp_alert boolean not null default true,         -- ความดันสูงเกินเกณฑ์ → เตือนทันที
  daily_summary boolean not null default true,    -- สรุปวันละครั้งตอนเช้า
  bp_threshold int not null default 140 check (bp_threshold between 100 and 250),
  summary_hour int not null default 7 check (summary_hour between 0 and 23),
  updated_at timestamptz not null default now()
);

-- คิวข้อความที่รอส่ง
--
-- แยกการ "ตัดสินใจว่าต้องเตือน" (ฐานข้อมูลรู้ดีที่สุด) ออกจากการ "ส่งจริง"
-- (ต้องใช้ VAPID จึงต้องอยู่ที่ Edge Function) ถ้าส่งไม่ผ่านเพราะเน็ตสะดุด
-- ข้อความยังอยู่ในคิว รอบหน้าส่งต่อได้ ไม่หายไปเงียบๆ
--
-- event_key คือกันซ้ำ: 'appt:<id>:eve' ยิงได้ครั้งเดียวตลอดกาล ต่อให้ cron
-- เดินทับรอบเดิมกี่ครั้งก็ตาม (แทนตาราง notified_log เดิมที่ไม่เคยได้ใช้จริง)
create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('appointment', 'bp_alert', 'daily_summary')),
  event_key text not null,
  title text not null,
  body text not null,
  url text,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text,
  unique (user_id, event_key)
);

create index if not exists notification_outbox_pending_idx
  on notification_outbox (urgent desc, created_at)
  where sent_at is null;

-- ตารางเดิมที่วางไว้ตั้งแต่ 0001 แต่ไม่เคยมีโค้ดไหนเขียนลงไปเลย
-- หน้าที่กันแจ้งเตือนซ้ำย้ายไปอยู่ที่ unique (user_id, event_key) ของ outbox แล้ว
-- เก็บสมุดบันทึกกันซ้ำไว้สองที่ = วันหนึ่งจะไม่ตรงกัน แล้วไล่ไม่ถูกว่าเชื่ออันไหน
drop table if exists notified_log;

-- ─────────────────────────── สิทธิ์ ───────────────────────────
alter table notification_prefs   enable row level security;
alter table notification_outbox  enable row level security;

drop policy if exists notify_prefs_self on notification_prefs;
create policy notify_prefs_self on notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- อ่านของตัวเองได้ (เอาไว้ดูว่าทำไมไม่ได้รับ) แต่เขียนเองไม่ได้ — คิวนี้ฐานข้อมูลเติมเอง
drop policy if exists notify_outbox_self on notification_outbox;
create policy notify_outbox_self on notification_outbox for select
  using (user_id = auth.uid());

grant all on table notification_prefs to anon, authenticated, service_role;
grant all on table notification_outbox to anon, authenticated, service_role;

-- ─────────────────────────── จองเครื่องนี้ให้บัญชีที่ล็อกอินอยู่ ───────────────────────────
-- เครื่องหนึ่งเครื่องมี endpoint เดียว ถ้าเคยเปิดแจ้งเตือนไว้ตอนล็อกอินบัญชีหนึ่ง
-- แล้วเปลี่ยนไปอีกบัญชีบนเครื่องเดิม (เรื่องปกติมากสำหรับเครื่องกลางที่คนดูแลใช้)
-- ฝั่งแอปจะเขียนทับแถวเดิมไม่ได้เลย เพราะกติกาสิทธิ์บอกว่าแตะได้เฉพาะแถวของตัวเอง
--
-- ลบก่อนแล้วค่อยเพิ่มก็ไม่ช่วย เพราะคำสั่งลบจะถูกปัดตกเงียบๆ (ลบได้ 0 แถว ไม่ error)
-- แล้วไปตายตอน insert ว่า endpoint ซ้ำ ซึ่งเป็นข้อความที่ไม่มีใครเดาสาเหตุถูก
--
-- และจะแก้ด้วยการเลิกบังคับให้ endpoint ไม่ซ้ำก็ไม่ได้ เพราะแถวของบัญชีเก่าจะค้าง
-- อยู่ แล้วแจ้งเตือนของคนเก่าจะวิ่งไปโผล่บนเครื่องที่ตอนนี้เป็นของอีกคน = ข้อมูล
-- สุขภาพรั่วข้ามบัญชี
--
-- จึงทำเป็นฟังก์ชันที่ทำงานด้วยสิทธิ์ของฐานข้อมูลแทน ผู้เรียกจองเครื่องให้ตัวเอง
-- ได้อย่างเดียว (เขียน auth.uid() ตายตัว ส่งชื่อคนอื่นเข้ามาไม่ได้) และต้องรู้
-- ค่า endpoint ของเครื่องนั้นอยู่แล้วจึงจะเรียกได้
create or replace function claim_push_subscription(
  p_endpoint text,
  p_subscription jsonb,
  p_origin text default null,
  p_user_agent text default null,
  p_label text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าระบบก่อนถึงจะเปิดแจ้งเตือนได้';
  end if;

  delete from push_subscriptions where endpoint = p_endpoint;

  insert into push_subscriptions
    (user_id, endpoint, subscription, origin, user_agent, label, updated_at)
  values
    (auth.uid(), p_endpoint, p_subscription, p_origin, p_user_agent, p_label, now());
end;
$$;

-- ตัวนี้ต่างจากฟังก์ชันภายในตัวอื่น — ฝั่งแอปต้องเรียกได้จริง แต่คนที่ยังไม่เข้า
-- ระบบเรียกไม่ได้ และเรียกได้ก็จองให้ตัวเองเท่านั้น
revoke all on function claim_push_subscription(text, jsonb, text, text, text)
  from public, anon;
grant execute on function claim_push_subscription(text, jsonb, text, text, text)
  to authenticated;

-- ─────────────────────────── ใครเห็นสมุดเล่มไหน ───────────────────────────
-- can_access_book เดิมตอบได้แค่ "ฉันเห็นไหม" (อิง auth.uid()) ซึ่งใช้กับ RLS ได้ดี
-- แต่ตอนจะเตือนต้องถามกลับด้าน: "สมุดเล่มนี้ ใครบ้างที่ต้องรู้"
-- ระดับที่ต่ำที่สุดที่ยอมให้รู้เรื่องนี้ — 'appointments' ใช้ได้กับเรื่องวันนัด
-- เท่านั้น ส่วนความดันกับสรุปสุขภาพต้องระดับ 'full' เพราะคนที่แชร์แค่วันนัดเปิด
-- แอปดูค่าความดันไม่ได้อยู่แล้วตามกติกา ถ้าเราส่งไปในแจ้งเตือนก็คือรั่วออกทางอื่น
-- เคยเป็นแบบรับพารามิเตอร์เดียว การเปลี่ยนลายเซ็นทำให้ create or replace ไม่ทับ
-- ของเก่าแต่สร้างเพิ่มเป็นตัวที่สอง แล้วจะมีสองตัวที่ตัดสินสิทธิ์ต่างกันอยู่ในฐาน
-- ข้อมูลเดียวกัน ซึ่งเป็นจุดที่พลาดแล้วข้อมูลรั่วโดยไม่มีใครรู้
drop function if exists book_audience(uuid);

create or replace function book_audience(p_book uuid, p_level share_level default 'appointments')
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select b.owner_id from books b where b.id = p_book
  union
  select gm.user_id
  from book_shares bs
  join group_members gm on gm.group_id = bs.group_id
  where bs.book_id = p_book
    and (bs.level = 'full' or (p_level = 'appointments' and bs.level = 'appointments'));
$$;

-- สรุปรายวันมีทั้งความดันและยาที่ตกไป จึงนับเฉพาะสมุดที่เห็นได้เต็มระดับ
create or replace function visible_books(p_user uuid)
returns table (book_id uuid)
language sql stable security definer set search_path = public as $$
  select b.id from books b where b.owner_id = p_user
  union
  select bs.book_id
  from book_shares bs
  join group_members gm on gm.group_id = bs.group_id
  where gm.user_id = p_user
    and bs.level = 'full';
$$;

-- ─────────────────────────── เข้าคิว ───────────────────────────
create or replace function notification_wanted(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case p_kind
       when 'appointment'   then p.appointments
       when 'bp_alert'      then p.bp_alert
       when 'daily_summary' then p.daily_summary
       else false
     end
     from notification_prefs p where p.user_id = p_user),
    p_kind in ('appointment', 'bp_alert', 'daily_summary')   -- ยังไม่เคยตั้งค่า = เอาทั้งสามอย่าง
  );
$$;

create or replace function enqueue_notification(
  p_user uuid, p_kind text, p_key text, p_title text, p_body text,
  p_url text default null, p_urgent boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or not notification_wanted(p_user, p_kind) then return; end if;

  insert into notification_outbox (user_id, kind, event_key, title, body, url, urgent)
  values (p_user, p_kind, p_key, p_title, p_body, p_url, p_urgent)
  on conflict (user_id, event_key) do nothing;
end;
$$;

-- ─────────────────────────── ส่งออก ───────────────────────────
-- ความลับสองตัวอยู่ใน Vault ไม่ใช่ในไฟล์นี้ (ดูวิธีใส่ที่ท้ายไฟล์)
-- ยังไม่ได้ใส่ = คืน null = ไม่มีการยิงออกไปไหนเลย ทั้งระบบจึงเงียบสนิทโดยปริยาย
create or replace function app_secret(p_name text)
returns text language plpgsql stable security definer set search_path = public, vault as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = p_name limit 1;
  return v;
exception when others then
  return null;   -- ยังไม่ได้เปิด Vault ก็ไม่ควรทำให้การบันทึกความดันล้มไปด้วย
end;
$$;

create or replace function dispatch_notifications()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  -- ไม่มีอะไรค้างก็ไม่ต้องปลุก Edge Function — โควตาเรียกฟังก์ชันของแพลนฟรีมีจำกัด
  -- และ cron เดินทุก 15 นาทีตลอดปี ถ้ายิงทุกรอบจะหมดไปกับรอบที่ไม่มีอะไรส่ง
  if not exists (select 1 from notification_outbox where sent_at is null and attempts < 5) then
    return;
  end if;

  v_url := app_secret('notify_url');
  v_secret := app_secret('notify_secret');
  if v_url is null or v_secret is null then return; end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
exception when others then
  raise notice 'ยิงไป notify ไม่สำเร็จ: %', sqlerrm;   -- คิวยังอยู่ รอบหน้าค่อยส่ง
end;
$$;

-- ─────────────────────────── ความดันสูง → เตือนทันที ───────────────────────────
create or replace function notify_bp_high() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sys int;
  v_dia int;
  v_name text;
  v_uid uuid;
  v_threshold int;
  v_any boolean := false;
begin
  if new.kind <> 'bp' or new.data is null then return new; end if;

  v_sys := nullif(new.data ->> 'sys', '')::int;
  v_dia := nullif(new.data ->> 'dia', '')::int;
  if v_sys is null then return new; end if;

  select display_name into v_name from books where id = new.book_id;

  -- ค่าความดันเป็นข้อมูลสุขภาพ ส่งได้เฉพาะคนที่เห็นสมุดเต็มระดับ
  for v_uid in select a.user_id from book_audience(new.book_id, 'full') a loop
    -- คนที่เพิ่งกดบันทึกยืนอยู่ข้างเครื่องวัดแล้ว เตือนกลับไปหาตัวเองไม่ได้ช่วยอะไร
    continue when v_uid = new.actor_user;

    v_threshold := coalesce(
      (select bp_threshold from notification_prefs where user_id = v_uid), 140);
    continue when v_sys < v_threshold;

    perform enqueue_notification(
      v_uid, 'bp_alert', 'bp:' || new.id,
      'ความดัน' || coalesce(v_name, 'ที่บ้าน') || 'สูง',
      v_sys || '/' || coalesce(v_dia::text, '-')
        || ' เมื่อ ' || to_char(new.created_at at time zone 'Asia/Bangkok', 'HH24:MI') || ' น.'
        || coalesce(' (' || nullif(new.actor_name, '') || 'บันทึก)', ''),
      null, true);
    v_any := true;
  end loop;

  if v_any then perform dispatch_notifications(); end if;
  return new;
exception when others then
  -- แจ้งเตือนพังต้องไม่ลากการบันทึกความดันล้มไปด้วย ค่าที่วัดได้สำคัญกว่าการเตือน
  raise notice 'เข้าคิวเตือนความดันไม่สำเร็จ: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists records_notify_bp on records;
create trigger records_notify_bp after insert on records
  for each row execute function notify_bp_high();

-- ─────────────────────────── สรุปวันละครั้ง ───────────────────────────
create or replace function daily_summary_body(p_user uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_lines text[] := '{}';
  v_parts text[];
  b record;
  a record;
  r record;
  v_missed int;
begin
  for b in
    select bk.id, bk.display_name
    from books bk
    where bk.id in (select vb.book_id from visible_books(p_user) vb)
    order by bk.display_name
  loop
    v_parts := '{}';

    select ap.title, ap.appt_date, ap.appt_time, ap.blood_test_before, ap.blood_test_done_at
      into a
    from appointments ap
    where ap.book_id = b.id and ap.appt_date >= v_today
    order by ap.appt_date, ap.appt_time nulls last
    limit 1;

    if found then
      if a.appt_date = v_today then
        v_parts := v_parts || ('นัด' || a.title || ' วันนี้'
          || coalesce(' ' || to_char(a.appt_time, 'HH24:MI') || ' น.', ''));
      else
        v_parts := v_parts || ('นัด' || a.title || ' อีก ' || (a.appt_date - v_today) || ' วัน');
      end if;

      if a.blood_test_before and a.blood_test_done_at is null and a.appt_date - v_today <= 7 then
        v_parts := v_parts || 'ยังไม่ได้เจาะเลือด';
      end if;
    end if;

    select (rc.data ->> 'sys') as sys, (rc.data ->> 'dia') as dia, rc.created_at
      into r
    from records rc
    where rc.book_id = b.id and rc.kind = 'bp' and rc.data ? 'sys'
    order by rc.created_at desc
    limit 1;

    if found and (r.created_at at time zone 'Asia/Bangkok')::date >= v_today - 1 then
      v_parts := v_parts || ('ความดัน ' || r.sys || '/' || coalesce(r.dia, '-'));
    end if;

    -- ยาที่เมื่อวานไม่มีใครกดเลยสักครั้ง — ไม่ใช่การเตือนรายมื้อ แต่เป็นการรายงาน
    -- ย้อนหลังวันละครั้งว่าเมื่อวานตกไปกี่มื้อ ('prn' คือกินเมื่อมีอาการ ไม่นับ)
    select count(*) into v_missed
    from medications m, unnest(m.slots) s
    where m.book_id = b.id and m.active and not m.paused and s <> 'prn'
      and not exists (
        select 1 from med_logs l
        where l.medication_id = m.id and l.dose_day = v_today - 1 and l.slot = s
      );

    if v_missed > 0 then
      v_parts := v_parts || ('เมื่อวานยังไม่ได้กด ' || v_missed || ' มื้อ');
    end if;

    if array_length(v_parts, 1) > 0 then
      v_lines := v_lines || (b.display_name || ': ' || array_to_string(v_parts, ' · '));
    end if;
  end loop;

  if array_length(v_lines, 1) is null then return ''; end if;
  return array_to_string(v_lines, E'\n');
end;
$$;

-- ─────────────────────────── ถึงเวลาหรือยัง ───────────────────────────
-- เดินทุก 15 นาที แล้วตัดสินจากเวลาไทยในฐานข้อมูลเอง ไม่ผูกกับตารางเวลาของ cron
-- (cron ของ Supabase เดินเป็น UTC ถ้าเขียนเวลาไทยลงไปตรงๆ จะเพี้ยนไป 7 ชั่วโมง
--  และเวลาแก้เกณฑ์ทีหลังต้องไปแก้สองที่ซึ่งวันหนึ่งจะลืมแก้ที่หนึ่ง)
--
-- event_key ผูกกับวันที่ ตกรอบไปเพราะฐานข้อมูลหลับหรือ cron ล่ม รอบถัดไปยังส่งให้
-- แต่ไม่มีทางส่งซ้ำ
create or replace function enqueue_due_notifications()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := now() at time zone 'Asia/Bangkok';
  v_today date := v_now::date;
  v_time time := v_now::time;
  a record;
  u record;
  v_when text;
  v_body text;
begin
  -- ── เตือนวันนัด ──
  for a in
    select ap.id, ap.book_id, ap.title, ap.appt_date, ap.appt_time, ap.place,
           ap.blood_test_before, ap.blood_test_done_at, bk.display_name
    from appointments ap
    join books bk on bk.id = ap.book_id
    where ap.appt_date between v_today and v_today + 7
  loop
    v_when := coalesce(' ' || to_char(a.appt_time, 'HH24:MI') || ' น.', '')
      || coalesce(' ที่' || nullif(a.place, ''), '');

    -- เย็นก่อนวันนัด: ยังจัดของ เตรียมบัตร เตรียมคนพาไปได้ทัน
    if a.appt_date = v_today + 1 and v_time >= time '18:00' then
      for u in select ba.user_id from book_audience(a.book_id) ba loop
        perform enqueue_notification(u.user_id, 'appointment', 'appt:' || a.id || ':eve',
          'พรุ่งนี้' || a.display_name || 'มีนัด',
          a.title || v_when, null, false);
      end loop;
    end if;

    -- เช้าวันนัด
    if a.appt_date = v_today and v_time >= time '06:30' then
      for u in select ba.user_id from book_audience(a.book_id) ba loop
        perform enqueue_notification(u.user_id, 'appointment', 'appt:' || a.id || ':morn',
          'วันนี้' || a.display_name || 'มีนัด',
          a.title || v_when, null, true);
      end loop;
    end if;

    -- หน้าต่างเจาะเลือดล่วงหน้า — ผลเลือดต้องออกก่อนถึงวันนัด ไม่งั้นไปถึงแล้วหมอ
    -- ตรวจไม่ได้ ต้องเลื่อนนัดทั้งครั้ง เตือนที่ D-7 (เปิดหน้าต่าง) และย้ำอีกที D-3
    if a.blood_test_before and a.blood_test_done_at is null then
      if a.appt_date - v_today = 7 and v_time >= time '09:00' then
        for u in select ba.user_id from book_audience(a.book_id) ba loop
          perform enqueue_notification(u.user_id, 'appointment', 'appt:' || a.id || ':blood7',
            'ถึงเวลาพา' || a.display_name || 'ไปเจาะเลือด',
            'นัด' || a.title || ' อีก 7 วัน — เจาะเลือดได้ตั้งแต่วันนี้', null, false);
        end loop;
      elsif a.appt_date - v_today = 3 and v_time >= time '09:00' then
        for u in select ba.user_id from book_audience(a.book_id) ba loop
          perform enqueue_notification(u.user_id, 'appointment', 'appt:' || a.id || ':blood3',
            'ยังไม่ได้เจาะเลือดให้' || a.display_name,
            'นัด' || a.title || ' อีก 3 วัน — ไม่มีผลเลือดหมออาจตรวจไม่ได้', null, true);
        end loop;
      end if;
    end if;
  end loop;

  -- ── สรุปวันละครั้ง ──
  -- ส่งให้เฉพาะคนที่เปิดไว้และเห็นสมุดอย่างน้อยหนึ่งเล่ม
  for u in
    select p.id,
           coalesce(np.summary_hour, 7) as hour
    from profiles p
    left join notification_prefs np on np.user_id = p.id
    where coalesce(np.daily_summary, true)
  loop
    continue when v_time < make_time(u.hour, 0, 0);

    v_body := daily_summary_body(u.id);
    -- ไม่มีอะไรจะสรุปก็ไม่ต้องเด้ง — "วันนี้ไม่มีอะไร" ทุกเช้าคือเหตุผลที่คนปิดทิ้ง
    continue when coalesce(v_body, '') = '';

    perform enqueue_notification(u.id, 'daily_summary',
      'sum:' || to_char(v_today, 'YYYY-MM-DD'),
      'สรุปวันนี้', v_body, null, false);
  end loop;

  -- เก็บกวาดของเก่า คิวนี้ไม่ต้องเก็บเป็นประวัติ
  delete from notification_outbox where created_at < now() - interval '30 days';
end;
$$;

create or replace function run_notifications()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform enqueue_due_notifications();
  perform dispatch_notifications();
end;
$$;

-- ─────────────────────────── ตั้งเวลา ───────────────────────────
do $$
begin
  perform cron.unschedule('doolaekan-notify');
exception when others then null;   -- ยังไม่เคยตั้ง = ไม่มีอะไรให้ยกเลิก
end $$;

do $$
begin
  perform cron.schedule('doolaekan-notify', '*/15 * * * *', 'select public.run_notifications()');
exception when others then
  raise notice 'ตั้ง cron ไม่สำเร็จ (%) — เปิด pg_cron ที่ Dashboard แล้วรันไฟล์นี้ซ้ำ', sqlerrm;
end $$;

-- ─────────────────────────── ปิดประตูฟังก์ชันภายใน ───────────────────────────
-- Postgres ให้สิทธิ์เรียกฟังก์ชันกับทุกคนโดยปริยาย และ Supabase เปิดฟังก์ชันใน
-- schema public ออกเป็น REST API อัตโนมัติ แปลว่าใครก็ตามที่เปิดเว็บเราแล้วก๊อป
-- anon key ไป (ซึ่งฝังอยู่ในตัวเว็บ ใครก็เห็น) จะเรียกฟังก์ชันข้างล่างได้ทั้งหมด
--
-- ของเดิมอย่าง can_access_book รอดมาได้เพราะถามว่า "ฉันเห็นไหม" (อิง auth.uid())
-- ส่งชื่อคนอื่นเข้าไปไม่ได้ แต่ฟังก์ชันชุดนี้รับ p_user เป็นพารามิเตอร์ ส่ง uuid
-- ใครก็ได้เข้าไป — daily_summary_body จะคายสรุปสุขภาพของคนนั้นออกมาทั้งก้อน
-- และ app_secret จะคายความลับใน Vault ออกมาตรงๆ
--
-- ทั้งหมดนี้ถูกเรียกจากใน trigger และ cron ซึ่งทำงานในสิทธิ์ของฐานข้อมูลเอง
-- ไม่มีใครต้องเรียกจากฝั่งแอปเลยสักตัว จึงปิดได้ทั้งหมดโดยไม่กระทบอะไร
do $$
declare fn text;
begin
  -- ถ้าตัวไหนล้ม ต้องไม่ทำให้ตัวที่เหลือไม่ถูกปิดตามไปด้วย และต้องดังพอให้เห็น
  -- เพราะ "ปิดไม่ครบ" หน้าตาเหมือน "ปิดครบ" ทุกประการถ้าไม่มีใครบอก
  foreach fn in array array[
    'app_secret(text)',
    'book_audience(uuid, share_level)',
    'visible_books(uuid)',
    'notification_wanted(uuid, text)',
    'enqueue_notification(uuid, text, text, text, text, text, boolean)',
    'daily_summary_body(uuid)',
    'dispatch_notifications()',
    'enqueue_due_notifications()',
    'run_notifications()'
  ] loop
    begin
      execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    exception when others then
      raise warning 'ปิดสิทธิ์ % ไม่สำเร็จ: % — ฟังก์ชันนี้ยังเรียกจากภายนอกได้', fn, sqlerrm;
    end;
  end loop;
end $$;

-- ─────────────────────────── สวิตช์เปิด ───────────────────────────
-- ทั้งหมดข้างบนจะเงียบสนิทจนกว่าจะใส่ความลับสองตัวนี้ (รันใน SQL Editor ครั้งเดียว)
-- ทำให้เปิดแจ้งเตือน "วันที่พร้อมจริง" ได้โดยไม่ต้องแก้โค้ดหรือ deploy ใหม่
--
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/notify', 'notify_url');
--   select vault.create_secret('<ข้อความลับยาวๆ ที่สุ่มมา>', 'notify_secret');
--
-- ค่า notify_secret ต้องตรงกับ secret ชื่อ NOTIFY_SECRET ของ Edge Function
-- แก้ทีหลังด้วย vault.update_secret(id, ค่าใหม่)
