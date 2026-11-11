import { describe, expect, it } from 'vitest';
import { analyze, analyzeBar } from './analyze';
import { beatQuarters, type SimpleBar, type SimpleNote } from './model';

const n = (string: number, fret: number, extra: Partial<SimpleNote> = {}): SimpleNote => ({
  string, fret, hammer: false, slide: false, bend: false, palmMute: false, tied: false, ...extra,
});
const bar = (index: number, beats: SimpleNote[][], quarters = 0.5, tempo = 80): SimpleBar => ({
  index, tempo, beats: beats.map((notes) => ({ quarters, notes })),
});
const kinds = (b: SimpleBar) => analyzeBar(b, null).issues.map((i) => i.kind);

describe('beatQuarters', () => {
  it('handles plain, dotted and triplet durations', () => {
    expect(beatQuarters(4, 0)).toBe(1);
    expect(beatQuarters(8, 1)).toBe(0.75);
    expect(beatQuarters(8, 0, 3, 2)).toBeCloseTo(1 / 3);
  });
});

describe('analyzeBar', () => {
  it('detects a barre shape played as an arpeggio', () => {
    const f = bar(0, [[n(6, 1)], [n(5, 3)], [n(4, 3)], [n(3, 2)], [n(2, 1)], [n(1, 1)]]);
    expect(kinds(f)).toContain('barre');
  });

  it('does not flag an open C arpeggio as barre', () => {
    const c = bar(0, [[n(5, 3)], [n(4, 2)], [n(3, 0)], [n(2, 1)], [n(1, 0)]]);
    expect(kinds(c)).not.toContain('barre');
  });

  it('detects stretches inside a chord', () => {
    expect(kinds(bar(0, [[n(6, 3), n(5, 5), n(4, 7), n(3, 8)]], 2))).toContain('stretch');
  });

  it('detects position shifts', () => {
    expect(kinds(bar(0, [[n(1, 12)], [n(1, 10)], [n(4, 3)], [n(4, 5)]]))).toContain('shift');
  });

  it('detects fast passages and techniques', () => {
    const fast = bar(0, Array.from({ length: 16 }, (_, i) => [n(1, i % 2 ? 3 : 5, { hammer: i === 0 })]), 0.25, 100);
    const k = kinds(fast);
    expect(k).toContain('speed');
    expect(k).toContain('hammer');
  });
});

describe('analyze', () => {
  it('ranks hard bars and suggests a slower start speed', () => {
    const easy = bar(0, [[n(1, 0)], [n(2, 1)]], 2);
    const hard = bar(1, Array.from({ length: 16 }, (_, i) => [n(i % 2 ? 6 : 1, i % 2 ? 1 : 1)]), 0.25, 110);
    const r = analyze([easy, hard]);
    expect(r.hardestBars).toEqual([1]);
    expect(r.suggestedStartSpeed).toBeLessThanOrEqual(0.6);
  });
});
