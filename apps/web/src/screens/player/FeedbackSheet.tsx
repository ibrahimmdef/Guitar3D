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

const range = (r: [number, number]) => (r[0] === r[1] ? `Ölçü ${r[0] + 1}` : `Ölçü ${r[0] + 1}–${r[1] + 1}`);

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
      title="Tur özeti"
      description={o.accuracy >= 90 ? 'Çok temiz bir tur.' : hard ? `En çok ${range(hard)} zorladı.` : 'Her notayı yakaladın.'}
      footer={
        <>
          <Button icon={<RotateCcw size={15} />} onClick={onRetry}>Tekrar çal</Button>
          {hard && <Button variant="primary" icon={<Repeat size={15} />} onClick={() => onLoop(hard)}>Zor ölçüleri döngüye al</Button>}
        </>
      }
    >
      <div className="fb">
        <div className="stat-row fb-stats">
          <div className="stat"><span className="stat-label">Doğruluk</span><span className="stat-value num">%{o.accuracy}</span></div>
          <div className="stat"><span className="stat-label">Temiz</span><span className="stat-value num">{o.clean}<small>/ {o.total}</small></span></div>
        </div>
        <ul className="fb-kinds" aria-label="Hata türleri">
          <li><span className="fb-dot is-clean" aria-hidden />Temiz <b className="num">{o.clean}</b><small>ilk denemede, zamanında</small></li>
          <li><span className="fb-dot is-missed" aria-hidden />Kaçan <b className="num">{o.missed}</b><small>önce yanlış nota</small></li>
          <li><span className="fb-dot is-early" aria-hidden />Erken <b className="num">{o.early}</b><small>sonraki notaya atladın</small></li>
          <li><span className="fb-dot is-late" aria-hidden />Geç <b className="num">{o.late}</b><small>nota çok bekletildi</small></li>
        </ul>
        <h3 className="eyebrow">Ölçü ölçü</h3>
        <ul className="fb-bars">
          {fb.bars.map((b) => {
            const label = `Ölçü ${b.bar + 1}: %${b.accuracy} temiz, ${b.missed} kaçan, ${b.early} erken, ${b.late} geç. Döngüye al`;
            return (
              <li key={b.bar}>
                <button type="button" className={`fb-bar${worst.has(b.bar) ? ' is-worst' : ''}`} onClick={() => onLoop([b.bar, b.bar])} aria-label={label} title={label}>
                  <span className="fb-bar-no num">{b.bar + 1}</span>
                  <span className="fb-bar-track" aria-hidden>
                    {(['clean', 'missed', 'early', 'late'] as const).map((k) => (b[k] ? <span key={k} className={`is-${k}`} style={{ flexGrow: b[k] }} /> : null))}
                  </span>
                  <span className="fb-bar-acc num">%{b.accuracy}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="subtle small">Bir ölçüye tıklamak onu döngüye alır.</p>
      </div>
    </Sheet>
  );
}
