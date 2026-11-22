import { useId } from 'react';
import { TUNINGS, tuningNotes } from '../music/tunings';

/** Native select of the supported tunings ("Drop D · D A D G B E"). */
export function TuningSelect({ value, onChange, label = 'Tuning', allowTab }: { value: string; onChange: (id: string) => void; label?: string; allowTab?: boolean }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      {label}
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {allowTab && <option value="">Tab's own tuning</option>}
        {TUNINGS.map((t) => (
          <option key={t.id} value={t.id}>{t.label} · {tuningNotes(t)}</option>
        ))}
      </select>
    </label>
  );
}
