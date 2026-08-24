-- แยกยา "ก่อนอาหาร" กับ "หลังอาหาร" ออกจากกัน
-- เดิมรวมอยู่ในข้อความวิธีกิน แอปเลยจัดยาเช้าทั้งหมดเป็นมื้อเดียว
-- ทั้งที่ก่อนอาหารกับหลังอาหารเป็นคนละเวลาจริงๆ กินพร้อมกันไม่ได้
--
-- ไฟล์นี้รันซ้ำได้
alter table medications add column if not exists timing text
  check (timing is null or timing in ('before', 'after', 'with'));

-- เติมค่าให้ยาที่กรอกไว้แล้ว โดยอ่านจากข้อความวิธีกินที่พิมพ์ไว้
update medications set timing = case
  when how_to_take like '%ก่อนอาหาร%' then 'before'
  when how_to_take like '%พร้อมอาหาร%' or how_to_take like '%กับอาหาร%' then 'with'
  when how_to_take like '%หลังอาหาร%' then 'after'
  else null
end
where timing is null;
