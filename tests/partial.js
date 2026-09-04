const { chromium } = require('../node_modules/playwright-core');
const UID = '11111111-1111-1111-1111-111111111111';
const BOOK = { id: 'bk-1', owner_id: UID, display_name: 'เตี่ย', full_name: '', address: '',
  blood_group: '', birth_date: null, age: '', allergy: '', conditions: [], emergency_contact: '' };
const MEDS = [{ id: 'm1', book_id: 'bk-1', name: 'ยาความดัน', active: true, slots: ['morning'] }];
const APPTS = [{ id: 'ap1', book_id: 'bk-1', title: 'หมอตา', appt_date: '2026-10-24', appt_time: '17:00', place: 'รพ.กรุงเทพ' }];

// ไทม์ไลน์กับประวัติกินยาโดน statement timeout ส่วนที่เหลือปกติ
// = สถานการณ์จริงบนเครื่องผู้ใช้ ต้องเปิดแอปได้ ไม่ใช่ตกหน้า "โหลดไม่สำเร็จ"
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const asked = [];
  await ctx.route('**/rest/v1/**', (r) => {
    const u = r.request().url();
    if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    asked.push(decodeURIComponent(u.split('/rest/v1/')[1]));
    if (u.includes('/records') || u.includes('/med_logs')) {
      return r.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }) });
    }
    if (u.includes('/books')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([BOOK]) });
    if (u.includes('/medications')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MEDS) });
    if (u.includes('/appointments')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(APPTS) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, email: 'doo.test3@example.com', aud: 'authenticated' }) }));

  await p.goto('http://localhost:4201/');
  await p.evaluate((uid) => localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now()/1000)+3600,
    user: { id: uid, email: 'doo.test3@example.com', aud: 'authenticated', role: 'authenticated' } })), UID);
  await p.goto('http://localhost:4201/', { waitUntil: 'commit' });
  await p.waitForTimeout(6000);

  const t = (await p.locator('body').innerText()).replace(/\n+/g, ' | ');
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  check('เปิดแอปได้ ไม่ตกหน้า "โหลดข้อมูลไม่สำเร็จ"', !/โหลดข้อมูลไม่สำเร็จ/.test(t));
  check('เห็นนัดหมอ', /หมอตา/.test(t));
  const limited = asked.find((a) => a.startsWith('records'));
  const logq = asked.find((a) => a.startsWith('med_logs'));
  console.log('  คำขอไทม์ไลน์: ' + (limited || '(ไม่มี)'));
  console.log('  คำขอประวัติกินยา: ' + (logq || '(ไม่มี)'));
  check('ไทม์ไลน์จำกัดจำนวน ไม่ดึงทั้งตาราง', /limit=/.test(limited || ''));
  check('ประวัติกินยาจำกัดช่วงวัน', /dose_day=gte/.test(logq || ''));
  await p.getByRole('button', { name: 'ยา', exact: true }).click();
  await p.waitForTimeout(500);
  check('เห็นรายการยา', /ยาความดัน/.test(await p.locator('body').innerText()));
  console.log('\n  จอ: ' + t.slice(0, 150));
  await b.close();
  console.log(ok ? '\nสรุป: ผ่าน' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
