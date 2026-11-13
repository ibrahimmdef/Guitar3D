import type { PracticeSession } from '@guitar3d/shared';

/** Pure practice statistics over sessions. Days are local calendar days. */

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

/** Seconds practised per local day (by session start). */
export function secondsByDay(sessions: PracticeSession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const k = dayKey(new Date(s.startedAt));
    m.set(k, (m.get(k) ?? 0) + s.seconds);
  }
  return m;
}

export function todayMinutes(sessions: PracticeSession[], now = new Date()) {
  return Math.round((secondsByDay(sessions).get(dayKey(now)) ?? 0) / 60);
}

/**
 * Consecutive days with at least `minSeconds` of practice, ending today. When today has nothing yet
 * the streak ending yesterday still counts (it is not broken until the day is over).
 */
export function dayStreak(sessions: PracticeSession[], now = new Date(), minSeconds = 60): number {
  const by = secondsByDay(sessions);
  const ok = (d: Date) => (by.get(dayKey(d)) ?? 0) >= minSeconds;
  let d = ok(now) ? now : addDays(now, -1);
  let n = 0;
  while (ok(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/** The last `days` days, oldest first, with minutes and a short Turkish weekday label. */
export function weeklyMinutes(sessions: PracticeSession[], now = new Date(), days = 7) {
  const by = secondsByDay(sessions);
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(now, i - days + 1);
    const key = dayKey(d);
    return { key, label: WEEKDAYS[d.getDay()], date: d, minutes: Math.round((by.get(key) ?? 0) / 60), today: i === days - 1 };
  });
}

export interface RefStats {
  key: string;
  kind: PracticeSession['kind'];
  refId?: string;
  title: string;
  seconds: number;
  sessions: number;
  bestCleanSpeed: number | null;
  bestAccuracy: number | null;
  lastAt: string;
}

/** Per tab / lesson / routine: total time, best clean tempo and best accuracy, most recent first. */
export function statsByRef(sessions: PracticeSession[]): RefStats[] {
  const m = new Map<string, RefStats>();
  for (const s of sessions) {
    const key = `${s.kind}:${s.refId ?? s.title}`;
    const r = m.get(key) ?? { key, kind: s.kind, refId: s.refId, title: s.title, seconds: 0, sessions: 0, bestCleanSpeed: null, bestAccuracy: null, lastAt: s.endedAt };
    r.seconds += s.seconds;
    r.sessions += 1;
    if (s.bestCleanSpeed != null) r.bestCleanSpeed = Math.max(r.bestCleanSpeed ?? 0, s.bestCleanSpeed);
    if (s.accuracy != null) r.bestAccuracy = Math.max(r.bestAccuracy ?? 0, s.accuracy);
    if (s.endedAt >= r.lastAt) {
      r.lastAt = s.endedAt;
      r.title = s.title;
    }
    m.set(key, r);
  }
  return [...m.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** "1 sa 5 dk" / "12 dk" / "40 sn". */
export function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sn`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa${min % 60 ? ` ${min % 60} dk` : ''}`;
}
