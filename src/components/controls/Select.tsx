import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange(v: string): void;
}

/** App-styled dropdown (native <select> replaced for the glass look). */
export function Select({ label, value, options, onChange }: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="control">
      {label ? (
        <div className="control-head">
          <span className="control-label">{label}</span>
        </div>
      ) : null}
      <div className="select" ref={rootRef}>
        <button
          type="button"
          className={`select-trigger${open ? ' open' : ''}`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="select-value">{current?.label ?? value}</span>
          <svg className="select-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        {open ? (
          <div className="select-menu" role="listbox">
            {options.map((o) => (
              <div
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`select-option${o.value === value ? ' selected active' : ''}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {o.value === value ? (
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4.5L4 7.5L10 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
