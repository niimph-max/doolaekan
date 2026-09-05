const { chromium } = require('../node_modules/playwright-core');

/** หมายเหตุของนัดหมอ
 *
 *  ใบนัดจริงมีเรื่องที่ต้องจำนอกจากวันเวลาสถานที่เสมอ — งดน้ำงดอาหารกี่ชั่วโมง
 *  เอาผลเลือดใบเก่าไปด้วย จอดตึกไหน เดิมไม่มีที่ให้จด คนจึงยัดรวมในชื่อนัด
 *  แล้วชื่อบนการ์ดยาวจนอ่านไม่รู้เรื่อง
 *
 *  ที่ต้องพิสูจน์
 *    1. ไม่กรอกก็บันทึกได้ — ห้ามกลายเป็นช่องบังคับ
 *    2. กรอกแล้วต้องเห็นบนการ์ด ไม่ใช่หายเข้าไปในฐานข้อมูลเฉยๆ
 *    3. แก้ไขได้ และลบข้อความออกได้จริง
 *    4. เรื่องอย่าง "งดน้ำงดอาหาร" ต้องโผล่ที่หน้าหลักด้วย เพราะต้องรู้ตั้งแต่
 *       คืนก่อน ไม่ใช่ตอนเปิดแท็บนัดหมอ
 */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(700);

  console.log('\n=== 1. หมายเหตุที่มีอยู่ต้องเห็นบนหน้าหลักและบนการ์ด ===');
  const home = await p.locator('body').innerText();
  check('หน้าหลักโชว์หมายเหตุของนัดถัดไป', /งดน้ำงดอาหารหลังเที่ยงคืน/.test(home));

  await p.locator('.tabbar button', { hasText: 'นัดหมอ' }).click();
  await p.waitForTimeout(700);
  check('การ์ดในแท็บนัดหมอโชว์หมายเหตุ',
    /เอาผลเลือดใบเดิมไปด้วย/.test(await p.locator('body').innerText()));

  console.log('\n=== 2. ไม่กรอกหมายเหตุก็ต้องบันทึกได้ ===');
  await p.getByRole('button', { name: 'เพิ่มนัดใหม่' }).click();
  await p.waitForTimeout(600);
  await p.locator('#ap-doctor').selectOption('__other__');
  await p.waitForTimeout(300);
  await p.locator('.sheet input[placeholder*="หมอผิวหนัง"]').fill('หมอกระดูก');
  await p.locator('#ap-date').fill('2570-01-20').catch(() => {});
  await p.locator('#ap-date').fill('2027-01-20');
  const saveBtn = p.getByRole('button', { name: 'บันทึกนัด' });
  check('ปุ่มบันทึกกดได้ทั้งที่ยังไม่กรอกหมายเหตุ', await saveBtn.isEnabled());
  await saveBtn.click();
  await p.waitForTimeout(900);
  check('นัดที่ไม่มีหมายเหตุถูกบันทึก',
    /หมอกระดูก/.test(await p.locator('body').innerText()));

  console.log('\n=== 3. กรอกหมายเหตุแล้วต้องเห็นบนการ์ด ===');
  await p.getByRole('button', { name: 'เพิ่มนัดใหม่' }).click();
  await p.waitForTimeout(600);
  await p.locator('#ap-doctor').selectOption('__other__');
  await p.waitForTimeout(300);
  await p.locator('.sheet input[placeholder*="หมอผิวหนัง"]').fill('หมอผิวหนัง');
  await p.locator('#ap-date').fill('2027-02-10');
  await p.locator('#ap-note').fill('จอดตึก B ชั้น 3\nรับบัตรคิวก่อน 08:00');
  await p.getByRole('button', { name: 'บันทึกนัด' }).click();
  await p.waitForTimeout(900);
  const list = await p.locator('body').innerText();
  check('หมายเหตุที่พิมพ์ไว้ขึ้นบนการ์ด', /จอดตึก B ชั้น 3/.test(list));
  check('ขึ้นบรรทัดใหม่ตามที่พิมพ์ ไม่ถูกยุบเป็นบรรทัดเดียว', /รับบัตรคิวก่อน 08:00/.test(list));

  console.log('\n=== 4. แก้ไขและลบข้อความออกได้จริง ===');
  const card = p.locator('.o-card').filter({ hasText: 'หมอผิวหนัง' }).first();
  await card.getByRole('button', { name: 'แก้ไข' }).click();
  await p.waitForTimeout(600);
  const noteBox = card.locator('textarea');
  check('ฟอร์มแก้ไขเปิดมาพร้อมข้อความเดิม',
    (await noteBox.inputValue()).includes('จอดตึก B'));
  await noteBox.fill('เปลี่ยนเป็นตึก C');
  await card.getByRole('button', { name: 'บันทึก' }).click();
  await p.waitForTimeout(900);
  const after = await p.locator('body').innerText();
  check('แก้แล้วเห็นข้อความใหม่', /เปลี่ยนเป็นตึก C/.test(after));
  check('ข้อความเก่าหายไปแล้ว', !/จอดตึก B/.test(after));

  await card.getByRole('button', { name: 'แก้ไข' }).click();
  await p.waitForTimeout(600);
  await card.locator('textarea').fill('');
  await card.getByRole('button', { name: 'บันทึก' }).click();
  await p.waitForTimeout(900);
  check('ลบข้อความออกได้ ไม่ค้างของเดิมไว้',
    !/เปลี่ยนเป็นตึก C/.test(await p.locator('body').innerText()));

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
