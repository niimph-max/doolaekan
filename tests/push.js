const { chromium } = require('../node_modules/playwright-core');
const UID = 'eeeeeeee-1111-2222-3333-555555555555';
const BOOK = 'bk-mine';

/** แจ้งเตือนเข้าเครื่อง — ส่วนตั้งค่าในชีตโปรไฟล์
 *
 *  สิ่งที่ต้องพิสูจน์ ล้วนเป็นเรื่อง "แอปต้องไม่โกหก" ทั้งนั้น
 *    1. ค่าที่บันทึกไม่ขึ้น ต้องเด้งกลับและบอกตรงๆ ไม่ใช่ค้างบนจอเหมือนตั้งสำเร็จ
 *    2. ตั้งค่าเรื่องที่จะเตือน เป็นของบัญชี ไม่ใช่ของเครื่อง — ต้องเขียนบนจอให้ชัด
 *       และต้องเห็นแม้เครื่องนี้ยังไม่ได้เปิด
 *    3. เครื่องที่สมัครไว้ตอนแอปอยู่ที่อยู่เดิม ส่งไปไม่ถึงแล้ว ต้องบอก ไม่ใช่นับรวม
 *       เป็นเครื่องที่ใช้ได้
 *    4. ยังไม่ได้เปิดบนเครื่องนี้ ต้องไม่ขึ้นว่าเปิดอยู่
 */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  /** เปิดชีตโปรไฟล์ของแอปที่ล็อกอินแล้ว
   *  failSave = ให้การบันทึกการตั้งค่าล้มเหลว
   *  devices  = แถวเครื่องที่เปิดแจ้งเตือนไว้ ที่ฐานข้อมูลจะตอบกลับมา */
  const openSheet = async ({ failSave = false, devices = [] } = {}) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
    const seen = { savedBody: null };
    await ctx.route('**/rest/v1/**', (r) => {
      const req = r.request(); const u = req.url(); const m = req.method();
      const json = (body) => r.fulfill({ status: 200, contentType: 'application/json', body });

      if (u.includes('/notification_prefs')) {
        if (m === 'GET') return json('[]');   // ยังไม่เคยตั้ง = ใช้ค่าเริ่มต้น
        seen.savedBody = req.postData();
        if (failSave) {
          return r.fulfill({
            status: 500, contentType: 'application/json',
            body: JSON.stringify({ message: 'เซิร์ฟเวอร์ปฏิเสธ' }),
          });
        }
        return json('[]');
      }
      if (u.includes('/push_subscriptions')) return json(JSON.stringify(devices));
      if (m === 'GET' && u.includes('/books')) {
        return json(JSON.stringify([{
          id: BOOK, owner_id: UID, display_name: 'ฉัน', full_name: '', address: '',
          conditions: [], created_at: new Date().toISOString(),
        }]));
      }
      return json('[]');
    });
    await ctx.route('**/auth/v1/**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, email: 'me@example.com', aud: 'authenticated' }),
    }));

    const p = await ctx.newPage();
    await p.goto('http://localhost:4201/');
    await p.evaluate((uid) => localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
      access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: uid, email: 'me@example.com', aud: 'authenticated', role: 'authenticated' },
    })), UID);
    await p.goto('http://localhost:4201/', { waitUntil: 'commit' });
    await p.waitForTimeout(4000);
    await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
    await p.waitForTimeout(900);
    await p.getByRole('button', { name: /ตั้งค่าสมุด|โปรไฟล์|แก้ข้อมูลสมุด/ }).first()
      .click().catch(() => {});
    await p.waitForTimeout(1500);
    return { p, ctx, seen };
  };

  console.log('\n=== 1. ส่วนแจ้งเตือนต้องมีจริง และบอกสถานะเครื่องนี้ตามจริง ===');
  let { p, ctx, seen } = await openSheet();
  const head = p.getByRole('heading', { name: 'แจ้งเตือนเข้าเครื่อง' });
  await head.scrollIntoViewIfNeeded().catch(() => {});
  check('มีส่วนแจ้งเตือนในชีตโปรไฟล์', await head.count() === 1);
  let body = await p.locator('body').innerText();
  check('ไม่ค้างที่ "กำลังตรวจ"', !/กำลังตรวจเครื่องนี้/.test(body));
  check('ยังไม่ได้เปิด ต้องไม่ขึ้นว่าเปิดอยู่', !/เปิดอยู่บนเครื่องนี้/.test(body));

  console.log('\n=== 2. ตั้งค่าเรื่องที่จะเตือน เห็นได้แม้เครื่องนี้ยังไม่ได้เปิด ===');
  const appt = p.getByRole('button', { name: 'วันนัดหมอ' });
  check('มีปุ่มเลือกเรื่องที่จะเตือน', await appt.count() === 1);
  check('ค่าเริ่มต้นคือเปิดทั้งสามเรื่อง',
    await appt.getAttribute('aria-pressed') === 'true'
    && await p.getByRole('button', { name: 'ความดันสูงเกินเกณฑ์' }).getAttribute('aria-pressed') === 'true'
    && await p.getByRole('button', { name: 'สรุปตอนเช้า' }).getAttribute('aria-pressed') === 'true');
  check('บอกว่าใช้กับทุกเครื่อง ไม่ใช่เฉพาะเครื่องนี้', /ใช้กับทุกเครื่อง/.test(body));
  check('บอกตรงๆ ว่าไม่เตือนรายมื้อยา', /ไม่เตือนรายมื้อยา/.test(body));

  console.log('\n=== 3. ปิดเรื่องหนึ่ง แล้วบันทึกขึ้นคลาวด์จริง ===');
  await appt.click();
  await p.waitForTimeout(1200);
  check('ปุ่มเปลี่ยนเป็นปิด', await appt.getAttribute('aria-pressed') === 'false');
  check('ส่งค่าที่ปิดขึ้นคลาวด์จริง', /"appointments":false/.test(seen.savedBody || ''));

  console.log('\n=== 4. บันทึกไม่สำเร็จ ต้องเด้งกลับและบอกตามจริง ===');
  await ctx.close();
  ({ p, ctx, seen } = await openSheet({ failSave: true }));
  const bp = p.getByRole('button', { name: 'ความดันสูงเกินเกณฑ์' });
  await bp.scrollIntoViewIfNeeded().catch(() => {});
  await bp.click();
  await p.waitForTimeout(1800);
  check('ค่าเด้งกลับเป็นของเดิม ไม่ค้างเหมือนบันทึกสำเร็จ',
    await bp.getAttribute('aria-pressed') === 'true');
  check('บอกว่าบันทึกไม่สำเร็จ พร้อมเหตุผล',
    /บันทึกการตั้งค่าไม่สำเร็จ/.test(await p.locator('body').innerText()));

  console.log('\n=== 5. เครื่องที่สมัครไว้ตอนอยู่ที่อยู่เดิม ต้องบอกว่าใช้ไม่ได้แล้ว ===');
  await ctx.close();
  ({ p, ctx, seen } = await openSheet({
    devices: [
      { endpoint: 'https://fcm.example/aaa', label: 'ไอโฟนของแม่', origin: 'https://old.example.com', updated_at: new Date().toISOString() },
      { endpoint: 'https://fcm.example/bbb', label: 'เครื่องแอนดรอยด์', origin: 'http://localhost:4201', updated_at: new Date().toISOString() },
    ],
  }));
  await p.getByRole('heading', { name: 'แจ้งเตือนเข้าเครื่อง' }).scrollIntoViewIfNeeded().catch(() => {});
  body = await p.locator('body').innerText();
  check('บอกว่ามีเครื่องอื่นเปิดไว้ พร้อมชื่อเครื่อง', /ไอโฟนของแม่/.test(body) && /เครื่องแอนดรอยด์/.test(body));
  check('เครื่องที่อยู่เดิมถูกทำเครื่องหมายไว้', /ไอโฟนของแม่ \(ที่อยู่เดิม\)/.test(body));
  check('อธิบายว่าต้องไปกดเปิดใหม่ที่เครื่องนั้น', /กดเปิดใหม่ที่เครื่องนั้น/.test(body));

  await ctx.close();
  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
