// ส่งแจ้งเตือนที่ค้างอยู่ในคิวออกไปเข้าเครื่องจริง
//
// ฐานข้อมูลเป็นคนตัดสินว่า "ต้องเตือนใครเรื่องอะไร" (ดู 0010_push_notify.sql)
// ไฟล์นี้มีหน้าที่เดียวคือหยิบของในคิวไปส่ง เพราะการเซ็น VAPID ทำในฐานข้อมูลไม่ได้
//
// deploy:  supabase functions deploy notify --no-verify-jwt
//          (--no-verify-jwt เพราะคนเรียกคือฐานข้อมูล ไม่ใช่ผู้ใช้ที่ถือ JWT
//           ประตูจึงเป็น header x-notify-secret แทน)
//
//          deploy จากหน้า Dashboard ไม่มีธงนี้ให้ใส่ ต้องไปปิดเองทีหลังที่
//          Edge Functions → notify → Settings → Verify JWT ไม่งั้นฐานข้อมูล
//          จะโดนปัดตกด้วย 401 UNAUTHORIZED_NO_AUTH_HEADER ตั้งแต่หน้าประตู
//          โดยที่โค้ดในไฟล์นี้ไม่ได้เริ่มทำงานเลยสักบรรทัด
//
// secret ที่ต้องตั้ง (Dashboard → Edge Functions → Secrets) — คนละหน้ากับการ deploy
// โค้ด ลืมข้อนี้จะได้ 503 พร้อมชื่อ secret ที่ขาดไป:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — สร้างด้วย `npm run vapid` ที่ repo
//   VAPID_SUBJECT                        — 'mailto:<อีเมลเรา>'
//   NOTIFY_SECRET                        — ต้องตรงกับ vault ชื่อ notify_secret

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

/** ส่งทีละกี่ข้อความต่อการเรียกหนึ่งครั้ง — เหลือค้างก็ได้ cron รอบหน้าเก็บต่อ */
const BATCH = 200;
/** ส่งไม่ผ่านกี่ครั้งถึงเลิกพยายาม */
const MAX_ATTEMPTS = 5;

interface OutboxRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  url: string | null;
  urgent: boolean;
  kind: string;
  attempts: number;
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  subscription: unknown;
}

const env = (k: string) => Deno.env.get(k) ?? '';

function ready(): string {
  for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'NOTIFY_SECRET']) {
    if (!env(k)) return `ยังไม่ได้ตั้ง secret ${k}`;
  }
  return '';
}

Deno.serve(async (req) => {
  const problem = ready();
  if (problem) {
    // ยังไม่ได้เปิดสวิตช์ — ไม่ใช่ความผิดพลาด แต่ต้องบอกให้ชัดว่าขาดอะไร
    // ไม่งั้นจะกลายเป็น "กดเปิดแจ้งเตือนแล้วเงียบ" ซึ่งไล่หาสาเหตุยากที่สุด
    return json({ ok: false, reason: problem }, 503);
  }

  // ประตูเดียว: ความลับที่ฐานข้อมูลถือไว้ใน Vault
  if (req.headers.get('x-notify-secret') !== env('NOTIFY_SECRET')) {
    return json({ ok: false, reason: 'ไม่ได้รับอนุญาต' }, 401);
  }

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  const { data: queue, error } = await db
    .from('notification_outbox')
    .select('id, user_id, title, body, url, urgent, kind, attempts')
    .is('sent_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('urgent', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(BATCH);

  if (error) return json({ ok: false, reason: error.message }, 500);
  if (!queue?.length) return json({ ok: true, sent: 0, note: 'คิวว่าง' });

  const rows = queue as OutboxRow[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, user_id, endpoint, subscription')
    .in('user_id', userIds);

  const byUser = new Map<string, SubRow[]>();
  for (const s of (subs ?? []) as SubRow[]) {
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  }

  // เครื่องที่ผู้ใช้ถอนแอปทิ้งไปแล้ว บริการ push จะตอบ 404/410 กลับมา
  // ถ้าไม่ลบทิ้ง แถวตายจะค้างอยู่ตลอดกาลและถูกยิงซ้ำทุกครั้งไปเรื่อยๆ
  const dead: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(rows.map(async (row) => {
    const targets = byUser.get(row.user_id) ?? [];

    if (!targets.length) {
      // ไม่มีเครื่องรับ = ส่งไม่ได้จริงๆ ปิดงานไปเลย อย่าให้ค้างวนลองใหม่ตลอดกาล
      await db.from('notification_outbox').update({
        sent_at: new Date().toISOString(),
        last_error: 'ยังไม่มีเครื่องที่เปิดรับแจ้งเตือนของคนนี้',
      }).eq('id', row.id);
      return;
    }

    const payload = JSON.stringify({
      title: row.title,
      body: row.body,
      url: row.url ?? undefined,
      urgent: row.urgent,
      // เตือนเรื่องเดียวกันซ้ำ ให้ทับอันเดิมบนแถบแจ้งเตือน ไม่ใช่กองสะสม
      tag: row.kind,
    });

    const results = await Promise.all(targets.map(async (t) => {
      try {
        await webpush.sendNotification(
          t.subscription as webpush.PushSubscription,
          payload,
          { TTL: row.urgent ? 3600 : 21600, urgency: row.urgent ? 'high' : 'normal' },
        );
        return { ok: true, error: '' };
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode ?? 0;
        if (code === 404 || code === 410) dead.push(t.id);
        return { ok: false, error: `${code || ''} ${(e as Error).message}`.trim() };
      }
    }));

    // ถึงมือสักเครื่องก็พอ — คนคนหนึ่งมีได้หลายเครื่อง ไม่ต้องครบทุกเครื่องถึงจะนับว่าส่งแล้ว
    const anyOk = results.some((r) => r.ok);
    if (anyOk) {
      sent += 1;
      await db.from('notification_outbox')
        .update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null })
        .eq('id', row.id);
    } else {
      failed += 1;
      await db.from('notification_outbox')
        .update({
          attempts: row.attempts + 1,
          last_error: results.map((r) => r.error).join(' | ').slice(0, 500),
        })
        .eq('id', row.id);
    }
  }));

  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);

  return json({ ok: true, sent, failed, removedDevices: dead.length });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
