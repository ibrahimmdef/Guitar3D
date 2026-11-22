import { useMemo } from 'react';
import { Repeat, RotateCcw } from 'lucide-react';
import { aggregateFeedback, hardestRange, worstBars } from '../../player/feedback';
import type { PassSummary } from '../../player/useListenMode';
import { Button, Sheet } from '../../ui/kit';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pass: PassSummary | null;
  /** Loop bars [from, to] (0-based) and start practising them. */
  onLoop: (range: [number, number]) => void;
  onRetry: () => void;
}

const range = (r: [number, number]) => (r[0] === r[1] ? `bar ${r[0] + 1}` : `bars ${r[0] + 1}–${r[1] + 1}`);

/** Summary after a listen-mode pass: accuracy per bar, missed / early / late notes, loop the worst. */
export function FeedbackSheet({ open, onOpenChange, pass, onLoop, onRetry }: Props) {
  const fb = useMemo(() => (pass ? aggregateFeedback(pass.notes) : null), [pass]);
  const hard = useMemo(() => (fb ? hardestRange(fb.bars) : null), [fb]);
  const worst = useMemo(() => new Set(fb ? worstBars(fb.bars, 3, 100).map((b) => b.bar) : []), [fb]);
  if (!fb) return null;
  const o = fb.overall;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Pass summary"
      description={o.accuracy >= 90 ? 'A very clean pass.' : hard ? `The hardest part was ${range(hard)}.` : 'You caught every note.'}
      footer={
        <>
          <Button icon={<RotateCcw size={15} />} onClick={onRetry}>Play again</Button>
          {hard && <Button variant="primary" icon={<Repeat size={15} />} onClick={() => onLoop(hard)}>Loop the hard bars</Button>}
        </>
      }
    >
      <div className="fb">
        <div className="stat-row fb-stats">
          <div className="stat"><span className="stat-label">Accuracy</span><span className="stat-value num">{o.accuracy}%</span></div>
          <div className="stat"><span className="stat-label">Clean</span><span className="stat-value num">{o.clean}<small>/ {o.total}</small></span></div>
        </div>
        <ul className="fb-kinds" aria-label="Mistake types">
          <li><span className="fb-dot is-clean" aria-hidden />Clean <b className="num">{o.clean}</b><small>first try, on time</small></li>
          <li><span className="fb-dot is-missed" aria-hidden />Missed <b className="num">{o.missed}</b><small>wrong note first</small></li>
          <li><span className="fb-dot is-early" aria-hidden />Early <b className="num">{o.early}</b><small>jumped to the next note</small></li>
          <li><span className="fb-dot is-late" aria-hidden />Late <b className="num">{o.late}</b><small>note held too long</small></li>
        </ul>
        <h3 className="eyebrow">Bar by bar</h3>
        <ul className="fb-bars">
          {fb.bars.map((b) => {
            const label = `Bar ${b.bar + 1}: ${b.accuracy}% clean, ${b.missed} missed, ${b.early} early, ${b.late} late. Loop it`;
            return (
              <li key={b.bar}>
                <button type="button" className={`fb-bar${worst.has(b.bar) ? ' is-worst' : ''}`} onClick={() => onLoop([b.bar, b.bar])} aria-label={label} title={label}>
                  <span className="fb-bar-no num">{b.bar + 1}</span>
                  <span className="fb-bar-track" aria-hidden>
                    {(['clean', 'missed', 'early', 'late'] as const).map((k) => (b[k] ? <span key={k} className={`is-${k}`} style={{ flexGrow: b[k] }} /> : null))}
                  </span>
                  <span className="fb-bar-acc num">{b.accuracy}%</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="subtle small">Click a bar to loop it.</p>
      </div>
    </Sheet>
  );
}
