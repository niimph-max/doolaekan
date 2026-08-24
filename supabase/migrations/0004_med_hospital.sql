-- เก็บโรงพยาบาลของยาแต่ละตัว
-- เดิมมีแค่ชื่อหมอกับแผนก พอหมอคนเดียวออกตรวจหลายที่ก็แยกไม่ออกว่าใบสั่งยามาจากที่ไหน
-- ไฟล์นี้รันซ้ำได้
alter table medications add column if not exists hospital text;

-- เติมจากรายชื่อหมอในสมุดเล่มเดียวกัน ถ้าชื่อหมอตรงกัน
update medications m
set hospital = d.hospital
from doctors d
where m.hospital is null
  and d.book_id = m.book_id
  and d.hospital is not null
  and (m.prescriber = d.name or m.prescriber = 'หมอ' || d.name);
