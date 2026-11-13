import { describe, expect, it } from 'vitest';
import { seeded } from './fretGame';
import {
  checkNeck, earTex, INTERVAL_LEVELS, intervalNotes, intervalQuestion, neckQuestion, placeNote, placeNotes, QUALITY_LEVELS, qualityQuestion,
  questionGroups, shouldLevelUp,
} from './ear';
import { STANDARD } from './tunings';

const playable = (m: number) => m >= 40 && m <= 40 + 24 + 20;

describe('interval questions', () => {
  it('stay inside the level set and the guitar range', () => {
    const rng = seeded(3);
    for (let level = 1; level <= 4; level++) {
      for (let i = 0; i < 100; i++) {
        const q = intervalQuestion(level, rng, ['up', 'down', 'together']);
        expect(INTERVAL_LEVELS[level - 1]).toContain(q.semitones);
        expect(q.options).toBe(INTERVAL_LEVELS[level - 1]);
        const [a, b] = intervalNotes(q);
        expect(Math.abs(b - a)).toBe(q.semitones);
        expect(playable(a) && playable(b)).toBe(true);
        expect(earTex(questionGroups(q))).not.toBeNull();
      }
    }
  });
});

describe('chord quality questions', () => {
  it('build the chord from its intervals and can always be played', () => {
    const rng = seeded(9);
    for (let level = 1; level <= 3; level++) {
      for (let i = 0; i < 60; i++) {
        const q = qualityQuestion(level, rng);
        expect(QUALITY_LEVELS[level - 1]).toContain(q.quality);
        expect(q.midi[0]).toBe(q.root);
        expect(earTex(questionGroups(q))).not.toBeNull();
      }
    }
  });
});

describe('neck questions', () => {
  it('level 1 only uses open strings and checks exact pitch', () => {
    const rng = seeded(5);
    for (let i = 0; i < 30; i++) {
      const q = neckQuestion(1, STANDARD, rng);
      expect(STANDARD.midi).toContain(q.midi);
    }
    const q = { kind: 'neck' as const, midi: 45, maxFret: 5, anyOctave: false };
    expect(checkNeck(q, 5, 0)).toBe(true);
    expect(checkNeck(q, 6, 5)).toBe(true);
    expect(checkNeck(q, 3, 2)).toBe(false); // A3, an octave up
    expect(checkNeck({ ...q, anyOctave: true }, 3, 2)).toBe(true);
  });
});

describe('placing notes for playback', () => {
  it('puts each chord note on its own string with the right pitch', () => {
    const midis = [45, 49, 52, 55];
    const ps = placeNotes(midis)!;
    expect(new Set(ps.map((p) => p.string)).size).toBe(4);
    ps.forEach((p, i) => expect(STANDARD.midi[p.string - 1] + p.fret).toBe(midis[i]));
    expect(placeNotes([30])).toBeNull();
    expect(placeNote(64)).toEqual({ string: 1, fret: 0 });
  });
  it('writes alphaTex half notes', () => {
    expect(earTex([[45], [52]])).toMatch(/:2 0\.5 2\.4 \|$/);
    expect(earTex([[45, 52]])).toMatch(/:2 \(0\.5 2\.4\) r \|$/);
  });
});

describe('level up', () => {
  it('needs 8 of the last 10', () => {
    expect(shouldLevelUp([true, true, true])).toBe(false);
    expect(shouldLevelUp([false, false, ...Array(8).fill(true)])).toBe(true);
    expect(shouldLevelUp([...Array(7).fill(true), false, false, false])).toBe(false);
  });
});
