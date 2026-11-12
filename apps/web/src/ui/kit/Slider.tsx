import * as RS from '@radix-ui/react-slider';
import { useId } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  /** Formats the value label and aria-valuetext. */
  format?: (v: number) => string;
  /** Hide the visible label row (label stays available to screen readers). */
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Slider({ label, value, min, max, step = 1, onChange, onCommit, format = String, compact, disabled, className }: Props) {
  const id = useId();
  return (
    <div className={`slider${compact ? ' slider-compact' : ''}${className ? ` ${className}` : ''}`}>
      {!compact && (
        <div className="slider-head">
          <span id={id} className="slider-label">{label}</span>
          <span className="slider-value num">{format(value)}</span>
        </div>
      )}
      <RS.Root
        className="slider-root"
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
        onValueCommit={onCommit ? (v) => onCommit(v[0]) : undefined}
      >
        <RS.Track className="slider-track">
          <RS.Range className="slider-range" />
        </RS.Track>
        <RS.Thumb className="slider-thumb" aria-label={label} aria-labelledby={compact ? undefined : id} aria-valuetext={format(value)} />
      </RS.Root>
    </div>
  );
}
