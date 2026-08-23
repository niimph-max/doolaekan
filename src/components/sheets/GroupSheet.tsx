'use client';

import React, { useState } from 'react';
import { Sheet } from '../Sheet';
import { Icon } from '../Icon';
import { useStore } from '@/lib/store';
import type { ShareLevel } from '@/lib/types';

/** สลับกลุ่ม / สร้างกลุ่มใหม่ / เข้ากลุ่มด้วยรหัส — แต่ละกลุ่มแยกกันสนิท */
export function GroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useStore();
  const [mode, setMode] = useState<'list' | 'create' | 'join'>('list');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [share, setShare] = useState<ShareLevel>('full');

  const close = () => { setMode('list'); setName(''); setCode(''); onClose(); };

  return (
    <Sheet open={open} title="กลุ่มครอบครัว" onClose={close}>
      {mode === 'list' && (
        <>
          {state.groups.length === 0 && (
            <p className="subtle" style={{ marginBottom: 12 }}>ยังไม่ได้อยู่กลุ่มไหน — สมุดของคุณเป็นส่วนตัวอยู่</p>
          )}
          {state.groups.map((g) => {
            const active = g.id === state.activeGroupId;
            return (
              <button key={g.id} type="button" className="o-btn block"
                style={{
                  justifyContent: 'space-between', marginBottom: 8,
                  background: active ? 'var(--color-accent-2-100)' : 'var(--color-neutral-100)',
                  border: `1.5px solid ${active ? 'var(--color-accent-2-500)' : 'var(--color-neutral-300)'}`,
                  color: 'var(--color-text)',
                }}
                onClick={() => { actions.setActiveGroup(g.id); close(); }}>
                <span style={{ textAlign: 'left' }}>
                  {g.name}
                  <span className="subtle" style={{ display: 'block' }}>
                    {g.members.length} คน · รหัส {g.invite_code}
                  </span>
                </span>
                {active && <Icon name="check" size={19} color="var(--color-accent-2-700)" />}
              </button>
            );
          })}
          <div className="o-row" style={{ marginTop: 14 }}>
            <button type="button" className="o-btn secondary" onClick={() => setMode('create')}>สร้างกลุ่ม</button>
            <button type="button" className="o-btn ghost" onClick={() => setMode('join')}>เข้ากลุ่มด้วยรหัส</button>
          </div>
        </>
      )}

      {mode !== 'list' && (
        <>
          {mode === 'create' ? (
            <>
              <label className="o-label" htmlFor="gs-name">ชื่อกลุ่ม</label>
              <input id="gs-name" className="o-input" placeholder="เช่น บ้านเตี่ย–แม่"
                value={name} onChange={(e) => setName(e.target.value)} />
            </>
          ) : (
            <>
              <div className="ph" style={{ width: 140, height: 140, borderRadius: 18, margin: '4px auto 12px' }} />
              <label className="o-label" htmlFor="gs-code">รหัสเข้ากลุ่ม</label>
              <input id="gs-code" className="o-input" placeholder="เช่น DLK-4821"
                value={code} onChange={(e) => setCode(e.target.value)} />
            </>
          )}

          <label className="o-label">แชร์สมุดของคุณเข้ากลุ่มนี้ระดับไหน</label>
          <div className="o-chips">
            {(['full', 'appointments', 'none'] as ShareLevel[]).map((lv) => (
              <button key={lv} type="button" className="o-chip" aria-pressed={share === lv}
                onClick={() => setShare(lv)}>
                {lv === 'full' ? 'ทั้งหมด' : lv === 'appointments' ? 'เฉพาะวันนัด' : 'ยังไม่แชร์'}
              </button>
            ))}
          </div>

          <div className="o-row" style={{ marginTop: 18 }}>
            <button type="button" className="o-btn ghost" onClick={() => setMode('list')}>ย้อนกลับ</button>
            <button type="button" className="o-btn primary"
              disabled={mode === 'create' ? !name.trim() : !code.trim()}
              onClick={async () => {
                if (mode === 'create') {
                  actions.createGroup(name.trim(), share);
                  actions.toast('สร้างกลุ่มแล้ว — ส่งรหัสให้พี่น้องเข้าร่วมได้เลย');
                  close();
                  return;
                }
                if (await actions.joinGroup(code, share)) {
                  actions.toast('เข้ากลุ่มแล้ว');
                  close();
                }
              }}>
              {mode === 'create' ? 'สร้างกลุ่ม' : 'เข้ากลุ่ม'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
