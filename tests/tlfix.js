const { chromium } = require('../node_modules/playwright-core');

/** แก้และลบบันทึกในไทม์ไลน์สุขภาพ
 *
 *  เกิดขึ้นจริงแล้ว: คนในบ้านเปิดสมุดค้างไว้เล่มหนึ่ง แล้วจดความดันของตัวเอง
 *  ลงไปในสมุดนั้น กว่าจะรู้ตัวก็บันทึกไปแล้ว และไม่มีทางเอาออก ค่าที่ผิดจึงอยู่
 *  ในไทม์ไลน์ของอีกคนตลอดไป ปนกับค่าจริงจนกราฟความดันเพี้ยนตาม
 *
 *  ที่ต้องพิสูจน์
 *    1. แก้ค่าความดันที่จดผิดได้ และหัวข้อต้องเปลี่ยนตามตัวเลขใหม่
 *    2. แก้จากค่าสูงเป็นค่าปกติแล้ว คำว่า "สูงกว่าเกณฑ์" ต้องหายไปด้วย
 *       ไม่ใช่ค้างอยู่บอกว่าน่ากังวลทั้งที่แก้ไปแล้ว
 *    3. บันทึกชนิดอื่น (อาการ/เอกสาร) แก้หัวข้อกับรายละเอียดได้
 *    4. ลบต้องถามก่อน กดไม่ลบแล้วของยังอยู่
 *    5. ลบแล้วหายจริง และบันทึกอื่นไม่หายตาม
 */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  const goBook = async () => {
    await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
    await p.waitForTimeout(800);
  };
  /** การ์ดในไทม์ไลน์ที่มีข้อความนี้ */
  const card = (text) => p.locator('.tl-item .o-card').filter({ hasText: text }).first();
  /** ชิปกรองของไทม์ไลน์
   *  ห้ามใช้ p.locator('.o-chip', {hasText:'ทั้งหมด'}).first() เด็ดขาด — ในหน้านี้
   *  มีชิปคำว่า "ทั้งหมด" สองที่ และตัวแรกคือ "สิทธิ์การเห็น" ของสมุด
   *  กดผิดคือไปเปลี่ยนระดับการแชร์ของจริง ไม่ใช่แค่กรองรายการ */
  const filterChip = (label) =>
    p.locator('.o-chips').last().locator('.o-chip', { hasText: label });

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(700);
  await goBook();

  console.log('\n=== 1. ทุกบันทึกในไทม์ไลน์ต้องมีทางแก้ ===');
  const first = p.locator('.tl-item .o-card').first();
  check('มีปุ่มแก้ไข', await first.getByRole('button', { name: 'แก้ไข' }).count() === 1);
  check('มีปุ่มลบ', await first.getByRole('button', { name: 'ลบ', exact: true }).count() === 1);

  console.log('\n=== 2. แก้ค่าความดันที่จดผิด ===');
  await filterChip('ความดัน').click();
  await p.waitForTimeout(500);
  const high = card('142/84');
  check('เจอค่าที่จดไว้ว่าสูงกว่าเกณฑ์', await high.count() === 1);
  check('ตอนนี้ยังบอกว่าสูงกว่าเกณฑ์', /สูงกว่าเกณฑ์/.test(await high.innerText()));

  await high.getByRole('button', { name: 'แก้ไข' }).click();
  await p.waitForTimeout(400);
  check('เปิดมาพร้อมค่าเดิม', await high.locator('input').first().inputValue() === '142');

  await high.locator('input').nth(0).fill('124');
  await high.locator('input').nth(1).fill('78');
  await high.getByRole('button', { name: 'บันทึก' }).click();
  await p.waitForTimeout(800);

  const list = await p.locator('.screen').innerText();
  check('หัวข้อเปลี่ยนตามตัวเลขใหม่', /ความดัน 124\/78/.test(list));
  check('ค่าที่ผิดไม่เหลืออยู่', !/142\/84/.test(list));
  check('คำว่า "สูงกว่าเกณฑ์" หายไปด้วย เพราะไม่สูงแล้ว',
    !/สูงกว่าเกณฑ์/.test(await card('124/78').innerText()));

  console.log('\n=== 3. บันทึกชนิดอื่นแก้หัวข้อและรายละเอียดได้ ===');
  await filterChip('อาการ').click();
  await p.waitForTimeout(500);
  const sym = card('เวียนหัว');
  check('เจอบันทึกอาการ', await sym.count() === 1);
  await sym.getByRole('button', { name: 'แก้ไข' }).click();
  await p.waitForTimeout(400);
  await sym.locator('input').first().fill('อาการ: เวียนหัวตอนลุกเร็ว');
  await sym.locator('textarea').fill('เป็นเฉพาะตอนลุกจากเตียง');
  await sym.getByRole('button', { name: 'บันทึก' }).click();
  await p.waitForTimeout(800);
  const after = await p.locator('.screen').innerText();
  check('หัวข้อใหม่ขึ้นแทนของเดิม', /เวียนหัวตอนลุกเร็ว/.test(after));
  check('รายละเอียดใหม่ขึ้นด้วย', /เป็นเฉพาะตอนลุกจากเตียง/.test(after));

  console.log('\n=== 4. ลบต้องถามก่อน ===');
  const target = card('เวียนหัวตอนลุกเร็ว');
  await target.getByRole('button', { name: 'ลบ', exact: true }).click();
  await p.waitForTimeout(400);
  check('ถามก่อนลบ ไม่ลบทันที', /ลบบันทึกนี้\?/.test(await target.innerText()));
  await target.getByRole('button', { name: 'ไม่ลบ' }).click();
  await p.waitForTimeout(500);
  check('กดไม่ลบแล้วของยังอยู่',
    /เวียนหัวตอนลุกเร็ว/.test(await p.locator('.screen').innerText()));

  console.log('\n=== 5. ลบแล้วหายจริง และของอื่นไม่หายตาม ===');
  await filterChip('ทั้งหมด').click();
  await p.waitForTimeout(500);
  const before = await p.locator('.tl-item').count();
  const doomed = card('เวียนหัวตอนลุกเร็ว');
  await doomed.getByRole('button', { name: 'ลบ', exact: true }).click();
  await p.waitForTimeout(300);
  await doomed.getByRole('button', { name: 'ลบ', exact: true }).click();
  await p.waitForTimeout(900);
  const now = await p.locator('.screen').innerText();
  check('บันทึกที่ลบหายไปจริง', !/เวียนหัวตอนลุกเร็ว/.test(now));
  check('หายไปใบเดียว ไม่ลากใบอื่นไปด้วย',
    await p.locator('.tl-item').count() === before - 1);
  check('ค่าความดันที่แก้ไว้ยังอยู่', /ความดัน 124\/78/.test(now));
  check('บันทึกเก่าที่ไม่เกี่ยวกันยังอยู่', /ผลตรวจเลือด/.test(now));

  console.log('\n=== 6. ปิดแอปเปิดใหม่แล้วต้องยังเป็นค่าที่แก้ไว้ ===');
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await goBook();
  const reopened = await p.locator('.screen').innerText();
  check('ค่าที่แก้ไว้ยังอยู่หลังเปิดใหม่', /ความดัน 124\/78/.test(reopened));
  check('ของที่ลบไปไม่กลับมา', !/เวียนหัวตอนลุกเร็ว/.test(reopened));

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
