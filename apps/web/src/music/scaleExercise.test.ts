import { describe, expect, it } from 'vitest';
import { firstOctave, neckNotes, scaleExercise } from './scales';

const octave = firstOctave(neckNotes(9, 'minor', undefined, 12)); // A natural minor, 8 notes

describe('scaleExercise', () => {
  it('up/down goes root → octave → root', () => {
    const seq = scaleExercise(octave, 'updown');
    expect(seq.length).toBe(15);
    expect(seq[0].midi).toBe(seq[14].midi);
    expect(seq[7].midi - seq[0].midi).toBe(12);
  });
  it('thirds skip one scale step each pair', () => {
    const seq = scaleExercise(octave, 'thirds');
    expect(seq.slice(0, 4).map((n) => n.midi - seq[0].midi)).toEqual([0, 3, 2, 5]);
    expect(seq[seq.length - 1].midi).toBe(seq[0].midi);
  });
  it('groups of four ascend then descend and end on the root', () => {
    const seq = scaleExercise(octave, 'fours');
    expect(seq.length).toBe(5 * 4 * 2 + 1);
    expect(seq.slice(0, 4).map((n) => n.midi - seq[0].midi)).toEqual([0, 2, 3, 5]);
    expect(seq[seq.length - 1].isRoot).toBe(true);
  });
});
