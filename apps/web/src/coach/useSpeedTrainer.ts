import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlphaTabApi, model } from '@coderline/alphatab';
import { barRange } from '../player/useAlphaTab';
import { plannedNotes, tickToPerf, type Anchor } from './expected';
import { decimate, startMicCapture, type MicCapture } from './micCapture';
import { detectOnsets } from './onsets';
import { scorePass, tendencies, type ExpectedNote, type PassScore, type Tendency } from './scorePass';

export type TrainerMicStatus = 'off' | 'asking' | 'on' | 'denied' | 'unsupported' | 'error';

/** One finished pass through the loop: scored from the microphone, or `score` null (manual mode). */
export interface TrainerPass {
  loop: [number, number];
  speed: number;
  score: PassScore | null;
  tips: Tendency[];
}

interface Args {
  api: React.RefObject<AlphaTabApi | null>;
  track: model.Track | null;
  loop: [number, number] | null;
  active: boolean;
  mic: boolean;
  latencyMs: number;
  toleranceMs: number;
  onPass: (p: TrainerPass) => void;
}

/** Extra audio kept around a pass for notes played early / late (ms). */
const MARGIN_MS = 300;

/**
 * Speed trainer engine: follows alphaTab's position events through the looped section, notices
 * each complete pass (start of the loop to its end, no seeks or pauses in between), and either
 * scores it from the microphone recording (onset + pitch detection against the tab, latency
 * removed) or, without a microphone, just reports that a pass ended.
 *
 * Manual mode (mic=false): onPass is called with score=null after each completed pass.
 * The UI (SpeedTrainerPanel) then shows "Clean" / "Not clean" buttons and waits for the user
 * to press one. The user's choice is sent back via onManual(clean) which records the pass.
 */
export function useSpeedTrainer({ api, track, loop, active, mic, latencyMs, toleranceMs, onPass }: Args) {
  const [micStatus, setMicStatus] = useState<TrainerMicStatus>('off');
  const capture = useRef<MicCapture | null>(null);
  const live = useRef({ onPass, latencyMs, toleranceMs });
  live.current = { onPass, latencyMs, toleranceMs };

  const plan = useMemo(() => (track && loop ? plannedNotes(track, loop[0], loop[1]) : []), [track, loop]);

  // microphone
  useEffect(() => {
    if (!active || !mic) {
      setMicStatus('off');
      return;
    }
    let alive = true;
    setMicStatus('asking');
    startMicCapture()
      .then((c) => {
        if (!alive) return c.stop();
        capture.current = c;
        setMicStatus('on');
      })
      .catch((e: DOMException) => {
        if (!alive) return;
        setMicStatus(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : e?.name === 'NotSupportedError' ? 'unsupported' : 'error');
      });
    return () => {
      alive = false;
      capture.current?.stop();
      capture.current = null;
    };
  }, [active, mic]);

  // passes
  useEffect(() => {
    const a = api.current;
    const score = track?.score;
    if (!active || !a || !score || !loop) return;
    const range = barRange(score, loop[0], loop[1]);
    let anchors: Anchor[] = [];
    let lastTick = -1;
    const timers: number[] = [];
    const reset = () => {
      anchors = [];
    };

    const finish = (pass: Anchor[]) => {
      const first = pass[0];
      const last = pass[pass.length - 1];
      // Use time-signature-aware thresholds: one quarter note = 960 ticks / denominator
      const mb = score.masterBars[loop[0]];
      const quarterTicks = 3840 / (mb?.timeSignatureDenominator || 4);
      // only whole passes: from the loop start (count-in ticks do not move) to near its end
      if (!first || first.tick > range.startTick + quarterTicks || last.tick < range.endTick - quarterTicks * 2 || pass.length < 4) return;
      const speed = a.playbackSpeed;
      const lp: [number, number] = [loop[0], loop[1]];
      const cap = capture.current;
      if (!mic) {
        live.current.onPass({ loop: lp, speed, score: null, tips: [] });
        return;
      }
      if (!cap || !plan.length) return;
      const times = plan.map((n) => tickToPerf(pass, n.tick));
      if (times.some((t) => t == null)) return;
      const { latencyMs: lat, toleranceMs: tol } = live.current;
      const from = (times[0] as number) - MARGIN_MS;
      const to = (times[times.length - 1] as number) + MARGIN_MS + Math.max(0, lat);
      const wait = Math.max(0, to - cap.latestPerf()) + 150;
      timers.push(window.setTimeout(() => {
        const { samples, startPerf } = cap.slice(from, to);
        if (samples.length < 1000) return;
        const d = decimate(samples, cap.sampleRate);
        const onsets = detectOnsets(d.samples, d.sampleRate);
        const expected: ExpectedNote[] = plan.map(({ tick: _t, ...n }, i) => ({ ...n, ms: (times[i] as number) - startPerf }));
        const result = scorePass(expected, onsets, { latencyMs: lat, toleranceMs: tol });
        const pass: TrainerPass = { loop: lp, speed, score: result, tips: tendencies(result, { toleranceMs: tol }) };
        if (import.meta.env.DEV) {
          const w = window as unknown as { __g3dTrainerLog?: unknown[] };
          (w.__g3dTrainerLog ??= []).push({ speed, score: result.score, counts: result.counts, outcomes: result.notes.map((n) => [n.note.bar, n.outcome, n.deltaMs]), tips: pass.tips.map((t) => t.text), onsets: onsets.length });
        }
        live.current.onPass(pass);
      }, wait));
    };

    const offPos = a.playerPositionChanged.on((e) => {
      const tick = e.currentTick;
      if (lastTick >= 0 && tick < lastTick - 480) {
        // jumped back: at the loop's end this completes a pass (alphaTab may flag it as a seek)
        if (lastTick >= range.endTick - 960 && tick <= range.startTick + 480) finish(anchors);
        reset();
      } else if (e.isSeek) reset();
      const now = performance.now();
      const prev = anchors[anchors.length - 1];
      // a tick that does not move (count-in, a stall) keeps only its latest time
      if (prev && prev.tick === tick) prev.perf = now;
      else if (tick >= range.startTick && tick <= range.endTick) anchors.push({ perf: now, tick });
      lastTick = tick;
    });
    const offState = a.playerStateChanged.on(() => {
      reset();
      lastTick = -1;
    });
    return () => {
      offPos();
      offState();
      timers.forEach(clearTimeout);
    };
  }, [active, mic, api, track, loop, plan]);

  return { micStatus, level: () => capture.current?.level() ?? 0 };
}
