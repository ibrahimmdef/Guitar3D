import { describe, expect, it } from 'vitest';
import { detectOnsets, matchOnsets, nearestExpected, offsetLabel, summarizeTiming, verdict } from './onset';
import { countLabels, getPattern, handMotionConsistent, parseSteps, PATTERNS, stepEvents, stepSeconds, strokeTimes } from '../music/rhythm';

const FRAME = 0.01;

/** Synthetic envelope: noise floor with decaying plucks at the given times. */
function envelope(plucks: number[], seconds: number, floor = 0.005) {
  const n = Math.round(seconds / FRAME);
  return Array.from({ length: n }, (_, i) => {
    const t = i * FRAME;
    let v = floor * (1 + 0.3 * Math.sin(i * 1.7));
    for (const p of plucks) if (t >= p - 1e-9) v += 0.3 * Math.exp(-(t - p) * 6);
    return v;
  });
}

describe('onset detection', () => {
  it('finds each pluck once, at the right frame', () => {
    const plucks = [0.2, 0.7, 1.2, 1.45];
    const got = detectOnsets(envelope(plucks, 2), FRAME);
    expect(got).toHaveLength(plucks.length);
    got.forEach((t, i) => expect(Math.abs(t - plucks[i])).toBeLessThanOrEqual(FRAME + 1e-9));
  });
  it('ignores room noise and a ringing string', () => {
    expect(detectOnsets(envelope([], 2), FRAME)).toEqual([]);
    expect(detectOnsets(envelope([0.1], 2), FRAME)).toHaveLength(1);
  });
  it('respects the refractory time', () => {
    expect(detectOnsets(envelope([0.2, 0.24], 1), FRAME, { refractory: 0.1 })).toHaveLength(1);
  });
});

describe('timing scores', () => {
  const expected = [0, 0.5, 1, 1.5];
  it('matches onsets to the nearest stroke with signed offsets', () => {
    expect(nearestExpected(expected, 0.48)).toEqual({ index: 1, offsetMs: -20 });
    expect(nearestExpected(expected, 0.75)).toBeNull();
    const m = matchOnsets(expected, [0.03, 0.47, 0.49, 1.6]);
    expect(m.hits.map((h) => [h.index, h.offsetMs])).toEqual([[0, 30], [1, -10], [3, 100]]);
    expect(m.missed).toEqual([2]);
    expect(m.extra).toBe(1);
  });
  it('summarises rushing and dragging', () => {
    const s = summarizeTiming([{ index: 0, offsetMs: -60 }, { index: 1, offsetMs: 10 }, { index: 2, offsetMs: 80 }], 4);
    expect(s).toMatchObject({ hits: 3, onTime: 1, early: 1, late: 1, missed: 1, meanOffsetMs: 10, meanAbsMs: 50 });
    expect(s.score).toBeGreaterThan(40);
    expect(s.score).toBeLessThan(75);
    expect(summarizeTiming([0, 1, 2].map((index) => ({ index, offsetMs: 0 })), 3).score).toBe(100);
  });
  it('labels offsets in Turkish', () => {
    expect(verdict(-50)).toBe('early');
    expect(offsetLabel(-50)).toBe('50 ms erken');
    expect(offsetLabel(12)).toBe('zamanında');
    expect(offsetLabel(70)).toBe('70 ms geç');
  });
});

describe('strumming patterns', () => {
  it('have whole bars and valid steps', () => {
    for (const p of PATTERNS) {
      const pulses = p.meter === '4/4' ? 4 : p.meter === '3/4' ? 3 : 2;
      expect(p.steps.length, p.id).toBe(pulses * p.perPulse);
      expect(p.steps).toMatch(/^[DdUuXx-]+$/);
      expect(handMotionConsistent(p), p.id).toBe(true);
    }
  });
  it('parses strokes', () => {
    expect(parseSteps('Du-X')).toEqual([
      { dir: 'down', accent: true, muted: false },
      { dir: 'up', accent: false, muted: false },
      null,
      { dir: 'down', accent: true, muted: true },
    ]);
  });
  it('times steps and clicks from the tempo', () => {
    const p = getPattern('eighths');
    expect(stepSeconds(p, 120)).toBeCloseTo(0.25);
    const ev = stepEvents(p, 120, 2);
    expect(ev).toHaveLength(16);
    expect(ev[8]).toMatchObject({ bar: 1, index: 0, click: 2 });
    expect(ev[2].click).toBe(1);
    expect(ev[1].click).toBe(0);
    expect(strokeTimes(getPattern('pop'), 60, 1)).toEqual([0, 1, 1.5, 2.5, 3, 3.5]);
  });
  it('counts in Turkish', () => {
    expect(countLabels(getPattern('eighths'))).toEqual(['1', 've', '2', 've', '3', 've', '4', 've']);
    expect(countLabels(getPattern('six-eight')).join(' ')).toBe('1 2 3 4 5 6');
    expect(countLabels(getPattern('sixteenths')).slice(0, 4)).toEqual(['1', 'e', 've', 'a']);
  });
});
