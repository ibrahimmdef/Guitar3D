import { useEffect, useState, useSyncExternalStore } from 'react';
import { listBuiltinLessons } from '../../tabs/builtin';
import { saveSession } from '../progress/sessions';
import { buildRoutine, totalElapsed, type Routine, type RunState } from './routines';

/** The running routine, shared by the routines screen and the floating bar; kept in localStorage. */
const KEY = 'guitar3d.routine.v1';
const listeners = new Set<() => void>();
let current: RunState | null = load();

function load(): RunState | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v.length === 'number' && typeof v.step === 'number' ? (v as RunState) : null;
  } catch {
    return null;
  }
}

export function setRun(s: RunState | null) {
  current = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* in memory only */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useRun = () => useSyncExternalStore(subscribe, () => current, () => current);

let lessonsCache: ReturnType<typeof listBuiltinLessons> | null = null;
export function routineFor(length: RunState['length'], day: number): Routine {
  lessonsCache ??= listBuiltinLessons();
  return buildRoutine(length, lessonsCache, day);
}

/** Ends the routine and records the time spent (at least 20 s) as a 'routine' session. */
export function finishRun(run: RunState, now = Date.now()) {
  const seconds = Math.round(totalElapsed(run, now));
  if (seconds >= 20) {
    saveSession({
      kind: 'routine',
      refId: `routine-${run.length}`,
      title: routineFor(run.length, run.day).title,
      startedAt: run.startedAt,
      endedAt: new Date(now).toISOString(),
      seconds,
    });
  }
  setRun(null);
  return seconds;
}

/** Current time, re-rendering every `ms` while `enabled`. */
export function useNow(enabled: boolean, ms = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [enabled, ms]);
  return now;
}
