// ส่งแจ้งเตือนเข้าไอโฟนผ่าน APNs
//
// ทำไมต้องมีไฟล์นี้: Web Push ใช้ไม่ได้ในแอปที่ห่อด้วย Capacitor เพราะ WKWebView
// ไม่มี service worker ให้รับ push แอปเปิลให้ส่งทาง APNs อย่างเดียว
//
// ไม่พึ่งไลบรารีข้างนอกเลย เพราะทั้งหมดที่ต้องทำคือเซ็น JWT ES256 หนึ่งใบ
// ซึ่ง WebCrypto ทำได้อยู่แล้ว — ไลบรารี APNs ส่วนใหญ่พาเรื่อง Node built-in
// เข้ามาด้วย ซึ่งบน Deno เป็นทางที่พังง่ายกว่าเขียนเอง 40 บรรทัด
//
// secret ที่ต้องตั้ง (Dashboard → Edge Functions → Secrets) — ไม่ครบ = ไม่ส่ง
// และบอกออกไปว่าขาดตัวไหน ไม่ใช่เงียบ
//   APNS_KEY_ID      รหัสกุญแจ 10 ตัว จากหน้า Keys ใน Apple Developer
//   APNS_TEAM_ID     รหัสทีม 10 ตัว มุมขวาบนของ Apple Developer
//   APNS_BUNDLE_ID   com.doolaekan.app (ต้องตรงกับ appId ใน capacitor.config.ts)
//   APNS_PRIVATE_KEY เนื้อไฟล์ .p8 ทั้งก้อน รวมบรรทัด BEGIN/END
//   APNS_ENV         'production' หรือ 'sandbox' (ตอนรันจาก Xcode ใส่เครื่องเอง
//                    คือ sandbox — ถ้าใส่ผิดจะได้ BadDeviceToken โดยที่ทุกอย่าง
//                    ในโค้ดถูกหมด เป็นจุดที่คนติดกันมากที่สุด)

import { pemToKey, signApnsJwt } from './jwt.ts';

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

const env = (k: string) => Deno.env.get(k) ?? '';

export function apnsMissing(): string {
  for (const k of ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_PRIVATE_KEY']) {
    if (!env(k)) return `ยังไม่ได้ตั้ง secret ${k}`;
  }
  return '';
}

// APNs ให้ใช้ token ใบเดิมซ้ำได้ และ "ห้าม" สร้างใหม่ถี่กว่าทุก 20 นาที
// ไม่งั้นโดนตอบ 429 TooManyProviderTokenUpdates แล้วแจ้งเตือนจะเงียบไปทั้งรอบ
let cached: { token: string; at: number } | null = null;

async function providerToken(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.at < 45 * 60 * 1000) return cached.token;

  const key = await pemToKey(env('APNS_PRIVATE_KEY'));
  const token = await signApnsJwt(env('APNS_KEY_ID'), env('APNS_TEAM_ID'), key);
  cached = { token, at: now };
  return token;
}

export interface ApnsResult {
  ok: boolean;
  /** เครื่องนี้ตายแล้ว (ถอนแอป / token หมดอายุ) — ต้องลบแถวทิ้ง ไม่ใช่ลองใหม่ตลอดกาล */
  dead: boolean;
  error: string;
}

export async function sendApns(deviceToken: string, msg: {
  title: string; body: string; url?: string; urgent: boolean; tag: string;
}): Promise<ApnsResult> {
  const host = HOSTS[env('APNS_ENV') === 'sandbox' ? 'sandbox' : 'production'];

  try {
    const res = await fetch(`${host}/3/device/${deviceToken}`, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${await providerToken()}`,
        'apns-topic': env('APNS_BUNDLE_ID'),
        'apns-push-type': 'alert',
        // เรื่องด่วนส่งทันทีแม้เครื่องอยู่โหมดประหยัดพลังงาน ที่เหลือปล่อยให้ระบบจัดคิว
        'apns-priority': msg.urgent ? '10' : '5',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + (msg.urgent ? 3600 : 21600)),
        // เรื่องเดียวกันที่ส่งซ้ำให้ทับอันเดิม ไม่ใช่กองสะสมจนเห็นแถบยาวเป็นพืด
        'apns-collapse-id': msg.tag.slice(0, 64),
      },
      body: JSON.stringify({
        aps: {
          alert: { title: msg.title, body: msg.body },
          sound: 'default',
          'interruption-level': msg.urgent ? 'time-sensitive' : 'active',
        },
        // ฝั่งแอปอ่านค่านี้ตอนผู้ใช้แตะแจ้งเตือน เพื่อพาไปหน้าที่เกี่ยวข้อง
        url: msg.url ?? null,
      }),
    });

    if (res.ok) return { ok: true, dead: false, error: '' };

    // APNs ตอบเหตุผลมาเป็นข้อความสั้นๆ เสมอ เก็บไว้ทั้งดุ้น จะได้ไม่ต้องเดา
    const text = await res.text().catch(() => '');
    const reason = (() => {
      try { return JSON.parse(text).reason as string; } catch { return text; }
    })();

    // 410 = token ตายแล้ว, BadDeviceToken = token ผิดฝั่ง (sandbox/production สลับกัน)
    // อย่างหลังไม่ใช่เครื่องตาย เป็นการตั้งค่าผิด ห้ามลบแถวทิ้ง ไม่งั้นแก้ค่าถูกแล้ว
    // ผู้ใช้ยังต้องไปกดเปิดใหม่ทุกเครื่องโดยไม่รู้ว่าทำไม
    const dead = res.status === 410 || reason === 'Unregistered';
    return { ok: false, dead, error: `${res.status} ${reason || 'ไม่มีเหตุผลแนบมา'}` };
  } catch (e) {
    return { ok: false, dead: false, error: (e as Error).message };
  }
}
