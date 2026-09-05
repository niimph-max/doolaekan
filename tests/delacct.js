const { chromium } = require('../node_modules/playwright-core');
const UID = 'dddddddd-1111-2222-3333-444444444444';
const BOOK = 'bk-mine';

/** ลบบัญชีพร้อมข้อมูลทั้งหมด — Google Play บังคับให้มีทางลบเองในแอป
 *
 *  ปุ่มนี้กดแล้วกู้คืนไม่ได้ จึงต้องพิสูจน์สามเรื่อง
 *    1. กดพลาดไม่ได้ — ต้องพิมพ์คำยืนยันเองก่อน
 *    2. ลบคลาวด์ไม่สำเร็จ ต้องไม่ล้างเครื่องและต้องบอกว่าไม่มีอะไรถูกลบ
 *    3. บอกความจริงว่าเกิดอะไรขึ้น ไม่ใช่ขึ้นว่า "ลบแล้ว" ลอยๆ
 */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  /** เปิดแอปที่ล็อกอินแล้ว พร้อมข้อมูลจำลอง
   *  failDelete = ให้คำสั่งลบล้มเหลว เพื่อทดสอบทางที่พัง */
  const openApp = async (failDelete) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
    const seen = { deleted: false, rpc: false };
    await ctx.route('**/rest/v1/**', (r) => {
      const req = r.request(); const u = req.url(); const m = req.method();
      const json = (body) => r.fulfill({ status: 200, contentType: 'application/json', body });
      if (u.includes('/rpc/delete_my_account')) {
        seen.rpc = true;
        return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      if (m === 'DELETE') {
        if (failDelete) {
          return r.fulfill({
            status: 500, contentType: 'application/json',
            body: JSON.stringify({ message: 'เซิร์ฟเวอร์ปฏิเสธ' }),
          });
        }
        seen.deleted = true;
        return json('[]');
      }
      if (m === 'GET' && u.includes('/books')) {
        return json(JSON.stringify([{
          id: BOOK, owner_id: UID, display_name: 'ฉัน', full_name: '', address: '',
          conditions: [], created_at: new Date().toISOString(),
        }]));
      }
      if (m === 'GET' && u.includes('/medications')) {
        return json(JSON.stringify([
          { id: 'm1', book_id: BOOK, name: 'ยาความดัน', dose: '1 เม็ด', slots: ['morning'], created_at: new Date().toISOString() },
          { id: 'm2', book_id: BOOK, name: 'ยาไขมัน', dose: '1 เม็ด', slots: ['bedtime'], created_at: new Date().toISOString() },
        ]));
      }
      if (m === 'GET') return json('[]');
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
    // ปุ่มลบบัญชีอยู่ในชีตโปรไฟล์ ที่เดียวกับปุ่มออกจากระบบ
    await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
    await p.waitForTimeout(900);
    await p.getByRole('button', { name: /ตั้งค่าสมุด|โปรไฟล์|แก้ข้อมูลสมุด/ }).first()
      .click().catch(() => {});
    await p.waitForTimeout(900);
    return { p, ctx, seen };
  };

  console.log('\n=== 1. ปุ่มต้องหาเจอ และบอกว่าจะลบอะไรบ้าง ===');
  let { p, ctx, seen } = await openApp(false);
  const open = p.getByRole('button', { name: 'ลบบัญชีและข้อมูลทั้งหมด' });
  check('มีปุ่มลบบัญชีในแอป', await open.count() === 1);
  await open.scrollIntoViewIfNeeded();
  await open.click();
  await p.waitForTimeout(500);
  const t = await p.locator('.o-card.warn').innerText();
  check('บอกว่ากู้คืนไม่ได้', /กู้คืนไม่ได้/.test(t));
  check('นับสมุดจริง ไม่ใช่พูดลอยๆ: ' + (t.match(/สมุด \d+ เล่ม/) || ['(ไม่พบ)'])[0], /สมุด 1 เล่ม/.test(t));
  check('นับยาจริง: ' + (t.match(/ยา \d+ รายการ/) || ['(ไม่พบ)'])[0], /ยา 2 รายการ/.test(t));
  check('บอกว่าบันทึกในสมุดคนอื่นไม่ถูกลบ', /สมุดของคนอื่นจะไม่ถูกลบ/.test(t));

  console.log('\n=== 2. กดพลาดไม่ได้ — ต้องพิมพ์คำยืนยันก่อน ===');
  const del = p.getByRole('button', { name: 'ลบถาวร' });
  check('ปุ่มลบถาวรยังกดไม่ได้', !(await del.isEnabled()));
  await p.locator('#del-confirm').fill('ลบ');
  check('พิมพ์ไม่ครบ ยังกดไม่ได้', !(await del.isEnabled()));
  await p.locator('#del-confirm').fill('ลบบัญชี');
  check('พิมพ์ครบแล้วถึงกดได้', await del.isEnabled());

  console.log('\n=== 3. ลบไม่สำเร็จ ต้องไม่ล้างเครื่องและต้องบอกตามจริง ===');
  await ctx.close();
  ({ p, ctx, seen } = await openApp(true));
  await p.getByRole('button', { name: 'ลบบัญชีและข้อมูลทั้งหมด' }).click();
  await p.waitForTimeout(400);
  await p.locator('#del-confirm').fill('ลบบัญชี');
  await p.getByRole('button', { name: 'ลบถาวร' }).click();
  await p.waitForTimeout(2500);
  const failText = await p.locator('.o-card.warn').innerText();
  check('บอกว่าลบไม่สำเร็จ', /ลบไม่สำเร็จ/.test(failText));
  check('บอกว่าข้อมูลยังอยู่ครบ ไม่มีอะไรถูกลบ', /ข้อมูลยังอยู่ครบ/.test(failText));
  check('ยังอยู่ในแอป ไม่ถูกเด้งออก', await p.locator('.tabbar').count() === 1);

  console.log('\n=== 4. ลบสำเร็จ แต่ยังไม่ได้รัน SQL — ต้องพูดตรงว่าอีเมลยังอยู่ ===');
  await ctx.close();
  ({ p, ctx, seen } = await openApp(false));
  await p.getByRole('button', { name: 'ลบบัญชีและข้อมูลทั้งหมด' }).click();
  await p.waitForTimeout(400);
  await p.locator('#del-confirm').fill('ลบบัญชี');
  await p.getByRole('button', { name: 'ลบถาวร' }).click();
  await p.waitForTimeout(3000);
  const doneText = await p.locator('body').innerText();
  check('ส่งคำสั่งลบข้อมูลไปจริง', seen.deleted);
  check('เรียกฟังก์ชันลบบัญชีฝั่งฐานข้อมูลด้วย', seen.rpc);
  check('บอกว่าลบข้อมูลแล้ว', /ลบข้อมูลทั้งหมดแล้ว/.test(doneText));
  check('ไม่โกหกว่าลบอีเมลด้วย ทั้งที่ยังไม่ได้รัน SQL',
    /อีเมลที่ใช้เข้าระบบยังอยู่/.test(doneText));
  check('ออกจากระบบให้แล้ว ไม่ค้างอยู่ในแอปที่ข้อมูลหายไป',
    await p.evaluate(() => localStorage.getItem('sb-offline-test-auth-token')) === null);
  check('ไม่เด้งกลับหน้าใส่อีเมลเงียบๆ — ค้างหน้าแจ้งผลไว้ให้อ่าน',
    await p.getByRole('button', { name: 'กลับหน้าเข้าใช้งาน' }).count() === 1);
  await p.getByRole('button', { name: 'กลับหน้าเข้าใช้งาน' }).click();
  await p.waitForTimeout(900);
  check('กดแล้วถึงกลับไปหน้าเข้าใช้งาน',
    /อีเมลของคุณ|ส่งรหัสเข้าอีเมล/.test(await p.evaluate(() => document.body.innerText)));

  await ctx.close();
  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
