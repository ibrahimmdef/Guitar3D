import { useRef } from 'react';
import { Check } from 'lucide-react';

export interface LoadStep {
  label: string;
  /** 0..1; 1 = done. */
  progress: number;
  /** Relative share of the whole bar (default 1). */
  weight?: number;
}

/** Overall 0..1 progress of weighted steps. */
export function overallProgress(steps: readonly LoadStep[]): number {
  const total = steps.reduce((s, x) => s + (x.weight ?? 1), 0);
  if (!total) return 0;
  return steps.reduce((s, x) => s + (x.weight ?? 1) * Math.min(1, Math.max(0, x.progress)), 0) / total;
}

/**
 * One loading indicator for the whole app: a bar with a percentage, the step running now and the
 * list of steps (done ones ticked). The bar never moves backwards.
 */
export function LoadingProgress({ title, steps, note, className = '' }: {
  title?: string;
  steps: readonly LoadStep[];
  /** Small line under the steps (e.g. "you can leave this page"). */
  note?: string;
  className?: string;
}) {
  const shown = useRef(0);
  shown.current = Math.max(shown.current, overallProgress(steps));
  const pct = Math.round(shown.current * 100);
  const current = steps.find((s) => s.progress < 1);
  return (
    <div className={`loadp ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={title ?? 'Loading'}>
      {/* always rendered (non-breaking space while unknown) so the bar does not jump when the title arrives */}
      <p className="loadp-title">{title || '\u00a0'}</p>
      <div className="loadp-row">
        <span className="loadp-now" aria-live="polite">{current ? `${current.label}…` : 'Ready'}</span>
        <span className="loadp-pct num">{pct}%</span>
      </div>
      <div className="loadp-bar"><span style={{ transform: `scaleX(${shown.current})` }} /></div>
      {steps.length > 1 && (
        <ol className="loadp-steps">
          {steps.map((s) => {
            const state = s.progress >= 1 ? 'done' : s === current ? 'active' : 'todo';
            return (
              <li key={s.label} className={`loadp-step is-${state}`}>
                <span className="loadp-dot" aria-hidden>{state === 'done' && <Check size={11} strokeWidth={3} />}</span>
                {s.label}
              </li>
            );
          })}
        </ol>
      )}
      {note && <p className="loadp-note">{note}</p>}
    </div>
  );
}
