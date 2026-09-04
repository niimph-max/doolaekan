const { chromium } = require('../node_modules/playwright-core');
const fs = require('fs');
// รูปทดสอบ 900x600 (ไม่จัตุรัส) เพื่อดูว่าตัดกลางเป็นสี่เหลี่ยมจัตุรัสจริงไหม
const mkJpeg = async (p) => {
  const png = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 600;
    const x = c.getContext('2d');
    x.fillStyle = '#3a7'; x.fillRect(0, 0, 900, 600);
    x.fillStyle = '#fff'; x.fillRect(300, 100, 300, 400);
    return c.toDataURL('image/jpeg', 0.9);
  });
  return Buffer.from(png.split(',')[1], 'base64');
};
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

  console.log('\n=== ยังไม่มีรูปโปรไฟล์ ===');
  const initials = await p.locator('.screen .ph').allInnerTexts();
  check('แสดงอักษรตัวแรกของชื่อแทนวงกลมเปล่า', initials.some((t) => t.trim().length === 1));
  console.log('  อักษรที่แสดง: ' + JSON.stringify(initials.filter((t) => t.trim())));

  const file = '/tmp/av.jpg';
  fs.writeFileSync(file, await mkJpeg(p));
  await p.getByRole('button', { name: 'โปรไฟล์ & หมอ' }).click();
  await p.waitForTimeout(600);
  const sheet = p.getByLabel('โปรไฟล์ & หมอ');
  check('มีหัวข้อรูปโปรไฟล์ในชีต', await sheet.getByText('รูปโปรไฟล์').count() > 0);
  check('มีปุ่มถ่ายรูป', await sheet.getByRole('button', { name: 'ถ่ายรูป' }).count() > 0);
  check('มีปุ่มเลือกรูป', await sheet.getByRole('button', { name: 'เลือกรูป' }).count() > 0);

  console.log('\n=== ใส่รูป 900x600 ===');
  await p.locator('input[type=file]').last().setInputFiles(file);
  await p.waitForTimeout(1500);
  const img = sheet.locator('img').first();
  check('รูปขึ้นในชีต', await img.count() > 0);
  const info = await img.evaluate((el) => ({
    w: el.naturalWidth, h: el.naturalHeight, kb: Math.round(el.src.length / 1024),
  }));
  console.log(`  ย่อเหลือ ${info.w}x${info.h} · ขนาดที่เก็บ ~${info.kb} KB`);
  check('ย่อเป็นจัตุรัส 160px', info.w === 160 && info.h === 160);
  check('เล็กพอที่จะเก็บไปกับข้อมูลสมุด (< 30 KB)', info.kb < 30);

  await sheet.getByRole('button', { name: 'เสร็จแล้ว' }).click();
  await p.waitForTimeout(600);
  check('รูปขึ้นบนการ์ดสมุดด้วย', await p.locator('.screen img[alt]').count() > 0);

  console.log('\n=== เอารูปออก ===');
  await p.getByRole('button', { name: 'โปรไฟล์ & หมอ' }).click();
  await p.waitForTimeout(500);
  await p.getByLabel('โปรไฟล์ & หมอ').getByRole('button', { name: 'เอารูปออก' }).click();
  await p.waitForTimeout(600);
  check('กลับไปเป็นอักษรตัวแรก', await p.getByLabel('โปรไฟล์ & หมอ').locator('img').count() === 0);

  await b.close();
  console.log(ok ? '\nสรุป: ผ่าน' : '\nสรุป: ตก');
  process.exit(ok ? 0 : 1);
})();
