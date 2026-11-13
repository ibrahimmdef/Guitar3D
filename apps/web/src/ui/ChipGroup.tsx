import { Tooltip } from './kit';

export interface ChipOption {
  value: string;
  label: string;
  /** Tooltip / secondary name. */
  hint?: string;
}

/** A labelled row of toggle chips (single choice). Every chip is a button, so Tab reaches them. */
export function ChipGroup({ label, value, onChange, options, hideLabel }: { label: string; value: string; onChange: (v: string) => void; options: ChipOption[]; hideLabel?: boolean }) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      {!hideLabel && <span className="chip-group-label" aria-hidden>{label}</span>}
      <div className="chip-row">
        {options.map((o) => {
          const chip = (
            <button key={o.value} type="button" className={`chip${o.value === value ? ' is-on' : ''}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
              {o.label}
            </button>
          );
          return o.hint ? <Tooltip key={o.value} content={o.hint}>{chip}</Tooltip> : chip;
        })}
      </div>
    </div>
  );
}
