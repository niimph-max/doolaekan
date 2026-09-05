const { chromium } = require('../node_modules/playwright-core');

/** ตัวกู้ตอนแอปไม่เริ่มทำงาน
 *
 *  วันย้ายโดเมน ทุกเครื่องค้างที่ "กำลังเปิดสมุด…" เพราะไฟล์ js ตอบ 404 หมด
 *  React ไม่เคยเริ่ม โค้ดที่คอยอัปเดต service worker จึงไม่ได้ทำงานตามไปด้วย
 *  ตัวเก่าค้างเสิร์ฟหน้าเก่าตลอดกาล ต้องเดินไปล้างทีละเครื่องด้วยมือ
 *
 *  ต้องพิสูจน์สองด้าน และด้านที่สองสำคัญกว่า
 *    1. แอปตายจริง → ล้าง service worker + แคช แล้วโหลดใหม่ให้เอง
 *       กู้แล้วยังไม่ขึ้น → บอกตามตรง ไม่ใช่วนล้างวนโหลดให้ดูเหมือนกำลังโหลด
 *    2. แอปปกติดี → ห้ามแตะอะไรทั้งนั้น การล้างแคชเครื่องที่ใช้งานได้อยู่
 *       คือทำให้แย่ลงเปล่าๆ
 */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  console.log('\n=== 1. แอปปกติ — ห้ามกู้ ห้ามล้างอะไรทั้งสิ้น ===');
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    // นับด้วย event 'load' ไม่ใช่ 'framenavigated' — ตัวหลังยิงสองครั้งต่อการเปิด
    // หน้าเดียวใน Chromium (คอมมิตหน้าใหม่ + สลับ document) จะนับเป็นโหลดซ้ำทั้งที่ไม่ได้ซ้ำ
    let loads = 0;
    p.on('load', () => { loads += 1; });

    await p.goto('http://localhost:4200/');
    await p.waitForTimeout(12000);   // เลยเวลาที่ตัวกู้จะทำงาน (8 วิ) ไปแล้ว

    check('แอปเริ่มทำงาน ปักธงไว้ให้ตัวกู้เห็น',
      await p.evaluate(() => Boolean(window.__doolaekanStarted)));
    check('ไม่มีการโหลดหน้าใหม่ซ้ำ', loads === 1);
    check('ไม่ได้ทิ้งรอยว่าเคยกู้', await p.evaluate(() => {
      try { return sessionStorage.getItem('doolaekan-rescue') === null; } catch { return true; }
    }));
    check('ไม่ได้ไปล้าง service worker ของเครื่องที่ปกติดี',
      (await p.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))) > 0);
    check('ยังเห็นแอปตามปกติ ไม่ใช่หน้าแจ้งว่าเปิดไม่สำเร็จ',
      !/เปิดแอปไม่สำเร็จ/.test(await p.locator('body').innerText()));
    await ctx.close();
  }

  console.log('\n=== 2. แอปตายสนิท — ต้องล้างของเก่าแล้วโหลดใหม่ให้เอง ===');
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();

    // เปิดแบบปกติก่อน ให้ service worker กับแคชได้ติดตั้งจริง
    await p.goto('http://localhost:4200/');
    await p.waitForTimeout(4000);
    const before = await p.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
    check('ตั้งต้นด้วยเครื่องที่มี service worker ติดตั้งอยู่จริง', before > 0);

    // ตัดไฟล์ js ทิ้ง = อาการเดียวกับวันย้ายโดเมนเป๊ะๆ React ไม่มีวันเริ่ม
    await ctx.route('**/_next/**', (r) => r.fulfill({ status: 404, body: '' }));

    let loads = 0;
    p.on('load', () => { loads += 1; });
    await p.goto('http://localhost:4200/', { waitUntil: 'commit' });
    await p.waitForTimeout(3000);
    check('ยังค้างอยู่ที่หน้ารอ ยังไม่มีใครมากู้ (ยังไม่ถึง 8 วินาที)',
      await p.locator('[data-boot-splash]').count() === 1);

    await p.waitForTimeout(9000);    // ครบ 8 วิ + เวลาล้าง + โหลดใหม่
    check('โหลดหน้าใหม่ให้เองแล้ว', loads >= 2);
    check('ล้าง service worker ตัวที่ค้างทิ้งแล้ว',
      await p.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)) === 0);
    check('ล้างแคชของเก่าทิ้งด้วย',
      await p.evaluate(() => caches.keys().then((k) => k.length)) === 0);

    console.log('\n=== 3. กู้แล้วยังไม่ขึ้น — ต้องบอกตามตรง ไม่ใช่วนกู้ไม่รู้จบ ===');
    await p.waitForTimeout(10000);   // รอบสองครบ 8 วิ
    const t = await p.locator('body').innerText();
    check('บอกว่าเปิดแอปไม่สำเร็จ', /เปิดแอปไม่สำเร็จ/.test(t));
    check('บอกตรงๆ ว่าไม่ได้ติดที่ของเก่าค้าง', /ไม่ได้ติดที่ของเก่าค้าง/.test(t));
    check('บอกว่าข้อมูลยังอยู่ครบ', /ข้อมูลที่บันทึกไว้ยังอยู่ครบ/.test(t));
    check('มีปุ่มให้ลองใหม่', await p.getByRole('button', { name: 'ลองใหม่อีกครั้ง' }).count() === 1);
    const loadsBefore = loads;
    await p.waitForTimeout(10000);
    check('ไม่วนโหลดหน้าใหม่ไปเรื่อยๆ', loads === loadsBefore);
    await ctx.close();
  }

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
