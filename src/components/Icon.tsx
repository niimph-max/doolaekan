import React from 'react';

// ไอคอนชุด Lucide (stroke-width 2.75 ตามระบบดีไซน์ Organic)
const PATHS: Record<string, React.ReactNode> = {
  heart: <path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 12 5.4 5.5 5.5 0 0 0 2 8.5C2 10.7 3.5 12.5 5 14l7 7 7-7Z" />,
  pill: <><path d="m10.5 20.5-7-7a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z" /><path d="m8.5 8.5 7 7" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  camera: <><path d="M14.5 4h-5L8 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4Z" /><circle cx="12" cy="13" r="3.5" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  alert: <><path d="M12 9v5M12 18h.01" /><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z" />,
  check: <path d="m20 6-11 11-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1Z" /><path d="M4 22v-7" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM19 19h2v2h-2z" /></>,
  droplet: <path d="M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7Z" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, color = 'currentColor', style }: {
  name: IconName; size?: number; color?: string; style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
