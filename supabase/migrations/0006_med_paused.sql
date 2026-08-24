-- พักยาไว้ก่อน (ยังไม่ได้เลิกกิน)
--
-- เคสจริง: เตี่ยได้ progabilin 25 มก. จากหมอวิวัฒน์ ต่อมาหมอกระดูกสั่ง
-- progabilin 75 มก. ซึ่งเป็นตัวเดียวกันแต่เพิ่มโดส ต้องเก็บ 25 ไว้ก่อน
-- กิน 75 จนหมดแล้วค่อยกลับมากิน 25 ต่อ
--
-- เดิมทำได้อย่างเดียวคือ "เอายานี้ออก" ซึ่งเป็นการเอาออกถาวร (active = false)
-- ทำให้ยาหายจากรายการทั้งที่ยังต้องกลับมากิน และถ้าเพิ่มใหม่ทีหลัง
-- ประวัติการกินยาก็ขาดตอน
--
-- รันซ้ำได้ ไม่พัง

alter table medications add column if not exists paused boolean not null default false;
alter table medications add column if not exists paused_note text;

comment on column medications.paused is 'พักไว้ชั่วคราว — ไม่ขึ้นในยาวันนี้ แต่ยังอยู่ในรายการยา';
comment on column medications.paused_note is 'เหตุผลที่พัก เช่น รอกินโดสใหม่ให้หมดก่อน';
