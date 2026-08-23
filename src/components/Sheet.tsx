'use client';

import React, { useEffect } from 'react';

/** Bottom sheet — slide-up 250ms + backdrop fade 200ms, แตะ backdrop ปิด, Esc ปิด */
export function Sheet({ open, title, onClose, children }: {
  open: boolean; title?: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </>
  );
}
