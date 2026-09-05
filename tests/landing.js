const { chromium } = require('../node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  for (const [label, w, h, file] of [
    ['มือถือ', 390, 844, 'shots/landing-mobile.png'],
    ['คอม', 1280, 900, 'shots/landing-desktop.png'],
  ]) {
    console.log(`\n=== ${label} ${w}x${h} ===`);
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const bad = [];
    p.on('response', (r) => { if (r.status() >= 400) bad.push(r.url()); });
    p.on('pageerror', (e) => console.log('  [error]', String(e).slice(0, 200)));
    await p.goto('http://localhost:4200/welcome/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);

    check('ไม่มีไฟล์ไหนโหลดไม่ได้' + (bad.length ? ` (${bad[0]})` : ''), bad.length === 0);
    const t = await p.evaluate(() => document.body.innerText);
    check('พาดหัวเป็นสมุดของตัวเองก่อน ไม่มัดไว้แค่พ่อแม่',
      /สมุดสุขภาพของคุณ/.test(t) && /คนที่คุณเป็นห่วง/.test(t));
    check('บอกว่าใช้จดของตัวเองอย่างเดียวก็ได้',
      /ไม่ต้องมีใครให้ดูแล/.test(t));
    check('มีเหตุผลที่ทำแอป', /ไม่ได้อยู่บ้านเดียวกับพ่อแม่/.test(t));
    check('มีรายการสิ่งที่จดได้ครบ 6', (t.match(/ยาประจำตัว|นัดหมอ|ความดันและอาการ|พบหมอและเอกสาร|ประวัติวัคซีน|บันทึกประจำวัน/g) || []).length >= 6);
    check('มีส่วนความซื่อตรง', /แอปนี้จะไม่โกหกคุณ/.test(t));
    check('เขียนเป็นสถานการณ์จริง ไม่ใช่หลักการลอยๆ',
      /จดไม่ครบ จะบอกว่าจดไม่ครบ/.test(t) && /8 มื้อที่กินไป/.test(t));
    check('อธิบายระดับการแชร์ครบสามระดับ',
      /ยังไม่แชร์/.test(t) && /เฉพาะวันนัด/.test(t) && /ทั้งหมด/.test(t));
    check('บอกว่าสมุดเป็นส่วนตัวเป็นค่าตั้งต้น', /เริ่มต้นเป็นส่วนตัวเสมอ/.test(t));
    check('อธิบายวิธีเข้ากลุ่มด้วยรหัส', /สร้างกลุ่มแล้วได้รหัส/.test(t));
    check('บอกว่าเข้ากลุ่มไม่ได้แปลว่าเปิดสมุดให้ดูอัตโนมัติ',
      /การเข้ากลุ่มไม่ได้แปลว่าเปิดสมุดให้ดูอัตโนมัติ/.test(t));
    check('มีปุ่มเข้าใช้สมุด 2 จุด',
      await p.getByRole('link', { name: 'เข้าใช้สมุด' }).count() === 2);

    // ห้ามล้นแนวนอน — กฎของโปรเจกต์
    const overflow = await p.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check('ไม่ล้นแนวนอน', !overflow);

    await p.screenshot({ path: file, fullPage: true });
    await p.close();
  }

  // ปุ่มต้องพาไปที่ตัวแอปจริง
  console.log('\n=== ปุ่มพาไปหน้าแอป ===');
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('http://localhost:4200/welcome/', { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: 'เข้าใช้สมุด' }).first().click();
  await p.waitForTimeout(2500);
  const t = await p.evaluate(() => document.body.innerText);
  check('กดแล้วไปถึงตัวแอป', /ดูโหมดตัวอย่างก่อน|ชื่อเรียกในสมุด|อีเมลของคุณ/.test(t));
  await p.close();

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
