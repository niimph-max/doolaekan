const { chromium } = require('../node_modules/playwright-core');
const UID = 'eeeeeeee-1111-2222-3333-444444444444';

/** จำลองคีย์บอร์ดเด้ง: จอสูง 844 → เหลือ 400 ตอนคีย์บอร์ดขึ้น
 *  ของที่ต้องผ่าน: ช่องที่กำลังพิมพ์ต้องยังเลื่อนไปหาได้ และหน้าต้องเลื่อนได้จริง */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  await ctx.route('**/rest/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, email: 'friend@x.com', aud: 'authenticated' }),
  }));

  await p.goto('http://localhost:4201/');
  await p.evaluate((uid) => localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: uid, email: 'friend@x.com', aud: 'authenticated', role: 'authenticated' },
  })), UID);
  await p.goto('http://localhost:4201/', { waitUntil: 'commit' });
  await p.locator('#ob-name').waitFor({ timeout: 20000 });

  const fixed = await p.locator('#ob-name').evaluate((el) => {
    let n = el.parentElement;
    while (n && n !== document.body) {
      if (getComputedStyle(n).position === 'fixed') return n.className;
      n = n.parentElement;
    }
    return '';
  });
  check(`ช่องพิมพ์ไม่ได้อยู่ในกล่องที่ตรึงตำแหน่ง${fixed ? ' (เจอ: ' + fixed + ')' : ''}`, fixed === '');

  // คีย์บอร์ดเด้ง — จอเตี้ยลง
  await p.setViewportSize({ width: 390, height: 400 });
  await p.locator('#ob-name').focus();
  await p.waitForTimeout(400);
  await p.locator('#ob-name').fill('เพื่อน');
  await p.waitForTimeout(300);
  check('จอเตี้ยลงแล้วยังพิมพ์ได้',
    (await p.locator('#ob-name').inputValue()) === 'เพื่อน');

  const box = await p.locator('#ob-name').boundingBox();
  check(`ช่องพิมพ์ยังอยู่ในจอที่เหลือ (บน ${Math.round(box.y)}px จาก 400px)`,
    box.y >= 0 && box.y < 400);

  // หน้าต้องเลื่อนได้จริง ไม่ติดอยู่กับที่
  const scrolled = await p.evaluate(() => {
    const before = window.scrollY;
    window.scrollTo(0, 300);
    return { before, after: window.scrollY, docH: document.documentElement.scrollHeight };
  });
  check(`หน้าเลื่อนได้จริง (${scrolled.before} → ${scrolled.after}, สูงทั้งหน้า ${scrolled.docH}px)`,
    scrolled.after > scrolled.before);

  // ปุ่มขั้นถัดไปต้องกดถึงตอนจอเตี้ย
  await p.getByRole('button', { name: 'เริ่มใช้สมุดของฉัน' }).scrollIntoViewIfNeeded();
  check('ปุ่มขั้นต่อไปเลื่อนไปกดได้',
    await p.getByRole('button', { name: 'เริ่มใช้สมุดของฉัน' }).isVisible());

  // ปุ่มออกจากระบบต้องไม่ลอยทับช่องพิมพ์ตอนจอเตี้ย
  const outBtn = p.getByRole('button', { name: /ออกจากระบบ/ });
  if (await outBtn.count()) {
    const ob = await outBtn.boundingBox();
    const ib = await p.locator('#ob-name').boundingBox();
    const overlap = ob && ib && ob.y < ib.y + ib.height && ob.y + ob.height > ib.y;
    check(`ปุ่มออกจากระบบไม่ทับช่องพิมพ์ (ปุ่มอยู่ ${Math.round(ob.y)}px ช่องอยู่ ${Math.round(ib.y)}px)`,
      !overlap);
    const stillFixed = await outBtn.evaluate((el) => {
      let n = el.parentElement;
      while (n && n !== document.body) {
        if (getComputedStyle(n).position === 'fixed') return true;
        n = n.parentElement;
      }
      return false;
    });
    check('ปุ่มออกจากระบบไม่ได้ตรึงตำแหน่งแล้ว', !stillFixed);
    await outBtn.scrollIntoViewIfNeeded();
    check('เลื่อนไปกดออกจากระบบได้อยู่', await outBtn.isVisible());
  } else {
    check('หาปุ่มออกจากระบบไม่เจอ', false);
  }

  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  await p.screenshot({
    path: 'shots/keyboard.png',
    fullPage: true });

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีข้อที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
