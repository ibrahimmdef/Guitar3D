import type { PracticeSession } from '@guitar3d/shared';
import { LEVEL_TITLES, levelProgress } from '../../music/course';
import { dayKey, secondsByDay } from './stats';

/** Badges derived from practice sessions and course progress. Nothing is stored server-side. */
export interface Badge {
  id: string;
  title: string;
  description: string;
}

export interface BadgeInput {
  sessions: PracticeSession[];
  courseDone: ReadonlySet<string>;
  weeklyGoalMinutes: number;
  now?: Date;
}

const MINUTE_STEPS = [60, 300, 1000];

export const ALL_BADGES: Badge[] = [
  { id: 'first-song', title: 'İlk parça', description: 'Bir tabı ya da dersi ilk kez çaldın.' },
  { id: 'streak-3', title: '3 gün seri', description: 'Üç gün üst üste çalıştın.' },
  { id: 'streak-7', title: '7 gün seri', description: 'Bir hafta boyunca her gün çalıştın.' },
  { id: 'tempo-100', title: 'Tam tempo', description: 'Bir bölümü %100 hızda temiz çaldın.' },
  { id: 'accuracy-90', title: 'Kulak onayı', description: 'Dinleme modunda %90 doğruluğa ulaştın.' },
  { id: 'week-goal', title: 'Haftalık hedef', description: 'Bir haftada hedef dakikana ulaştın.' },
  ...MINUTE_STEPS.map((m) => ({ id: `minutes-${m}`, title: `${m} dakika`, description: `Toplam ${m} dakika çalıştın.` })),
  ...Object.entries(LEVEL_TITLES).map(([lvl, t]) => ({ id: `course-${lvl}`, title: `Seviye ${lvl}`, description: `Ders seviyesi “${t}” tamamlandı.` })),
];

/** Longest run of consecutive days with at least `minSeconds` of practice. */
export function longestStreak(sessions: PracticeSession[], minSeconds = 60): number {
  const days = [...secondsByDay(sessions)].filter(([, s]) => s >= minSeconds).map(([k]) => k).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of days) {
    if (prev) {
      const d = new Date(`${prev}T12:00:00`);
      d.setDate(d.getDate() + 1);
      run = dayKey(d) === k ? run + 1 : 1;
    } else run = 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

/** Monday 00:00 of the week containing `d` (local time). */
export function weekStart(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

/** Practice minutes in the calendar week (Mon–Sun) containing `now`. */
export function weekMinutes(sessions: PracticeSession[], now = new Date()): number {
  const from = weekStart(now).getTime();
  const to = from + 7 * 86400000;
  const sec = sessions.filter((s) => {
    const t = Date.parse(s.startedAt);
    return t >= from && t < to;
  }).reduce((a, s) => a + s.seconds, 0);
  return Math.round(sec / 60);
}

/** Minutes per calendar week, keyed by the Monday's day key. */
function minutesByWeek(sessions: PracticeSession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const k = dayKey(weekStart(new Date(s.startedAt)));
    m.set(k, (m.get(k) ?? 0) + s.seconds / 60);
  }
  return m;
}

/** Ids of all badges earned with this data. */
export function earnedBadges({ sessions, courseDone, weeklyGoalMinutes }: BadgeInput): string[] {
  const out: string[] = [];
  if (sessions.some((s) => s.kind === 'tab' || s.kind === 'lesson')) out.push('first-song');
  const streak = longestStreak(sessions);
  if (streak >= 3) out.push('streak-3');
  if (streak >= 7) out.push('streak-7');
  if (sessions.some((s) => (s.bestCleanSpeed ?? 0) >= 1)) out.push('tempo-100');
  if (sessions.some((s) => (s.accuracy ?? 0) >= 90)) out.push('accuracy-90');
  if (weeklyGoalMinutes > 0 && [...minutesByWeek(sessions).values()].some((m) => m >= weeklyGoalMinutes)) out.push('week-goal');
  const total = sessions.reduce((a, s) => a + s.seconds, 0) / 60;
  for (const m of MINUTE_STEPS) if (total >= m) out.push(`minutes-${m}`);
  for (const lvl of Object.keys(LEVEL_TITLES)) if (levelProgress(courseDone, Number(lvl)).pct === 100) out.push(`course-${lvl}`);
  return out;
}

/* ---------- Seen badges (for "new badge" toasts) ---------- */
const KEY = 'guitar3d.badges.v1';

export function loadSeen(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Stores the earned badges; returns the ones not seen before (none on the very first run, to avoid a flood). */
export function markSeen(earned: string[], now = new Date()): Badge[] {
  const seen = loadSeen();
  const next = { ...(seen ?? {}) };
  const fresh: Badge[] = [];
  for (const id of earned) {
    if (next[id]) continue;
    next[id] = now.toISOString();
    if (seen) {
      const b = ALL_BADGES.find((x) => x.id === id);
      if (b) fresh.push(b);
    }
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return fresh;
}

/** Fired after a practice session was saved, so badges can be re-checked. */
export const SESSION_SAVED_EVENT = 'guitar3d:session-saved';
