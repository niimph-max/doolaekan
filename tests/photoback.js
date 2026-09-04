const { chromium } = require('../node_modules/playwright-core');
const UID = '11111111-1111-1111-1111-111111111111';
const BOOK_ID = 'bk-1';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
// สำเนาในเครื่องเก็บแต่ "ที่อยู่ของรูป" ไม่เก็บตัวรูป — ตรงกับของจริง
const CACHE = {
  books: [{ id: BOOK_ID, owner_id: UID, owner_name: 'เตี่ย', full_name: '', address: '', allergy: '',
    conditions: [], blood_type: '', birth_date: '', age: '', emergency_contact: '', is_mine: true }],
  doctors: [], medications: [], medLogs: [],
  appointments: [{ id: 'ap1', book_id: BOOK_ID, title: 'หมอตา', date: '2026-10-24', time: '17:00',
    place: 'รพ.กรุงเทพ', escort: '', blood_test_before: false, blood_test_done: false,
    photo_path: `${BOOK_ID}/appt-ap1.jpg` }],
  records: [{ id: 'rc1', book_id: BOOK_ID, kind: 'doc', title: 'สแกนถุงยา: ยาความดัน', body: '',
    at: '2026-08-24T10:00:00Z', actor_name: 'นิ่ม', important: true,
    file_path: `${BOOK_ID}/rc1.jpg` }],
  watchRules: [], groups: [], shares: [],
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  let signCalls = 0;
  // ดึงข้อมูลสดพังทั้งหมด = แอปต้องอยู่ได้ด้วยสำเนาในเครื่องล้วนๆ
  await ctx.route('**/rest/v1/**', (r) => r.fulfill({ status: 500, contentType: 'application/json',
    body: JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }) }));
  await ctx.route('**/storage/v1/object/sign/**', (r) => {
    signCalls += 1;
    const body = JSON.parse(r.request().postData() || '{}');
    const paths = body.paths || [];
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(paths.map((path) => ({ path, signedURL: `/dummy?p=${path}`, signedUrl: `/dummy?p=${path}` }))) });
  });
  await ctx.route('**/dummy**', (r) => r.fulfill({ status: 200, contentType: 'image/png',
    body: Buffer.from(PNG.split(',')[1], 'base64') }));
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, email: 'doo.test@example.com', aud: 'authenticated' }) }));

  await p.goto('http://localhost:4201/');
  await p.evaluate(({ uid, cache }) => {
    localStorage.setItem('doolaekan_last_user', uid);
    localStorage.setItem('doolaekan_cache_' + uid, JSON.stringify(cache));
    localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
      access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now()/1000)+3600,
      user: { id: uid, email: 'doo.test@example.com', aud: 'authenticated', role: 'authenticated' } }));
  }, { uid: UID, cache: CACHE });
  await p.goto('http://localhost:4201/', { waitUntil: 'commit' });
  await p.waitForTimeout(5000);

  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  console.log('\n=== เปิดจากสำเนาในเครื่อง ดึงข้อมูลสดพังทั้งหมด ===');
  check('เปิดแอปโดยไม่แตะรูปเลย (เร็ว)', signCalls === 0);

  await p.getByRole('button', { name: 'นัดหมอ', exact: true }).click();
  await p.waitForTimeout(1200);
  check('ยังไม่โหลดรูปเอง', (await p.locator('img.scan-img').count()) === 0);
  const btn = p.getByRole('button', { name: 'ดูภาพใบนัดที่เก็บไว้' });
  check('มีปุ่มให้กดดูรูปที่เก็บไว้', await btn.count() > 0);
  await btn.click();
  await p.waitForTimeout(1500);
  check('กดแล้วรูปขึ้น', (await p.locator('img.scan-img').count()) > 0);
  check('ขอลิงก์เฉพาะตอนกด', signCalls === 1);

  await p.getByRole('button', { name: 'สมุด', exact: true }).click();
  await p.waitForTimeout(800);
  const recBtn = p.getByRole('button', { name: 'ดูรูปที่แนบไว้' });
  check('ไทม์ไลน์ก็มีปุ่มดูรูป', await recBtn.count() > 0);
  console.log(`  จำนวนครั้งที่ขอลิงก์ทั้งหมด: ${signCalls}`);
  await b.close();
  console.log(ok ? '\nสรุป: ผ่าน' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
