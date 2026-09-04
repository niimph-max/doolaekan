const { chromium } = require('../node_modules/playwright-core');

/** "พบหมอ / เอกสาร" — เดิมชื่อ "เก็บเอกสารจากหมอ" และบังคับว่าต้องมีรูป
 *
 *  ไปฉีดยามาแล้วไม่ได้กระดาษอะไรติดมือกลับมาเลยเป็นเรื่องปกติ แต่ยังเป็นเรื่อง
 *  ที่ต้องจดไว้ ถ้าบังคับให้มีรูปก่อนถึงจะกดได้ คนจะถ่ายอะไรก็ได้มาใส่ให้ผ่าน
 */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  const sheet = () => p.locator('.sheet');
  const saveBtn = () => sheet().getByRole('button', { name: 'บันทึก', exact: true });

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(700);
  await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
  await p.waitForTimeout(800);

  const open = async () => {
    await p.getByRole('button', { name: 'พบหมอ / เอกสาร' }).click();
    await p.waitForTimeout(600);
  };

  console.log('\n=== 1. ชื่อใหม่ ===');
  check('ปุ่มในหน้าสมุดชื่อ "พบหมอ / เอกสาร"',
    await p.getByRole('button', { name: 'พบหมอ / เอกสาร' }).count() > 0);
  check('ชิปกรองไทม์ไลน์ชื่อ "พบหมอ/เอกสาร"',
    await p.getByRole('button', { name: 'พบหมอ/เอกสาร', exact: true }).count() > 0);
  await open();
  check('หัวชีตชื่อ "พบหมอ / เอกสาร"', /พบหมอ \/ เอกสาร/.test(await sheet().innerText()));

  console.log('\n=== 2. เรื่องที่ไปทำมา ต้องเลือกได้ ไม่ใช่มีแต่ชนิดเอกสาร ===');
  for (const k of ['ไปหาหมอ', 'ฉีดยา', 'ทำแผล', 'กายภาพ', 'เจาะเลือด', 'รับยา']) {
    check(`มีชิป "${k}"`, await sheet().getByRole('button', { name: k, exact: true }).count() > 0);
  }
  check('ชนิดเอกสารเดิมยังอยู่',
    await sheet().getByRole('button', { name: 'ผลตรวจเลือด', exact: true }).count() > 0);

  console.log('\n=== 3. ไม่บังคับใส่รูป ===');
  check('ยังไม่กรอกอะไร ปุ่มบันทึกกดไม่ได้ และบอกว่าขาดอะไร',
    !(await saveBtn().isEnabled()) && /อย่างน้อยหนึ่งอย่าง/.test(await sheet().innerText()));
  await sheet().getByRole('button', { name: 'ฉีดยา', exact: true }).click();
  await p.waitForTimeout(300);
  check('เลือกเรื่องอย่างเดียว ไม่มีรูป ก็กดบันทึกได้', await saveBtn().isEnabled());

  await sheet().locator('#doc-date').fill('2026-08-20');
  await sheet().locator('#doc-note').fill('ฉีดที่คลินิกใกล้บ้าน แขนซ้าย');
  await saveBtn().click();
  await p.waitForTimeout(1000);

  const card = p.locator('.tl-item').filter({ hasText: 'ฉีดยา' }).first();
  check('ขึ้นในไทม์ไลน์', await card.count() > 0);
  const ct = await card.innerText();
  check('ชื่อคือ "ฉีดยา" ไม่ใช่ "เอกสารจากหมอ"',
    /ฉีดยา/.test(ct) && !/เอกสารจากหมอ/.test(ct));
  check('ลงวันที่ตามที่กรอก: ' + (ct.match(/\d+ ส\.ค\.[^\n|]*/) || ['(ไม่พบ)'])[0], /20 ส\.ค\./.test(ct));
  check('โน้ตยังอยู่', /แขนซ้าย/.test(ct));
  check('การ์ดไม่มีรูปแตก',
    await card.locator('img').evaluateAll((i) => i.filter((x) => x.complete && x.naturalWidth === 0).length) === 0);
  check('ไม่มีเลข (แผ่น 1/1) กำกับทั้งที่ไม่มีแผ่นอะไรเลย', !/แผ่น 1\/1/.test(ct));

  console.log('\n=== 4. โน้ตอย่างเดียวก็บันทึกได้ ===');
  await open();
  await sheet().locator('#doc-note').fill('หมอนัดเจาะเลือดซ้ำเดือนหน้า');
  check('พิมพ์โน้ตอย่างเดียวก็กดบันทึกได้', await saveBtn().isEnabled());
  await saveBtn().click();
  await p.waitForTimeout(1000);
  check('ขึ้นในไทม์ไลน์ว่า "พบหมอ" ตามวันที่',
    /พบหมอ 20\d\d-\d\d-\d\d/.test(await p.locator('.screen').innerText()));

  console.log('\n=== 5. ปิดชีตแล้วของยังอยู่ (ไม่มีรูปก็ต้องถามก่อน) ===');
  await open();
  await sheet().locator('#doc-note').fill('เขียนค้างไว้');
  await sheet().getByRole('button', { name: 'ยกเลิก' }).click();
  await p.waitForTimeout(500);
  check('ถามก่อนทิ้ง ทั้งที่ไม่มีรูปสักใบ', /ทิ้งที่กรอกไว้/.test(await sheet().innerText()));
  await sheet().getByRole('button', { name: 'ปิดไว้ก่อน ของยังอยู่' }).click();
  await p.waitForTimeout(500);
  await open();
  check('เปิดกลับมา ข้อความยังอยู่',
    await sheet().locator('#doc-note').inputValue() === 'เขียนค้างไว้');

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีข้อที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
