'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useStore } from '@/lib/store';
import {
  pushConfigured, pushState, enablePush, disablePush, myPushDevices,
  loadPrefs, savePrefs, defaultPrefs,
  type NotifyPrefs, type PushDevice, type PushState,
} from '@/lib/push';

/** ชั่วโมงที่ให้เลือกสำหรับสรุปประจำวัน — เช้าจริงๆ เท่านั้น
 *  สรุปตอนบ่ายไม่มีประโยชน์ เพราะยาที่ยังไม่ได้กดของเช้าก็สายไปแล้ว */
const HOURS = [5, 6, 7, 8, 9, 10];

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00 น.`;
}

/** แจ้งเตือนเข้าเครื่อง — เปิดทีละเครื่อง แต่ตั้งค่าใช้ร่วมกันทั้งบัญชี
 *
 *  สองอย่างนี้แยกกันจริงๆ และเป็นจุดที่คนสับสนที่สุด:
 *  - "เปิดบนเครื่องนี้" คือการขออนุญาตจากเบราว์เซอร์ ทำแทนกันไม่ได้ ต้องไปกด
 *    ที่เครื่องนั้นเอง — เครื่องแม่ต้องกดที่เครื่องแม่
 *  - "จะเตือนเรื่องอะไรบ้าง" เป็นของบัญชี ตั้งที่ไหนก็มีผลกับทุกเครื่องของคนนั้น
 *
 *  จึงต้องเขียนบนจอให้ชัด ไม่ใช่ปล่อยให้เดาเอาจากปุ่มที่วางติดกัน */
export function PushSettings() {
  const { state } = useStore();
  const [ps, setPs] = useState<PushState | null>(null);
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');

  const cloud = state.mode === 'cloud' && Boolean(state.userId);

  const reload = useCallback(async () => {
    setPs(await pushState());
    // ดูรายชื่อเครื่องไม่ได้ ไม่ใช่เรื่องใหญ่พอจะขึ้นคำเตือน แต่ต้องไม่แสดงรายการว่างๆ
    // เป็น "ไม่มีเครื่องไหนเปิดไว้" ซึ่งไม่จริง — null คือ "ยังไม่รู้"
    setDevices(await myPushDevices().catch(() => null));
  }, []);

  useEffect(() => {
    if (!pushConfigured || !cloud) return;
    void reload();
    void loadPrefs().then(setPrefs).catch(() => setPrefs(defaultPrefs));
  }, [cloud, reload]);

  if (!pushConfigured || !cloud) return null;

  const setPref = async (patch: Partial<NotifyPrefs>) => {
    const before = prefs ?? defaultPrefs;
    setPrefs({ ...before, ...patch });      // ขยับบนจอทันที ไม่ต้องรอเน็ต
    setFail('');
    try {
      await savePrefs(patch);
    } catch (e) {
      // บันทึกไม่ขึ้น = ค่าบนจอไม่ใช่ของจริง ต้องคืนค่าเดิมและบอกตรงๆ
      // ไม่ใช่ปล่อยให้เห็นว่าตั้งไว้แล้วแต่คืนนี้ยังเตือนแบบเดิม
      setPrefs(before);
      setFail(`บันทึกการตั้งค่าไม่สำเร็จ — ${(e as Error).message}`);
    }
  };

  const turnOn = async () => {
    setBusy(true); setFail('');
    try {
      const next = await enablePush();
      setPs(next);
      if (next === 'blocked') setFail('เบราว์เซอร์ปฏิเสธไว้ — ต้องไปปลดในตั้งค่าของเบราว์เซอร์เอง');
      else if (next !== 'on') setFail('ยังไม่ได้อนุญาต — กด "อนุญาต" ตอนเบราว์เซอร์ถามด้วย');
      else setDevices(await myPushDevices().catch(() => null));
    } catch (e) {
      setFail(`เปิดไม่สำเร็จ — ${(e as Error).message}`);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true); setFail('');
    try {
      await disablePush();
    } catch (e) {
      setFail(`ปิดไม่สำเร็จ — ${(e as Error).message}`);
    } finally {
      await reload();
      setBusy(false);
    }
  };

  const others = (devices ?? []).filter((d) => !d.isThisDevice);
  const p = prefs ?? defaultPrefs;

  return (
    <>
      <h3 style={{ fontSize: 19, margin: '22px 0 8px' }}>แจ้งเตือนเข้าเครื่อง</h3>

      {/* ── เครื่องนี้ ── */}
      {ps === null && <p className="subtle" style={{ margin: 0 }}>กำลังตรวจเครื่องนี้…</p>}

      {ps === 'unsupported' && (
        <p className="subtle" style={{ margin: 0 }}>
          เบราว์เซอร์นี้รับแจ้งเตือนไม่ได้ — เปิดแอปด้วย Chrome หรือ Safari รุ่นใหม่
          แล้วลองอีกที ข้อมูลในสมุดยังใช้ได้ตามปกติทุกอย่าง
        </p>
      )}

      {ps === 'need-install' && (
        <div className="o-card" style={{ padding: 16 }}>
          <strong>ต้องเพิ่มลงหน้าจอหลักก่อน</strong>
          <p className="subtle" style={{ margin: '6px 0 0' }}>
            บนไอโฟนกับไอแพด แจ้งเตือนใช้ได้เฉพาะตอนเปิดจากไอคอนบนหน้าจอหลักเท่านั้น
            กดปุ่มแชร์ในซาฟารี → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดแอปจากไอคอนนั้น
            จะเห็นปุ่มเปิดแจ้งเตือนตรงนี้
          </p>
        </div>
      )}

      {ps === 'blocked' && (
        <div className="o-card warn" style={{ padding: 16 }}>
          <strong>เครื่องนี้ปิดกั้นแจ้งเตือนไว้</strong>
          <p className="subtle" style={{ margin: '6px 0 0' }}>
            เคยกด “ไม่อนุญาต” ไว้ แอปขอใหม่เองไม่ได้ ต้องไปเปิดในตั้งค่าเบราว์เซอร์ —
            แตะรูปแม่กุญแจข้างที่อยู่เว็บ แล้วเปิดการแจ้งเตือน จากนั้นกลับมาที่หน้านี้
          </p>
        </div>
      )}

      {ps === 'not-ready' && (
        <p className="subtle" style={{ margin: 0 }}>
          ยังตรวจไม่ได้ว่าเครื่องนี้เปิดแจ้งเตือนไว้หรือยัง — ตัวช่วยเบื้องหลังของแอป
          (service worker) ยังไม่พร้อม ลองปิดแอปแล้วเปิดใหม่อีกครั้ง
        </p>
      )}

      {ps === 'off' && (
        <>
          <p className="subtle" style={{ margin: '0 0 10px' }}>
            เครื่องนี้ยังไม่ได้เปิด — จะเตือนวันนัด ความดันที่สูงเกินเกณฑ์
            และสรุปตอนเช้าว่ามีอะไรค้างอยู่บ้าง
          </p>
          <button type="button" className="o-btn primary block" disabled={busy} onClick={() => void turnOn()}>
            <Icon name="bell" size={19} /> {busy ? 'กำลังเปิด…' : 'เปิดแจ้งเตือนบนเครื่องนี้'}
          </button>
        </>
      )}

      {ps === 'on' && (
        <>
          <p className="subtle" style={{ margin: '0 0 10px' }}>เปิดอยู่บนเครื่องนี้</p>
          <button type="button" className="o-btn ghost block" disabled={busy} onClick={() => void turnOff()}>
            {busy ? 'กำลังปิด…' : 'ปิดแจ้งเตือนบนเครื่องนี้'}
          </button>
        </>
      )}

      {/* ── เครื่องอื่นของบัญชีนี้ ──
          ต้องเห็นว่ามีเครื่องไหนบ้าง ไม่งั้นเวลาแม่ไม่ได้รับ จะไม่มีทางรู้เลยว่า
          เป็นเพราะเครื่องแม่ยังไม่เคยกดเปิด หรือเปิดไว้ตั้งแต่แอปยังอยู่ที่อยู่เดิม */}
      {others.length > 0 && (
        <p className="subtle" style={{ margin: '10px 0 0' }}>
          เครื่องอื่นที่เปิดไว้: {others.map((d) => d.label + (d.stale ? ' (ที่อยู่เดิม)' : '')).join(', ')}
          {others.some((d) => d.stale) && (
            <>
              <br />เครื่องที่ขึ้นว่า “ที่อยู่เดิม” สมัครไว้ตอนแอปยังอยู่ที่อยู่ก่อนย้าย
              ส่งไปไม่ถึงแล้ว ต้องไปกดเปิดใหม่ที่เครื่องนั้น
            </>
          )}
        </p>
      )}

      {fail && (
        <p style={{ margin: '10px 0 0', color: 'var(--color-accent-700)' }}>{fail}</p>
      )}

      {/* ── จะเตือนเรื่องอะไรบ้าง ──
          แสดงตลอดแม้เครื่องนี้ยังไม่ได้เปิด เพราะเป็นค่าของบัญชี ไม่ใช่ของเครื่อง
          คนดูแลตั้งจากเครื่องตัวเองแล้วมีผลกับเครื่องที่บ้านด้วย */}
      <label className="o-label">จะเตือนเรื่องอะไรบ้าง</label>
      <p className="subtle" style={{ margin: '0 0 8px' }}>
        ใช้กับทุกเครื่องที่คุณเปิดแจ้งเตือนไว้ ไม่ใช่เฉพาะเครื่องนี้
      </p>
      <div className="o-chips">
        <button type="button" className="o-chip" aria-pressed={p.appointments}
          onClick={() => void setPref({ appointments: !p.appointments })}>
          วันนัดหมอ
        </button>
        <button type="button" className="o-chip" aria-pressed={p.bp_alert}
          onClick={() => void setPref({ bp_alert: !p.bp_alert })}>
          ความดันสูงเกินเกณฑ์
        </button>
        <button type="button" className="o-chip" aria-pressed={p.daily_summary}
          onClick={() => void setPref({ daily_summary: !p.daily_summary })}>
          สรุปตอนเช้า
        </button>
      </div>

      {p.bp_alert && (
        <>
          <label className="o-label" htmlFor="np-bp">เตือนเมื่อตัวบนเกิน</label>
          <select id="np-bp" className="o-select" value={p.bp_threshold}
            onChange={(e) => void setPref({ bp_threshold: Number(e.target.value) })}>
            {[130, 140, 150, 160, 180].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </>
      )}

      {p.daily_summary && (
        <>
          <label className="o-label" htmlFor="np-hour">ส่งสรุปตอน</label>
          <select id="np-hour" className="o-select" value={p.summary_hour}
            onChange={(e) => void setPref({ summary_hour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </>
      )}

      <p className="subtle" style={{ margin: '10px 0 0' }}>
        ตั้งใจไม่เตือนรายมื้อยา — เตือนวันละหลายครั้งทุกวันคือทางที่คนปิดแจ้งเตือนทิ้ง
        แล้วพลาดเรื่องด่วนไปด้วย ยาที่ยังไม่ได้กดจะไปรวมอยู่ในสรุปตอนเช้าแทน
      </p>
    </>
  );
}
