const { chromium } = require('../node_modules/playwright-core');
const UID = '11111111-1111-1111-1111-111111111111';
const SESSION = { access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now()/1000)+3600,
  user: { id: UID, email: 'doo.test@example.com', aud: 'authenticated', role: 'authenticated' } };

const boot = async (b, routes) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await ctx.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('**/auth/v1/**', routes);
  await p.goto('http://localhost:4201/', { waitUntil: 'commit' });
  await p.waitForTimeout(2500);
  return { ctx, p };
};
const text = async (p) => (await p.locator('body').innerText()).replace(/\n+/g, ' | ');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  // 1) รหัสถูก แต่เซิร์ฟเวอร์คืน error มาก่อน แล้วเซสชันตามมาทีหลัง
  //    = อาการ "บอกว่ารหัสผิด แต่ที่จริงเข้าได้แล้ว"
  {
    console.log('\n=== รหัสถูก แต่ตอบ error มาก่อน เซสชันตามมาทีหลัง ===');
    let hasSession = false;
    const { ctx, p } = await boot(b, (r) => {
      const u = r.request().url();
      if (u.includes('/otp')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      if (u.includes('/verify')) { hasSession = true;
        return r.fulfill({ status: 500, contentType: 'application/json',
          body: JSON.stringify({ error: 'invalid_otp', error_description: 'Token has expired or is invalid' }) }); }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION.user) });
    });
    await p.getByLabel('อีเมลของคุณ').fill('doo.test@example.com');
    await p.getByRole('button', { name: 'ส่งรหัสเข้าอีเมล' }).click();
    await p.waitForTimeout(800);
    // เซสชันโผล่ในเครื่องระหว่างที่ verify กำลังพัง
    await p.evaluate((s) => localStorage.setItem('sb-offline-test-auth-token', JSON.stringify(s)), SESSION);
    await p.getByLabel('รหัสจากอีเมล').fill('123456');
    await p.getByRole('button', { name: 'เข้าใช้สมุด' }).click();
    await p.waitForTimeout(2000);
    const t = await text(p);
    check('ไม่โกหกว่ารหัสผิด', !/รหัสนี้ใช้ไม่ได้แล้ว|ไม่ถูกต้อง/.test(t));
    check('ไม่เด้งกลับหน้าใส่อีเมล', !/อีเมลของคุณ/.test(t));
    await ctx.close();
  }

  // 2) เน็ตหลุดตอนกดตรวจรหัส — ต้องบอกว่าเน็ต ไม่ใช่บอกว่ารหัสผิด และต้องอยู่หน้าเดิม
  {
    console.log('\n=== เน็ตหลุดตอนตรวจรหัส ===');
    const { ctx, p } = await boot(b, (r) => {
      const u = r.request().url();
      if (u.includes('/otp')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      if (u.includes('/verify')) return r.abort('connectionfailed');
      return r.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    });
    await p.getByLabel('อีเมลของคุณ').fill('doo.test@example.com');
    await p.getByRole('button', { name: 'ส่งรหัสเข้าอีเมล' }).click();
    await p.waitForTimeout(800);
    await p.getByLabel('รหัสจากอีเมล').fill('123456');
    await p.getByRole('button', { name: 'เข้าใช้สมุด' }).click();
    await p.waitForTimeout(2500);
    const t = await text(p);
    check('บอกว่าเป็นเรื่องเน็ต', /ต่ออินเทอร์เน็ตไม่ติด/.test(t));
    check('บอกว่ารหัสเดิมยังใช้ได้', /รหัสเดิมยังใช้ได้/.test(t));
    check('ยังอยู่หน้ากรอกรหัส ไม่เด้งกลับ', /รหัสจากอีเมล/.test(t));
    check('ปุ่มไม่ค้างที่ "กำลังตรวจ"', !/กำลังตรวจ/.test(t));
    await ctx.close();
  }

  // 3) พิมพ์อีเมลผิด = บัญชีไม่มีอยู่ — ห้ามสร้างบัญชีใหม่เงียบๆ
  {
    console.log('\n=== พิมพ์อีเมลผิดตัวเดียว ===');
    let created = false;
    const { ctx, p } = await boot(b, (r) => {
      const u = r.request().url();
      if (u.includes('/otp')) {
        const body = JSON.parse(r.request().postData() || '{}');
        if (body.create_user === false || body.should_create_user === false) {
          return r.fulfill({ status: 422, contentType: 'application/json',
            body: JSON.stringify({ error_code: 'otp_disabled', msg: 'Signups not allowed for otp' }) });
        }
        created = true;
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      return r.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    });
    // สะกดผิดจาก doo.test ที่ใช้ในเคสอื่น — จำลองคนพิมพ์อีเมลตัวเองผิด
    await p.getByLabel('อีเมลของคุณ').fill('doo.tset@example.com');
    await p.getByRole('button', { name: 'ส่งรหัสเข้าอีเมล' }).click();
    await p.waitForTimeout(2000);
    const t = await text(p);
    check('ไม่สร้างบัญชีใหม่เงียบๆ', !created);
    check('ทักว่ายังไม่มีบัญชีของอีเมลนี้', /ยังไม่มีบัญชีของอีเมลนี้/.test(t));
    check('เตือนว่าจะได้สมุดเปล่า', /สมุดเปล่า/.test(t));
    check('ต้องกดยืนยันเองถึงจะสร้าง', /ฉันเป็นคนใหม่/.test(t));
    await ctx.close();
  }

  // 4) ขอรหัสใหม่รัวๆ = รหัสที่กำลังส่งมาถูกยกเลิก ต้องกันไว้และบอกให้รู้
  {
    console.log('\n=== กันขอรหัสรัวๆ ===');
    const { ctx, p } = await boot(b, (r) => r.request().url().includes('/otp')
      ? r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      : r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await p.getByLabel('อีเมลของคุณ').fill('doo.test@example.com');
    await p.getByRole('button', { name: 'ส่งรหัสเข้าอีเมล' }).click();
    await p.waitForTimeout(1000);
    const t = await text(p);
    check('บอกว่าอีเมลอาจมาช้า อย่าเพิ่งกดขอใหม่', /อย่าเพิ่งกดขอใหม่/.test(t));
    check('ล็อกปุ่มขอรหัสใหม่ไว้ก่อน', /ขอรหัสใหม่ได้ในอีก \d+ วินาที/.test(t));
    check('บอกผลของการขอใหม่ล่วงหน้า', /รหัสเดิมจะใช้ไม่ได้/.test(t) || /ขอรหัสใหม่ได้ในอีก/.test(t));
    await ctx.close();
  }

  // 5) ส่งอีเมลช้าจนเราเลิกรอเอง — ไม่ได้แปลว่าไม่ได้ส่ง ต้องพาไปหน้ากรอกรหัส
  //    ของเดิมทิ้งไว้หน้าเดิมพร้อมข้อความว่าเน็ตพัง ทั้งที่ WiFi เต็มขีด
  {
    console.log('\n=== ส่งอีเมลช้าเกินเส้นตาย (ไม่ใช่เน็ตพัง) ===');
    const { ctx, p } = await boot(b, (r) => {
      if (r.request().url().includes('/otp')) return;   // ไม่ตอบเลย ปล่อยให้ครบเวลา
      return r.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    });
    await p.getByLabel('อีเมลของคุณ').fill('doo.test@example.com');
    await p.getByRole('button', { name: 'ส่งรหัสเข้าอีเมล' }).click();
    await p.waitForTimeout(34000);
    const t = await text(p);
    check('พาไปหน้ากรอกรหัส ไม่ทิ้งไว้หน้าอีเมล', /รหัสจากอีเมล/.test(t));
    check('บอกตรงๆ ว่ายังไม่รู้ผล', /ยังไม่ตอบกลับ/.test(t));
    check('ไม่โทษเน็ตทั้งที่เน็ตดี', !/เช็คสัญญาณ|ต่ออินเทอร์เน็ตไม่ติด/.test(t));
    await ctx.close();
  }

  // 6) เน็ตพังจริงตอนขอรหัส — ข้อความต้องเข้ากับหน้าที่ยืนอยู่
  {
    console.log('\n=== เน็ตพังจริงตอนขอรหัส ===');
    const { ctx, p } = await boot(b, (r) => r.request().url().includes('/otp')
      ? r.abort('connectionfailed')
      : r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await p.getByLabel('อีเมลของคุณ').fill('doo.test@example.com');
    await p.getByRole('button', { name: 'ส่งรหัสเข้าอีเมล' }).click();
    await p.waitForTimeout(2500);
    const t = await text(p);
    check('บอกให้กดส่งรหัสอีกครั้ง', /กดส่งรหัสอีกครั้ง/.test(t));
    check('ไม่พูดถึง "รหัสเดิม" ทั้งที่ยังไม่เคยมีรหัส', !/รหัสเดิมยังใช้ได้/.test(t));
    await ctx.close();
  }

  // 7) รหัสมาถึงอีเมลก่อนที่คำขอส่งจะตอบกลับ — ต้องกรอกได้ทันที ห้ามค้างที่ "กำลังส่ง…"
  {
    console.log('\n=== รหัสมาถึงก่อนคำขอตอบกลับ ===');
    let verified = false;
    const { ctx, p } = await boot(b, (r) => {
      const u = r.request().url();
      if (u.includes('/otp')) return;                       // ค้างไว้ ไม่ตอบ
      if (u.includes('/verify')) { verified = true;
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) }); }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION.user) });
    });
    await p.getByLabel('อีเมลของคุณ').fill('doo.test@example.com');
    await p.getByRole('button', { name: 'ส่งรหัสเข้าอีเมล' }).click();
    await p.waitForTimeout(1500);            // ยังไม่ถึงเส้นตายการส่งเลยด้วยซ้ำ
    const t1 = await text(p);
    check('เปิดช่องกรอกรหัสทันที ไม่รอเซิร์ฟเวอร์', /รหัสจากอีเมล/.test(t1));
    check('บอกว่ากรอกได้เลยถ้ารหัสมาแล้ว', /กรอกได้เลยไม่ต้องรอ/.test(t1));
    await p.getByLabel('รหัสจากอีเมล').fill('123456');
    await p.getByRole('button', { name: 'เข้าใช้สมุด' }).click();
    await p.waitForTimeout(1500);
    check('กดเข้าใช้สมุดได้ ทั้งที่การส่งยังค้างอยู่', verified);
    await ctx.close();
  }

  await b.close();
  console.log(ok ? '\nสรุป: ผ่านทั้งหมด' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
