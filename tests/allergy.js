const { chromium } = require('../node_modules/playwright-core');

/** ช่องแพ้ยาต้องเป็นกล่องใหญ่ ไม่ใช่บรรทัดเดียว
 *
 *  ของจริงยาวกว่าที่คิดเสมอ เพราะคนเขียนชื่อยาเต็มพร้อมอาการที่แพ้ไว้ด้วย
 *  ในช่องบรรทัดเดียวจะเห็นแค่ต้นประโยค ที่เหลือซ่อนอยู่นอกจอ คนเปิดดูจะเห็น
 *  ตัวแรกแล้วนึกว่าแพ้แค่ตัวนั้น — เข้าใจผิดที่อันตรายที่สุดที่ช่องกรอกจะทำได้
 *
 *  และเพราะการแก้นี้ไปรื้อข้างในของ DraftInput (แยกตรรกะร่างออกมาใช้ร่วมกัน)
 *  จึงต้องพิสูจน์ด้วยว่าช่องธรรมดายังบันทึกตอนออกจากช่องได้เหมือนเดิม
 *  ถ้าพังตรงนั้น ทุกช่องในชีตโปรไฟล์จะเลิกบันทึกพร้อมกันแบบเงียบๆ
 */
const LONG = 'Pioglitazone HCl 30mg. - เท้าบวม / ทีซีมัยซิน (ผื่นทั้งตัว)\nแอสไพริน (หอบ)';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  const openProfile = async () => {
    await p.getByRole('button', { name: 'โปรไฟล์ & หมอ' }).click();
    await p.waitForTimeout(600);
  };
  // ชีตปิดด้วย Escape หรือแตะพื้นหลัง — ไม่มีปุ่มปิดในตัวชีต
  const closeSheet = async () => {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
  };

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'สมุด', exact: true }).click();
  await p.waitForTimeout(500);
  await openProfile();

  console.log('\n=== 1. เป็นกล่องใหญ่จริง ไม่ใช่บรรทัดเดียว ===');
  const al = p.locator('#pf-allergy');
  check('ช่องแพ้ยาเป็น textarea', await al.evaluate((e) => e.tagName) === 'TEXTAREA');
  const hAl = (await al.boundingBox()).height;
  const hAddr = (await p.locator('#pf-addr').boundingBox()).height;
  check(`สูงกว่าช่องบรรทัดเดียวชัดเจน (แพ้ยา ${Math.round(hAl)}px · ที่อยู่ ${Math.round(hAddr)}px)`,
    hAl >= hAddr * 1.6);

  console.log('\n=== 2. ข้อความยาวต้องอ่านได้ครบ ไม่ถูกซ่อนไว้นอกจอ ===');
  await al.fill(LONG);
  await p.waitForTimeout(300);
  const fit = await al.evaluate((e) => ({
    sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight,
  }));
  check(`ไม่ล้นแนวนอน (กว้างที่ต้องใช้ ${fit.sw} · ที่มี ${fit.cw})`, fit.sw <= fit.cw + 1);
  check(`เห็นครบทุกบรรทัดโดยไม่ต้องเลื่อน (สูงที่ต้องใช้ ${fit.sh} · ที่มี ${fit.ch})`,
    fit.sh <= fit.ch + 1);

  console.log('\n=== 3. บันทึกตอนออกจากช่อง (ตรรกะร่างต้องไม่พังตอนรื้อ) ===');
  await p.locator('#pf-contact').click();     // พาโฟกัสออกจากช่อง = จังหวะที่บันทึก
  await p.waitForTimeout(500);
  await closeSheet();
  await openProfile();
  check('เปิดกลับมา ข้อความแพ้ยายังอยู่ครบทั้งสองบรรทัด',
    await p.locator('#pf-allergy').inputValue() === LONG);

  console.log('\n=== 4. ช่องบรรทัดเดียวต้องยังบันทึกได้เหมือนเดิม ===');
  await p.locator('#pf-addr').fill('99 หมู่ 2 ต.ทดสอบ');
  await p.locator('#pf-contact').click();
  await p.waitForTimeout(500);
  await closeSheet();
  await openProfile();
  check('ที่อยู่ที่เพิ่งแก้ยังอยู่', await p.locator('#pf-addr').inputValue() === '99 หมู่ 2 ต.ทดสอบ');
  await closeSheet();

  console.log('\n=== 5. ไปโผล่บนบัตรฉุกเฉินครบ และคงบรรทัดไว้ ===');
  await p.locator('.tabbar button', { hasText: 'หน้าหลัก' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: /บัตรสรุปฉุกเฉิน/ }).first().click();
  await p.waitForTimeout(700);
  const card = await p.locator('body').innerText();
  check('บัตรฉุกเฉินแสดงยาตัวแรก', /Pioglitazone/.test(card));
  check('และแสดงตัวที่สองด้วย ไม่ใช่ตัดทิ้ง', /แอสไพริน/.test(card));
  // เขียนมาสองบรรทัดต้องเห็นเป็นสองบรรทัด ไม่ใช่เชื่อมติดกันจนแยกไม่ออก
  check('คงการขึ้นบรรทัดใหม่ไว้ ยาสองตัวไม่เชื่อมติดกัน',
    /\(ผื่นทั้งตัว\)\s*\n\s*แอสไพริน/.test(card));

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีข้อที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
