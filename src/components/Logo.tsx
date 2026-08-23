import React from 'react';

/** เครื่องหมายใบไม้–หัวใจ วาดเป็นเส้นเดียวต่อเนื่องตามโลโก้ Doolaekan */
export function LogoMark({ size = 64, color = 'var(--color-brand-soft)' }: {
  size?: number; color?: string;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100" fill="none"
      stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"
      role="img" aria-label="Doolaekan"
    >
      {/* ปีกขวาของหัวใจ ทอดลงมาจบที่ปลายล่าง */}
      <path d="M50 32 C57 20 76 20 82 34 C88 49 71 65 50 84" />
      {/* ใบไม้ ทำหน้าที่เป็นปีกซ้าย ปลายชี้ขึ้นทางซ้าย */}
      <path d="M50 84 C50 84 27 65 22 49 C17 34 26 26 36 28 C47 31 52 46 50 84 Z" />
      {/* เส้นกลางใบ */}
      <path d="M27 34 C36 48 44 64 49 79" />
    </svg>
  );
}

/** โลโก้เต็ม: เครื่องหมาย + ชื่อไทย-อังกฤษ ใช้บนหน้าเข้าสู่ระบบและหน้าเปิดแอปครั้งแรก */
export function Logo({ size = 96 }: { size?: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <LogoMark size={size} />
      <div style={{
        fontFamily: 'var(--font-heading)',
        fontSize: size * 0.34,
        letterSpacing: '.04em',
        color: 'var(--color-brand)',
        marginTop: size * 0.06,
        lineHeight: 1.1,
      }}>
        Doolaekan
      </div>
      <div style={{
        fontSize: size * 0.18,
        color: 'var(--color-brand-soft)',
        letterSpacing: '.08em',
      }}>
        ดูแลกัน
      </div>
    </div>
  );
}
