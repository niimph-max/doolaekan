const { chromium } = require('../node_modules/playwright-core');

/** ควบคุมพื้นที่เก็บรูป — แอปแจกฟรี ทุกไบต์คือเงินที่เจ้าของจ่ายแทนผู้ใช้
 *  1) รูปเอกสารต้องถูกย่อก่อนเก็บ (เดิมเก็บเต็มขนาด ใบละหลายเมกะไบต์)
 *  2) บันทึกประจำวันใส่ได้รูปเดียว */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  const sheet = () => p.locator('.sheet');

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(700);

  // รูปใหญ่เหมือนที่ได้จากกล้องมือถือจริง
  const big = await p.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 3000; cv.height = 4000;
    const x = cv.getContext('2d');
    for (let i = 0; i < 400; i += 1) {
      x.fillStyle = `hsl(${(i * 37) % 360} 70% ${40 + (i % 40)}%)`;
      x.fillRect((i * 97) % 3000, (i * 53) % 4000, 260, 190);
    }
    return cv.toDataURL('image/jpeg', 0.95);
  });
  const bytes = (d) => Math.round(d.length * 0.75);
  console.log(`\n  รูปต้นฉบับที่ใช้ทดสอบ ${(bytes(big) / 1024 / 1024).toFixed(2)} MB`);
  const fs = require('fs');
  fs.writeFileSync('/tmp/bigphoto.jpg', Buffer.from(big.split(',')[1], 'base64'));

  console.log('\n=== 1. รูปเอกสารต้องถูกย่อก่อนเก็บ ===');
  await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'พบหมอ / เอกสาร' }).click();
  await p.waitForTimeout(600);
  await sheet().locator('input[type=file]').last().setInputFiles(['/tmp/bigphoto.jpg']);
  await p.waitForTimeout(3000);
  const stored = await sheet().locator('img').first().getAttribute('src');
  const kb = bytes(stored) / 1024;
  console.log(`  ขนาดหลังย่อ ${kb.toFixed(0)} KB`);
  check(`ย่อแล้วจริง เล็กกว่าต้นฉบับมาก (${(bytes(big) / 1024).toFixed(0)} KB → ${kb.toFixed(0)} KB)`,
    bytes(stored) < bytes(big) * 0.4);
  check('ยังใหญ่พอให้อ่านตัวหนังสือบนเอกสาร (ด้านยาว 1600px)',
    await p.evaluate((src) => new Promise((res) => {
      const i = new Image(); i.onload = () => res(Math.max(i.width, i.height)); i.src = src;
    }), stored) === 1600);

  console.log('\n=== 2. เอกสารยังใส่ได้หลายแผ่นเหมือนเดิม ===');
  await sheet().locator('input[type=file]').last().setInputFiles(['/tmp/bigphoto.jpg']);
  await p.waitForTimeout(3000);
  check('ใส่แผ่นที่สองได้', (await sheet().getByText(/แผ่นที่ \d/).count()) === 2);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  await sheet().getByRole('button', { name: 'ทิ้งรูปทั้งหมด' }).click().catch(() => {});
  await p.waitForTimeout(500);

  console.log('\n=== 3. บันทึกประจำวันใส่ได้รูปเดียว ===');
  await p.locator('.tabbar button', { hasText: 'กิจกรรม' }).click();
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: /จดบันทึก/ }).first().click();
  await p.waitForTimeout(600);
  check('บอกไว้ตั้งแต่แรกว่าใส่ได้รูปเดียว', /ใส่ได้รูปเดียว/.test(await sheet().innerText()));
  const fileInputs = await sheet().locator('input[type=file]').count();
  const anyMultiple = await sheet().locator('input[type=file][multiple]').count();
  check(`ช่องเลือกไฟล์ไม่รับหลายไฟล์แล้ว (มี ${fileInputs} ช่อง, multiple ${anyMultiple})`, anyMultiple === 0);

  await sheet().locator('input[type=file]').last().setInputFiles(['/tmp/bigphoto.jpg']);
  await p.waitForTimeout(2500);
  check('ใส่รูปแรกได้', await sheet().locator('img').count() === 1);
  check('ปุ่มถ่ายรูปกดไม่ได้แล้ว',
    !(await sheet().getByRole('button', { name: /ถ่ายรูป/ }).isEnabled()));
  check('บอกวิธีเปลี่ยนรูป', /กดกากบาทที่รูป/.test(await sheet().innerText()));

  await sheet().getByRole('button', { name: 'เอารูปที่ 1 ออก' }).click();
  await p.waitForTimeout(400);
  check('เอารูปออกแล้วใส่ใหม่ได้', await sheet().getByRole('button', { name: /ถ่ายรูป/ }).isEnabled());

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
