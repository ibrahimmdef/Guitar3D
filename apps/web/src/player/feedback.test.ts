import { describe, expect, it } from 'vitest';
import { aggregateFeedback, classifyNote, hardestRange, worstBars, type NoteResult } from './feedback';

describe('listen-mode feedback', () => {
  it('classifies notes: early > missed > late > clean', () => {
    expect(classifyNote({ missed: true, early: true, waitMs: 0, beatMs: 500 })).toBe('early');
    expect(classifyNote({ missed: true, early: false, waitMs: 5000, beatMs: 500 })).toBe('missed');
    expect(classifyNote({ missed: false, early: false, waitMs: 1300, beatMs: 500 })).toBe('late');
    expect(classifyNote({ missed: false, early: false, waitMs: 1300, beatMs: 1000 })).toBe('clean');
    expect(classifyNote({ missed: false, early: false, waitMs: 200, beatMs: 500 })).toBe('clean');
  });

  const results: NoteResult[] = [
    { bar: 0, outcome: 'clean' }, { bar: 0, outcome: 'clean' },
    { bar: 1, outcome: 'missed' }, { bar: 1, outcome: 'clean' },
    { bar: 2, outcome: 'late' }, { bar: 2, outcome: 'early' }, { bar: 2, outcome: 'clean' }, { bar: 2, outcome: 'clean' },
    { bar: 4, outcome: 'clean' },
  ];

  it('aggregates per bar and overall', () => {
    const { bars, overall } = aggregateFeedback(results);
    expect(bars.map((b) => b.bar)).toEqual([0, 1, 2, 4]);
    expect(bars[1]).toMatchObject({ total: 2, clean: 1, missed: 1, accuracy: 50 });
    expect(bars[2]).toMatchObject({ late: 1, early: 1, accuracy: 50 });
    expect(overall).toMatchObject({ total: 9, clean: 6, missed: 1, early: 1, late: 1, accuracy: 67 });
    expect(aggregateFeedback([]).overall.accuracy).toBe(0);
  });

  it('finds the worst bars and the range to loop', () => {
    const { bars } = aggregateFeedback(results);
    expect(worstBars(bars).map((b) => b.bar)).toEqual([2, 1]);
    expect(hardestRange(bars)).toEqual([1, 2]);
    expect(hardestRange(bars, 1)).toEqual([2, 2]);
    expect(hardestRange(aggregateFeedback([{ bar: 3, outcome: 'clean' }]).bars)).toBeNull();
    // A clean neighbour is not included.
    expect(hardestRange(aggregateFeedback([{ bar: 5, outcome: 'missed' }, { bar: 6, outcome: 'clean' }]).bars)).toEqual([5, 5]);
  });
});
