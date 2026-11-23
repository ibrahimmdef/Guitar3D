import { useEffect, useRef, useState } from 'react';
import { Mic, Timer } from 'lucide-react';
import { CAL_BPM, CAL_CLICKS, CAL_COUNT_IN, calibrationClicks, latencyFromTaps, type CalibrationResult } from '../../coach/calibration';
import { decimate, startMicCapture, type MicCapture } from '../../coach/micCapture';
import { detectOnsets } from '../../coach/onsets';
import { Button, Dialog } from '../../ui/kit';
import { useSettings } from '../../ui/settings';

type Phase = 'idle' | 'asking' | 'running' | 'done' | 'failed';

function click(ctx: AudioContext, at: number, accent: boolean) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = accent ? 2400 : 1900;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(accent ? 0.6 : 0.45, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + 0.06);
}

/**
 * One-time latency calibration: four count-in clicks, then eight clicks to play along with (any
 * note, or a muted strum). The median offset between the clicks and the heard attacks is the
 * delay of speaker + microphone, removed from every timing judgement afterwards.
 */
export function CalibrationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [settings, setSettings] = useSettings();
  const [phase, setPhase] = useState<Phase>('idle');
  const [beat, setBeat] = useState(-1);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cap = useRef<MicCapture | null>(null);
  const timers = useRef<number[]>([]);

  const cleanup = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cap.current?.stop();
    cap.current = null;
  };
  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase('idle');
      setBeat(-1);
      setResult(null);
      setError(null);
    }
  }, [open]);
  useEffect(() => cleanup, []);

  const run = async () => {
    cleanup();
    setResult(null);
    setError(null);
    setPhase('asking');
    let c: MicCapture;
    try {
      c = await startMicCapture();
    } catch (e) {
      setPhase('failed');
      setError((e as DOMException)?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in the browser and try again.' : 'Couldn\'t open the microphone.');
      return;
    }
    cap.current = c;
    setPhase('running');
    const ctx = c.context;
    const plan = calibrationClicks(CAL_BPM, CAL_COUNT_IN, CAL_CLICKS, 600);
    const t0 = ctx.currentTime;
    const all = [...plan.countIn, ...plan.play];
    all.forEach((ms, i) => click(ctx, t0 + ms / 1000, i % 4 === 0));
    // performance time at which each play-along click is rendered (speaker + mic delay is what we measure)
    const heardAt = plan.play.map((ms) => c.ctxToPerf(t0 + ms / 1000));
    if (import.meta.env.DEV) (window as unknown as { __g3dCalibration?: number[] }).__g3dCalibration = heardAt;
    all.forEach((ms, i) => timers.current.push(window.setTimeout(() => setBeat(i), ms)));
    const end = all[all.length - 1] + 900;
    timers.current.push(window.setTimeout(() => {
      const from = heardAt[0] - 500;
      const { samples, startPerf } = c.slice(from, heardAt[heardAt.length - 1] + 600);
      const d = decimate(samples, c.sampleRate);
      const attacks = detectOnsets(d.samples, d.sampleRate, { legato: false }).map((o) => o.ms + startPerf);
      const r = latencyFromTaps(heardAt, attacks);
      cleanup();
      setResult(r);
      setPhase(r.ok ? 'done' : 'failed');
      if (!r.ok) setError(r.matched < 5 ? `Only ${r.matched} of ${CAL_CLICKS} clicks had a note with them. Play louder or move closer to the microphone.` : `The notes were uneven (±${r.spreadMs} ms). Try again and play exactly with the clicks.`);
    }, end));
  };

  const count = beat < 0 ? null : beat < CAL_COUNT_IN ? `${beat + 1}` : `Play ${beat - CAL_COUNT_IN + 1}/${CAL_CLICKS}`;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Calibrate timing"
      description="Speakers and microphones add a delay. Measure it once so late and early notes are judged fairly."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{phase === 'done' ? 'Close' : 'Cancel'}</Button>
          {phase === 'done' && result ? (
            <Button variant="primary" onClick={() => { setSettings({ latencyMs: Math.max(0, result.latencyMs) }); onOpenChange(false); }}>Save {Math.max(0, result.latencyMs)} ms</Button>
          ) : (
            <Button variant="primary" icon={<Mic size={15} />} disabled={phase === 'asking' || phase === 'running'} onClick={run}>{phase === 'failed' ? 'Try again' : 'Start'}</Button>
          )}
        </>
      }
    >
      <div className="cal">
        <ol className="cal-steps small">
          <li>Use the same speakers or headphones and the same microphone you practise with.</li>
          <li>After {CAL_COUNT_IN} count-in clicks, play one note (or a muted strum) exactly with each of the next {CAL_CLICKS} clicks.</li>
        </ol>
        <div className="cal-beats" aria-hidden>
          {Array.from({ length: CAL_COUNT_IN + CAL_CLICKS }, (_, i) => (
            <span key={i} className={`${i < CAL_COUNT_IN ? 'is-count' : ''}${i === beat ? ' is-now' : i < beat ? ' is-past' : ''}`} />
          ))}
        </div>
        <p className="cal-status num" role="status" aria-live="polite">
          {phase === 'asking' && 'Waiting for the microphone…'}
          {phase === 'running' && (count ?? 'Get ready…')}
          {phase === 'done' && result && <><Timer size={15} aria-hidden /> Delay {result.latencyMs} ms (±{result.spreadMs} ms, {result.matched}/{CAL_CLICKS} clicks)</>}
          {phase === 'failed' && error}
          {phase === 'idle' && (settings.latencyMs != null ? `Current delay: ${settings.latencyMs} ms.` : 'Not calibrated yet.')}
        </p>
      </div>
    </Dialog>
  );
}
