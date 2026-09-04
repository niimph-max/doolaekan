const { chromium } = require('../node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(600);

  // ชื่อสมุดที่กำลังดูอยู่ตอนนี้
  const h2 = await p.locator('.screen h2').first().innerText();
  console.log('  หน้าแรก: ' + h2);

  for (const tab of ['หน้าหลัก', 'ยา', 'นัดหมอ', 'กิจกรรม', 'สมุด']) {
    await p.locator('.tabbar button', { hasText: tab }).click();
    await p.waitForTimeout(400);
    const k = (await p.locator('.screen .kicker').first().innerText()).trim();
    check(`แท็บ ${tab} → "${k}"`, /^Doolaekan · .+/i.test(k));
  }

  // สลับสมุด แล้วบรรทัดบนต้องเปลี่ยนตาม
  await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
  await p.waitForTimeout(500);
  const before = (await p.locator('.screen .kicker').first().innerText()).trim();
  await p.locator('.screen button').filter({ hasText: 'นัด หมอหัวใจ 20 วัน' }).first().click();
  await p.waitForTimeout(700);
  const after = (await p.locator('.screen .kicker').first().innerText()).trim();
  check(`สลับสมุดแล้วชื่อเปลี่ยนตาม: "${before}" → "${after}"`,
    /แม่/.test(after) && after !== before);

  // สลับสมุดแล้วไปแท็บอื่น ชื่อต้องยังตามไปด้วยทุกแท็บ
  for (const tab of ['หน้าหลัก', 'ยา', 'นัดหมอ', 'กิจกรรม']) {
    await p.locator('.tabbar button', { hasText: tab }).click();
    await p.waitForTimeout(350);
    const k = (await p.locator('.screen .kicker').first().innerText()).trim();
    check(`แท็บ ${tab} ตามสมุดที่เลือก → "${k}"`, /แม่/.test(k));
  }
  await b.close();
  process.exit(ok ? 0 : 1);
})();
