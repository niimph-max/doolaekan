const { chromium } = require('../node_modules/playwright-core');
const UID = 'eeeeeeee-1111-2222-3333-444444444444';

/** เฝ้าดูตั้งแต่วินาทีแรกที่เปิดแอป ว่าหน้าจอสลับไปมากี่ครั้งกว่าจะนิ่ง
 *  นี่คือช่วงที่เพื่อนบอกว่า "หน้าแรกมันสั่น" */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  const FLAKY = process.env.FLAKY === '1';
  let getCount = 0;

  await ctx.route('**/rest/v1/**', async (r) => {
    if (r.request().method() === 'GET') {
      getCount += 1;
      if (FLAKY) {
        await new Promise((res) => setTimeout(res, 400 + Math.random() * 900));
        if (getCount % 3 === 0) return r.abort('failed');
      }
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, email: 'friend@x.com', aud: 'authenticated' }),
  }));

  await p.goto('http://localhost:4201/');
  await p.evaluate((uid) => localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: uid, email: 'friend@x.com', aud: 'authenticated', role: 'authenticated' },
  })), UID);

  await p.goto('http://localhost:4201/', { waitUntil: 'commit' });

  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 16000) {
    const s = await p.evaluate(() => {
      const t = document.body.innerText || '';
      if (document.querySelector('#ob-name')) return 'หน้ากรอกข้อมูล';
      if (/กำลังดึงสมุด/.test(t)) return 'ห้องรอ (กำลังดึง)';
      if (/ยังไม่เจอสมุด|ยังดึงสมุดกลับมาไม่ได้|หมดเวลาเข้าระบบ/.test(t)) return 'ห้องรอ (ให้เลือก)';
      if (/ลองใหม่อีกครั้ง|ต่อคลาวด์ไม่ได้|ดึงข้อมูลไม่สำเร็จ/.test(t)) return 'หน้าแจ้งพัง';
      if (/รหัส|อีเมล|เข้าสู่ระบบ/.test(t)) return 'หน้าเข้าระบบ';
      if (document.querySelector('.tabbar')) return 'หน้าแอปปกติ';
      return 'โลโก้/ว่าง';
    }).catch(() => '(อ่านไม่ได้)');
    const ms = Date.now() - t0;
    if (!seen.length || seen[seen.length - 1].s !== s) seen.push({ ms, s });
    await p.waitForTimeout(150);
  }

  console.log('\n  เวลา(วินาที) | หน้าที่ผู้ใช้เห็น');
  for (const x of seen) console.log(`     ${(x.ms / 1000).toFixed(1).padStart(5)}     | ${x.s}`);
  console.log(`\n  สลับหน้าทั้งหมด ${seen.length - 1} ครั้งใน 16 วินาที`);
  console.log(`  ยิงคำขออ่านข้อมูล ${getCount} ครั้ง`);

  const flips = seen.length - 1;
  console.log('\n' + (flips <= 2 ? '✅ สลับไม่เกิน 2 ครั้ง ถือว่านิ่ง' : '❌ สลับหลายครั้ง = ที่ผู้ใช้เห็นว่าสั่น'));
  await b.close();
  process.exit(flips <= 2 ? 0 : 1);
})();
