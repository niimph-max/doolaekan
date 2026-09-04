const { chromium } = require('../node_modules/playwright-core');
const fs = require('fs');

// PDF จริงขนาดเล็กที่สุดที่เบราว์เซอร์ยอมรับ
const MINI_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n'
  + 'trailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  fs.writeFileSync('/tmp/lab.pdf', MINI_PDF);
  // ไฟล์ PDF ก้อนใหญ่ ไว้ทดสอบคำเตือนเรื่องพื้นที่
  fs.writeFileSync('/tmp/big.pdf', Buffer.concat([MINI_PDF, Buffer.alloc(4 * 1024 * 1024, 0x20)]));

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(600);
  await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
  await p.waitForTimeout(600);

  console.log('\n=== 1. ช่องเลือกไฟล์ต้องรับ PDF ===');
  await p.getByRole('button', { name: 'พบหมอ / เอกสาร' }).click();
  await p.waitForTimeout(600);
  const sheet = p.locator('.sheet');
  const accept = await sheet.locator('input[type=file]').last().getAttribute('accept');
  check('accept รับ PDF ด้วย: ' + accept, /application\/pdf/.test(accept || ''));
  check('ป้ายบอกว่าใส่ PDF ได้', /ไฟล์ PDF/.test(await sheet.innerText()));

  console.log('\n=== 2. ใส่ PDF แล้วต้องไม่แสดงเป็นรูปแตก ===');
  await sheet.locator('input[type=file]').last().setInputFiles(['/tmp/lab.pdf']);
  await p.waitForTimeout(1200);
  const t = await sheet.innerText();
  const sizeLine = (t.match(/ไฟล์ PDF · [^\n]+/) || ['(ไม่พบ)'])[0];
  check('ขึ้นว่าเป็นไฟล์ PDF พร้อมขนาด: ' + sizeLine,
    /ไฟล์ PDF · [\d.]+ (ไบต์|KB|MB)/.test(t));
  check('ไฟล์เล็กต้องไม่โม้ว่าเป็น 1 MB', !/ไฟล์ PDF · 1 MB/.test(t));
  const broken = await sheet.locator('img').evaluateAll(
    (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length);
  check('ไม่มีรูปแตกในหน้าจอ', broken === 0);
  check('ปุ่มบันทึกกดได้',
    await sheet.getByRole('button', { name: 'บันทึก', exact: true }).isEnabled());

  console.log('\n=== 3. ไฟล์ใหญ่ต้องเตือนเรื่องพื้นที่ ===');
  check('ไฟล์เล็กยังไม่เตือน', !/ใหญ่กว่า 3 MB/.test(await sheet.innerText()));
  await sheet.locator('input[type=file]').last().setInputFiles(['/tmp/big.pdf']);
  await p.waitForTimeout(1800);
  const bigText = await sheet.innerText();
  check('ใส่ไฟล์ใหญ่แล้วเตือน', /ใหญ่กว่า 3 MB/.test(bigText));
  check('บอกขนาดไฟล์ใหญ่ตามจริง: '
    + (bigText.match(/ไฟล์ PDF · [\d.]+ MB/) || ['(ไม่พบ)'])[0],
    /ไฟล์ PDF · 4\.[0-9] MB/.test(bigText));
  check('แต่ยังเก็บได้ ไม่ได้ห้าม',
    await sheet.getByRole('button', { name: 'บันทึก', exact: true }).isEnabled());

  // เอาไฟล์ใหญ่ออก เหลือแค่ใบเล็ก
  await sheet.locator('.o-card').filter({ hasText: 'แผ่นที่ 2' })
    .getByRole('button', { name: /เอาออก/ }).last().click().catch(async () => {
      await sheet.getByRole('button', { name: /เอาออก/ }).last().click();
    });
  await p.waitForTimeout(400);

  console.log('\n=== 4. เก็บแล้วขึ้นในไทม์ไลน์เป็นปุ่มเปิด ไม่ใช่รูป ===');
  await sheet.locator('#doc-title').fill('ผลตรวจเลือด').catch(() => {});
  await sheet.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await p.waitForTimeout(1200);

  const card = p.locator('.screen .o-card').filter({ hasText: /ผลตรวจเลือด|เอกสารจากหมอ/ }).first();
  check('มีปุ่มเปิดไฟล์ PDF',
    await card.getByRole('link', { name: /เปิดไฟล์ PDF/ }).count() > 0);
  const brokenAfter = await p.locator('.screen img').evaluateAll(
    (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length);
  check('ไทม์ไลน์ไม่มีรูปแตก', brokenAfter === 0);
  const href = await card.getByRole('link', { name: /เปิดไฟล์ PDF/ }).first().getAttribute('href');
  check('ลิงก์ชี้ไปที่ไฟล์ PDF จริง', /^data:application\/pdf/.test(href || ''));

  console.log('\n=== 5. รูปธรรมดายังทำงานเหมือนเดิม ===');
  const img = await p.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 300; cv.height = 400;
    const x = cv.getContext('2d'); x.fillStyle = '#8a6'; x.fillRect(0, 0, 300, 400);
    return cv.toDataURL('image/jpeg', 0.8);
  });
  fs.writeFileSync('/tmp/plain.jpg', Buffer.from(img.split(',')[1], 'base64'));
  await p.getByRole('button', { name: 'พบหมอ / เอกสาร' }).click();
  await p.waitForTimeout(600);
  const s2 = p.locator('.sheet');
  await s2.locator('input[type=file]').last().setInputFiles(['/tmp/plain.jpg']);
  await p.waitForTimeout(1000);
  check('รูปยังขึ้นเป็นรูปย่อ ไม่กลายเป็น PDF',
    await s2.locator('img').count() > 0 && !/ไฟล์ PDF/.test(
      (await s2.locator('.o-card').first().innerText())));

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีข้อที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
