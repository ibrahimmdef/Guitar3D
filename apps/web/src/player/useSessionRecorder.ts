import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { SessionKind } from '@guitar3d/shared';
import { saveSession } from '../screens/progress/sessions';

/** Sessions shorter than this are not recorded. */
export const MIN_SESSION_MS = 20_000;

interface Args {
  /** True while the user is actually practising (playing or listening). */
  active: boolean;
  kind: SessionKind;
  refId?: string;
  title: string;
  /** Do not record (e.g. a routine is recording the time instead). */
  disabled?: boolean;
}

/**
 * Records one practice session per screen visit: active time only, plus the best clean speed and
 * listen-mode accuracy reported through the returned callbacks. Saved on unmount or page hide.
 */
export function useSessionRecorder({ active, kind, refId, title, disabled }: Args) {
  const acc = useRef({ ms: 0, since: 0, startedAt: '', best: undefined as number | undefined, accuracy: undefined as number | undefined });
  const meta = useRef({ kind, refId, title, disabled });
  meta.current = { kind, refId, title, disabled };

  useEffect(() => {
    const a = acc.current;
    const now = Date.now();
    if (active && !disabled) {
      if (!a.since) a.since = now;
      if (!a.startedAt) a.startedAt = new Date(now).toISOString();
    } else if (a.since) {
      a.ms += now - a.since;
      a.since = 0;
    }
  }, [active, disabled]);

  const flush = useCallback((beacon: boolean) => {
    const a = acc.current;
    const now = Date.now();
    const ms = a.ms + (a.since ? now - a.since : 0);
    const m = meta.current;
    if (ms >= MIN_SESSION_MS && a.startedAt && !m.disabled) {
      saveSession({
        kind: m.kind,
        refId: m.refId,
        title: m.title,
        startedAt: a.startedAt,
        endedAt: new Date(now).toISOString(),
        seconds: Math.round(ms / 1000),
        bestCleanSpeed: a.best,
        accuracy: a.accuracy,
      }, beacon);
    }
    acc.current = { ms: 0, since: a.since ? now : 0, startedAt: a.since ? new Date(now).toISOString() : '', best: undefined, accuracy: undefined };
  }, []);

  useEffect(() => {
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush(false);
    };
  }, [flush]);

  const noteClean = useCallback((speed: number) => {
    acc.current.best = Math.max(acc.current.best ?? 0, speed);
  }, []);
  const noteAccuracy = useCallback((accuracy: number) => {
    acc.current.accuracy = Math.max(acc.current.accuracy ?? 0, accuracy);
  }, []);
  return useMemo(() => ({ noteClean, noteAccuracy }), [noteClean, noteAccuracy]);
}
