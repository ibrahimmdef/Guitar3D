import { describe, expect, it } from 'vitest';
import type { PracticeSession } from '@guitar3d/shared';
import { levelLessons } from '../../music/course';
import { earnedBadges, longestStreak, weekMinutes, weekStart } from './badges';

let n = 0;
const s = (startedAt: string, seconds: number, extra: Partial<PracticeSession> = {}): PracticeSession => ({
  id: String(n++), kind: 'tab', title: 'x', startedAt, endedAt: startedAt, seconds, ...extra,
});

describe('badges', () => {
  it('counts the longest streak, not only the current one', () => {
    const list = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05'].map((d) => s(`${d}T10:00:00`, 120));
    expect(longestStreak(list)).toBe(3);
    expect(longestStreak([s('2026-11-01T10:00:00', 30)])).toBe(0);
  });

  it('computes the calendar week from Monday', () => {
    expect(weekStart(new Date(2026, 10, 15, 20)).getDate()).toBe(9); // Sunday 15 Nov → Monday 9 Nov
    const list = [s(new Date(2026, 10, 9, 8).toISOString(), 600), s(new Date(2026, 10, 8, 8).toISOString(), 600)];
    expect(weekMinutes(list, new Date(2026, 10, 13))).toBe(10);
  });

  it('derives badges from sessions and course progress', () => {
    const sessions = [
      s('2026-11-01T10:00:00', 3600, { bestCleanSpeed: 1 }),
      s('2026-11-02T10:00:00', 120, { kind: 'chords', accuracy: 95 }),
      s('2026-11-03T10:00:00', 120, { kind: 'scales' }),
    ];
    const done = new Set(levelLessons(1).map((l) => l.id));
    const ids = earnedBadges({ sessions, courseDone: done, weeklyGoalMinutes: 30 });
    expect(ids).toEqual(expect.arrayContaining(['first-song', 'streak-3', 'tempo-100', 'accuracy-90', 'week-goal', 'minutes-60', 'course-1']));
    expect(ids).not.toContain('streak-7');
    expect(ids).not.toContain('course-2');
    expect(earnedBadges({ sessions: [], courseDone: new Set(), weeklyGoalMinutes: 60 })).toEqual([]);
  });
});
