import { memo } from 'react';
import { Check, Gauge, Lightbulb, Play, Repeat, RotateCcw, Target } from 'lucide-react';
import { ISSUE_LABELS, type Report } from '../tips/analyze';
import { Button } from './kit';
import { PRACTICE_STEPS, practiceStep } from './practiceFlow';

const KIND_LABEL: Record<string, string> = ISSUE_LABELS;

export interface Ladder {
  speed: number;
  clean: number;
  target: number;
  /** Clean passes needed per step (default 3). */
  passes?: number;
}

interface Props {
  report: Report | null;
  currentBar: number;
  loop: [number, number] | null;
  onBarClick: (bar: number, extend: boolean) => void;
  ladder: Ladder;
  onClean: () => void;
  onStuck: () => void;
  playing: boolean;
  speed: number;
  /** Loop the given bar and drop to the ladder speed. */
  onPickBar: (bar: number) => void;
  onSlowDown: () => void;
  onPlay: () => void;
}


/** Practice drawer content: bar difficulty map, tips for the focused bar, tempo ladder, summary. */
export const Coach = memo(function Coach({ report, currentBar, loop, onBarClick, ladder, onClean, onStuck, playing, speed, onPickBar, onSlowDown, onPlay }: Props) {
  if (!report) {
    return <p className="muted small">Once a tab loads, the bar map and tips will appear here.</p>;
  }
  const focusBar = loop ? loop[0] : currentBar;
  const bar = report.bars[focusBar];
  const range = loop ? (loop[0] === loop[1] ? `Bar ${loop[0] + 1}` : `Bars ${loop[0] + 1}–${loop[1] + 1}`) : null;

  const step = practiceStep({ loop, playing, speed, ladderSpeed: ladder.speed });
  const stepIndex = PRACTICE_STEPS.findIndex((s) => s.step === step);
  const hardest = report.hardestBars[0] ?? currentBar;

  return (
    <div className="coach">
      <section className="flow" aria-labelledby="flow-title">
        <ol className="flow-steps" aria-label="Practice steps">
          {PRACTICE_STEPS.map((s, i) => (
            <li key={s.step} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
              <span className="flow-dot num" aria-hidden>{i < stepIndex ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
              <span className="flow-label">{s.label}</span>
            </li>
          ))}
        </ol>
        <div className="flow-body">
          {step === 'choose' && (
            <>
              <h3 id="flow-title">Pick the section to practice</h3>
              <p className="muted small">Click a bar on the map or start with the hardest spot. While playing, <kbd className="kbd">L</kbd> loops the current bar.</p>
              <Button variant="primary" icon={<Target size={16} />} onClick={() => onPickBar(hardest)}>
                {report.hardestBars.length ? `Hardest bar: ${hardest + 1}` : `Start with bar ${hardest + 1}`}
              </Button>
            </>
          )}
          {step === 'slow' && (
            <>
              <h3 id="flow-title">Play it slowly first</h3>
              <p className="muted small">Start at a speed you can play cleanly. Suggested speed: {Math.round(ladder.speed * 100)}%.</p>
              <Button variant="primary" icon={<Gauge size={16} />} onClick={onSlowDown}>Set speed to {Math.round(ladder.speed * 100)}%</Button>
            </>
          )}
          {step === 'loop' && (
            <>
              <h3 id="flow-title">Play in a loop</h3>
              <p className="muted small">The section repeats nonstop. After each pass, mark whether you played it cleanly.</p>
              <Button variant="primary" icon={<Play size={16} fill="currentColor" />} onClick={onPlay}>Start loop</Button>
            </>
          )}
          {step === 'climb' && (
            <>
              <h3 id="flow-title" className="flow-title-row">
                <span><Repeat size={15} aria-hidden /> Mark each pass when it ends</span>
                <span className="ladder-dots" role="img" aria-label={`${ladder.clean} / ${ladder.passes ?? 3} clean passes`}>
                  {Array.from({ length: ladder.passes ?? 3 }, (_, i) => i).map((i) => <span key={i} className={i < ladder.clean ? 'on' : ''} />)}
                </span>
              </h3>
              <div className="ladder-actions">
                <Button variant="secondary" icon={<RotateCcw size={15} />} onClick={onStuck}>I stumbled</Button>
                <Button variant="primary" icon={<Check size={15} />} onClick={onClean}>Played it clean</Button>
              </div>
              <p className="subtle small">Speed goes up 5% after {ladder.passes ?? 3} clean passes in a row · now {Math.round(ladder.speed * 100)}%, target {Math.round(ladder.target * 100)}%</p>
            </>
          )}
        </div>
      </section>

      <section className="coach-sec">
        <div className="coach-sec-head">
          <h3>Bar map</h3>
          <span className="heat-legend" aria-hidden>
            <span>Easy</span><i /><span>Hard</span>
          </span>
        </div>
        <p className="coach-hint">Click a bar to loop it. Shift-click for a range.</p>
        <div className="heatmap" role="group" aria-label="Bars by difficulty">
          {report.bars.map((b) => {
            const inLoop = !!loop && b.bar >= loop[0] && b.bar <= loop[1];
            // Difficulty is 1 (easy) … 5 (hard); an all-easy song stays cool.
            const level = Math.min(1, Math.max(0, (b.difficulty - 1) / 4));
            const label = `Bar ${b.bar + 1}${b.issues.length ? `: ${b.issues.map((i) => KIND_LABEL[i.kind]).join(', ')}` : ', easy'}`;
            return (
              <button
                key={b.bar}
                type="button"
                className={`cell${b.bar === currentBar ? ' current' : ''}${inLoop ? ' looped' : ''}`}
                style={{ ['--h' as string]: level.toFixed(2) }}
                title={label}
                aria-label={label}
                aria-pressed={inLoop}
                onClick={(e) => onBarClick(b.bar, e.shiftKey)}
              >
                {b.bar + 1}
              </button>
            );
          })}
        </div>
      </section>

      <section className="coach-sec">
        <h3>{range ?? `Bar ${focusBar + 1}`}</h3>
        {bar && bar.issues.length ? (
          <ul className="tips">
            {bar.issues.map((i) => (
              <li key={i.kind}>
                <span className="tag">{KIND_LABEL[i.kind]}</span>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No particular difficulty in this bar. Focus on locking in the rhythm with the metronome.</p>
        )}
      </section>

      <section className="coach-sec">
        <h3>General tips</h3>
        <ul className="tips plain">
          {report.summary.map((s) => (
            <li key={s}><Lightbulb size={15} aria-hidden className="tip-ic" /><span>{s}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
});
