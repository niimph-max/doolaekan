const { chromium } = require('../node_modules/playwright-core');
const UID = '11111111-1111-1111-1111-111111111111';
// รูปปลอมขนาดใหญ่ เลียนแบบรูปถุงยาจากมือถือที่ถูกเก็บเป็น base64 ในฐานข้อมูล
const FAT = 'data:image/jpeg;base64,' + 'A'.repeat(300000);   // ~300 KB ต่อยาหนึ่งตัว
const BOOK = { id: 'bk-1', owner_id: UID, display_name: 'เตี่ย', full_name: '', address: '',
  blood_group: '', birth_date: null, age: '', allergy: '', conditions: [], emergency_contact: '' };
const MEDS = Array.from({ length: 21 }, (_, i) => ({
  id: `m${i}`, book_id: 'bk-1', name: `ยา ${i}`, active: true, slots: ['morning'],
  photo_path: FAT,          // ← ของเสียที่ค้างอยู่ในฐานข้อมูลจริง
}));

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  let medBytes = 0, askedColumns = '';
  await ctx.route('**/rest/v1/**', (r) => {
    const u = r.request().url();
    if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (u.includes('/medications')) {
      askedColumns = decodeURIComponent(u.split('select=')[1] || '').split('&')[0];
      // ส่งเฉพาะคอลัมน์ที่ขอมา เหมือนที่เซิร์ฟเวอร์จริงทำ
      const wantsPhoto = askedColumns === '*' || askedColumns.includes('photo_path');
      const rows = MEDS.map((m) => (wantsPhoto ? m : (({ photo_path: _p, ...rest }) => rest)(m)));
      const body = JSON.stringify(rows);
      medBytes = Buffer.byteLength(body);
      return r.fulfill({ status: 200, contentType: 'application/json', body });
    }
    if (u.includes('/books')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([BOOK]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, email: 'doo.test@example.com', aud: 'authenticated' }) }));

  await p.goto('http://localhost:4201/');
  await p.evaluate((uid) => localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now()/1000)+3600,
    user: { id: uid, email: 'doo.test@example.com', aud: 'authenticated', role: 'authenticated' } })), UID);
  await p.goto('http://localhost:4201/', { waitUntil: 'commit' });
  await p.waitForTimeout(4000);

  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  console.log('\n=== เปิดแอปหนึ่งครั้ง โหลดรายการยา 21 ตัว ===');
  console.log('  คอลัมน์ที่ขอ: ' + (askedColumns || '(ไม่ได้ขอ)').slice(0, 90));
  console.log(`  ข้อมูลที่ถูกส่งกลับมา: ${(medBytes / 1024).toFixed(0)} KB`);
  check('ไม่ขอคอลัมน์รูปมาด้วย', !askedColumns.includes('photo_path') && askedColumns !== '*');
  check('โหลดรายการยาต่ำกว่า 50 KB', medBytes < 50 * 1024);
  await p.getByRole('button', { name: 'ยา', exact: true }).click();
  await p.waitForTimeout(600);
  check('รายการยายังแสดงครบ', (await p.getByText('ยา 20').count()) > 0);
  await b.close();
  console.log(ok ? '\nสรุป: ผ่าน' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
