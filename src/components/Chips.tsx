'use client';

import React from 'react';

export function Chips({ options, selected, onToggle, multi = true }: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="o-chips">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className="o-chip"
          aria-pressed={selected.includes(o)}
          role={multi ? undefined : 'radio'}
          onClick={() => onToggle(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
