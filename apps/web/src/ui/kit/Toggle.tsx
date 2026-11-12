import { useId, type ReactNode } from 'react';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/** On/off switch with a visible label (role="switch"). */
export function Toggle({ checked, onChange, label, description, disabled }: Props) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <label htmlFor={id} className="toggle-label">{label}</label>
        {description && <p className="toggle-desc">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}
