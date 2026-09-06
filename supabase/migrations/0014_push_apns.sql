-- แจ้งเตือนสองทาง: เบราว์เซอร์ (Web Push) และแอปบนไอโฟน (APNs)
--
-- เดิมตารางนี้สมมติว่ามีทางเดียวคือ Web Push ซึ่งใช้ไม่ได้ในแอปที่ห่อด้วย
-- Capacitor — WKWebView ไม่มี service worker ให้รับ push แอปเปิลให้ส่งผ่าน
-- APNs อย่างเดียว ที่เก็บก็คนละอย่าง: ฝั่งเว็บเป็นที่อยู่ยาวๆ พร้อมกุญแจสองดอก
-- ส่วนฝั่งแอปเป็น device token สั้นๆ ตัวเดียว
--
-- ตั้งใจไม่แยกตาราง เพราะคำถามที่ต้องตอบคือ "คนนี้มีเครื่องไหนรับแจ้งเตือนได้บ้าง"
-- ซึ่งไม่ควรต้องไปถามสองที่แล้วเอามารวมกันเอง — แยกตารางเมื่อไหร่ วันหนึ่งจะมีที่
-- ที่ลืมถามอีกตาราง แล้วแจ้งเตือนจะหายไปเงียบๆ เฉพาะเครื่องบางชนิด
--
-- รันซ้ำได้ ไม่พัง

alter table push_subscriptions add column if not exists kind text not null default 'web';

do $$
begin
  alter table push_subscriptions
    add constraint push_subscriptions_kind_check check (kind in ('web', 'apns'));
exception when duplicate_object then null;
end $$;

comment on column push_subscriptions.kind is
  'web = Web Push ผ่าน service worker, apns = แอปบน iOS ผ่าน device token';

-- endpoint ยังเป็นตัวชี้ขาดว่า "เครื่องเดียวกันไหม" เหมือนเดิม
-- ฝั่ง apns เก็บ device token ลงช่องนี้ ได้ดัชนีห้ามซ้ำที่มีอยู่แล้วมาใช้ฟรีๆ
-- และ claim_push_subscription ก็ยังจองเครื่องให้บัญชีที่ล็อกอินอยู่ได้เหมือนเดิม

-- ── ต้อง drop ก่อน ห้าม create or replace เฉยๆ ──
-- เพิ่มพารามิเตอร์ = ลายเซ็นเปลี่ยน create or replace จะไม่ทับของเดิมแต่สร้าง
-- เป็นตัวที่สอง แล้วจะมีสองฟังก์ชันชื่อเดียวกันอยู่ในฐานข้อมูล ตัวเก่าไม่รู้จัก
-- คอลัมน์ kind เครื่องที่เรียกโดนตัวไหนก็แล้วแต่ว่า Postgres เลือกอันไหน
-- (บทเรียนเดียวกับ book_audience ตอนแก้ 0010)
drop function if exists claim_push_subscription(text, jsonb, text, text, text);

create or replace function claim_push_subscription(
  p_endpoint text,
  p_subscription jsonb,
  p_origin text default null,
  p_user_agent text default null,
  p_label text default null,
  p_kind text default 'web'
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าระบบก่อนถึงจะเปิดแจ้งเตือนได้';
  end if;

  if p_kind not in ('web', 'apns') then
    raise exception 'ชนิดเครื่องต้องเป็น web หรือ apns เท่านั้น (ได้มา: %)', p_kind;
  end if;

  delete from push_subscriptions where endpoint = p_endpoint;

  insert into push_subscriptions
    (user_id, endpoint, subscription, origin, user_agent, label, kind, updated_at)
  values
    (auth.uid(), p_endpoint, p_subscription, p_origin, p_user_agent, p_label, p_kind, now());
end;
$$;

revoke all on function claim_push_subscription(text, jsonb, text, text, text, text)
  from public, anon;
grant execute on function claim_push_subscription(text, jsonb, text, text, text, text)
  to authenticated;
