const { chromium } = require('../node_modules/playwright-core');

/** ปุ่มที่ต้องกดบ่อย ต้องไม่ขยับหนีไปเรื่อยๆ ตามจำนวนข้อมูลที่มากขึ้น */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(600);
  await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
  await p.waitForTimeout(800);

  const btn = p.getByRole('button', { name: 'พบหมอ / เอกสาร' });
  const bb = await btn.boundingBox();
  const firstRec = await p.locator('.tl-item').first().boundingBox();
  const lastRec = await p.locator('.tl-item').last().boundingBox();
  const pageH = await p.evaluate(() => document.documentElement.scrollHeight);

  console.log(`  ปุ่มอยู่ที่ ${Math.round(bb.y)}px · บันทึกแรก ${Math.round(firstRec.y)}px`
    + ` · บันทึกสุดท้าย ${Math.round(lastRec.y)}px · หน้าสูง ${pageH}px`);

  check('ปุ่มอยู่เหนือบันทึกอันแรก', bb.y < firstRec.y);
  check('ไม่ต้องเลื่อนผ่านไทม์ไลน์ทั้งหมดกว่าจะเจอ', bb.y < lastRec.y);

  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await p.waitForTimeout(700);
  check('ยังกดเปิดชีตพบหมอ/เอกสารได้',
    /พบหมอ \/ เอกสาร/.test(await p.locator('.sheet').innerText()));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);

  await p.screenshot({
    path: 'shots/btnpos.png',
  });

  console.log('\n' + (ok ? '✅ ผ่าน' : '❌ ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
