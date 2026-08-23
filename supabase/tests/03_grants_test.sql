-- สิทธิ์ระดับตาราง: RLS อย่างเดียวไม่พอ role ต้องได้ GRANT ด้วย
-- เคสนี้เกิดจริงเมื่อ schema public ถูกสร้างใหม่ (drop schema public cascade)
-- แล้ว default privileges ของ Supabase หายไป — ทุกอย่างดูถูกหมดแต่เขียนไม่ได้
-- ผลที่ต้องได้:
--   ไม่มี grant → permission denied for table books  [SQLSTATE 42501]
--   มี grant   → เขียนสำเร็จ
grant usage on schema auth to public;
grant execute on function auth.uid() to public;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid $$;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','{"display_name":"พี่หนึ่ง"}');

-- role ที่ยังไม่ได้รับ grant เลย = เลียนแบบสถานการณ์หลัง drop schema public
create role no_grant nologin;
grant usage on schema public to no_grant;
set role no_grant;
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$
begin
  insert into books (owner_id, display_name) values (auth.uid(), 'เตี่ย');
  raise notice 'ไม่มี grant → เขียนได้ (ไม่ควรเกิด)';
exception when others then
  raise notice 'ไม่มี grant → %  [SQLSTATE %]', sqlerrm, sqlstate;
end $$;
reset role;

-- role authenticated ที่ migration grant ให้แล้ว
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$
begin
  insert into books (owner_id, display_name) values (auth.uid(), 'เตี่ย');
  raise notice 'มี grant → เขียนสำเร็จ';
exception when others then
  raise notice 'มี grant → ยังพัง: %  [SQLSTATE %]', sqlerrm, sqlstate;
end $$;
