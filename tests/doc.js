const { chromium } = require('../node_modules/playwright-core');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'สมุด', exact: true }).click();
  await p.waitForTimeout(500);

  console.log('\n=== การ์ดสมุด: เอาตัวเลขที่เดาเอาเองออก ===');
  const cards = (await p.locator('.screen .o-card').allInnerTexts()).join(' | ');
  check('ไม่มี "ยังไม่กินยา N มื้อ" แล้ว', !/ยังไม่กินยา \d+ มื้อ/.test(cards));
  console.log('  สรุปบนการ์ด: ' + (cards.match(/(กินยาครบแล้ววันนี้|ยา \d+ มื้อวันนี้)[^|]*/) || ['(ไม่พบ)'])[0].trim());

  // เตรียมรูปสองแผ่น
  for (const [n, color] of [[1, '#c33'], [2, '#39c']]) {
    const d = await p.evaluate((c) => {
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 560;
      const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 400, 560);
      return cv.toDataURL('image/jpeg', 0.8);
    }, color);
    fs.writeFileSync(`/tmp/doc${n}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
  }

  console.log('\n=== เก็บผลตรวจเลือดย้อนหลัง 2 แผ่น ===');
  await p.getByRole('button', { name: 'พบหมอ / เอกสาร' }).click();
  await p.waitForTimeout(600);
  const sheet = p.locator('.sheet');

  // ── ยังไม่กรอกอะไรเลย = บอกว่าขาดอะไร (รูปไม่ใช่ของบังคับแล้ว) ──
  check('ยังไม่กรอกอะไร บอกว่าต้องมีอย่างน้อยหนึ่งอย่าง',
    /อย่างน้อยหนึ่งอย่าง/.test(await sheet.innerText()));

  // ── ใส่รูปแล้วต้องกดเก็บได้ทันที ไม่ต้องตั้งชื่อก่อน ──
  await sheet.locator('input[type=file]').last().setInputFiles(['/tmp/doc1.jpg']);
  await p.waitForTimeout(900);
  check('ใส่รูปแล้วกดเก็บได้เลย ไม่บังคับตั้งชื่อ',
    await sheet.getByRole('button', { name: 'บันทึก', exact: true }).isEnabled());

  // ── รูปที่ใส่ไว้ต้องไม่หายเพราะเผลอปิด ──
  await sheet.getByRole('button', { name: 'ยกเลิก' }).click();
  await p.waitForTimeout(400);
  check('กดยกเลิกแล้วถามก่อน ไม่ทิ้งทันที', /ทิ้งรูป 1 แผ่น/.test(await sheet.innerText()));
  await sheet.getByRole('button', { name: 'ปิดไว้ก่อน ของยังอยู่' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'พบหมอ / เอกสาร' }).click();
  await p.waitForTimeout(600);
  check('เปิดกลับมา รูปยังอยู่', (await sheet.getByText(/แผ่นที่ 1/).count()) > 0);
  await sheet.getByRole('button', { name: 'เอาออก' }).click();
  await p.waitForTimeout(400);
  check('มีให้เลือกประเภท ผลตรวจเลือด', await sheet.getByRole('button', { name: 'ผลตรวจเลือด' }).count() > 0);
  check('มีให้เลือกประเภท ผลตรวจตา', await sheet.getByRole('button', { name: 'ผลตรวจตา' }).count() > 0);
  await sheet.getByRole('button', { name: 'ผลตรวจเลือด' }).click();

  const dateInput = sheet.locator('#doc-date');
  check('ตั้งวันที่ของเอกสารเองได้', await dateInput.count() > 0);
  await dateInput.fill('2026-05-14');           // ย้อนหลังไปสามเดือน
  await sheet.locator('#doc-note').fill('หมอบอกไขมันลดลง');

  await sheet.locator('input[type=file]').last().setInputFiles(['/tmp/doc1.jpg', '/tmp/doc2.jpg']);
  await p.waitForTimeout(1200);
  check('เลือกทีเดียวได้หลายแผ่น', (await sheet.getByText(/แผ่นที่ \d/).count()) === 2);

  await sheet.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await p.waitForTimeout(900);

  console.log('\n=== ผลลัพธ์ในไทม์ไลน์ ===');
  await p.getByRole('button', { name: 'พบหมอ/เอกสาร', exact: true }).click();
  await p.waitForTimeout(600);
  const tl = await p.locator('.tl-item').allInnerTexts();
  const mine = tl.filter((t) => /ผลตรวจเลือด \(แผ่น/.test(t));
  check('เก็บครบสองแผ่น ชื่อบอกลำดับแผ่น', mine.length === 2);
  check('ลงวันที่ตามใบจริง ไม่ใช่วันนี้', mine.every((t) => /14 พ\.ค\.|พ\.ค\. 2569/.test(t)));
  check('เก็บโน้ตไว้ด้วย', mine.some((t) => /ไขมันลดลง/.test(t)));
  console.log('  รายการแรก: ' + (mine[0] || '(ไม่พบ)').replace(/\n/g, ' | ').slice(0, 110));

  await b.close();
  console.log(ok ? '\nสรุป: ผ่าน' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
