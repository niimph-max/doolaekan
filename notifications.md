# Doolaekan — แผนการแจ้งเตือน

## เหตุการณ์ที่ต้องเตือน (จากต้นแบบ)
| เหตุการณ์ | ถึงใคร | เวลา |
|---|---|---|
| นัดหมอ | ทุกคนที่เห็นสมุด + คนพาไป | 1 วันก่อน 18:00 + เช้าวันนัด 06:30 |
| ตรวจเลือดก่อนนัด (นัดหมอหัวใจ) | ทุกคน | เปิดหน้าต่าง D-7 และย้ำ D-3 ถ้ายังไม่ไป |
| ถึงเวลากินยา | เครื่องกลาง (เครื่องเตี่ย/แม่) | ตามมื้อ เช้า/เย็น/ก่อนนอน |
| ยังไม่กดว่ากินยา | ลูกๆ | เกินเวลา 1 ชม. |
| ไม่ยอมกินยา | ลูกๆ ทุกคน | ทันที |
| อาการเข้าข้อเฝ้าระวัง | ทุกคน | ทันที (ระดับด่วน) |
| ความดันสูงเกินเกณฑ์ (≥140) | ลูกๆ | ทันทีหลังบันทึก |

## Phase 1 — PWA + Web Push (เริ่มได้เลย ฟรี)
1. ทำแอปเป็น PWA (manifest + service worker) → ติดตั้งลงหน้าจอเครื่องเตี่ย/แม่และเครื่องลูก
2. ขอ permission → เก็บ subscription ลงตาราง `push_subscriptions`
3. **Supabase Edge Functions**:
   - `notify` — ยิง Web Push (VAPID) ตาม user_id
   - **DB webhook/trigger**: insert `med_logs` ที่ status='refused', insert `records` ที่ hit_watch_rule=true หรือ bp sys≥140 → เรียก `notify` ทันที
   - **pg_cron ทุก 15 นาที**: สแกน `appointments` หานัดที่เข้าเงื่อนไข D-1 / เช้าวันนัด / หน้าต่างตรวจเลือด D-7, และมื้อยาที่เลยเวลา → ยิง notify (กันซ้ำด้วยตาราง `notified_log`)
4. Realtime subscription ในแอป → ข้อมูลบนจออัปเดตสด ไม่ต้องรีเฟรช

ข้อจำกัด: iOS Safari ต้อง "Add to Home Screen" ก่อนถึงจะรับ push ได้ (iOS 16.4+)

## Phase 2 — LINE Messaging API (เหมาะกับครอบครัวไทยมาก)
1. สร้าง LINE Official Account + Messaging API channel
2. ผูกบัญชี: ผู้ใช้กด "เชื่อม LINE" → LINE Login → เก็บ `line_user_id` ใน `profiles`
3. Edge Function `notify` ยิงทั้ง Web Push และ LINE push message (ข้อความ + ลิงก์เปิดแอป)
4. ตัวเลือก: LINE group ของครอบครัว — bot ส่งสรุปเช้า ("วันนี้เตี่ยมียา 3 ตัว, นัดตรวจเลือดพรุ่งนี้")

## ลำดับที่แนะนำ
1. Realtime ในแอป (ได้ฟรีจาก Supabase) → 2. Web Push refusal/watch-rule (trigger, ง่ายสุด) →
3. cron นัด/มื้อยา → 4. LINE integration
