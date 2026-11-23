import { Check, Gauge, Mic, MicOff, Square, Target, Timer, TrendingUp, X } from 'lucide-react';
import type { SectionProgress } from '@guitar3d/shared';
import type { LadderState } from '../player/tempoLadder';
import type { TrainerMicStatus, TrainerPass } from '../coach/useSpeedTrainer';
import { cleanLabel } from '../coach/progress';
import { Button, Slider, Toggle } from './kit';
import { useSettings } from './settings';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const bars = (r: [number, number]) => (r[0] === r[1] ? `Bar ${r[0] + 1}` : `Bars ${r[0] + 1}–${r[1] + 1}`);

interface Props {
  active: boolean;
  onStart: () => void;
  onStop: () => void;
  ladder: LadderState;
  loop: [number, number] | null;
  /** Loop the hardest 2–4 bars from the tips engine. */
  onHardest: () => void;
  hardest: [number, number] | null;
  micStatus: TrainerMicStatus;
  lastPass: TrainerPass | null;
  onDetails: () => void;
  /** Manual mode: a pass ended and waits for "Clean" / "Not clean". */
  awaiting: boolean;
  onManual: (clean: boolean) => void;
  /** Written tempo of the loop (BPM). */
  bpm: number | null;
  section: SectionProgress | null;
  onCalibrate: () => void;
}

