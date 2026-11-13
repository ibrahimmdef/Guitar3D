import { describe, expect, it } from 'vitest';
import { assignFingers, candidates, sequenceCost, suggestFingering, type BeatPositions } from './fingering';
import { STANDARD } from './tunings';

const T = STANDARD.midi;
const midiOf = (b: BeatPositions) => b.map((p) => T[p.string - 1] + p.fret).sort((a, c) => a - c);
const one = (string: number, fret: number): BeatPositions => [{ string, fret }];

describe('candidates', () => {
  it('lists every position of a note and keeps chord notes on separate strings', () => {
    expect(candidates([64], T).map((c) => c[0])).toEqual([{ string: 1, fret: 0 }, { string: 2, fret: 5 }, { string: 3, fret: 9 }, { string: 4, fret: 14 }]);
    for (const c of candidates([48, 52, 55], T)) expect(new Set(c.map((p) => p.string)).size).toBe(3);
  });
});

describe('suggestFingering', () => {
  it('keeps the pitches and never costs more than the tab as written', () => {
    const tab = [one(3, 2), one(1, 12), one(3, 2), one(1, 12)];
    const r = suggestFingering(tab, T);
    r.beats.forEach((b, i) => expect(midiOf(b)).toEqual(midiOf(tab[i])));
    expect(r.cost).toBeLessThan(r.originalCost);
    // the A moves up to the 12th fret so the hand stays in one position
    expect(r.beats[0][0]).toMatchObject({ string: 5, fret: 12 });
    expect(r.changed).toEqual([0, 2]);
  });
  it('leaves an already easy open-position line alone', () => {
    const tab = [one(5, 3), one(4, 0), one(4, 2), one(4, 3), one(3, 0), one(3, 2)];
    const r = suggestFingering(tab, T);
    expect(r.changed).toEqual([]);
    expect(r.cost).toBeCloseTo(sequenceCost(tab), 1);
  });
  it('keeps a written open C chord and fingers it 3-2-1', () => {
    const c: BeatPositions = [{ string: 5, fret: 3 }, { string: 4, fret: 2 }, { string: 3, fret: 0 }, { string: 2, fret: 1 }, { string: 1, fret: 0 }];
    const r = suggestFingering([c], T);
    expect(r.changed).toEqual([]);
    expect(r.beats[0].map((p) => p.finger)).toEqual([3, 2, 0, 1, 0]);
  });
  it('handles rests and empty input', () => {
    expect(suggestFingering([], T).beats).toEqual([]);
    const r = suggestFingering([one(1, 0), [], one(1, 3)], T);
    expect(r.beats[1]).toEqual([]);
  });
});

describe('assignFingers', () => {
  it('gives one finger per fret from the hand position', () => {
    expect(assignFingers([{ string: 1, fret: 5 }, { string: 1, fret: 8 }, { string: 2, fret: 9 }], 5).map((p) => p.finger)).toEqual([1, 4, 4]);
  });
});
