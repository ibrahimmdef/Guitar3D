import { describe, expect, it } from 'vitest';
import { listBuiltinLessons } from '../../tabs/builtin';
import { advanceRun, buildRoutine, formatClock, pauseRun, resumeRun, startRun, stepElapsed, stepRemaining, totalElapsed } from './routines';

const lessons = listBuiltinLessons();

describe('routines', () => {
  it('builds warm-up → technique → piece → free with the right total length', () => {
    for (const len of [10, 20, 30] as const) {
      const r = buildRoutine(len, lessons, 0);
      expect(r.steps.map((s) => s.kind)).toEqual(['warmup', 'technique', 'piece', 'free']);
      expect(r.steps.reduce((a, s) => a + s.seconds, 0)).toBe(len * 60);
      for (const s of r.steps) if (s.target.type === 'lesson') expect(lessons.map((l) => l.id)).toContain(s.target.id);
    }
    expect(buildRoutine(10, lessons, 0).steps[0].target).toEqual({ type: 'lesson', id: 'chromatic-warmup' });
  });

  it('rotates technique (chords / scale) and piece by day', () => {
    expect(buildRoutine(20, lessons, 0).steps[1].target.type).toBe('chords');
    expect(buildRoutine(20, lessons, 1).steps[1].target.type).toBe('scale');
    const a = buildRoutine(20, lessons, 0).steps[2].target;
    const b = buildRoutine(20, lessons, 1).steps[2].target;
    expect(a).not.toEqual(b);
  });

  it('times steps, pauses, advances and finishes', () => {
    const routine = buildRoutine(10, lessons, 0);
    let r = startRun(10, 0, 0);
    expect(stepRemaining(routine, r, 30_000)).toBe(90);
    r = pauseRun(r, 30_000);
    expect(stepElapsed(r, 99_000)).toBe(30);
    r = resumeRun(r, 100_000);
    expect(stepElapsed(r, 110_000)).toBe(40);
    let adv = advanceRun(routine, r, 110_000);
    expect(adv.finished).toBe(false);
    expect(adv.state).toMatchObject({ step: 1, stepSpent: 0, runningSince: 110_000 });
    expect(totalElapsed(adv.state, 120_000)).toBe(50);
    adv = advanceRun(routine, adv.state, 120_000);
    adv = advanceRun(routine, adv.state, 130_000);
    adv = advanceRun(routine, adv.state, 140_000);
    expect(adv.finished).toBe(true);
    expect(adv.state.totalSpent).toBe(70);
    expect(formatClock(89.2)).toBe('01:30');
  });
});
