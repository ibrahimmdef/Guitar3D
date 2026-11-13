import { describe, expect, it } from 'vitest';
import type { PracticeSession } from '@guitar3d/shared';
import { dayStreak, formatDuration, statsByRef, todayMinutes, weeklyMinutes } from './stats';

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString();
let n = 0;
const s = (startedAt: string, seconds: number, extra: Partial<PracticeSession> = {}): PracticeSession => ({
  id: String(++n), kind: 'tab', refId: 't1', title: 'Riff', startedAt, endedAt: startedAt, seconds, ...extra,
});
const NOW = new Date(2026, 10, 13, 18);

describe('practice stats', () => {
  it('sums today and the last seven days', () => {
    const list = [s(at(2026, 11, 13), 600), s(at(2026, 11, 13, 8), 300), s(at(2026, 11, 12), 1200), s(at(2026, 11, 1), 900)];
    expect(todayMinutes(list, NOW)).toBe(15);
    const w = weeklyMinutes(list, NOW);
    expect(w).toHaveLength(7);
    expect(w[6]).toMatchObject({ minutes: 15, today: true, label: 'Cum' });
    expect(w[5].minutes).toBe(20);
    expect(w.reduce((a, d) => a + d.minutes, 0)).toBe(35);
  });

  it('counts the day streak, alive until the day ends', () => {
    const days = [13, 12, 11, 9].map((d) => s(at(2026, 11, d), 120));
    expect(dayStreak(days, NOW)).toBe(3);
    // Nothing yet today: yesterday's streak still counts.
    expect(dayStreak(days.slice(1), NOW)).toBe(2);
    // Too short a session does not count.
    expect(dayStreak([s(at(2026, 11, 13), 30)], NOW)).toBe(0);
    expect(dayStreak([], NOW)).toBe(0);
    // Across a month boundary.
    expect(dayStreak([s(at(2026, 11, 1), 120), s(at(2026, 10, 31), 120)], new Date(2026, 10, 1, 20))).toBe(2);
  });

  it('keeps the best tempo and accuracy per tab', () => {
    const list = [
      s(at(2026, 11, 10), 100, { bestCleanSpeed: 0.7, accuracy: 80, endedAt: at(2026, 11, 10) }),
      s(at(2026, 11, 12), 100, { bestCleanSpeed: 0.85, endedAt: at(2026, 11, 12), title: 'Riff (yeni ad)' }),
      s(at(2026, 11, 11), 50, { refId: 't2', title: 'Etüt', accuracy: 95, endedAt: at(2026, 11, 11) }),
    ];
    const r = statsByRef(list);
    expect(r.map((x) => x.refId)).toEqual(['t1', 't2']);
    expect(r[0]).toMatchObject({ seconds: 200, sessions: 2, bestCleanSpeed: 0.85, bestAccuracy: 80, title: 'Riff (yeni ad)' });
    expect(r[1]).toMatchObject({ bestCleanSpeed: null, bestAccuracy: 95 });
  });

  it('formats durations', () => {
    expect(formatDuration(40)).toBe('40 sn');
    expect(formatDuration(720)).toBe('12 dk');
    expect(formatDuration(3900)).toBe('1 sa 5 dk');
  });
});
