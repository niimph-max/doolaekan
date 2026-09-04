const { chromium } = require('../node_modules/playwright-core');
const UID = '99999999-9999-9999-9999-999999999999';
const BOOK = {
  id: '11111111-2222-3333-4444-555555555555', owner_id: UID, display_name: 'นิ่ม',
  full_name: '', address: '', birth_date: null, conditions: [], allergy: '',
  child_phone: '', blood_type: '', hospital_rights: '', notes: '',
};

/** mode:
 *   'error'  = คำขออ่านล้มเหลวจริง (แบบ statement timeout) แล้วหายเองรอบถัดไป
 *   'empty'  = เซิร์ฟเวอร์ตอบสำเร็จว่าไม่มีสมุด — คำตอบจริง ไม่ใช่อาการพัง
 *   authOk   = เซิร์ฟเวอร์เข้าระบบยืนยันตัวตนได้ไหม */
const boot = async (b, { mode, failRounds = 0, seedHadBook = false, authOk = true }) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  let round = 0;
  // ── ตัวกวาดต้องมาก่อนตัวเจาะจง ──
  // Playwright ให้กติกาที่ใส่ทีหลังชนะ ถ้าใส่ตัวกวาดไว้ท้ายจะทับของเจาะจงหมด
  // ตัวนี้มีไว้ปิดคำขอที่หลุดออกไปหาเน็ตจริง (realtime / ต่อ token ใหม่) ซึ่งจะ
  // ค้างรอจนหมดเวลาแล้วทำให้แต่ละรอบใช้เวลาไม่เท่ากัน ผลทดสอบเลยไม่นิ่ง
  await ctx.route('**', (r) => (/supabase\.(co|in)/.test(r.request().url())
    ? r.abort() : r.continue()));
  await ctx.route('**/rest/v1/**', (r) => {
    const req = r.request();
    if (req.method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (req.url().includes('/books')) {
      if (mode === 'error' && round++ < failRounds) {
        return r.fulfill({ status: 500, contentType: 'application/json',
          body: JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }) });
      }
      const give = mode === 'error';
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(give ? [{ ...BOOK, profiles: { display_name: 'นิ่ม' } }] : []) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/auth/v1/**', (r) => (authOk
    ? r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: UID, email: 'doo.test2@example.com', aud: 'authenticated' }) })
    : r.fulfill({ status: 401, contentType: 'application/json',
        body: JSON.stringify({ message: 'invalid JWT' }) })));

  await p.goto(`http://localhost:${process.env.PORT || 4201}/`);
  await p.evaluate(([uid, seed]) => {
    localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
      access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600,
      user: { id: uid, email: 'doo.test2@example.com', aud: 'authenticated', role: 'authenticated' } }));
    if (seed) localStorage.setItem('doolaekan_had_book', JSON.stringify([uid]));
  }, [UID, seedHadBook]);
  await p.goto(`http://localhost:${process.env.PORT || 4201}/`, { waitUntil: 'commit' });
  return { ctx, p };
};
const text = async (p) => (await p.locator('body').innerText()).replace(/\n+/g, ' | ');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  // 1) เพิ่งสมัครใหม่ — เซิร์ฟเวอร์ตอบชัดว่ายังไม่มีสมุด ต้องเข้าหน้ากรอกทันที
  {
    console.log('\n=== เพิ่งสมัครใหม่ ===');
    const { ctx, p } = await boot(b, { mode: 'empty' });
    let waiting = 0;
    for (let i = 0; i < 10; i += 1) {
      await p.waitForTimeout(400);
      if (await p.getByText('กำลังดึงสมุดของคุณ').count()) waiting += 1;
    }
    check('เข้าหน้ากรอกข้อมูลได้', /ชื่อเรียกในสมุด/.test(await text(p)));
    check('ไม่ติดค้างที่หน้ารอ', waiting <= 1);
    console.log(`  จังหวะที่เห็นหน้ารอ: ${waiting}/10`);
    await ctx.close();
  }

  // 2) อ่านล้มเหลวจริง (statement timeout) และไม่มีสำเนาในเครื่อง
  //    ต้องบอกว่าโหลดไม่สำเร็จ + ให้กดลองใหม่ ห้ามพาไปหน้ากรอกข้อมูลเด็ดขาด
  //    เพราะ "อ่านไม่ได้" ไม่ได้แปลว่า "ไม่มีสมุด"
  {
    console.log('\n=== อ่านล้มเหลวจริง ไม่มีสำเนาในเครื่อง ===');
    const { ctx, p } = await boot(b, { mode: 'error', failRounds: 2 });
    let sawForm = 0;
    for (let i = 0; i < 16; i += 1) {
      await p.waitForTimeout(500);
      if (await p.getByLabel('ชื่อเรียกในสมุด').count()) sawForm += 1;
    }
    check('ไม่โผล่หน้ากรอกข้อมูลเลยสักจังหวะ', sawForm === 0);
    check('ฟื้นเองแล้วเข้าถึงสมุดได้ ไม่ต้องกดอะไร', /วันนี้|นัดถัดไป/.test(await text(p)));
    await ctx.close();
  }

  // 3) เคยมีสมุดในเครื่องนี้ แต่ตอนนี้อ่านได้ 0 เล่ม — ห้ามชวนสร้างใหม่ลอยๆ
  {
    console.log('\n=== เคยมีสมุด แต่อ่านได้ 0 เล่ม ===');
    const { ctx, p } = await boot(b, { mode: 'empty', seedHadBook: true });
    await p.waitForTimeout(9000);
    console.log('  หัวข้อ: ' + await p.locator('h2').first().innerText());
    check('บอกว่าข้อมูลไม่ได้หาย', (await p.getByText('ข้อมูลไม่ได้หาย').count()) > 0);
    check('ยังไม่โผล่ช่องกรอกชื่อ', (await p.getByLabel('ชื่อเรียกในสมุด').count()) === 0);
    check('สร้างใหม่ต้องกดยืนยันเอง', (await p.getByRole('button', { name: 'ยืนยันสร้างสมุดใหม่' }).count()) > 0);
    await p.getByRole('button', { name: 'ยืนยันสร้างสมุดใหม่' }).click();
    await p.waitForTimeout(600);
    check('กดยืนยันแล้วถึงเข้าหน้ากรอก', (await p.getByLabel('ชื่อเรียกในสมุด').count()) > 0);
    await ctx.close();
  }

  // 4) ยืนยันตัวตนกับเซิร์ฟเวอร์ไม่ผ่าน — ห้ามสรุปว่าเป็นคนใหม่แล้วชวนสร้างสมุด
  {
    console.log('\n=== ใบเข้าระบบใช้ไม่ได้ ===');
    const { ctx, p } = await boot(b, { mode: 'empty', authOk: false });
    await p.waitForTimeout(9000);
    const t = await text(p);
    console.log('  หัวข้อ: ' + await p.locator('h2').first().innerText());
    check('ไม่พาไปหน้ากรอกข้อมูล', !/ชื่อเรียกในสมุด/.test(t));
    check('บอกว่าหมดเวลาเข้าระบบ', /หมดเวลาเข้าระบบ/.test(t));
    await ctx.close();
  }

  await b.close();
  console.log(ok ? '\nสรุป: ผ่านทั้งหมด' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
