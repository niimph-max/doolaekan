'use client';

import React from 'react';
import { Icon, type IconName } from './Icon';
import type { Tab } from '@/lib/types';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'หน้าหลัก', icon: 'heart' },
  { id: 'meds', label: 'ยา', icon: 'pill' },
  { id: 'appts', label: 'นัดหมอ', icon: 'calendar' },
  { id: 'book', label: 'สมุด', icon: 'book' },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="เมนูหลัก">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} size={23} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}
