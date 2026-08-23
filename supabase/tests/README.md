# ทดสอบ RLS บน Postgres เปล่า

ตรวจว่ากติกา "ของใครของมันก่อน / แชร์เมื่อยินยอม" ถูกบังคับที่ชั้นฐานข้อมูลจริง
ไม่ใช่แค่ที่หน้าจอ — รันได้โดยไม่ต้องมีโปรเจกต์ Supabase

```bash
# 1) ตั้งคลัสเตอร์ชั่วคราว (ต้องรันด้วยผู้ใช้ที่ไม่ใช่ root)
initdb -D /var/tmp/dlk-pgdata -U postgres --auth=trust
pg_ctl -D /var/tmp/dlk-pgdata -o '-p 55432 -k /var/tmp' -l /var/tmp/dlk-pgdata/log start

# 2) จำลอง schema ที่ Supabase มีให้ (auth, storage, publication)
psql -h /var/tmp -p 55432 -U postgres -f supabase/tests/00_supabase_stub.sql

# 3) ลง schema จริง แล้วรันเคสทดสอบ
psql -h /var/tmp -p 55432 -U postgres -c "create role authenticated nologin;"
psql -h /var/tmp -p 55432 -U postgres -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init.sql
psql -h /var/tmp -p 55432 -U postgres -v ON_ERROR_STOP=1 -f supabase/migrations/0002_join_group.sql

# เคสทดสอบ (รันทีละไฟล์บนฐานที่เพิ่งลง schema ใหม่)
psql -h /var/tmp -p 55432 -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/01_rls_test.sql
psql -h /var/tmp -p 55432 -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/02_join_group_test.sql
```

ไฟล์ migration รันซ้ำได้ (idempotent) — รันแล้วพลาดกลางทาง รันใหม่ทับได้เลย ไม่ต้องล้างฐาน

เคสที่ตรวจ (ค่าที่ควรได้เขียนกำกับไว้ในผลลัพธ์แต่ละแถว):

| สถานการณ์ | ผลที่ต้องได้ |
|---|---|
| ยังไม่แชร์ | คนในกลุ่มไม่เห็นสมุด/ยา/นัด เลย |
| แชร์ "เฉพาะวันนัด" | เห็นสมุดกับนัด แต่ไม่เห็นยา |
| แชร์ "ทั้งหมด" | เห็นยา และช่วยบันทึกลงไทม์ไลน์ได้ |
| คนนอกกลุ่ม | ไม่เห็นสมุด/ยา/กลุ่ม แม้เจ้าของแชร์ระดับ full ไว้ในกลุ่มอื่น |
| สมาชิกกลุ่ม | เห็นกลุ่ม สมาชิก และโปรไฟล์ของคนในกลุ่มเดียวกัน (ไม่ recursion) |
| รู้รหัสกลุ่มแต่ยังไม่ได้เข้า | ค้นกลุ่มจากรหัสตรงๆ ไม่เจอ (ต้องผ่าน `join_group_by_code`) |
| เข้ากลุ่มด้วยรหัสถูก | เข้าได้ แล้วเห็นสมุดที่เจ้าของแชร์ไว้ |
| เข้ากลุ่มด้วยรหัสผิด | error "ไม่พบกลุ่มที่ใช้รหัสนี้" |

หมายเหตุ: `00_supabase_stub.sql` ให้ `auth.uid()` อ่านค่าจาก GUC `test.uid`
เพื่อสวมบทบาทผู้ใช้ระหว่างทดสอบ — ของจริงบน Supabase ใช้ของแพลตฟอร์ม ไม่ต้องลงไฟล์นี้
