import { useEffect, useRef, useState } from 'react';

/** Seconds left of a countdown; calls `onEnd` once when it reaches 0. Restarts when `runId` changes. */
export function useCountdown(seconds: number, running: boolean, runId: number, onEnd: () => void): number {
  const [left, setLeft] = useState(seconds);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    setLeft(seconds);
    if (!running) return;
    const t0 = performance.now();
    let done = false;
    const id = window.setInterval(() => {
      const l = Math.max(0, seconds - (performance.now() - t0) / 1000);
      setLeft(l);
      if (l <= 0 && !done) {
        done = true;
        clearInterval(id);
        end.current();
      }
    }, 100);
    return () => clearInterval(id);
  }, [seconds, running, runId]);
  return left;
}

/** Plays-it-back helper: the same midi must be heard for `need` frames in a row. */
export function stableNote(prev: { midi: number; frames: number } | null, midi: number | null, need = 4) {
  if (midi == null) return { state: null, stable: null as number | null };
  const m = Math.round(midi);
  const frames = prev && prev.midi === m ? prev.frames + 1 : 1;
  return { state: { midi: m, frames }, stable: frames === need ? m : null };
}
