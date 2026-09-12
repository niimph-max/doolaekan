-- ปิดสองทางที่คนนอกเข้ากลุ่มครอบครัวได้โดยไม่ได้รับเชิญ
--
-- กลุ่มคือกุญแจของทุกอย่างในแอปนี้ — เข้ากลุ่มได้เมื่อไหร่ ก็เห็นทุกสมุดที่กลุ่ม
-- นั้นแชร์ไว้ ยา ความดัน อาการ และรูปเอกสารจากโรงพยาบาล
--
-- รันซ้ำได้ ไม่พัง

-- ═══════════ ช่องโหว่ที่ 1: รหัสเชิญสั้นเกินไป และเดาได้ไม่จำกัดจำนวนครั้ง ═══════════
--
-- ฝั่งแอปสร้างรหัสเป็น 'DLK-' ตามด้วยเลขสี่หลัก = 9,000 แบบ แล้วส่งค่านั้นมาเอง
-- ค่า default ของคอลัมน์ (12 ตัวอักษรจาก uuid) จึงไม่เคยถูกใช้เลยสักครั้ง
-- ใครสมัครบัญชีใหม่ (ฟรี ใช้แค่อีเมล) แล้วไล่เรียก join_group_by_code จนครบ
-- ก็เข้ากลุ่มของครอบครัวที่ไม่รู้จักได้ ไม่มีอะไรกั้นเลยสักชั้น

-- 1.1 เปลี่ยนรหัสเก่าที่สั้นเกินไปให้ยาวขึ้นก่อน มิฉะนั้นข้อ 1.2 จะเพิ่มกติกาไม่ได้
--     ⚠️ กลุ่มที่โดนเปลี่ยนต้องบอกรหัสใหม่ให้คนที่ยังไม่ได้เข้ากลุ่มอีกครั้ง
--     คนที่เข้ากลุ่มไปแล้วไม่ได้รับผลกระทบ ยังอยู่ในกลุ่มตามเดิม
do $$
declare n int;
begin
  update groups
  set invite_code = 'DLK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  where length(invite_code) < 12;
  get diagnostics n = row_count;
  if n > 0 then
    raise notice 'เปลี่ยนรหัสเชิญที่สั้นเกินไป % กลุ่ม — ต้องบอกรหัสใหม่ให้คนในบ้าน', n;
  end if;
end $$;

-- 1.2 กันไม่ให้แอปรุ่นไหนก็ตามสร้างรหัสสั้นๆ ได้อีก
do $$
begin
  alter table groups add constraint groups_invite_code_len check (length(invite_code) >= 12);
exception when duplicate_object then null;
end $$;

-- 1.3 จำกัดจำนวนครั้งที่เดารหัสได้
--
-- ต่อให้รหัสยาวขึ้นแล้ว การปล่อยให้ยิงได้ไม่จำกัดก็ไม่ควรอยู่ดี และชั้นนี้ยัง
-- ป้องกันในวันที่มีใครเผลอกลับไปใช้รหัสสั้นอีก
create table if not exists group_join_attempts (
  user_id uuid not null references profiles(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists group_join_attempts_idx on group_join_attempts(user_id, at);

-- ไม่มี policy เลยสักข้อ = ฝั่งแอปแตะตารางนี้ไม่ได้ทั้งอ่านและเขียน
-- มีแต่ฟังก์ชันที่ทำงานด้วยสิทธิ์ฐานข้อมูลเท่านั้นที่เข้าถึงได้
alter table group_join_attempts enable row level security;

-- ═══════════ ช่องโหว่ที่ 2: เข้ากลุ่มได้โดยไม่ต้องมีรหัสเลย ═══════════
--
-- policy เดิม: group_members_self ... for all with check (user_id = auth.uid())
-- ตรวจแค่ว่า "แถวที่เพิ่มเป็นของตัวเองไหม" ไม่ได้ตรวจเลยว่ากลุ่มไหน
-- ใครก็ตามที่รู้ id ของกลุ่มจึงเพิ่มตัวเองเข้าไปตรงๆ ผ่าน PostgREST ได้เลย
-- โดยไม่ต้องผ่าน join_group_by_code และไม่ต้องรู้รหัสเชิญ
--
-- เคสที่เกิดได้จริงที่สุดคือคนที่เคยอยู่ในกลุ่มแล้วถูกเอาออก — เขายังรู้ id
-- ของกลุ่มจากเครื่องตัวเอง แล้วใส่ตัวเองกลับเข้าไปได้เงียบๆ ได้สิทธิ์คืนทั้งหมด

drop policy if exists group_members_self on group_members;

-- ออกจากกลุ่มเองได้ (ลบเฉพาะแถวของตัวเอง)
drop policy if exists group_members_leave on group_members;
create policy group_members_leave on group_members for delete
  using (user_id = auth.uid());

-- เพิ่มตัวเองตรงๆ ได้เฉพาะเจ้าของกลุ่ม ซึ่งคือตอนสร้างกลุ่มใหม่
-- คนอื่นทั้งหมดต้องเข้าทาง join_group_by_code เท่านั้น
drop policy if exists group_members_owner_join on group_members;
create policy group_members_owner_join on group_members for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- ไม่มี policy ของ update โดยตั้งใจ — แถวสมาชิกไม่มีอะไรให้แก้
-- มีแต่เข้ากับออก การไม่มี policy คือห้ามทั้งหมด

-- ═══════════ ประตูเดียวที่เหลือ ═══════════
create or replace function join_group_by_code(p_code text)
returns groups language plpgsql security definer set search_path = public as $$
declare
  g groups;
  tries int;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  -- เก็บกวาดของเก่าทิ้งไปด้วยเลย ตารางนี้จะได้ไม่โตขึ้นเรื่อยๆ
  delete from group_join_attempts where at < now() - interval '1 day';

  select count(*) into tries
  from group_join_attempts
  where user_id = auth.uid() and at > now() - interval '1 hour';

  -- สิบครั้งต่อชั่วโมงเหลือเฟือสำหรับคนที่พิมพ์รหัสผิด แต่ไล่เดาไม่ไหว
  if tries >= 10 then
    raise exception 'ลองใส่รหัสผิดหลายครั้งเกินไป รออีกสักชั่วโมงแล้วลองใหม่';
  end if;

  insert into group_join_attempts (user_id) values (auth.uid());

  select * into g from groups where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'ไม่พบกลุ่มที่ใช้รหัสนี้';
  end if;

  insert into group_members (group_id, user_id)
  values (g.id, auth.uid())
  on conflict do nothing;

  -- เข้าได้แล้วล้างประวัติการลองของคนนี้ทิ้ง คนที่พิมพ์ผิดหลายครั้งกว่าจะถูก
  -- ไม่ควรโดนกันตอนจะเข้ากลุ่มที่สองในชั่วโมงเดียวกัน
  delete from group_join_attempts where user_id = auth.uid();

  return g;
end;
$$;

revoke all on function join_group_by_code(text) from public, anon;
grant execute on function join_group_by_code(text) to authenticated;
