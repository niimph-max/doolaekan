-- ด่านกันเดารหัสเชิญใน 0015 ไม่เคยทำงานเลยแม้แต่ครั้งเดียว
--
-- เจ้าของลองใส่รหัสผิดเกินสิบครั้งที่เครื่องจริง แล้วไม่เคยโดนกันสักที
-- สาเหตุอยู่ใน PL/pgSQL ไม่ได้อยู่ในตรรกะที่เขียนไว้:
--
--     insert into group_join_attempts (user_id) values (auth.uid());   -- บันทึกว่าลองแล้ว
--     ...
--     raise exception 'ไม่พบกลุ่มที่ใช้รหัสนี้';                        -- แล้วล้มทั้งก้อน
--
-- raise exception ล้มทั้ง transaction ของคำสั่งนั้น **รวมถึงแถวที่เพิ่งเพิ่มไปในฟังก์ชัน
-- เดียวกันเอง** ทุกครั้งที่ใส่รหัสผิด แถวบันทึกการลองจึงถูกย้อนทิ้งไปพร้อมกับ error
-- ตารางว่างเปล่าตลอด นับได้ 0 เสมอ เงื่อนไข tries >= 10 จึงไม่มีวันเป็นจริง
--
-- ที่หลอกตาคือ ผู้ใช้เห็นข้อความ "ไม่พบกลุ่มที่ใช้รหัสนี้" ถูกต้องทุกครั้ง ดูเหมือน
-- ฟังก์ชันทำงานครบ ทั้งที่ครึ่งหนึ่งของมันถูกย้อนทิ้งไปเงียบๆ
--
-- วิธีแก้: กรณี "ไม่พบกลุ่ม" ต้องไม่ใช่ error แต่คืนผลว่างกลับไป แล้วให้ฝั่งแอป
-- เป็นคนบอกผู้ใช้แทน ฟังก์ชันจบแบบปกติ แถวบันทึกการลองจึงอยู่รอด
-- ส่วนกรณีโดนกัน ยังเป็น error ตามเดิมได้ เพราะตอนนั้นไม่ได้เพิ่มแถวอะไรไว้
--
-- รันซ้ำได้ ไม่พัง

-- เปลี่ยนชนิดผลลัพธ์จาก groups เป็น setof groups ต้องลบของเดิมก่อน
drop function if exists join_group_by_code(text);

create or replace function join_group_by_code(p_code text)
returns setof groups language plpgsql security definer set search_path = public as $$
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
  -- ตรงนี้ยัง raise ได้ เพราะยังไม่ได้เพิ่มแถวอะไรที่จะเสียไปกับการย้อน
  if tries >= 10 then
    raise exception 'ลองใส่รหัสผิดหลายครั้งเกินไป รออีกสักชั่วโมงแล้วลองใหม่';
  end if;

  insert into group_join_attempts (user_id) values (auth.uid());

  select * into g from groups where invite_code = upper(trim(p_code));
  if not found then
    -- ห้ามเปลี่ยนเป็น raise exception เด็ดขาด — แถวข้างบนจะหายไปกับมัน
    -- แล้วด่านนี้จะกลับไปนับไม่ขึ้นเหมือนเดิม
    return;
  end if;

  insert into group_members (group_id, user_id)
  values (g.id, auth.uid())
  on conflict do nothing;

  -- เข้าได้แล้วล้างประวัติการลองของคนนี้ทิ้ง คนที่พิมพ์ผิดหลายครั้งกว่าจะถูก
  -- ไม่ควรโดนกันตอนจะเข้ากลุ่มที่สองในชั่วโมงเดียวกัน
  delete from group_join_attempts where user_id = auth.uid();

  return next g;
end;
$$;

revoke all on function join_group_by_code(text) from public, anon;
grant execute on function join_group_by_code(text) to authenticated;
