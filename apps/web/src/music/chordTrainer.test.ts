import { describe, expect, it } from 'vitest';
import { acceptStrum, bestFor, countChanges, leaderboard, pairKey, perMinute, sharedFingers, sharedText, type TrainerResult } from './chordTrainer';
import { VOICINGS } from './chords';

const open = (name: string) => VOICINGS.find((v) => v.name === name && v.shape === 'open')!;

describe('shared fingers', () => {
  it('finds the fingers that stay between C and Am', () => {
    // C x32010 / Am x02210: 1st finger (2nd string, 1st fret) and 2nd finger (4th string, 2nd fret) stay
    const s = sharedFingers(open('C'), open('Am'));
    expect(s.anchors).toEqual(expect.arrayContaining([
      { string: 2, fret: 1, finger: 1 },
      { string: 4, fret: 2, finger: 2 },
    ]));
    expect(sharedText(s).some((t) => t.includes('kalır'))).toBe(true);
  });
  it('is symmetric in anchors', () => {
    const a = sharedFingers(open('G'), open('Em')).anchors.length;
    expect(sharedFingers(open('Em'), open('G')).anchors.length).toBe(a);
  });
});

describe('change counting', () => {
  it('counts strums separated by the minimum gap, minus the first chord', () => {
    expect(countChanges([])).toBe(0);
    expect(countChanges([0.1])).toBe(0);
    expect(countChanges([0, 0.1, 0.2, 1, 1.05, 2, 3.5])).toBe(3);
    expect(countChanges([2, 0, 1], 0.5)).toBe(2);
    expect(acceptStrum(1, 1.3, 0.6)).toBe(false);
    expect(acceptStrum(1, 1.7, 0.6)).toBe(true);
  });
});

describe('history', () => {
  const h: TrainerResult[] = [
    { pair: pairKey('G', 'C'), changes: 20, seconds: 60, date: '2026-01-01' },
    { pair: pairKey('C', 'G'), changes: 14, seconds: 30, date: '2026-01-02' },
    { pair: pairKey('Am', 'E'), changes: 25, seconds: 60, date: '2026-01-03' },
  ];
  it('normalises pairs and rounds', () => {
    expect(pairKey('G', 'C')).toBe('C|G');
    expect(perMinute(h[1])).toBe(28);
    expect(bestFor(h, 'C|G')?.date).toBe('2026-01-02');
    expect(bestFor(h, 'D|A')).toBeNull();
    expect(leaderboard(h).map((r) => r.pair)).toEqual(['C|G', 'Am|E']);
  });
});
