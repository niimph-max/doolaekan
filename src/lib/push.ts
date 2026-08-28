'use client';

import { getSupabase } from './supabase';

/** กุญแจสาธารณะ VAPID — ตั้งตอน build จาก secret NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *
 *  ไม่ใส่ = ทั้งเรื่องแจ้งเตือนหายไปจากแอปเงียบๆ ตั้งใจให้เป็นแบบนั้น
 *  จะได้เปิดใช้ "วันที่พร้อมจริง" ได้โดยไม่ต้องแก้โค้ด: ใส่ secret แล้ว deploy รอบเดียว
 *  (ทุกเครื่องต้องกดเปิดเองอยู่ดี เพราะเบราว์เซอร์ไม่ให้สมัครแทนกัน) */
const vapidKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();

export const pushConfigured = Boolean(vapidKey);

export type PushState =
  | 'unconfigured'   // ยังไม่ได้ใส่กุญแจตอน build
  | 'unsupported'    // เบราว์เซอร์นี้ทำไม่ได้
  | 'need-install'   // iPhone/iPad: ต้องเพิ่มลงหน้าจอหลักก่อน
  | 'blocked'        // เคยกดปฏิเสธไว้ ต้องไปปลดในตั้งค่าเบราว์เซอร์เอง
  | 'off'
  | 'on';

/** เดสก์ท็อป Safari รับ push ได้ แต่บน iPhone/iPad ต้องเปิดจากไอคอนหน้าจอหลักเท่านั้น
 *  ถ้าไม่แยกเคสนี้ ผู้ใช้จะกดปุ่มแล้วไม่มีอะไรเกิดขึ้น โดยไม่มีใครบอกว่าทำไม */
function iosNeedsInstall(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  return !window.matchMedia('(display-mode: standalone)').matches
    && !(window.navigator as { standalone?: boolean }).standalone;
}

function supported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** base64url → ไบต์ดิบ — รูปแบบที่ pushManager.subscribe ต้องการ
 *  คืนเป็น ArrayBuffer ไม่ใช่ Uint8Array เพราะ BufferSource ไม่รับ Uint8Array
 *  ที่ยังไม่รู้ชนิด buffer ข้างใน (อาจเป็น SharedArrayBuffer ในสายตา TypeScript) */
function toKeyBytes(base64url: string): ArrayBuffer {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return buffer;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  try {
    // ready รอตัวที่ "เข้าคุมแล้ว" — ตอนเพิ่งเปิดแอปครั้งแรก service worker
    // ยังติดตั้งไม่เสร็จ ถ้าไปหยิบ getRegistration() ตรงๆ จะได้ null แล้วปุ่มจะขึ้นว่า
    // เครื่องนี้ทำไม่ได้ ทั้งที่แค่ยังไม่พร้อม
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function pushState(): Promise<PushState> {
  if (!pushConfigured) return 'unconfigured';
  if (!supported()) return 'unsupported';
  if (iosNeedsInstall()) return 'need-install';
  if (Notification.permission === 'denied') return 'blocked';

  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** ชื่อเครื่องแบบเดาให้ก่อน — ผู้ใช้แก้เองได้ทีหลัง
 *  มีไว้ให้ตอบได้ว่า "เครื่องไหนของบ้านที่ยังไม่ได้เปิดแจ้งเตือน" */
function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return 'ไอแพด';
  if (/iPhone/.test(ua)) return 'ไอโฟน';
  if (/Android/.test(ua)) return 'เครื่องแอนดรอยด์';
  return 'คอมพิวเตอร์';
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  const { data: auth } = await db.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  const json = sub.toJSON();
  const { error } = await db.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    subscription: json,
    origin: window.location.origin,
    user_agent: navigator.userAgent.slice(0, 300),
    label: guessDeviceLabel(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });

  if (error) throw new Error(error.message);
}

export async function enablePush(): Promise<PushState> {
  const state = await pushState();
  if (state !== 'off') return state;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';

  const reg = await registration();
  if (!reg) return 'unsupported';

  const sub = await reg.pushManager.subscribe({
    // เบราว์เซอร์ยุคนี้บังคับว่า push ทุกครั้งต้องมีอะไรขึ้นจอ ส่งเงียบๆ ไม่ได้
    userVisibleOnly: true,
    applicationServerKey: toKeyBytes(vapidKey),
  });

  try {
    await saveSubscription(sub);
  } catch (e) {
    // เก็บขึ้นคลาวด์ไม่ได้ = ไม่มีใครรู้ว่าจะส่งมาที่ไหน การถือ subscription ไว้เฉยๆ
    // จะกลายเป็น "เปิดแล้วแต่ไม่เคยได้รับ" ซึ่งไล่หาสาเหตุยากกว่าการบอกว่าเปิดไม่สำเร็จ
    await sub.unsubscribe().catch(() => {});
    throw e;
  }

  return 'on';
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  const db = getSupabase();
  if (db) await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}

/** เก็บที่อยู่รับ push ปัจจุบันขึ้นคลาวด์อีกรอบ — เรียกทุกครั้งที่เปิดแอป
 *
 *  เบราว์เซอร์เปลี่ยนที่อยู่ให้เองเป็นระยะ service worker สมัครใหม่ให้แล้ว
 *  แต่ส่งขึ้นฐานข้อมูลเองไม่ได้เพราะไม่มีใบเข้าระบบ ถ้าไม่มีใครเก็บให้
 *  แจ้งเตือนจะเงียบไปเฉยๆ โดยที่ผู้ใช้ยังเห็นว่าปุ่ม "เปิดอยู่" */
export async function syncPushSubscription(): Promise<void> {
  if (!pushConfigured || !supported()) return;
  if (Notification.permission !== 'granted') return;

  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  await saveSubscription(sub).catch(() => { /* รอบหน้าค่อยลองใหม่ */ });
}

export interface NotifyPrefs {
  appointments: boolean;
  bp_alert: boolean;
  daily_summary: boolean;
  bp_threshold: number;
  summary_hour: number;
}

export const defaultPrefs: NotifyPrefs = {
  appointments: true,
  bp_alert: true,
  daily_summary: true,
  bp_threshold: 140,
  summary_hour: 7,
};

export async function loadPrefs(): Promise<NotifyPrefs> {
  const db = getSupabase();
  if (!db) return defaultPrefs;

  const { data } = await db
    .from('notification_prefs')
    .select('appointments, bp_alert, daily_summary, bp_threshold, summary_hour')
    .maybeSingle();

  return data ? { ...defaultPrefs, ...data } : defaultPrefs;
}

export async function savePrefs(patch: Partial<NotifyPrefs>): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  const { data: auth } = await db.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  const current = await loadPrefs();
  const { error } = await db.from('notification_prefs').upsert({
    user_id: userId,
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) throw new Error(error.message);
}
