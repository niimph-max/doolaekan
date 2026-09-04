const { chromium } = require('../node_modules/playwright-core');
const UID = '11111111-1111-1111-1111-111111111111';
const BOOK = { id: 'bk-1', owner_id: UID, display_name: 'เตี่ย', full_name: '', address: '',
  blood_group: '', birth_date: null, age: '', allergy: '', conditions: [], emergency_contact: '' };
const CACHE = { books: [{ id: 'bk-1', owner_id: UID, owner_name: 'เตี่ย', full_name: '', address: '',
    allergy: '', conditions: [], blood_type: '', birth_date: '', age: '', emergency_contact: '', is_mine: true }],
  doctors: [], medications: [], medLogs: [], appointments: [], records: [], watchRules: [], groups: [], shares: [] };

// พลาดรอบแรก แล้วรอบถัดมาสำเร็จ — ผู้ใช้ไม่ควรเห็นคำเตือนเลย
const run = async (b, label, failRounds) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  let round = 0;
  const toasts = [];
  await ctx.route('**/rest/v1/**', (r) => {
    if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const u = r.request().url();
    if (u.includes('/books')) {
      const fail = round++ < failRounds;
      if (fail) return r.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([BOOK]) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, email: 'doo.test3@example.com', aud: 'authenticated' }) }));

  await p.goto('http://localhost:4201/');
  await p.evaluate(({ uid, cache }) => {
    localStorage.setItem('doolaekan_last_user', uid);
    localStorage.setItem('doolaekan_cache_' + uid, JSON.stringify(cache));
    localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
      access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now()/1000)+3600,
      user: { id: uid, email: 'doo.test3@example.com', aud: 'authenticated', role: 'authenticated' } }));
  }, { uid: UID, cache: CACHE });
  await p.goto('http://localhost:4201/', { waitUntil: 'commit' });

  for (let i = 0; i < 30; i += 1) {          // เฝ้า 15 วินาที
    await p.waitForTimeout(500);
    const el = await p.locator('.toast').count();
    if (el) { const txt = await p.locator('.toast').innerText(); if (!toasts.includes(txt)) toasts.push(txt); }
  }
  console.log(`\n=== ${label} ===`);
  console.log('  คำเตือนที่ผู้ใช้เห็น: ' + (toasts.length ? toasts.join(' / ').replace(/\n/g, ' ') : '(ไม่มี)'));
  await ctx.close();
  return toasts;
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = true;
  const t1 = await run(b, 'พลาดรอบแรก แล้วรอบถัดมาสำเร็จ', 1);
  const bad1 = t1.some((t) => /ไม่สำเร็จ/.test(t));
  console.log(`  ${bad1 ? '✗ ตก: เตือนทั้งที่หายเองแล้ว' : '✓ ผ่าน: ไม่รบกวนเพราะหายเอง'}`);
  if (bad1) ok = false;

  const t2 = await run(b, 'พลาดทุกรอบจริงๆ', 99);
  const warned = t2.some((t) => /ไม่สำเร็จ|เก็บไว้ในเครื่อง/.test(t));
  console.log(`  ${warned ? '✓ ผ่าน: พลาดจริงถึงเตือน' : '✗ ตก: เงียบทั้งที่พลาดจริง'}`);
  if (!warned) ok = false;

  await b.close();
  console.log(ok ? '\nสรุป: ผ่าน' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