/** Practice drawer: the speed trainer (loop, climb, per-pass verdict) and its settings. */
export function SpeedTrainerPanel(p: Props) {
  const [s, set] = useSettings();
  const { ladder } = p;
  const span = Math.max(0.0001, ladder.target - ladder.floor);
  const progress = Math.min(1, Math.max(0, (ladder.speed - ladder.floor) / span));
  const score = p.lastPass?.score;
  const micBad = p.micStatus === 'denied' || p.micStatus === 'unsupported' || p.micStatus === 'error';
  return (
    <section className="ladder-panel trainer" aria-labelledby="trainer-title">
      <div className="trainer-head">
        <h3 id="trainer-title" className="ladder-title"><TrendingUp size={15} aria-hidden /> Speed trainer</h3>
        {p.active && <span className="trainer-live">{s.trainerMic ? <><Mic size={13} aria-hidden /> {p.micStatus === 'on' ? 'Listening' : p.micStatus === 'asking' ? 'Microphone…' : 'No microphone'}</> : 'Manual'}</span>}
      </div>
      {!p.active && (
        <p className="subtle small">
          Loop a section from {pct(s.ladderStart)}. After {s.ladderPasses} clean passes in a row the tempo goes up {Math.round(s.ladderStep * 100)}%;
          after {s.ladderFailPasses} failed passes it comes back down. {s.trainerMic ? `With the microphone, a pass is clean at ${s.ladderCleanAccuracy}% or more.` : 'You judge each pass yourself.'}
        </p>
      )}

      <div className="trainer-section">
        <span className="trainer-loop">{p.loop ? bars(p.loop) : 'No loop yet'}</span>
        {p.section && <span className="subtle small num">{cleanLabel(p.section, 1)}</span>}
        <Button size="sm" variant="ghost" icon={<Target size={14} />} onClick={p.onHardest} disabled={!p.hardest}>
          {p.hardest ? `Practice the hardest bars (${bars(p.hardest).toLowerCase()})` : 'Practice the hardest bars'}
        </Button>
      </div>

      {p.active ? (
        <div className="ladder-status" aria-live="polite">
          <div className="ladder-status-row num">
            <span className="ladder-now">{pct(ladder.speed)}{p.bpm ? <small className="subtle"> · {Math.round(p.bpm * ladder.speed)} BPM</small> : null}</span>
            <span className="subtle small">target {pct(ladder.target)}</span>
          </div>
          <div className="ladder-track" role="progressbar" aria-label="Progress toward target speed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="trainer-streak small">
            <span className="ladder-dots" role="img" aria-label={`${ladder.clean} of ${ladder.passes} clean passes`}>
              {Array.from({ length: ladder.passes }, (_, i) => <span key={i} className={i < ladder.clean ? 'on' : ''} />)}
            </span>
            <span className="subtle">{ladder.clean}/{ladder.passes} clean{ladder.fails ? ` · ${ladder.fails} failed` : ''}</span>
          </div>
          {score && (
            <button type="button" className={`trainer-pass${p.lastPass && score.score >= s.ladderCleanAccuracy ? ' is-clean' : ''}`} onClick={p.onDetails}>
              <span className="trainer-pass-score num">{score.score}%</span>
              <span className="trainer-pass-text">
                <b>{score.score >= s.ladderCleanAccuracy ? 'Clean pass' : 'Not clean'} at {pct(p.lastPass!.speed)}</b>
                <span className="small">{p.lastPass!.tips[0]?.text ?? `${score.counts.clean} of ${score.notes.length} notes on time.`}</span>
                <span className="small subtle">Details</span>
              </span>
            </button>
          )}
          {!s.trainerMic && (
            <div className="ladder-actions">
              <Button variant="secondary" icon={<X size={15} />} onClick={() => p.onManual(false)}>Not clean</Button>
              <Button variant={p.awaiting ? 'primary' : 'secondary'} icon={<Check size={15} />} onClick={() => p.onManual(true)}>Clean</Button>
            </div>
          )}
          {!s.trainerMic && <p className="subtle small">{p.awaiting ? 'Pass finished: how was it?' : 'Mark each pass when it ends.'}</p>}
          {ladder.done && <p className="small trainer-done">Clean at {pct(ladder.speed)}. Section done!</p>}
          <Button icon={<Square size={14} />} onClick={p.onStop}>Stop trainer</Button>
        </div>
      ) : (
        <Button variant="primary" icon={<Gauge size={16} />} onClick={p.onStart}>
          Start speed trainer{p.loop ? '' : ' on the hardest bars'}
        </Button>
      )}

      <Toggle
        label={<span className="ladder-title">{s.trainerMic ? <Mic size={14} aria-hidden /> : <MicOff size={14} aria-hidden />} Judge passes with the microphone</span>}
        description={micBad ? 'The microphone is not available: use the Clean / Not clean buttons.' : 'Off: you press Clean or Not clean after each pass.'}
        checked={s.trainerMic}
        onChange={(v) => set({ trainerMic: v })}
      />
      {s.trainerMic && (
        <div className={`trainer-cal small${s.latencyMs == null ? ' is-warn' : ''}`}>
          <Timer size={14} aria-hidden />
          <span>{s.latencyMs == null ? 'Timing not calibrated: late/early judgements may be off.' : `Latency ${s.latencyMs} ms`}</span>
          <Button size="sm" variant="ghost" onClick={p.onCalibrate}>{s.latencyMs == null ? 'Calibrate' : 'Recalibrate'}</Button>
        </div>
      )}

      <details className="trainer-settings">
        <summary className="small">Trainer settings</summary>
        <Slider label="Start speed" min={0.3} max={1} step={0.05} value={s.ladderStart} onChange={(v) => set({ ladderStart: v })} format={pct} />
        <Slider label="Clean passes to speed up" min={1} max={5} step={1} value={s.ladderPasses} onChange={(v) => set({ ladderPasses: v })} />
        <Slider label="Failed passes before speed drops" min={1} max={5} step={1} value={s.ladderFailPasses} onChange={(v) => set({ ladderFailPasses: v })} />
        <Slider label="Step" min={0.02} max={0.1} step={0.01} value={s.ladderStep} onChange={(v) => set({ ladderStep: v })} format={pct} />
        <Slider label="Score that counts as clean" min={60} max={100} step={5} value={s.ladderCleanAccuracy} onChange={(v) => set({ ladderCleanAccuracy: v })} format={(v) => `${v}%`} />
        <Slider label="Timing window" min={30} max={120} step={10} value={s.timingToleranceMs} onChange={(v) => set({ timingToleranceMs: v })} format={(v) => `±${v} ms`} />
        <Toggle label="Keep going to 110%" description="Overshoot practice: once it is clean at full speed, push past it." checked={s.ladderTarget > 1} onChange={(v) => set({ ladderTarget: v ? 1.1 : 1 })} />
        <p className="subtle small">Changes apply the next time the trainer starts.</p>
      </details>
    </section>
  );
}
