// ใส่รหัสเข้ากลุ่มผิด แล้วเซิร์ฟเวอร์ตอบกลับมาว่า "ไม่เจอ" — ต้องบอกผู้ใช้ให้ถูก
//
// ตั้งแต่ 0016 ฟังก์ชัน join_group_by_code ไม่ได้โยน error เมื่อหาไม่เจออีกแล้ว
// แต่คืนผลว่างกลับมา (เพื่อให้แถวบันทึกการลองรอด ไม่ถูกย้อนทิ้งไปกับ error
// ซึ่งเป็นเหตุให้ด่านกันเดารหัสไม่เคยทำงานเลย) ข้อความบอกผู้ใช้จึงย้ายมาอยู่
// ฝั่งแอปแทน ถ้าวันไหนมีใครแก้ตรงนั้นหาย ผลว่างจะกลายเป็น "เข้ากลุ่มสำเร็จ"
// ที่ไม่มีกลุ่ม แล้วจะเงียบสนิทโดยไม่มีอะไรเตือน
//
// และไม่ว่าเข้ากลุ่มไม่ได้ด้วยเหตุใด สมุดที่เพิ่งกรอกต้องไม่หายไปด้วย
const { chromium } = require('../node_modules/playwright-core');
const UID = 'aaaaaaaa-1111-2222-3333-444444444444';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  const createdRows = []; const calls = [];
  await ctx.route('**/rest/v1/**', (r) => {
    const req = r.request(); const u = req.url(); const m = req.method();
    const t = u.split('/rest/v1/')[1].split('?')[0];
    if (m === 'GET') {
      if (u.includes('/books')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(createdRows) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    calls.push({ m, t });
    // ประตูเดียวที่รับรหัส — รหัสผิดคืนผลว่าง ไม่ใช่ error (นี่คือของจริงหลัง 0016)
    if (t === 'rpc/join_group_by_code') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (t === 'books' && m === 'POST') {
      const parsed = JSON.parse(req.postData() || '{}');
      createdRows.push(Array.isArray(parsed) ? parsed[0] : parsed);
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, email: 'doo.test3@example.com', aud: 'authenticated' }) }));

  await p.goto('http://localhost:4201/');
  await p.evaluate((uid) => localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: uid, email: 'doo.test3@example.com', aud: 'authenticated', role: 'authenticated' } })), UID);
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
  await p.locator('#grp-code').fill('DLK-ZZZZZZZZ');
  await p.getByRole('button', { name: 'เข้าใช้สมุดของฉัน' }).click();

  // แถบข้อความอยู่แค่ 2.8 วินาที ต้องคอยจับระหว่างนั้น ไม่ใช่รอจนหายแล้วค่อยดู
  let toast = '';
  for (let i = 0; i < 40; i++) {
    const el = p.locator('.toast');
    if (await el.count()) { toast = (await el.first().innerText()).trim(); if (toast) break; }
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(1500);
  const screen = (await p.locator('body').innerText()).replace(/\n+/g, ' | ');

  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  console.log('\n=== ผลลัพธ์ ===');
  check('บอกตรงๆ ว่าไม่พบกลุ่มที่ใช้รหัสนี้', /ไม่พบกลุ่มที่ใช้รหัสนี้/.test(toast));
  check('ไม่ได้บอกว่าเข้ากลุ่มสำเร็จ', !/เข้ากลุ่มแล้ว|เข้ากลุ่มสำเร็จ/.test(toast + screen));
  check('สมุดที่เพิ่งกรอกไม่หาย', createdRows.length === 1);
  check('ไม่เด้งกลับหน้ากรอกข้อมูล', !/ชื่อเรียกในสมุด/.test(screen));
  check('เข้าถึงแอปได้จริง', /วันนี้|นัดถัดไป|สมุดสุขภาพ/.test(screen));
  check('ไม่ได้แอบเพิ่มตัวเองเข้า group_members ตรงๆ', !calls.some((c) => c.t === 'group_members'));
  console.log('\n  แถบข้อความที่ขึ้น: ' + (toast || '(ไม่มีเลย)'));
  console.log('  ที่ส่งขึ้นเซิร์ฟเวอร์: ' + calls.map((c) => c.t).join(' → '));
  await b.close();
  console.log(ok ? '\nสรุป: ผ่าน' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
