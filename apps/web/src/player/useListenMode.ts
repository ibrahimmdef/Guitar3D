import { useCallback, useEffect, useRef, useState } from 'react';
import type { model } from '@coderline/alphatab';
import { accuracy, initialJudge, judgeStep, type Pitch } from '../audio/pitch';
import { useMicPitch, type MicStatus } from '../audio/useMicPitch';
import { isSounding, nextSoundingBeat, struckNotes } from './beats';

export interface PassSummary {
  hits: number;
  firstTry: number;
  accuracy: number;
}

interface Args {
  enabled: boolean;
  beat: model.Beat | null;
  track: model.Track | null;
  /** Inclusive bar range, or null for the whole song. */
  loop: [number, number] | null;
  seekBeat: (b: model.Beat) => void;
  pause: () => void;
  onPass: (s: PassSummary) => void;
}

const barOf = (b: model.Beat) => b.voice.bar.index;

function firstSoundingIn(track: model.Track, bar: number): model.Beat | null {
  const b = track.staves[0]?.bars[bar]?.voices[0]?.beats[0] ?? null;
  if (!b) return null;
  return isSounding(b) ? b : nextSoundingBeat(b);
}

/**
 * "Dinle ve bekle": playback is held at each note until the microphone hears it (±50 cents; for
 * chords any chord tone), then the cursor moves to the next sounding beat. Counts first-try hits
 * per pass through the loop (or the song) and reports them via `onPass`.
 */
export function useListenMode({ enabled, beat, track, loop, seekBeat, pause, onPass }: Args) {
  const [feedback, setFeedback] = useState<'hit' | 'miss' | null>(null);
  const [pass, setPass] = useState({ hits: 0, firstTry: 0 });
  const judge = useRef(initialJudge());
  const missedHere = useRef(false);
  /** Set after a hit until the cursor reaches the next beat, so one note is not counted twice. */
  const awaiting = useRef(false);
  const live = useRef({ beat, track, loop, seekBeat, onPass, pass });
  live.current = { beat, track, loop, seekBeat, onPass, pass };
  const fbTimer = useRef(0);

  const flash = useCallback((f: 'hit' | 'miss') => {
    setFeedback(f);
    clearTimeout(fbTimer.current);
    fbTimer.current = window.setTimeout(() => setFeedback(null), f === 'hit' ? 450 : 900);
  }, []);

  const startOfPass = useCallback((): model.Beat | null => {
    const { track: t, loop: l } = live.current;
    if (!t) return null;
    return firstSoundingIn(t, l ? l[0] : 0);
  }, []);

  const advance = useCallback(() => {
    const { beat: b, loop: l, seekBeat: seek, onPass: report, pass: p } = live.current;
    if (!b) return;
    const next = nextSoundingBeat(b);
    const outside = !next || (l && (barOf(next) > l[1] || barOf(next) < l[0]));
    let target: model.Beat | null = next;
    if (outside) {
      report({ ...p, accuracy: accuracy(p.hits, p.firstTry) });
      live.current.pass = { hits: 0, firstTry: 0 };
      setPass(live.current.pass);
      target = startOfPass();
    }
    judge.current = initialJudge();
    missedHere.current = false;
    if (target && target !== b) {
      awaiting.current = true;
      // Safety net in case the cursor event never arrives.
      window.setTimeout(() => (awaiting.current = false), 800);
      seek(target);
    }
  }, [startOfPass]);

  const onFrame = useCallback((pitch: Pitch | null) => {
    const b = live.current.beat;
    if (!b || awaiting.current) return;
    const targets = struckNotes(b).flatMap((n) => (n.realValue != null ? [n.realValue] : []));
    const r = judgeStep(judge.current, pitch, targets);
    judge.current = r.state;
    if (r.event === 'miss') {
      missedHere.current = true;
      flash('miss');
    } else if (r.event === 'hit') {
      const p = live.current.pass;
      const np = { hits: p.hits + 1, firstTry: p.firstTry + (missedHere.current ? 0 : 1) };
      live.current.pass = np;
      setPass(np);
      flash('hit');
      advance();
    }
  }, [advance, flash]);

  const status: MicStatus = useMicPitch(enabled, onFrame);

  // New target: reset the judge.
  useEffect(() => {
    judge.current = initialJudge();
    missedHere.current = false;
    awaiting.current = false;
  }, [beat]);

  // Turning on: stop playback, start a fresh pass and park the cursor on a note.
  useEffect(() => {
    if (!enabled) return;
    pause();
    awaiting.current = false;
    live.current.pass = { hits: 0, firstTry: 0 };
    setPass(live.current.pass);
    const b = live.current.beat;
    const l = live.current.loop;
    if (!b || !isSounding(b) || (l && (barOf(b) < l[0] || barOf(b) > l[1]))) {
      const target = b && isSounding(b) && !l ? b : b && !l ? nextSoundingBeat(b) : startOfPass();
      if (target) live.current.seekBeat(target);
    }
    // Only when toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => () => clearTimeout(fbTimer.current), []);

  return { status, feedback, pass };
}
