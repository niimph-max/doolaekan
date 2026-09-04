const { chromium } = require('../node_modules/playwright-core');
const UID = 'aaaaaaaa-1111-2222-3333-444444444444';
const OTHERS = [
  { id: 'bk-mae', owner_id: 'mmmmmmmm-0000-0000-0000-000000000001', display_name: 'แม่' },
  { id: 'bk-tia', owner_id: 'tttttttt-0000-0000-0000-000000000002', display_name: 'เตี่ย' },
];
// เขียนสมุดขึ้นคลาวด์สำเร็จ แต่การดึงข้อมูลรอบถัดมายังไม่เห็นเล่มนั้น
// สิ่งที่เพิ่งกรอกต้องไม่ถูกลบทิ้ง และต้องไม่ถูกเด้งกลับหน้ากรอกข้อมูล
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  let joined = false;
  await ctx.route('**/rest/v1/**', (r) => {
    const req = r.request(); const u = req.url(); const m = req.method();
    if (m === 'GET') {
      if (u.includes('/books')) return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(joined ? OTHERS : []) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (u.includes('/rpc/')) { joined = true;
      return r.fulfill({ status: 200, contentType: 'application/json', body: 'true' }); }
    // ส่งสมุดขึ้นสำเร็จ แต่ตอนอ่านกลับมายังไม่เห็นเล่มนี้ (เขียนเสร็จแต่ยังอ่านไม่เจอ)
    // เป็นจังหวะที่เกิดได้จริงเสมอเมื่อมีการดึงข้อมูลใหม่ตามมาติดๆ
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, email: 'doo.test2@example.com', aud: 'authenticated' }) }));

  await p.goto('http://localhost:4201/');
  await p.evaluate((uid) => localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now()/1000)+3600,
    user: { id: uid, email: 'doo.test2@example.com', aud: 'authenticated', role: 'authenticated' } })), UID);
  await p.goto('http://localhost:4201/', { waitUntil: 'commit' });
  await p.waitForTimeout(3000);

  await p.locator('#ob-name').fill('โต');
  await p.getByRole('button', { name: 'เริ่มใช้สมุดของฉัน' }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'ต่อไป' }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'ต่อไป' }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: /ใส่รหัสเข้ากลุ่ม/ }).click();
  await p.waitForTimeout(300);
  await p.locator('#grp-code').fill('DLK-2885');
  await p.getByRole('button', { name: 'เข้าใช้สมุดของฉัน' }).click();
  await p.waitForTimeout(6000);

  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  const t = (await p.locator('body').innerText()).replace(/\n+/g, ' | ');
  console.log('\n=== เขียนสำเร็จ แต่รอบอ่านถัดมายังไม่เห็นเล่มนั้น ===');
  check('สิ่งที่เพิ่งกรอกไม่หาย', /โต/.test(t));
  check('ไม่เด้งกลับหน้ากรอกข้อมูล', !/ชื่อเรียกในสมุด/.test(t));
  check('เข้าถึงสมุดของตัวเองได้', /ยาวันนี้ของโต|คนกดตอนนี้: โต/.test(t));
  console.log('  จอ: ' + t.slice(0, 170));
  await b.close();
  console.log(ok ? '\nสรุป: ผ่าน' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
