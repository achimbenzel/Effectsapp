import { useEffect, useState } from 'react';
import { normalizeHex } from '../../core/color';

interface ColorFieldProps {
  label: string;
  value: string;
  onChange(hex: string): void;
}

/** Colour well (native picker hidden inside the swatch) + hex input. */
export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const commit = (text: string) => {
    const hex = normalizeHex(text);
    if (hex) {
      onChange(hex);
      setInvalid(false);
    } else setInvalid(true);
  };

  return (
    <div className="control">
      <div className="control-head">
        <span className="control-label">{label}</span>
      </div>
      <div className="colorfield-body">
        <span className="color-swatch" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        </span>
        <input
          className={`colorfield-hexinput${invalid ? ' invalid' : ''}`}
          value={draft}
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            if (normalizeHex(e.target.value)) commit(e.target.value);
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(draft);
          }}
        />
      </div>
    </div>
  );
}
