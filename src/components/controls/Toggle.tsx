interface ToggleProps {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
}

/** Labelled glassy switch. */
export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle">
      <span className="control-label">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}
