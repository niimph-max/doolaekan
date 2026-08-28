// สร้างคู่กุญแจ VAPID สำหรับ Web Push — `npm run vapid`
//
// ไม่ได้ลงไลบรารีเพิ่มเพื่อการนี้ เพราะมันคือการสร้างคู่กุญแจ P-256 ธรรมดา
// ที่ node ทำได้เองอยู่แล้ว และคีย์ชุดนี้สร้างครั้งเดียวใช้ตลอดอายุแอป
//
// เปลี่ยนคีย์เมื่อไหร่ = เครื่องที่สมัครรับแจ้งเตือนไว้แล้วทุกเครื่องใช้ไม่ได้ทันที
// ต้องไล่ให้ทุกคนกดเปิดแจ้งเตือนใหม่ จึงควรสร้างครั้งเดียวแล้วเก็บให้ดี

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

// อ่านเป็น JWK ไม่ใช่ DER — DER ต้องนับ offset เองซึ่งพลาดทีเดียวจะได้คีย์ที่
// "หน้าตาถูกต้อง" แต่ใช้ไม่ได้จริง แล้วไปโผล่เป็นแจ้งเตือนที่ไม่มีวันถึงเครื่อง
const { x, y } = publicKey.export({ format: 'jwk' });
const { d } = privateKey.export({ format: 'jwk' });

// กุญแจสาธารณะของ Web Push = จุดบนเส้นโค้งแบบไม่บีบอัด (0x04 ตามด้วย x และ y)
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(x, 'base64url'), Buffer.from(y, 'base64url')]);
const pub = raw.toString('base64url');

if (raw.length !== 65 || Buffer.from(d, 'base64url').length !== 32) {
  throw new Error('ความยาวคีย์ไม่ถูกต้อง — อย่าเอาไปใช้');
}

console.log(`
คู่กุญแจ VAPID — สร้างครั้งเดียว เก็บให้ดี

ใส่ที่ Supabase → Edge Functions → Secrets:
  VAPID_PUBLIC_KEY   = ${pub}
  VAPID_PRIVATE_KEY  = ${d}
  VAPID_SUBJECT      = mailto:<อีเมลของเรา>

ใส่ที่ GitHub → Settings → Secrets and variables → Actions:
  NEXT_PUBLIC_VAPID_PUBLIC_KEY = ${pub}

ตัวสาธารณะใส่ในเว็บได้ตามปกติ (เบราว์เซอร์ต้องใช้ตอนสมัคร)
ตัวส่วนตัวห้ามขึ้น repo และห้ามอยู่ในไฟล์ที่ส่งให้เบราว์เซอร์เด็ดขาด
`);
