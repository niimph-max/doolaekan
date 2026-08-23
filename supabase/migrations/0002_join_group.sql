-- เข้ากลุ่มด้วยรหัสเชิญ (QR / ลิงก์)
--
-- policy ของ groups ให้เห็นเฉพาะกลุ่มที่ตัวเองเป็นสมาชิกอยู่แล้ว — คนที่ยังไม่ได้เข้ากลุ่ม
-- จึงค้นหากลุ่มจากรหัสไม่เจอ (ตั้งใจให้เป็นแบบนั้น กลุ่มอื่นต้องล่องหนสนิท)
-- ทางเข้าเดียวคือฟังก์ชันนี้: รับรหัส → เพิ่มตัวเองเป็นสมาชิก → คืนกลุ่มนั้นกลับไป

create or replace function join_group_by_code(p_code text)
returns groups language plpgsql security definer set search_path = public as $$
declare
  g groups;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into g from groups where invite_code = trim(p_code);
  if not found then
    raise exception 'ไม่พบกลุ่มที่ใช้รหัสนี้';
  end if;

  insert into group_members (group_id, user_id)
  values (g.id, auth.uid())
  on conflict do nothing;

  return g;
end;
$$;

revoke all on function join_group_by_code(text) from public;
grant execute on function join_group_by_code(text) to authenticated;
