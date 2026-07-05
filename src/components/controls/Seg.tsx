interface SegProps<T extends string> {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(v: T): void;
}

/** Compact segmented chip row. */
export function Seg<T extends string>({ label, value, options, onChange }: SegProps<T>) {
  return (
    <div className="control">
      {label ? (
        <div className="control-head">
          <span className="control-label">{label}</span>
        </div>
      ) : null}
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
