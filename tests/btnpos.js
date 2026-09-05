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

  console.log('\n  --- แท็บนัดหมอ ---');
  await p.locator('.tabbar button', { hasText: 'นัดหมอ' }).click();
  await p.waitForTimeout(700);
  const addAppt = p.getByRole('button', { name: 'เพิ่มนัดใหม่' });
  const ab = await addAppt.boundingBox();
  const firstAppt = await p.locator('.screen .o-card').first().boundingBox();
  const lastAppt = await p.locator('.screen .o-card').last().boundingBox();
  console.log(`  ปุ่มอยู่ที่ ${Math.round(ab.y)}px · นัดแรก ${Math.round(firstAppt.y)}px`
    + ` · นัดสุดท้าย ${Math.round(lastAppt.y)}px`);
  check('ปุ่มเพิ่มนัดอยู่เหนือนัดใบแรก', ab.y < firstAppt.y);
  check('มีปุ่มเพิ่มนัดปุ่มเดียว ไม่ได้ทิ้งของเดิมไว้ล่างจอ', await addAppt.count() === 1);

  console.log('\n  --- แท็บยา ---');
  await p.locator('.tabbar button', { hasText: 'ยา' }).click();
  await p.waitForTimeout(700);
  const scan = p.getByRole('button', { name: 'สแกนถุงยาใหม่' });
  const sb = await scan.boundingBox();
  const firstMed = await p.locator('.screen .o-card:not(.warn)').first().boundingBox();
  const lastMed = await p.locator('.screen .o-card:not(.warn)').last().boundingBox();
  console.log(`  ปุ่มอยู่ที่ ${Math.round(sb.y)}px · ยาตัวแรก ${Math.round(firstMed.y)}px`
    + ` · ยาตัวสุดท้าย ${Math.round(lastMed.y)}px`);
  check('ปุ่มสแกนถุงยาอยู่เหนือยาตัวแรก', sb.y < firstMed.y);
  check('ปุ่มพิมพ์เพิ่มยาเองก็อยู่เหนือด้วย',
    (await p.getByRole('button', { name: 'พิมพ์เพิ่มยาเอง' }).boundingBox()).y < firstMed.y);

  // คำเตือนยาซ้ำต้องไม่ถูกปุ่มดันตกจอ — ยาซ้ำข้ามหมอคือเคสที่อันตรายที่สุด
  const warn = p.locator('.screen .o-card.warn').first();
  if (await warn.count() > 0) {
    check('คำเตือนยาซ้ำยังอยู่เหนือปุ่ม', (await warn.boundingBox()).y < sb.y);
  } else {
    console.log('  · สมุดตัวอย่างนี้ไม่มีคำเตือนยาซ้ำ ข้ามข้อนั้น');
  }

  await p.screenshot({
    path: 'shots/btnpos.png',
  });

  console.log('\n' + (ok ? '✅ ผ่าน' : '❌ ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
