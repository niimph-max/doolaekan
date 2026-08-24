-- ลูกที่ดูแลพ่อแม่ต้องกรอกวันเกิด/ชื่อจริงในสมุดของพ่อแม่ได้
-- แต่ต้องยกสมุดไปเป็นของคนอื่นไม่ได้ และคนนอกกลุ่มต้องแตะไม่ได้เลย

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid $$;

create role app_user nologin;
grant usage on schema public, storage to app_user;
grant all on all tables in schema public to app_user;
grant all on all tables in schema storage to app_user;
grant execute on all functions in schema public, auth to app_user;

-- เตี่ยเป็นเจ้าของสมุดเอง ลูก (น้องสอง) อยู่กลุ่มเดียวกันและได้สิทธิ์ full
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', '{"display_name":"เตี่ย"}'),
  ('22222222-2222-2222-2222-222222222222', '{"display_name":"น้องสอง"}'),
  ('33333333-3333-3333-3333-333333333333', '{"display_name":"คนนอก"}');
insert into books (id, owner_id, display_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'เตี่ย');
insert into groups (id, name, owner_id)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'บ้านเตี่ย', '11111111-1111-1111-1111-111111111111');
insert into group_members values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
insert into book_shares values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'full');

set role app_user;

-- ลูกกรอกวันเกิดให้พ่อ — ต้องผ่าน (นี่คือเคสที่พังอยู่)
set test.uid = '22222222-2222-2222-2222-222222222222';
update books set birth_date = '1943-08-24', full_name = 'ปฐมพร ลิ้นทอง'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select 'ลูกกรอกวันเกิดให้พ่อ (ควรได้ 1943-08-24)' as case, birth_date::text as got
  from books where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ลูกยกสมุดไปเป็นของตัวเองไม่ได้
do $$ begin
  update books set owner_id = '22222222-2222-2222-2222-222222222222'
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise notice 'ยกสมุดเป็นของตัวเอง: ผ่านไปได้ ← ผิด';
exception when others then
  raise notice 'ยกสมุดเป็นของตัวเอง: ถูกปฏิเสธ (%) ← ถูกต้อง', sqlerrm;
end $$;

-- ลูกลบสมุดของพ่อทิ้งไม่ได้
delete from books where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select 'ลูกลบสมุดพ่อ (สมุดต้องยังอยู่ = 1)' as case, count(*)::text as got
  from books where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- คนนอกกลุ่มแก้ไม่ได้เลย
set test.uid = '33333333-3333-3333-3333-333333333333';
update books set full_name = 'โดนแก้โดยคนนอก'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set test.uid = '11111111-1111-1111-1111-111111111111';
select 'คนนอกแก้ชื่อ (ต้องยังเป็น ปฐมพร ลิ้นทอง)' as case, full_name as got
  from books where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- เจ้าของแก้ของตัวเองได้ตามปกติ
update books set address = '7 หมู่ 1 จ.จันทบุรี'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select 'เจ้าของแก้ที่อยู่เอง' as case, address as got
  from books where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- สร้างสมุดในชื่อคนอื่นไม่ได้
do $$ begin
  insert into books (owner_id, display_name)
    values ('33333333-3333-3333-3333-333333333333', 'สมุดปลอม');
  raise notice 'สร้างสมุดในชื่อคนอื่น: ผ่านไปได้ ← ผิด';
exception when others then
  raise notice 'สร้างสมุดในชื่อคนอื่น: ถูกปฏิเสธ ← ถูกต้อง';
end $$;

reset role;
