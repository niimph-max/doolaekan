-- ลบบัญชีพร้อมข้อมูลทั้งหมด — ข้อบังคับของ Google Play สำหรับแอปที่มีระบบสมัคร
--
-- ฝั่งแอปลบข้อมูลได้ครบอยู่แล้วโดยไม่ต้องพึ่งไฟล์นี้ เพราะโครงตารางผูกกันเป็นทอดๆ
--   auth.users → profiles → books → ยา/หมอ/นัด/บันทึก/กฎเฝ้าระวัง/การแชร์
--                         → group_members
-- ลบแถว profiles ของตัวเอง (policy profiles_self อนุญาตอยู่แล้ว) ข้อมูลหายตามหมด
--
-- สิ่งที่ลบจากฝั่งแอปไม่ได้คือแถวใน auth.users เอง — ตัวอีเมลที่ใช้เข้าระบบ
-- ต้องมีฟังก์ชันฝั่งฐานข้อมูลที่รันด้วยสิทธิ์เจ้าของ ไฟล์นี้ทำหน้าที่นั้น
--
-- ยังไม่รันไฟล์นี้ก็ใช้แอปได้ปกติ ข้อมูลจะถูกลบครบ แต่อีเมลยังเข้าระบบได้และจะเจอ
-- สมุดเปล่า ซึ่งแอปบอกผู้ใช้ตามจริงอยู่แล้วว่าเกิดอะไรขึ้น
--
-- รันซ้ำได้ ไม่พัง

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  -- ไม่มี session = ไม่มีบัญชีให้ลบ ห้ามเดาว่าเป็นใคร
  if me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนถึงจะลบบัญชีได้';
  end if;

  -- ลบได้เฉพาะบัญชีของตัวเองเท่านั้น ฟังก์ชันนี้ไม่รับพารามิเตอร์ใดๆ
  -- จึงไม่มีทางสั่งให้ลบบัญชีคนอื่นได้แม้จะเรียกผ่าน REST โดยตรง
  --
  -- แถวใน auth.users ผูกกับ profiles แบบ on delete cascade อยู่แล้ว
  -- ลบตรงนี้ที่เดียวจึงกวาดทุกอย่างที่เหลือไปด้วย
  delete from auth.users where id = me;
end;
$$;

-- ── ปิดไม่ให้คนที่ยังไม่เข้าระบบเรียกได้ ──
-- Postgres ให้สิทธิ์ EXECUTE กับ PUBLIC เป็นค่าตั้งต้น และ Supabase เปิดฟังก์ชัน
-- ใน schema public เป็น REST endpoint ให้อัตโนมัติ ถ้าไม่ถอนสิทธิ์ ใครถือ anon key
-- (ซึ่งเป็นคีย์สาธารณะ) ก็ยิงเข้ามาได้ แม้ตัวฟังก์ชันจะเช็ค auth.uid() ไว้แล้วก็ตาม
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
