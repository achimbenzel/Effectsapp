import { useId, useState } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange(v: number): void;
}

/** Labelled range slider with a click-to-edit numeric readout. */
export function Slider({ label, value, min, max, step = 1, unit, disabled, onChange }: SliderProps) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const n = parseFloat(draft);
    if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
    setEditing(false);
  };

  const shown = step < 1 ? value.toFixed(1) : String(Math.round(value));

  return (
    <div className={`control${disabled ? ' disabled' : ''}`}>
      <div className="control-head">
        <label className="control-label" htmlFor={id}>
          {label}
        </label>
        <div className="control-valuebox">
          {editing ? (
            <input
              className="control-valueinput"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="control-value"
              onClick={() => {
                setDraft(shown);
                setEditing(true);
              }}
            >
              {shown}
              {unit ? <span className="control-unit">{unit}</span> : null}
            </button>
          )}
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
