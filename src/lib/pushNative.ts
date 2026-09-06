'use client';

import { getSupabase } from './supabase';

/** แจ้งเตือนของแอปบนไอโฟน — คนละเส้นทางกับฝั่งเบราว์เซอร์โดยสิ้นเชิง
 *
 *  ในแอปที่ห่อด้วย Capacitor ไม่มี service worker ให้รับ push แอปเปิลให้ส่งผ่าน
 *  APNs อย่างเดียว ที่เก็บก็คนละอย่าง — ฝั่งเว็บเป็นที่อยู่ยาวๆ พร้อมกุญแจสองดอก
 *  ส่วนฝั่งนี้เป็น device token สั้นๆ ตัวเดียว
 *
 *  ปลั๊กอินถูกโหลดแบบ dynamic import ตลอด คนที่เข้าผ่านเบราว์เซอร์จึงไม่ต้อง
 *  ดาวน์โหลดโค้ดก้อนนี้เลยแม้แต่ไบต์เดียว */

/** จำ token ล่าสุดที่ส่งขึ้นคลาวด์สำเร็จไว้ในเครื่อง
 *  ใช้ตอบคำถามว่า "เครื่องนี้เปิดแจ้งเตือนไว้หรือยัง" — สิทธิ์ที่ได้รับอย่างเดียว
 *  ตอบไม่ได้ เพราะกดอนุญาตแล้วแต่ส่ง token ขึ้นคลาวด์ไม่สำเร็จก็ยังไม่ถือว่าเปิด */
const TOKEN_KEY = 'doolaekan-apns-token';

function remember(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* โหมดส่วนตัวห้ามเขียน */ }
}
function forget(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ไม่เป็นไร */ }
}
export function savedToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}

type Plugin = typeof import('@capacitor/push-notifications')['PushNotifications'];

async function plugin(): Promise<Plugin> {
  const mod = await import('@capacitor/push-notifications');
  return mod.PushNotifications;
}

/** ขอ token จากแอปเปิล
 *
 *  register() ไม่คืน token กลับมาเอง มันไปโผล่ที่ listener แทน และถ้า AppDelegate
 *  ฝั่ง iOS ไม่ได้ส่งต่อ callback ให้ปลั๊กอิน listener นี้จะไม่ยิงเลยตลอดกาล
 *  โดยไม่มี error อะไรทั้งสิ้น — จึงต้องมีเวลาจำกัด แล้วบอกตรงๆ ว่าไม่ได้ token
 *  ไม่ใช่ค้างรอไปเรื่อยๆ ให้ดูเหมือนกำลังทำงานอยู่ */
function awaitToken(p: Plugin): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; fn(); } };

    const timer = setTimeout(
      () => finish(() => reject(new Error('ขอที่อยู่รับแจ้งเตือนจากแอปเปิลไม่สำเร็จ (หมดเวลารอ)'))),
      15000,
    );

    void p.addListener('registration', (t: { value: string }) => {
      clearTimeout(timer);
      finish(() => resolve(t.value));
    });
    void p.addListener('registrationError', (e: { error: string }) => {
      clearTimeout(timer);
      finish(() => reject(new Error(e.error || 'แอปเปิลปฏิเสธการลงทะเบียน')));
    });

    void p.register().catch((e: Error) => {
      clearTimeout(timer);
      finish(() => reject(e));
    });
  });
}

async function claim(token: string): Promise<void> {
  const db = getSupabase();
  if (!db) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อคลาวด์');

  const { data: auth } = await db.auth.getUser();
  if (!auth.user?.id) throw new Error('ต้องเข้าระบบก่อนถึงจะเปิดแจ้งเตือนได้');

  const { error } = await db.rpc('claim_push_subscription', {
    p_endpoint: token,
    p_subscription: { token, platform: 'ios' },
    p_origin: 'app',
    p_user_agent: navigator.userAgent.slice(0, 300),
    p_label: /iPad/.test(navigator.userAgent) ? 'แอปบนไอแพด' : 'แอปบนไอโฟน',
    p_kind: 'apns',
  });
  if (error) throw new Error(error.message);
}

export async function nativeState(): Promise<'blocked' | 'off' | 'on'> {
  const p = await plugin();
  const { receive } = await p.checkPermissions();
  if (receive === 'denied') return 'blocked';
  if (receive !== 'granted') return 'off';
  return savedToken() ? 'on' : 'off';
}

export async function nativeEnable(): Promise<'blocked' | 'off' | 'on'> {
  const p = await plugin();

  let { receive } = await p.checkPermissions();
  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    ({ receive } = await p.requestPermissions());
  }
  if (receive === 'denied') return 'blocked';
  if (receive !== 'granted') return 'off';

  const token = await awaitToken(p);
  try {
    await claim(token);
  } catch (e) {
    // เก็บขึ้นคลาวด์ไม่ได้ = ไม่มีใครรู้ว่าจะส่งมาที่ไหน ถือว่ายังไม่เปิด
    // ดีกว่าขึ้นว่าเปิดแล้วแต่ไม่เคยได้รับ ซึ่งไล่หาสาเหตุยากกว่ากันมาก
    forget();
    throw e;
  }
  remember(token);
  return 'on';
}

export async function nativeDisable(): Promise<void> {
  const token = savedToken();
  forget();
  if (!token) return;

  const db = getSupabase();
  if (db) await db.from('push_subscriptions').delete().eq('endpoint', token);
}

/** เรียกทุกครั้งที่เปิดแอป — แอปเปิลเปลี่ยน token ให้เองเป็นระยะ
 *  ถ้าไม่มีใครเก็บตัวใหม่ให้ แจ้งเตือนจะเงียบไปเฉยๆ ทั้งที่ปุ่มยังขึ้นว่าเปิดอยู่ */
export async function nativeSync(): Promise<void> {
  const p = await plugin();
  const { receive } = await p.checkPermissions();
  if (receive !== 'granted' || !savedToken()) return;

  const token = await awaitToken(p);
  await claim(token);
  remember(token);
}
