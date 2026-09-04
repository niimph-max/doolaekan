const { chromium } = require('../node_modules/playwright-core');
const UID = 'aaaaaaaa-1111-2222-3333-444444444444';
// สมุดของแม่กับเตี่ยที่มองเห็นได้หลังเข้ากลุ่ม (ไม่ใช่ของเรา)
const OTHERS = [
  { id: 'bk-mae', owner_id: 'mmmmmmmm-0000-0000-0000-000000000001', display_name: 'แม่' },
  { id: 'bk-tia', owner_id: 'tttttttt-0000-0000-0000-000000000002', display_name: 'เตี่ย' },
];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  const writes = []; const created = []; const createdRows = [];
  let joined = false;
  await ctx.route('**/rest/v1/**', (r) => {
    const req = r.request(); const u = req.url(); const m = req.method();
    if (m === 'GET') {
      if (u.includes('/books')) {
        // อ่านกลับมาต้องมีสมุดที่เพิ่งสร้างด้วย เหมือนเซิร์ฟเวอร์จริง
        return r.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([...(joined ? OTHERS : []), ...createdRows]) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const body = req.postData() || '';
    writes.push({ m, t: u.split('/rest/v1/')[1].split('?')[0], body, prefer: req.headers()['prefer'] || '' });
    if (u.includes('/rpc/')) { joined = true;
      return r.fulfill({ status: 200, contentType: 'application/json', body: 'true' }); }
    if (u.includes('/books') && m === 'POST') {
      const parsed = JSON.parse(body);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const prefer = req.headers()['prefer'] || '';
      // เจ้าของไม่ตรง = ไม่ผ่านกติกา insert
      if (rows.some((row) => row.owner_id !== UID)) {
        return r.fulfill({ status: 403, contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy for table "books"' }) });
      }
      // upsert กับสมุดที่ยังไม่มีอยู่ = โดนตรวจกติกา update ด้วย แล้วไม่ผ่าน
      if (prefer.includes('merge-duplicates')) {
        return r.fulfill({ status: 403, contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy for table "books"' }) });
      }
      created.push(rows[0].display_name);
      createdRows.push(rows[0]);
    }
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

  // กรอกข้อมูล → เลือก "สแกน QR / ใส่รหัสเข้ากลุ่ม" → ใส่รหัส → เข้ากลุ่ม
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
  await p.waitForTimeout(5000);

  console.log('\n=== สิ่งที่ส่งขึ้นเซิร์ฟเวอร์ ตามลำดับ ===');
  for (const w of writes) {
    const short = w.body.length > 150 ? w.body.slice(0, 150) + '…' : w.body;
    console.log(`  ${w.m} ${w.t}  ${short}`);
  }
  const bookWrites = writes.filter((w) => w.t === 'books');
  console.log('\n  uid จริง: ' + UID);
  for (const w of bookWrites) {
    const parsed = JSON.parse(w.body);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    for (const row of rows) console.log(`  owner_id ที่ส่ง: ${row.owner_id}  (${row.display_name})`);
  }
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  console.log('\n=== ผลลัพธ์ ===');
  check('สร้างสมุดขึ้นคลาวด์สำเร็จ', created.length === 1);
  check('ไม่ได้ใช้ upsert กับสมุด', !writes.some((w) => w.t === 'books' && /merge-duplicates/.test(w.prefer || '')));
  const order = writes.map((w) => w.t);
  check('สร้างสมุดก่อนแล้วค่อยเข้ากลุ่ม', order.indexOf('books') < order.lastIndexOf('rpc/join_group_by_code'));
  const screen = (await p.locator('body').innerText()).replace(/\n+/g, ' | ');
  check('ไม่เด้งกลับหน้ากรอกข้อมูล', !/ชื่อเรียกในสมุด/.test(screen));
  check('เข้าถึงแอปได้จริง', /วันนี้|นัดถัดไป|สมุดสุขภาพ/.test(screen));
  console.log('  ลำดับที่ส่ง: ' + order.join(' → '));
  console.log('  สมุดที่ถูกสร้าง: ' + JSON.stringify(created));
  console.log('\n  ข้อความบนจอ: ' + (await p.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 200));
  await b.close();
  console.log(ok ? '\nสรุป: ผ่าน' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
