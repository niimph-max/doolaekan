'use client';

import React, { useState } from 'react';
import { Sheet } from '../Sheet';
import { Icon } from '../Icon';
import { useStore } from '@/lib/store';

/** เลือก "คนกดตอนนี้" — เครื่องกลางที่บ้านล็อกอินค้างไว้ ทุกบันทึกติดชื่อคนกดจริง */
export function ActorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useStore();
  const [custom, setCustom] = useState('');

  const group = state.groups.find((g) => g.id === state.activeGroupId);
  const names = Array.from(new Set([
    ...state.books.filter((b) => b.is_mine).map((b) => b.owner_name),
    ...(group?.members.map((m) => m.name) ?? []),
  ])).filter(Boolean);

  const pick = (name: string) => {
    actions.setActor(name.replace(' (คนดูแล)', ''));
    actions.toast(`คนกดตอนนี้: ${name.replace(' (คนดูแล)', '')}`);
    onClose();
  };

  return (
    <Sheet open={open} title="ใครเป็นคนกดตอนนี้" onClose={onClose}>
      <p className="subtle" style={{ marginBottom: 12 }}>ทุกบันทึกจะติดชื่อคนนี้ไว้ให้ครอบครัวเห็น</p>
      {names.map((n) => {
        const active = state.actorName === n.replace(' (คนดูแล)', '');
        return (
          <button key={n} type="button" className="o-btn block"
            style={{
              justifyContent: 'space-between', marginBottom: 8,
              background: active ? 'var(--color-accent-2-100)' : 'var(--color-neutral-100)',
              border: `1.5px solid ${active ? 'var(--color-accent-2-500)' : 'var(--color-neutral-300)'}`,
              color: 'var(--color-text)',
            }}
            onClick={() => pick(n)}>
            {n}
            {active && <Icon name="check" size={19} color="var(--color-accent-2-700)" />}
          </button>
        );
      })}

      <label className="o-label" htmlFor="actor-new">คนอื่น (พิมพ์ชื่อ)</label>
      <div className="o-row">
        <input id="actor-new" className="o-input" value={custom}
          onChange={(e) => setCustom(e.target.value)} placeholder="เช่น พี่แจ๋ว" />
        <button type="button" className="o-btn secondary" style={{ flex: '0 0 auto' }}
          disabled={!custom.trim()} onClick={() => pick(custom.trim())}>
          ใช้ชื่อนี้
        </button>
      </div>
    </Sheet>
  );
}
