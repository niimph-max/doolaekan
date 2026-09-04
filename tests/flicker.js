const { chromium } = require('../node_modules/playwright-core');
const UID = 'eeeeeeee-1111-2222-3333-444444444444';

/** จำลอง "เพื่อนเพิ่งสมัครเสร็จ กำลังจะกรอกสมุดตัวเอง"
 *
 *  อาการที่รายงานมา: หน้าจอสั่น พิมพ์ไม่ได้ ทิ้งไว้พักใหญ่ถึงกรอกได้
 *  ถ้าหน้าจอถูกสร้างใหม่ซ้ำๆ ช่องพิมพ์จะหลุดโฟกัสและค่าที่พิมพ์ไปหาย
 *  จึงวัดสองอย่าง: ช่องพิมพ์ถูกสร้างใหม่กี่ครั้ง และค่าที่พิมพ์ไว้ยังอยู่ไหม
 */
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  let ok = true;
  const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

  // เน็ตมือถือจริง: ช้า และล้มเป็นช่วงๆ — ไม่ใช่ตอบทันทีทุกครั้งแบบเซิร์ฟเวอร์จำลอง
  const FLAKY = process.env.FLAKY === '1';
  let getCount = 0;
  await ctx.route('**/rest/v1/**', async (r) => {
    if (r.request().method() === 'GET') {
      getCount += 1;
      if (FLAKY) {
        await new Promise((res) => setTimeout(res, 400 + Math.random() * 900));
        // หนึ่งในสามล้ม เหมือนเน็ตมือถือที่สัญญาณไม่นิ่ง
        if (getCount % 3 === 0) return r.abort('failed');
      }
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, email: 'friend@x.com', aud: 'authenticated' }),
  }));

  await p.goto(`http://localhost:${process.env.PORT || 4201}/`);
  await p.evaluate((uid) => localStorage.setItem('sb-offline-test-auth-token', JSON.stringify({
    access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: uid, email: 'friend@x.com', aud: 'authenticated', role: 'authenticated' },
  })), UID);
  await p.goto(`http://localhost:${process.env.PORT || 4201}/`, { waitUntil: 'commit' });

  // นับทุกครั้งที่ช่องกรอกชื่อถูกสร้างใหม่ (= หน้าถูกสลับ = ที่ผู้ใช้เห็นว่าสั่น)
  await p.evaluate(() => {
    window.__mounts = 0;
    window.__seen = new WeakSet();
    new MutationObserver(() => {
      const el = document.querySelector('#ob-name');
      if (el && !window.__seen.has(el)) { window.__seen.add(el); window.__mounts += 1; }
    }).observe(document.body, { childList: true, subtree: true });
  });

  console.log('\n=== รอให้หน้ากรอกข้อมูลโผล่ ===');
  await p.locator('#ob-name').waitFor({ timeout: 20000 }).catch(() => {});
  const appeared = await p.locator('#ob-name').count();
  check('หน้ากรอกข้อมูลโผล่ขึ้นมา', appeared === 1);

  // พิมพ์ทันทีที่เห็น เหมือนที่คนจริงทำ
  await p.locator('#ob-name').fill('เพื่อน');
  await p.locator('#ob-name').focus();
  console.log('\n=== พิมพ์ชื่อแล้วรอ 12 วินาที เหมือนคนกรอกจริง ===');

  const snaps = [];
  for (let i = 0; i < 12; i += 1) {
    await p.waitForTimeout(1000);
    snaps.push({
      t: i + 1,
      value: await p.locator('#ob-name').inputValue().catch(() => '(หาย)'),
      focused: await p.evaluate(() => document.activeElement?.id === 'ob-name'),
      mounts: await p.evaluate(() => window.__mounts),
      onboarding: await p.locator('#ob-name').count(),
      screen: await p.evaluate(() => {
        const t = document.body.innerText;
        if (/ยังบันทึกไม่สำเร็จ|ดึงข้อมูลไม่สำเร็จ|ต่อคลาวด์ไม่ได้|ลองใหม่อีกครั้ง/.test(t)) return 'หน้าแจ้งพัง';
        if (document.querySelector('#ob-name')) return 'หน้ากรอกข้อมูล';
        if (/กำลังดึงสมุด/.test(t)) return 'ห้องรอ';
        return 'อื่นๆ';
      }),
    });
  }

  const lost = snaps.filter((s) => s.value !== 'เพื่อน');
  const unfocused = snaps.filter((s) => !s.focused);
  const mounts = snaps[snaps.length - 1].mounts;

  console.log('\n  วินาที | ค่าที่พิมพ์ | โฟกัส | สร้างใหม่ | หน้าที่เห็น');
  for (const s of snaps) {
    console.log(`    ${String(s.t).padStart(2)}   | ${s.value.padEnd(10)} | ${s.focused ? 'อยู่ ' : 'หลุด'} | ${String(s.mounts).padEnd(3)} | ${s.screen}`);
  }

  console.log('');
  check(`ช่องพิมพ์ถูกสร้างใหม่ครั้งเดียว (จริง ${mounts} ครั้ง)`, mounts === 1);
  check(`ค่าที่พิมพ์ไม่หาย (หายไป ${lost.length} จาก 12 วินาที)`, lost.length === 0);
  check(`โฟกัสไม่หลุด (หลุด ${unfocused.length} จาก 12 วินาที)`, unfocused.length === 0);
  console.log(`  (ยิงคำขออ่านข้อมูลไปทั้งหมด ${getCount} ครั้ง)`);

  console.log('\n' + (ok ? '✅ ไม่พบอาการสั่น' : '❌ เจออาการสั่น'));
  await b.close();
  process.exit(ok ? 0 : 1);
})();
