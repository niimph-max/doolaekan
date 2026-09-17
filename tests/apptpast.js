const { chromium } = require('../node_modules/playwright-core');

/** นัดที่ผ่านไปแล้วต้องไปอยู่ข้างล่าง ใต้หัวข้อของมันเอง
 *
 *  เดิมเรียงตามวันที่ล้วนๆ นัดเก่าจึงกองอยู่ข้างบนและดันนัดที่ยังไม่ถึงลงไป
 *  ทั้งที่นัดที่ยังไม่ถึงคือเหตุผลเดียวที่คนเปิดหน้านี้ และยิ่งใช้ไปนานวันยิ่งแย่
 *  เพราะจำนวนนัดที่ผ่านไปแล้วมีแต่เพิ่ม ไม่มีวันลด
 *
 *  ที่ต้องพิสูจน์
 *    1. นัดเก่าอยู่ใต้หัวข้อ "นัดที่ผ่านไปแล้ว" จริง ไม่ใช่แค่จางลง
 *    2. นัดที่ยังไม่ถึงอยู่เหนือหัวข้อนั้นทั้งหมด
 *    3. ตัวเลขบนหัวหน้าไม่นับรวมจนเข้าใจผิดว่ายังต้องไปอีกเจ็ดครั้ง
 *    4. นัดเก่ายังกดแก้ไข/ลบได้ ไม่ใช่ย้ายลงไปแล้วแตะไม่ได้
 */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };
  const top = async (loc) => (await loc.first().boundingBox())?.y ?? null;

  await p.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'ดูโหมดตัวอย่างก่อน' }).click();
  await p.waitForTimeout(700);
  await p.locator('.tabbar button', { hasText: 'นัดหมอ' }).click();
  await p.waitForTimeout(700);

  console.log('\n=== 1. ยังไม่มีนัดเก่า ก็ไม่ต้องมีหัวข้อโผล่มาเปล่าๆ ===');
  check('ไม่มีหัวข้อ "นัดที่ผ่านไปแล้ว" ตอนที่ยังไม่มีนัดเก่าสักนัด',
    await p.locator('h3', { hasText: 'นัดที่ผ่านไปแล้ว' }).count() === 0);
  check('หัวหน้าบอกว่าเป็นนัดที่จะถึง ไม่ใช่แค่ "นัด" เฉยๆ',
    /นัดที่จะถึง/.test(await p.locator('.screen').innerText()));

  console.log('\n=== 2. เพิ่มนัดที่ผ่านไปแล้ว ===');
  await p.getByRole('button', { name: 'เพิ่มนัดใหม่' }).click();
  await p.waitForTimeout(600);
  await p.locator('#ap-doctor').selectOption('__other__');
  await p.waitForTimeout(300);
  await p.locator('.sheet input[placeholder*="หมอผิวหนัง"]').fill('หมอเมื่อปีก่อน');
  await p.locator('#ap-date').fill('2026-01-15');
  await p.getByRole('button', { name: 'บันทึกนัด' }).click();
  await p.waitForTimeout(1000);

  const head = p.locator('h3', { hasText: 'นัดที่ผ่านไปแล้ว' });
  check('มีหัวข้อ "นัดที่ผ่านไปแล้ว" แล้ว', await head.count() === 1);

  const headY = await top(head);
  const oldY = await top(p.locator('.o-card').filter({ hasText: 'หมอเมื่อปีก่อน' }));
  check(`นัดเก่าอยู่ใต้หัวข้อ (หัวข้อ y=${Math.round(headY)} · การ์ด y=${Math.round(oldY)})`,
    headY !== null && oldY !== null && oldY > headY);

  for (const name of ['หมอหัวใจ — พ่อ', 'หมอตา — พ่อ']) {
    const y = await top(p.locator('.o-card').filter({ hasText: name }));
    check(`"${name}" ที่ยังไม่ถึง อยู่เหนือหัวข้อนัดเก่า`, y !== null && y < headY);
  }

  console.log('\n=== 3. ตัวเลขบนหัวหน้าต้องไม่ทำให้เข้าใจผิด ===');
  const headline = await p.locator('.screen .subtle').first().innerText();
  check(`นับนัดที่จะถึงแยกจากที่ผ่านไปแล้ว: "${headline.replace(/\n/g, ' ')}"`,
    /2 นัดที่จะถึง/.test(headline) && /ผ่านไปแล้ว 1/.test(headline));

  console.log('\n=== 4. นัดเก่ายังแตะได้ ไม่ใช่ย้ายลงไปแล้วจบ ===');
  const oldCard = p.locator('.o-card').filter({ hasText: 'หมอเมื่อปีก่อน' }).first();
  await oldCard.getByRole('button', { name: 'แก้ไข' }).click();
  await p.waitForTimeout(500);
  check('กดแก้ไขนัดเก่าได้ และมีปุ่มลบให้',
    await oldCard.getByRole('button', { name: /ลบนัดนี้/ }).count() > 0);
  check('นัดเก่าไม่แสดงขั้นตอนเตรียมตัวที่ผ่านไปแล้ว',
    !/กลับบ้าน สแกนถุงยาใหม่/.test(await oldCard.innerText()));

  console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีข้อที่ตก'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
