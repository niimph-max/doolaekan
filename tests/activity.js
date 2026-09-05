const { chromium } = require('../node_modules/playwright-core');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  let ok = true;
  const chip = (root, name) => root.locator('.o-chip').filter({ hasText: new RegExp(`^${name}$`) });
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(600);

  console.log('\n=== 1. มีแท็บกิจกรรม และเปิดได้ ===');
  const tabs = await p.locator('.tabbar button').allInnerTexts();
  check('แท็บครบ 5 อัน: ' + tabs.join(' / '), tabs.length === 5 && tabs.some((t) => /กิจกรรม/.test(t)));
  await p.locator('.tabbar button', { hasText: 'กิจกรรม' }).click();
  await p.waitForTimeout(400);
  check('ยังไม่มีบันทึก บอกว่าให้แตะจดครั้งแรก',
    /ยังไม่มีบันทึก/.test(await p.locator('.screen').innerText()));

  // ตัวหนังสือแท็บต้องไม่ล้นออกนอกช่องเมื่อมี 5 อัน
  const overflow = await p.locator('.tabbar').evaluate((nav) =>
    Array.from(nav.querySelectorAll('button')).some((x) => x.scrollWidth > x.clientWidth + 1));
  check('ชื่อแท็บไม่ล้นออกนอกช่อง', !overflow);

  console.log('\n=== 2. จดยิมแบบพิมพ์อิสระ (รูปแบบจริงของผู้ใช้) ===');
  const WORKOUT = `ท่า 1
Leg press 85.7 ชิด 12-* 3 / ห่าง 12*3
ท่า 2
Lat pulldown 25 kg *12*3
3 converging chest press 13.3*12*3`;
  await p.getByRole('button', { name: 'จดบันทึกวันนี้' }).click();
  await p.waitForTimeout(500);
  let sheet = p.locator('.sheet');
  await chip(sheet, 'ยิม').click();
  await sheet.locator('#act-min').fill('60');
  await sheet.locator('#act-note').fill(WORKOUT);
  check('ปุ่มจดกดได้', await sheet.getByRole('button', { name: 'จดไว้', exact: true }).isEnabled());
  await sheet.getByRole('button', { name: 'จดไว้', exact: true }).click();
  await p.waitForTimeout(700);

  const screen = await p.locator('.screen').innerText();
  check('ขึ้นในบันทึกวันนี้', /วันนี้/.test(screen) && /ยิม/.test(screen));
  check('เก็บข้อความไว้ครบทุกบรรทัด', /Leg press 85.7/.test(screen) && /converging chest press/.test(screen));
  check('สรุปนาทีของวัน', /ออกกำลังกาย 60 นาที/.test(screen));

  console.log('\n=== 3. ครั้งหน้า: ไม่ต้องพิมพ์เอง เลือกเครื่องแล้วเติมให้ ===');
  await p.getByRole('button', { name: 'จดบันทึกวันนี้' }).click();
  await p.waitForTimeout(500);
  sheet = p.locator('.sheet');

  const opts = await sheet.locator('#act-eq-list option').evaluateAll((n) => n.map((x) => x.value));
  check('เดาชื่อเครื่องจากที่เคยจด: ' + opts.join(' / '),
    opts.includes('Leg press') && opts.includes('Lat pulldown'));
  check('ไม่เอาหัวข้อ "ท่า 1" มาเป็นชื่อเครื่อง', !opts.some((o) => /ท่า/.test(o)));

  await chip(sheet, 'Leg press').click();
  await p.waitForTimeout(300);
  check('แตะเครื่องแล้วเติมน้ำหนักครั้งก่อนให้เลย ไม่ต้องพิมพ์',
    (await sheet.locator('#act-w').inputValue()) === '85.7');
  check('บอกด้วยว่าครั้งก่อนจดอะไรไว้',
    /ครั้งก่อน .*Leg press 85\.7 ชิด 12-\* 3 \/ ห่าง 12\*3/.test(await sheet.innerText()));

  // แก้เป็นน้ำหนักใหม่แล้วกดเพิ่ม
  await sheet.locator('#act-w').fill('88');
  await sheet.locator('#act-r').fill('12');
  await sheet.locator('#act-s').fill('3');
  await sheet.getByRole('button', { name: 'เพิ่มลงบันทึก' }).click();
  await p.waitForTimeout(300);
  check('ต่อบรรทัดลงช่องข้อความให้เอง',
    (await sheet.locator('#act-note').inputValue()).trim() === 'Leg press 88 12*3');
  check('ล้างช่องให้พร้อมเครื่องถัดไป',
    (await sheet.locator('#act-eq').inputValue()) === ''
    && (await sheet.locator('#act-w').inputValue()) === '');

  // เครื่องที่สอง ต่อบรรทัดไม่ทับของเดิม
  await sheet.locator('#act-eq').fill('Lat pulldown');
  await p.waitForTimeout(300);
  check('พิมพ์ชื่อเองก็เติมน้ำหนักครั้งก่อนให้',
    (await sheet.locator('#act-w').inputValue()) === '25');
  await sheet.locator('#act-r').fill('12');
  await sheet.locator('#act-s').fill('3');
  await sheet.getByRole('button', { name: 'เพิ่มลงบันทึก' }).click();
  await p.waitForTimeout(300);
  check('เครื่องที่สองต่อบรรทัดใหม่ ไม่ทับของเดิม',
    (await sheet.locator('#act-note').inputValue()) === 'Leg press 88 12*3\nLat pulldown 25 12*3');

  // เครื่องใหม่ที่ไม่เคยจด ต้องไม่แกล้งเติมน้ำหนักมั่ว
  await sheet.locator('#act-eq').fill('เครื่องที่ไม่เคยใช้');
  await p.waitForTimeout(300);
  check('เครื่องที่ยังไม่เคยจด บอกตรงๆ ว่าไม่มี',
    /ยังไม่เคยจดเครื่องนี้ไว้/.test(await sheet.innerText()));
  check('เครื่องใหม่ ไม่แกล้งเติมน้ำหนักของเครื่องอื่น',
    (await sheet.locator('#act-w').inputValue()) === '');
  await sheet.locator('#act-eq').fill('');
  await sheet.locator('#act-note').fill('Leg press 85.7 ชิด 12*3');

  console.log('\n=== 4. ปิดชีตแล้วของที่พิมพ์ไว้ต้องไม่หาย ===');
  await p.locator('.sheet button[aria-label], .backdrop').first().click({ force: true }).catch(() => {});
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  let body = await p.locator('body').innerText();
  check('ถามก่อนทิ้ง ไม่ทิ้งทันที', /ทิ้งที่จดไว้\?/.test(body));
  await p.getByRole('button', { name: 'ปิดไว้ก่อน ของยังอยู่' }).click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'จดบันทึกวันนี้' }).click();
  await p.waitForTimeout(500);
  sheet = p.locator('.sheet');
  check('เปิดกลับมา ข้อความยังอยู่',
    (await sheet.locator('#act-note').inputValue()).includes('Leg press 85.7'));
  check('ยังพิมพ์แก้เองได้อิสระ ไม่ใช่ฟอร์มตายตัว',
    await sheet.locator('#act-note').isEditable());

  console.log('\n=== 5. อาหาร: รูปเป็นหลัก แคลไม่บังคับ ===');
  await chip(sheet, 'อาหาร').click();
  await p.waitForTimeout(300);
  check('ช่องแคลบอกว่าไม่ใส่ก็ได้', /แคลอรี่ \(ไม่ใส่ก็ได้\)/.test(await sheet.innerText()));

  // รูปอาหารสองใบ
  for (const [n, color] of [[1, '#e8a'], [2, '#7b5']]) {
    const d = await p.evaluate((c) => {
      const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1200;
      const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1600, 1200);
      return cv.toDataURL('image/jpeg', 0.9);
    }, color);
    fs.writeFileSync(`/tmp/food${n}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
  }
  await chip(sheet, 'กลางวัน').click();
  await sheet.locator('#act-note').fill('ข้าวมันไก่ ไม่กินหนัง');
  // ตั้งแต่คุมพื้นที่เก็บรูป บันทึกประจำวันใส่ได้รูปเดียว (ดู photolimit.js)
  await sheet.locator('input[type=file]').last().setInputFiles(['/tmp/food1.jpg']);
  await p.waitForTimeout(1500);
  check('ใส่รูปได้', (await sheet.locator('img[alt^="รูปที่"]').count()) === 1);
  await sheet.getByRole('button', { name: 'จดไว้', exact: true }).click();
  await p.waitForTimeout(800);

  body = await p.locator('.screen').innerText();
  check('อาหารขึ้นในบันทึก', /มื้อกลางวัน/.test(body) && /ข้าวมันไก่/.test(body));
  check('มื้อเดียว = การ์ดเดียว ไม่แตกเป็นหลายรายการ',
    (body.match(/มื้อกลางวัน/g) || []).length === 1);
  check('รูปย่อเป็นแถวเล็ก ไม่กินเต็มความกว้างจอ',
    await p.locator('.screen .o-card img').first().evaluate((i) => i.clientWidth <= 140));
  check('ไม่กรอกแคล = ไม่โผล่ยอดแคลปลอม', !/แคล/.test(body.split('วันนี้')[1] || body));

  console.log('\n=== 6. ยอดแคลต้องไม่โกหกเมื่อกรอกบ้างไม่กรอกบ้าง ===');
  await p.getByRole('button', { name: 'จดบันทึกวันนี้' }).click();
  await p.waitForTimeout(500);
  sheet = p.locator('.sheet');
  await chip(sheet, 'อาหาร').click();
  await p.waitForTimeout(200);
  await chip(sheet, 'เย็น').click();
  await sheet.locator('#act-kcal').fill('450');
  await sheet.locator('#act-note').fill('ก๋วยเตี๋ยว');
  await sheet.getByRole('button', { name: 'จดไว้', exact: true }).click();
  await p.waitForTimeout(700);

  body = await p.locator('.screen').innerText();
  check('ตัวเลขตรงกับจำนวนมื้อที่เห็นบนจอ (2 มื้อ ไม่ใช่ 3 แถว): ' + (body.match(/450 แคล[^\n]*/) || ['(ไม่พบ)'])[0],
    /450 แคล \(จด 1 ใน 2 รายการ\)/.test(body));

  console.log('\n=== 7. ไทม์ไลน์สุขภาพต้องไม่ถูกบันทึกประจำวันกลบ ===');
  await p.locator('.tabbar button', { hasText: 'สมุด' }).click();
  await p.waitForTimeout(600);
  const bookText = await p.locator('.screen').innerText();
  check('ยิม/อาหาร ไม่ไหลไปกองในไทม์ไลน์สุขภาพ',
    !/Leg press/.test(bookText) && !/ข้าวมันไก่/.test(bookText));

  console.log('\n=== 8. ย้อนวันได้ ===');
  await p.locator('.tabbar button', { hasText: 'กิจกรรม' }).click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'จดบันทึกวันนี้' }).click();
  await p.waitForTimeout(500);
  sheet = p.locator('.sheet');
  await chip(sheet, 'บันทึกทั่วไป').click();
  await p.waitForTimeout(200);
  const back = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  await sheet.locator('#act-date').fill(back);
  await sheet.locator('#act-note').fill('เมื่อวานซืนนอนดึก');
  await sheet.getByRole('button', { name: 'จดไว้', exact: true }).click();
  await p.waitForTimeout(700);
  const sections = await p.locator('.screen section h3').allInnerTexts();
  check('แยกเป็นคนละวัน: ' + sections.join(' | '), sections.length >= 2 && sections[0] === 'วันนี้');
  check('รายการย้อนหลังอยู่ในวันที่ถูกต้อง',
    /เมื่อวานซืนนอนดึก/.test(await p.locator('.screen section').last().innerText()));

  console.log('\n=== 9. แก้ไขบันทึกที่จดไว้แล้ว ===');
  const gymCard = p.locator('.screen .o-card').filter({ hasText: 'Leg press' }).first();
  await gymCard.getByRole('button', { name: 'แก้ไข' }).click();
  await p.waitForTimeout(600);
  sheet = p.locator('.sheet');
  check('เปิดมาเป็นหน้าแก้ไข ไม่ใช่หน้าจดใหม่', /แก้บันทึก/.test(await sheet.innerText()));
  check('เติมข้อความเดิมมาให้',
    (await sheet.locator('#act-note').inputValue()).includes('Leg press'));
  await sheet.locator('#act-note').fill('Leg press 90 12*3\nแก้แล้ว');
  await sheet.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
  await p.waitForTimeout(800);
  body = await p.locator('.screen').innerText();
  check('ข้อความใหม่ขึ้นแทนของเดิม', /Leg press 90 12\*3/.test(body) && /แก้แล้ว/.test(body));
  check('ของเดิมไม่ค้างอยู่', !/Leg press 85\.7 ชิด/.test(body));
  const exCards = await p.locator('.screen .o-card').filter({ hasText: 'Leg press' }).count();
  check('ไม่กลายเป็นบันทึกใหม่เพิ่มอีกอัน (การ์ดยิม ' + exCards + ' ใบ)', exCards === 1);

  console.log('\n=== 10. ลบบันทึก — ต้องถามก่อน และรูปในชุดต้องหายไปด้วย ===');
  const foodCard = p.locator('.screen .o-card').filter({ hasText: 'ข้าวมันไก่' }).first();
  const photosBefore = await foodCard.locator('img').count();
  await foodCard.getByRole('button', { name: 'ลบ', exact: true }).click();
  await p.waitForTimeout(300);
  check('ถามก่อนลบ ไม่ลบทันที: ' + (await foodCard.innerText()).split('\n').pop(),
    /ลบบันทึกนี้\?/.test(await foodCard.innerText()));
  check('บอกด้วยว่ารูปจะหายไปกี่ใบ',
    new RegExp(`รูป ${photosBefore} ใบจะหายไปด้วย`).test(await foodCard.innerText()));

  await foodCard.getByRole('button', { name: 'ไม่ลบ' }).click();
  await p.waitForTimeout(300);
  check('กดไม่ลบแล้วยังอยู่ครบ',
    /ข้าวมันไก่/.test(await p.locator('.screen').innerText()));

  await p.locator('.screen .o-card').filter({ hasText: 'ข้าวมันไก่' }).first()
    .getByRole('button', { name: 'ลบ', exact: true }).click();
  await p.waitForTimeout(300);
  await p.locator('.screen .o-card').filter({ hasText: 'ลบบันทึกนี้' }).first()
    .getByRole('button', { name: 'ลบ', exact: true }).click();
  await p.waitForTimeout(700);
  body = await p.locator('.screen').innerText();
  check('ลบแล้วหายไปจริง', !/ข้าวมันไก่/.test(body));
  check('ลบทั้งชุด ไม่เหลือแถวรูปค้าง', !/มื้อกลางวัน/.test(body));
  check('บันทึกอื่นไม่โดนลบตาม', /มื้อเย็น/.test(body) && /Leg press 90/.test(body));

  console.log('\n=== 11. เปิดแก้ไขค้างไว้ แล้วไปกดจดใหม่ ต้องไม่ติดของเดิมมา ===');
  await p.locator('.screen .o-card').filter({ hasText: 'Leg press' }).first()
    .getByRole('button', { name: 'แก้ไข' }).click();
  await p.waitForTimeout(500);
  sheet = p.locator('.sheet');
  await sheet.locator('#act-note').fill('กำลังแก้ค้างไว้');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'ปิดไว้ก่อน ของยังอยู่' }).click();
  await p.waitForTimeout(400);

  await p.getByRole('button', { name: 'จดบันทึกวันนี้' }).click();
  await p.waitForTimeout(500);
  sheet = p.locator('.sheet');
  check('กดจดใหม่แล้วได้ฟอร์มเปล่า ไม่ติดของที่กำลังแก้ค้างไว้',
    (await sheet.locator('#act-note').inputValue()) === '');
  check('หัวข้อกลับมาเป็นจดใหม่', /จดบันทึกวันนี้/.test(await sheet.innerText()));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);

  body = await p.locator('.screen').innerText();
  check('ของเดิมไม่ถูกแก้ไปด้วย เพราะยังไม่ได้กดบันทึก', /Leg press 90/.test(body));
  check('ไม่มีบันทึกขยะโผล่เพิ่ม', !/กำลังแก้ค้างไว้/.test(body));

  console.log('\n=== 12. ดูเฉพาะกลุ่ม ===');
  await p.locator('.tabbar button', { hasText: 'กิจกรรม' }).click();
  await p.waitForTimeout(400);
  const filters = await p.locator('.screen .o-chips .o-chip').allInnerTexts();
  check('มีตัวกรอง: ' + filters.join(' / '),
    filters.join('|') === 'ทั้งหมด|ออกกำลังกาย|อาหาร|อื่นๆ');

  await p.locator('.screen .o-chip').filter({ hasText: /^อาหาร$/ }).click();
  await p.waitForTimeout(400);
  body = await p.locator('.screen').innerText();
  check('เลือกอาหาร → เห็นแต่อาหาร', /มื้อเย็น/.test(body));
  check('เลือกอาหาร → ไม่มียิมปน', !/Leg press/.test(body));
  check('ยอดสรุปไม่โชว์นาทีออกกำลังกายตอนกรองอาหาร', !/ออกกำลังกาย \d+ นาที/.test(body));

  await p.locator('.screen .o-chip').filter({ hasText: /^ออกกำลังกาย$/ }).click();
  await p.waitForTimeout(400);
  body = await p.locator('.screen').innerText();
  check('เลือกออกกำลังกาย → เห็นแต่ยิม', /Leg press 90/.test(body) && !/มื้อเย็น/.test(body));

  await p.locator('.screen .o-chip').filter({ hasText: /^อื่นๆ$/ }).click();
  await p.waitForTimeout(400);
  body = await p.locator('.screen').innerText();
  check('เลือกอื่นๆ → เห็นแต่บันทึกทั่วไป',
    /เมื่อวานซืนนอนดึก/.test(body) && !/Leg press/.test(body) && !/มื้อเย็น/.test(body));

  await p.locator('.screen .o-chip').filter({ hasText: /^ทั้งหมด$/ }).click();
  await p.waitForTimeout(400);
  body = await p.locator('.screen').innerText();
  check('กลับมาทั้งหมด → เห็นครบทุกกลุ่ม',
    /Leg press 90/.test(body) && /มื้อเย็น/.test(body) && /เมื่อวานซืนนอนดึก/.test(body));

  await p.screenshot({ path: 'shots/activity.png', fullPage: true });
  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีข้อที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
