// ภาพหน้าจอสำหรับส่งขึ้น App Store
//
// ถ่ายจากแอปจริงในโหมดตัวอย่าง ไม่ใช่ภาพที่วาดขึ้นมาใหม่ — ภาพที่ไม่ตรงกับของจริง
// คือเหตุผลที่แอปเปิลตีกลับได้ และเป็นการโกหกคนที่กำลังตัดสินใจโหลดด้วย
//
// ขนาด 1290×2796 = 430×932 คูณ 3 ซึ่งเป็นขนาดที่ App Store รับสำหรับจอ 6.9 นิ้ว
//
//   ต้องมีเซิร์ฟเวอร์โหมดตัวอย่างที่ 4200 ก่อน (ดู tests/README.md)
//   node scripts/store-shots.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'store/screenshots';
const BASE = 'http://localhost:4200/';

mkdirSync(OUT, { recursive: true });

const shots = [
  {
    file: '1-หน้าหลัก.png',
    what: 'ยาวันนี้ กดแล้วรู้กันทั้งบ้าน',
    go: async (p) => { /* หน้าแรกอยู่แล้ว */ },
  },
  {
    file: '2-ยา.png',
    what: 'ยาทุกตัวพร้อมว่าช่วยอะไร และเตือนเมื่อเจอยาซ้ำ',
    go: async (p) => { await tab(p, 'ยา'); },
  },
  {
    file: '3-นัดหมอ.png',
    what: 'นัดหมอพร้อมขั้นตอนและหมายเหตุที่ต้องจำ',
    go: async (p) => { await tab(p, 'นัดหมอ'); },
  },
  {
    file: '4-กิจกรรม.png',
    what: 'บันทึกประจำวัน ออกกำลังกายและอาหาร',
    go: async (p) => { await tab(p, 'กิจกรรม'); },
  },
  {
    file: '5-สมุด.png',
    what: 'ไทม์ไลน์สุขภาพและบัตรฉุกเฉิน',
    go: async (p) => { await tab(p, 'สมุด'); },
  },
];

async function tab(p, name) {
  await p.locator('.tabbar button', { hasText: name }).click();
  await p.waitForTimeout(900);
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const p = await ctx.newPage();

await p.goto(BASE, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
await p.waitForTimeout(1200);

for (const s of shots) {
  await s.go(p);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${s.file}` });
  console.log(`  ✓ ${s.file} — ${s.what}`);
}

await b.close();
console.log(`\nเสร็จแล้ว ${shots.length} ภาพ ที่ ${OUT}/ (1290×2796 สำหรับจอ 6.9 นิ้ว)`);
