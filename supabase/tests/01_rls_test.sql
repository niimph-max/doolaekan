-- ให้ auth.uid() อ่านจาก GUC เพื่อสลับสวมบทบาทผู้ใช้ในการทดสอบ
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid $$;

create role app_user nologin;
grant usage on schema public, storage to app_user;
grant all on all tables in schema public to app_user;
grant all on all tables in schema storage to app_user;
grant execute on all functions in schema public, auth to app_user;

-- ผู้ใช้ 3 คน: หนึ่ง (เจ้าของสมุดเตี่ย), สอง (อยู่กลุ่มเดียวกัน), สาม (กลุ่มอื่น)
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', '{"display_name":"พี่หนึ่ง"}'),
  ('22222222-2222-2222-2222-222222222222', '{"display_name":"น้องสอง"}'),
  ('33333333-3333-3333-3333-333333333333', '{"display_name":"คนนอก"}');

insert into books (id, owner_id, display_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'เตี่ย');
insert into groups (id, name, owner_id)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'บ้านเตี่ย', '11111111-1111-1111-1111-111111111111');
insert into group_members values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
insert into medications (book_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'แอสไพริน 81');
insert into appointments (book_id, title, appt_date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'หมอหัวใจ', current_date + 4);

set role app_user;

-- ยังไม่แชร์: น้องสองไม่ควรเห็นอะไรเลย
set test.uid = '22222222-2222-2222-2222-222222222222';
select 'ยังไม่แชร์ — น้องสองเห็นยา' as case, count(*) as n from medications
union all select 'ยังไม่แชร์ — น้องสองเห็นนัด', count(*) from appointments
union all select 'ยังไม่แชร์ — น้องสองเห็นสมุด', count(*) from books;

reset role;
insert into book_shares values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'appointments');
set role app_user;

-- แชร์ "เฉพาะวันนัด": เห็นนัด + สมุด แต่ไม่เห็นยา
set test.uid = '22222222-2222-2222-2222-222222222222';
select 'เฉพาะวันนัด — เห็นยา (ควร 0)' as case, count(*) as n from medications
union all select 'เฉพาะวันนัด — เห็นนัด (ควร 1)', count(*) from appointments
union all select 'เฉพาะวันนัด — เห็นสมุด (ควร 1)', count(*) from books;

reset role;
update book_shares set level = 'full'
  where book_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role app_user;

-- แชร์ "ทั้งหมด": เห็นและช่วยบันทึกได้
set test.uid = '22222222-2222-2222-2222-222222222222';
select 'ทั้งหมด — เห็นยา (ควร 1)' as case, count(*) as n from medications;
insert into records (book_id, kind, title, actor_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'symptom', 'เวียนหัว', 'น้องสอง');
select 'ทั้งหมด — น้องสองบันทึกได้' as case, count(*) as n from records;

-- คนนอกกลุ่ม: ต้องไม่เห็นอะไรเลย แม้แชร์ระดับ full
set test.uid = '33333333-3333-3333-3333-333333333333';
select 'คนนอก — เห็นสมุด (ควร 0)' as case, count(*) as n from books
union all select 'คนนอก — เห็นยา (ควร 0)', count(*) from medications
union all select 'คนนอก — เห็นกลุ่ม (ควร 0)', count(*) from groups;

-- น้องสองเห็นกลุ่มและสมาชิกของกลุ่มตัวเองได้ (ไม่ recursion)
set test.uid = '22222222-2222-2222-2222-222222222222';
select 'น้องสอง — เห็นกลุ่มตัวเอง (ควร 1)' as case, count(*) as n from groups
union all select 'น้องสอง — เห็นสมาชิกกลุ่ม (ควร 2)', count(*) from group_members
union all select 'น้องสอง — เห็นโปรไฟล์ในกลุ่ม (ควร 2)', count(*) from profiles;
