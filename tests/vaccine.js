const { chromium } = require('../node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 950 } });
  let ok = true;
  const chip = (root, name) => root.locator('.o-chip').filter({ hasText: new RegExp(`^${name}$`) });
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  const card = () => p.locator('.screen .o-card').filter({ hasText: 'วัคซีนที่เคยฉีด' }).first();

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(600);
  await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
  await p.waitForTimeout(600);

  console.log('\n=== 1. มีที่อยู่ถาวรในหน้าสมุด ===');
  check('มีส่วน "วัคซีนที่เคยฉีด"', await card().count() === 1);
  check('ยังไม่มีของ บอกด้วยว่าจำได้แค่ปีก็ลงได้',
    /จำได้แค่ปีก็ลงได้/.test(await card().innerText()));

  console.log('\n=== 2. ลงเข็มที่รู้วันที่แน่นอน + กำหนดครั้งหน้า ===');
  await card().getByRole('button', { name: 'ลงเข็ม' }).click();
  await p.waitForTimeout(500);
  let sheet = p.locator('.sheet');
  await chip(sheet, 'ไข้หวัดใหญ่').click();
  await chip(sheet, 'ประจำปี').click();
  await sheet.locator('#vac-date').fill('2026-08-01');
  await sheet.locator('#vac-place').fill('รพ.พระปกเกล้า');
  await sheet.locator('#vac-next').fill('2027-08-01');
  await sheet.getByRole('button', { name: 'ลงประวัติ' }).click();
  await p.waitForTimeout(800);

  let t = await card().innerText();
  check('ขึ้นในรายการ', /ไข้หวัดใหญ่/.test(t) && /ประจำปี/.test(t));
  check('บอกที่ฉีด', /รพ\.พระปกเกล้า/.test(t));
  check('บอกกำหนดครั้งหน้า', /ครบกำหนดครั้งหน้า/.test(t));

  console.log('\n=== 3. จำได้แค่ปี ต้องไม่ถูกบังคับให้เดาวัน ===');
  await card().getByRole('button', { name: 'ลงเข็ม' }).click();
  await p.waitForTimeout(500);
  sheet = p.locator('.sheet');
  await chip(sheet, 'โควิด-19').click();
  await chip(sheet, 'จำได้แค่ปี').click();
  await p.waitForTimeout(200);
  check('เลือกแล้วมีช่องกรอกปี', await sheet.locator('#vac-year').count() === 1);
  check('ไม่บังคับให้เลือกวันที่', await sheet.locator('#vac-date').count() === 0);
  await sheet.locator('#vac-year').fill('2564');
  await sheet.getByRole('button', { name: 'ลงประวัติ' }).click();
  await p.waitForTimeout(800);

  t = await card().innerText();
  check('แสดงแค่ปี ไม่แกล้งเติมวันให้ดูแม่นเกินจริง',
    /ปี 2564/.test(t) && !/2564.*ก\.ค\./.test(t));

  console.log('\n=== 4. บาดทะยักต้องโผล่ในบัตรฉุกเฉิน ===');
  await card().getByRole('button', { name: 'ลงเข็ม' }).click();
  await p.waitForTimeout(500);
  sheet = p.locator('.sheet');
  await chip(sheet, 'บาดทะยัก').click();
  await chip(sheet, 'จำได้แค่ปี').click();
  await p.waitForTimeout(200);
  await sheet.locator('#vac-year').fill('2562');
  await sheet.getByRole('button', { name: 'ลงประวัติ' }).click();
  await p.waitForTimeout(800);

  await p.locator('.tabbar button', { hasText: 'หน้าหลัก' }).click();
  await p.waitForTimeout(500);
  const emg = p.getByRole('button', { name: /ฉุกเฉิน|บัตร/ }).first();
  if (await emg.count()) {
    await emg.click();
    await p.waitForTimeout(600);
    const body = await p.locator('body').innerText();
    check('บัตรฉุกเฉินบอกเข็มบาดทะยักล่าสุด',
      /บาดทะยักเข็มล่าสุด/.test(body) && /ปี 2562/.test(body));
    await p.getByRole('button', { name: 'ปิด', exact: true }).click();
    await p.waitForTimeout(500);
  } else {
    check('หาปุ่มบัตรฉุกเฉินไม่เจอ', false);
  }

  console.log('\n=== 5. ไม่ไปปนในไทม์ไลน์สุขภาพ ===');
  await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
  await p.waitForTimeout(600);
  const timeline = await p.locator('.screen').innerText();
  const afterTimeline = timeline.split('ไทม์ไลน์')[1] || '';
  check('ไทม์ไลน์ไม่มีวัคซีนมาซ้ำ', !/วัคซีนไข้หวัดใหญ่/.test(afterTimeline));

  console.log('\n=== 6. แก้ไขได้ ===');
  await card().getByRole('button', { name: 'แก้ไข' }).first().click();
  await p.waitForTimeout(600);
  sheet = p.locator('.sheet');
  check('เปิดมาเป็นหน้าแก้ไข', /แก้ประวัติวัคซีน/.test(await sheet.innerText()));
  await sheet.locator('#vac-place').fill('คลินิกใกล้บ้าน');
  await sheet.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
  await p.waitForTimeout(800);
  t = await card().innerText();
  check('แก้แล้วขึ้นค่าใหม่', /คลินิกใกล้บ้าน/.test(t));

  console.log('\n=== 7. กดตั้งเป็นนัดจากกำหนดครั้งหน้า ===');
  await card().getByRole('button', { name: 'ตั้งเป็นนัด' }).first().click();
  await p.waitForTimeout(800);
  sheet = p.locator('.sheet');
  const apptTitle = await sheet.locator('input[type=text], input:not([type])').first()
    .inputValue().catch(() => '');
  check('เปิดหน้าเพิ่มนัดพร้อมชื่อวัคซีน: ' + JSON.stringify(apptTitle),
    /ฉีดวัคซีน/.test(apptTitle));
  const apptDate = await sheet.locator('input[type=date]').first().inputValue();
  check('เติมวันครบกำหนดให้แล้ว: ' + apptDate, apptDate === '2027-08-01');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);

  console.log('\n=== 8. ลบต้องถามก่อน ===');
  const names = async () => (await card().innerText())
    .split('\n').filter((l) => /^(ไข้หวัดใหญ่|โควิด-19|บาดทะยัก)$/.test(l.trim()));
  const before = await names();
  await card().getByRole('button', { name: 'ลบ', exact: true }).first().click();
  await p.waitForTimeout(300);
  check('กดครั้งแรกยังไม่ลบ ถามยืนยันก่อน',
    /แน่ใจนะ\? กดอีกครั้งเพื่อลบ/.test(await card().innerText()));
  check('ระหว่างถาม ยังไม่มีอะไรหาย', (await names()).length === before.length);
  await card().getByRole('button', { name: /แน่ใจนะ/ }).click();
  await p.waitForTimeout(800);
  const after = await names();
  check(`ลบแล้วหายไปหนึ่งเข็ม (${before.join(',')} → ${after.join(',')})`,
    after.length === before.length - 1);
  check('เข็มอื่นไม่โดนลบตาม',
    after.includes('โควิด-19') && after.includes('บาดทะยัก'));

  await p.screenshot({ path: 'shots/vaccine.png', fullPage: true });
  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีข้อที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
