// เซ็นใบผ่าน (JWT ES256) ให้ APNs — ไฟล์นี้ตั้งใจไม่แตะ Deno.env หรืออะไรที่มีแต่
// ใน Deno เลย จะได้เอามารันทดสอบด้วย node ได้ตรงๆ
//
// ส่วนนี้คือส่วนที่พลาดแล้วหาสาเหตุยากที่สุดของทั้งเรื่อง: เซ็นผิดนิดเดียว
// APNs ตอบกลับมาแค่ 403 InvalidProviderToken ซึ่งไม่บอกเลยว่าผิดตรงไหน

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** เนื้อไฟล์ .p8 → กุญแจที่ WebCrypto ใช้เซ็นได้
 *
 *  ค่าที่วางไว้ใน secret มักมี \n เป็นตัวอักษรสองตัว (แบ็กสแลชกับ n) แทนการ
 *  ขึ้นบรรทัดจริง เพราะหน้าใส่ secret ของ Dashboard รับข้อความหลายบรรทัดไม่ได้
 *  ถ้าไม่แปลงกลับ atob จะพังด้วยข้อความที่ไม่มีทางเดาว่ามาจากเรื่องนี้ */
export async function pemToKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('กุญแจ .p8 ว่างเปล่า');

  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
}

/** ใบผ่านของ APNs — ไม่มี exp เพราะแอปเปิลนับอายุจาก iat เอง (ไม่เกิน 1 ชั่วโมง) */
export async function signApnsJwt(keyId: string, teamId: string, key: CryptoKey,
  issuedAt = Math.floor(Date.now() / 1000)): Promise<string> {
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: keyId })));
  const payload = b64url(enc.encode(JSON.stringify({ iss: teamId, iat: issuedAt })));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${payload}`),
  );
  // WebCrypto คืนลายเซ็นแบบ r||s ดิบ ซึ่งเป็นรูปแบบที่ JWT ต้องการพอดี
  // (ไลบรารีฝั่ง Node หลายตัวคืนเป็น DER แล้วต้องแปลงเอง — ตรงนี้ไม่ต้อง)
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}
