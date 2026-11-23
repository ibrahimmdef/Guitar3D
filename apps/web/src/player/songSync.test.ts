import { describe, expect, it } from 'vitest';
import { beatTimes, firstBeatFrom, syncPointsFor } from './songSync';

describe('song sync', () => {
  it('pins every bar of the tab to its time in the song', () => {
    expect(syncPointsFor([-0.4, 1.7, 3.9, 6.1], 2)).toEqual([
      { barIndex: 0, barOccurence: 0, barPosition: 0, millisecondOffset: -400 },
      { barIndex: 1, barOccurence: 0, barPosition: 0, millisecondOffset: 1700 },
    ]);
  });

  it('splits bars of different lengths into beats', () => {
    const beats = beatTimes([0, 2, 4.4], 4);
    expect(beats.map((b) => b.t)).toEqual([0, 0.5, 1, 1.5, 2, 2.6, 3.2, 3.8000000000000003]);
    expect(beats.filter((b) => b.down).map((b) => b.t)).toEqual([0, 2]);
  });

  it('finds the next beat to click', () => {
    const beats = beatTimes([0, 2], 4);
    expect(firstBeatFrom(beats, -1)).toBe(0);
    expect(firstBeatFrom(beats, 0.5)).toBe(1);
    expect(firstBeatFrom(beats, 0.51)).toBe(2);
    expect(firstBeatFrom(beats, 9)).toBe(4);
  });
});
