import { TrendingUp } from 'lucide-react';
import type { LadderState } from '../player/tempoLadder';
import { Slider, Toggle } from './kit';
import { useSettings } from './settings';

const pct = (v: number) => `${Math.round(v * 100)}%`;

interface Props {
  auto: boolean;
  onAuto: (on: boolean) => void;
  /** Restart the ladder with new settings. */
  onRestart: (cfg: { start: number; target: number; passes: number }) => void;
  ladder: LadderState;
  listening: boolean;
  hasLoop: boolean;
}

/** Practice drawer: automatic tempo ladder switch, its settings and where the climb stands. */
export function LadderPanel({ auto, onAuto, onRestart, ladder, listening, hasLoop }: Props) {
  const [s, set] = useSettings();
  const span = Math.max(0.0001, ladder.target - s.ladderStart);
  const cfg = { start: s.ladderStart, target: s.ladderTarget, passes: s.ladderPasses };
  const progress = Math.min(1, Math.max(0, (ladder.speed - s.ladderStart) / span));
  return (
    <section className="ladder-panel" aria-labelledby="ladder-title">
      <Toggle
        label={<span id="ladder-title" className="ladder-title"><TrendingUp size={15} aria-hidden /> Automatic tempo ladder</span>}
        description={`Starts at ${pct(s.ladderStart)}, speeds up 5% after ${s.ladderPasses} clean passes, slows down 5% when you stumble.`}
        checked={auto}
        onChange={onAuto}
      />
      {auto && (
        <>
          <div className="ladder-status" aria-live="polite">
            <div className="ladder-status-row num">
              <span className="ladder-now">{pct(ladder.speed)}</span>
              <span className="subtle small">target {pct(ladder.target)}</span>
            </div>
            <div className="ladder-track" role="progressbar" aria-label="Progress toward target speed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="subtle small">
              {ladder.clean}/{ladder.passes} clean passes ·{' '}
              {listening ? `in listen mode, a pass with ${s.ladderCleanAccuracy}% accuracy or more counts as clean` : 'after each pass, say “Played it clean” or “I stumbled”'}
              {!hasLoop && ' · loop a section first'}
            </p>
          </div>
          <Slider label="Start" min={0.3} max={1} step={0.05} value={s.ladderStart} onChange={(v) => set({ ladderStart: v })} onCommit={(v) => onRestart({ ...cfg, start: v })} format={pct} />
          <Slider label="Target" min={0.5} max={1.5} step={0.05} value={s.ladderTarget} onChange={(v) => set({ ladderTarget: v })} onCommit={(v) => onRestart({ ...cfg, target: v })} format={pct} />
          <Slider label="Clean passes per step" min={1} max={5} step={1} value={s.ladderPasses} onChange={(v) => set({ ladderPasses: v })} onCommit={(v) => onRestart({ ...cfg, passes: v })} />
          <Slider label="Accuracy that counts as clean" min={60} max={100} step={5} value={s.ladderCleanAccuracy} onChange={(v) => set({ ladderCleanAccuracy: v })} format={(v) => `${v}%`} />
          <p className="subtle small">The ladder restarts when the start, target or pass count changes.</p>
        </>
      )}
    </section>
  );
}
