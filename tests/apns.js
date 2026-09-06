/** ใบผ่าน (JWT ES256) ที่ส่งให้ APNs — ทดสอบด้วย node ไม่ต้องใช้เบราว์เซอร์
 *
 *  ตรงนี้คือจุดที่พลาดแล้วหาสาเหตุยากที่สุดของทั้งเรื่องแจ้งเตือนบนไอโฟน
 *  เซ็นผิดนิดเดียว APNs ตอบกลับมาแค่ "403 InvalidProviderToken" ซึ่งไม่บอกเลย
 *  ว่าผิดตรงไหน — กุญแจอ่านไม่ออก? ลายเซ็นผิดรูปแบบ? หัวใบผิด? เดาไม่ได้สักอย่าง
 *
 *  จึงต้องพิสูจน์ตรงนี้ให้จบก่อนเอาไปยิงจริง:
 *    1. อ่านไฟล์ .p8 ได้ ทั้งแบบขึ้นบรรทัดจริงและแบบที่ \n เป็นตัวอักษรสองตัว
 *       (Dashboard ของ Supabase รับข้อความหลายบรรทัดไม่ได้ คนจึงวางแบบหลังเสมอ)
 *    2. ลายเซ็นที่ได้ ตรวจผ่านจริงด้วยกุญแจสาธารณะคู่กัน
 *    3. เป็น base64url ล้วน ไม่มี + / = ปนมา (JWT ใช้ไม่ได้ถ้ามี)
 *
 *  รัน: node tests/apns.js
 */
const { execFileSync } = require('child_process');
const path = require('path');

const MOD = path.join(__dirname, '..', 'supabase', 'functions', 'notify', 'jwt.ts');

// node ยังนำเข้าไฟล์ .ts ตรงๆ ไม่ได้ทุกรุ่น จึงรันในกระบวนการลูกพร้อมธงถอดชนิดออก
const script = `
import { b64url, pemToKey, signApnsJwt } from ${JSON.stringify(MOD)};

const out = (o) => console.log(JSON.stringify(o));

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
let b64 = Buffer.from(pkcs8).toString('base64');
const lines = b64.match(/.{1,64}/g).join('\\n');
const pemReal = '-----BEGIN PRIVATE KEY-----\\n' + lines + '\\n-----END PRIVATE KEY-----';
const pemEscaped = pemReal.split('\\n').join('\\\\n');

const results = {};
for (const [name, pem] of [['ขึ้นบรรทัดจริง', pemReal], ['\\\\n เป็นตัวอักษร', pemEscaped]]) {
  try {
    const key = await pemToKey(pem);
    const jwt = await signApnsJwt('ABCDE12345', 'TEAM123456', key, 1750000000);
    const [h, p, s] = jwt.split('.');
    const raw = Uint8Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
    const okSig = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, raw,
      new TextEncoder().encode(h + '.' + p),
    );
    results[name] = {
      parts: jwt.split('.').length,
      header: JSON.parse(Buffer.from(h, 'base64url').toString()),
      payload: JSON.parse(Buffer.from(p, 'base64url').toString()),
      sigBytes: raw.length,
      verified: okSig,
      urlSafe: /^[A-Za-z0-9_-]+$/.test(jwt.replace(/\\./g, '')),
    };
  } catch (e) {
    results[name] = { error: e.message };
  }
}

let emptyErr = '';
try { await pemToKey(''); } catch (e) { emptyErr = e.message; }

out({ results, emptyErr, b64url: b64url(new Uint8Array([251, 255, 190])) });
`;

const raw = execFileSync(process.execPath,
  ['--experimental-strip-types', '--input-type=module', '--eval', script],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const data = JSON.parse(raw.trim().split('\n').pop());

let ok = true;
const check = (l, c) => { console.log(`  ${c ? '✓' : '✗'} ${l}`); if (!c) ok = false; };

for (const [name, r] of Object.entries(data.results)) {
  console.log(`\n=== กุญแจแบบ ${name} ===`);
  if (r.error) { check(`อ่านกุญแจได้ (${r.error})`, false); continue; }
  check('ได้ JWT ครบสามท่อน', r.parts === 3);
  check(`หัวใบบอก ES256 และ kid ถูก (${r.header.alg} / ${r.header.kid})`,
    r.header.alg === 'ES256' && r.header.kid === 'ABCDE12345');
  check(`เนื้อใบบอก team และเวลาที่ออก (${r.payload.iss} / ${r.payload.iat})`,
    r.payload.iss === 'TEAM123456' && r.payload.iat === 1750000000);
  check(`ลายเซ็นเป็นแบบ r||s ยาว 64 ไบต์ (ได้ ${r.sigBytes})`, r.sigBytes === 64);
  check('ตรวจลายเซ็นด้วยกุญแจสาธารณะแล้วผ่าน', r.verified === true);
  check('ทั้งใบเป็น base64url ล้วน ไม่มี + / = ปน', r.urlSafe === true);
}

console.log('\n=== ของที่ต้องพังให้ถูกทาง ===');
check(`กุญแจว่างเปล่าต้องบอกว่าว่าง ไม่ใช่พังด้วยข้อความที่เดาไม่ออก (${data.emptyErr})`,
  /ว่างเปล่า/.test(data.emptyErr));
check('b64url แปลงไบต์ที่มี + และ / ได้ถูก', data.b64url === '-_--');

console.log('\n' + (ok ? '✅ ผ่านหมด' : '❌ มีที่ตก'));
process.exit(ok ? 0 : 1);
