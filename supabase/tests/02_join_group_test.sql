-- เข้ากลุ่มด้วยรหัสเชิญ: คนที่ยังไม่ได้เป็นสมาชิกต้องค้นกลุ่มตรงๆ ไม่เจอ
-- แต่เรียก join_group_by_code แล้วต้องเข้าได้ และเห็นเฉพาะสิ่งที่เจ้าของยินยอมแชร์
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid $$;

create role app_user2 nologin;
grant usage on schema public, storage, auth to app_user2;
grant all on all tables in schema public to app_user2;
grant execute on all functions in schema public, auth to app_user2;

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', '{"display_name":"พี่หนึ่ง"}'),
  ('22222222-2222-2222-2222-222222222222', '{"display_name":"น้องสอง"}');

-- พี่หนึ่งสร้างสมุด + กลุ่ม (ทำผ่าน role ปกติ เหมือนที่แอปทำ)
set role app_user2;
set test.uid = '11111111-1111-1111-1111-111111111111';
insert into books (id, owner_id, display_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', auth.uid(), 'เตี่ย');
insert into groups (id, name, owner_id, invite_code)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'บ้านเตี่ย', auth.uid(), 'DLK-4821');
insert into group_members (group_id, user_id)
  values ('bbbbbbbb-0000-0000-0000-000000000001', auth.uid());
insert into book_shares values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'full');
insert into medications (book_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'แอสไพริน 81');

-- น้องสองยังไม่ได้เข้ากลุ่ม: ต้องมองไม่เห็นกลุ่มนั้นเลย แม้จะรู้รหัส
set test.uid = '22222222-2222-2222-2222-222222222222';
select 'ก่อนเข้ากลุ่ม — ค้นกลุ่มจากรหัสเจอ (ควร 0)' as case, count(*) as n
  from groups where invite_code = 'DLK-4821'
union all select 'ก่อนเข้ากลุ่ม — เห็นยา (ควร 0)', count(*) from medications;

-- เข้ากลุ่มผ่าน RPC
select 'เข้ากลุ่มด้วยรหัส — ได้ชื่อกลุ่ม' as case, (join_group_by_code('DLK-4821')).name as n;

select 'หลังเข้ากลุ่ม — เห็นกลุ่ม (ควร 1)' as case, count(*)::text as n from groups
union all select 'หลังเข้ากลุ่ม — เห็นยาของเตี่ย (ควร 1)', count(*)::text from medications
union all select 'หลังเข้ากลุ่ม — เห็นสมุด (ควร 1)', count(*)::text from books;

-- รหัสผิดต้องไม่เข้า
do $$
begin
  perform join_group_by_code('DLK-0000');
  raise exception 'ควรจะ error แต่ผ่านไปได้';
exception when others then
  raise notice 'รหัสผิด → %', sqlerrm;
end $$;
