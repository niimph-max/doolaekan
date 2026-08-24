-- ลูกที่ดูแลพ่อแม่กรอกวันเกิด/ชื่อจริง/ที่อยู่ ในสมุดของพ่อแม่ไม่ได้
-- ขึ้นว่า new row violates row-level security policy for table "books" (code 42501)
--
-- policy เดิม books_owner ให้แก้สมุดได้เฉพาะเจ้าของบัญชี ทั้งที่ข้อมูลอีกทุกอย่าง
-- ในเล่มเดียวกัน (ยา หมอ นัด อาการ ข้อเฝ้าระวัง) คนในกลุ่มระดับ "ดูแลเต็มที่"
-- แก้ได้อยู่แล้ว หน้าโปรไฟล์จึงเป็นที่เดียวที่แก้ไม่ได้ ทั้งที่เป็นข้อมูลชุดเดียวกัน
--
-- รันซ้ำได้ ไม่พัง

drop policy if exists books_owner on books;
drop policy if exists books_insert on books;
drop policy if exists books_update on books;
drop policy if exists books_delete on books;

-- สร้างสมุดใหม่ได้เฉพาะในชื่อตัวเอง
create policy books_insert on books for insert
  with check (owner_id = auth.uid());

-- แก้ข้อมูลในเล่ม: เจ้าของ หรือคนในกลุ่มที่ได้รับสิทธิ์ระดับ full
-- (can_access_book นับเจ้าของให้อยู่แล้ว)
create policy books_update on books for update
  using (can_access_book(id, 'full'))
  with check (can_access_book(id, 'full'));

-- ลบทั้งเล่มเป็นเรื่องที่ย้อนคืนไม่ได้ ให้เจ้าของเท่านั้น
create policy books_delete on books for delete
  using (owner_id = auth.uid());

-- policy ข้างบนตรวจจาก id ของสมุด ไม่ได้ตรวจ owner_id คนในกลุ่มจึงยังยกสมุด
-- ไปเป็นของคนอื่นได้ถ้าส่ง owner_id ใหม่มา ล็อกไว้ที่ trigger แทน
create or replace function books_keep_owner() returns trigger
language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'เปลี่ยนเจ้าของสมุดไม่ได้';
  end if;
  return new;
end;
$$;

drop trigger if exists books_keep_owner_trg on books;
create trigger books_keep_owner_trg before update on books
  for each row execute function books_keep_owner();
