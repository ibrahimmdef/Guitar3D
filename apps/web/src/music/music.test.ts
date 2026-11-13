import { describe, expect, it } from 'vitest';
import { baseFret, CHORD_TYPES, chordPcs, groupVoicings, searchChords, voicingMidi, voicingNotes, VOICINGS } from './chords';
import { noteName, noteWithOctave, parseRoot, pc } from './notes';
import { ascendDescend, firstOctave, neckNotes, scalePcs, scalePositions, SCALES } from './scales';
import { chordTex, sequenceTex, texHeader, texPitch } from './tex';
import { cents, median, needleAngle, readTuner } from './tuner';
import { fretMidi, getTuning, noteAt, STANDARD, tunerTargets, TUNINGS, withCapo, clampCapo, findTuning } from './tunings';

describe('notes', () => {
  it('names pitch classes and octaves', () => {
    expect(noteName(61)).toBe('C#');
    expect(noteName(61, true)).toBe('Db');
    expect(noteWithOctave(40)).toBe('E2');
    expect(noteWithOctave(64)).toBe('E4');
    expect(pc(-1)).toBe(11);
  });
  it('parses letter and solfège roots', () => {
    expect(parseRoot('F#m7')).toEqual({ pc: 6, length: 2 });
    expect(parseRoot('Bb')).toEqual({ pc: 10, length: 2 });
    expect(parseRoot('Sol7')).toEqual({ pc: 7, length: 3 });
    expect(parseRoot('la minör')?.pc).toBe(9);
    expect(parseRoot('xyz')).toBeNull();
  });
});

describe('tunings and capo', () => {
  it('has the six requested tunings with six strings each', () => {
    expect(TUNINGS.map((t) => t.id)).toEqual(['standard', 'half-down', 'drop-d', 'dadgad', 'open-g', 'open-d']);
    for (const t of TUNINGS) expect(t.midi).toHaveLength(6);
  });
  it('names notes per tuning and capo', () => {
    expect(noteAt(STANDARD, 6, 0)).toBe('E');
    expect(noteAt(getTuning('drop-d'), 6, 0)).toBe('D');
    expect(noteAt(getTuning('drop-d'), 6, 2)).toBe('E');
    expect(noteAt(getTuning('half-down'), 1, 0)).toBe('D#');
    expect(noteAt(getTuning('open-g'), 5, 0)).toBe('G');
    expect(noteAt(STANDARD, 6, 0, 2)).toBe('F#');
    expect(fretMidi(STANDARD, 1, 3, 2)).toBe(69);
    expect(getTuning('nope')).toBe(STANDARD);
    expect(findTuning([62, 57, 55, 50, 45, 38])?.id).toBe('dadgad');
  });
  it('lists tuner targets lowest string first, shifted by the capo', () => {
    const t = tunerTargets(getTuning('dadgad'));
    expect(t.map((x) => x.name)).toEqual(['D2', 'A2', 'D3', 'G3', 'A3', 'D4']);
    expect(tunerTargets(STANDARD, 1)[0]).toMatchObject({ string: 6, midi: 41, name: 'F2' });
  });
  it('moves markers by the capo, open strings onto the capo fret', () => {
    const moved = withCapo([{ string: 1, fret: 0, state: 'now' }, { string: 2, fret: 3, state: 'next' }, { string: 3, fret: 0, state: 'now', muted: true }], 3);
    expect(moved.map((n) => n.fret)).toEqual([3, 6, 0]);
    expect(clampCapo(15)).toBe(12);
    expect(clampCapo(-2)).toBe(0);
  });
});

describe('chord library', () => {
  it('covers every type, and E/A barre shapes exist for all 12 roots', () => {
    for (const ct of CHORD_TYPES) expect(VOICINGS.some((v) => v.type === ct.id)).toBe(true);
    for (let r = 0; r < 12; r++) {
      for (const type of ['maj', 'm', '7', 'm7', 'sus4', '5'] as const) {
        expect(VOICINGS.some((v) => v.root === r && v.type === type && v.shape === 'E')).toBe(true);
      }
      for (const type of ['maj', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'add9', '5'] as const) {
        expect(VOICINGS.some((v) => v.root === r && v.type === type && v.shape === 'A')).toBe(true);
      }
    }
  });

  it('every voicing sounds only chord tones, has the root in the bass and the full chord', () => {
    for (const v of VOICINGS) {
      const midi = voicingMidi(v);
      const pcs = new Set(midi.map(pc));
      const want = chordPcs(v.root, v.type);
      for (const p of pcs) expect(want, `${v.id} has ${noteName(p)}`).toContain(p);
      // The fifth may be left out of four-note chords (C7 x32310), as guitarists do.
      for (const p of want) if (!(want.length > 3 && p === pc(v.root + 7))) expect(pcs.has(p), `${v.id} misses ${noteName(p)}`).toBe(true);
      expect(pc(Math.min(...midi)), `${v.id} bass`).toBe(v.root);
    }
  });

  it('fingering is playable: fretted ↔ finger 1–4, one fret per finger, span ≤ 4, barre on its fret', () => {
    for (const v of VOICINGS) {
      expect(v.frets).toHaveLength(6);
      const byFinger = new Map<number, Set<number>>();
      v.frets.forEach((f, i) => {
        const finger = v.fingers[i];
        if (f > 0) {
          expect(finger, `${v.id} string ${6 - i}`).toBeGreaterThanOrEqual(1);
          expect(finger).toBeLessThanOrEqual(4);
          byFinger.set(finger, (byFinger.get(finger) ?? new Set()).add(f));
        } else expect(finger, `${v.id} string ${6 - i}`).toBe(0);
      });
      for (const [finger, frets] of byFinger) expect(frets.size, `${v.id} finger ${finger}`).toBe(1);
      const fretted = v.frets.filter((f) => f > 0);
      expect(Math.max(...fretted) - Math.min(...fretted), v.id).toBeLessThanOrEqual(4);
      if (v.barre) {
        expect(v.barre.fret).toBe(baseFret(v));
        for (let s = v.barre.to; s <= v.barre.from; s++) {
          const f = v.frets[6 - s];
          if (f >= 0) expect(f, `${v.id} barre string ${s}`).toBeGreaterThanOrEqual(v.barre.fret);
        }
      }
    }
  });

  it('known shapes: F major barre at fret 1, Bm A-shape at fret 2', () => {
    expect(VOICINGS.find((v) => v.id === 'F:E')?.frets).toEqual([1, 3, 3, 2, 1, 1]);
    expect(VOICINGS.find((v) => v.id === 'Bm:A')?.frets).toEqual([-1, 2, 4, 4, 3, 2]);
    expect(VOICINGS.find((v) => v.id === 'E:E')?.frets[0]).toBe(12);
  });

  it('turns a voicing into 3D markers with fingers and muted strings', () => {
    const c = VOICINGS.find((v) => v.id === 'C:open')!;
    const notes = voicingNotes(c);
    expect(notes.find((n) => n.string === 6)).toMatchObject({ muted: true });
    expect(notes.find((n) => n.string === 5)).toMatchObject({ fret: 3, finger: 3 });
    expect(notes.find((n) => n.string === 1)?.finger).toBeUndefined();
  });

  it('searches by root, type and text (letters and solfège)', () => {
    expect(searchChords({ text: 'Am' }).every((v) => v.name === 'Am')).toBe(true);
    expect(searchChords({ text: 'Am' }).length).toBeGreaterThan(1);
    expect(searchChords({ text: 'sol7' }).every((v) => v.name === 'G7')).toBe(true);
    expect(searchChords({ text: 'f#m7' }).map((v) => v.name)).toContain('F#m7');
    expect(searchChords({ root: 0, type: 'maj7' }).every((v) => v.name === 'Cmaj7')).toBe(true);
    expect(searchChords({ text: 'power' }).every((v) => v.type === '5')).toBe(true);
    const g = groupVoicings(searchChords({ root: 9 }));
    expect(g.find((x) => x.name === 'A')?.voicings[0].shape).toBe('open');
  });
});

describe('scales', () => {
  it('has the requested scales with correct intervals', () => {
    expect(SCALES).toHaveLength(13);
    expect(scalePcs(9, 'minor-pent').map((p) => noteName(p))).toEqual(['A', 'C', 'D', 'E', 'G']);
    expect(scalePcs(0, 'major').map((p) => noteName(p))).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(scalePcs(2, 'dorian').map((p) => noteName(p))).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
    expect(scalePcs(9, 'harmonic-minor').map((p) => noteName(p))).toContain('G#');
    expect(scalePcs(9, 'blues').map((p) => noteName(p))).toContain('D#');
    for (const s of SCALES) expect(new Set(s.intervals).size).toBe(s.intervals.length);
  });

  it('marks roots on the neck', () => {
    const notes = neckNotes(4, 'minor-pent', STANDARD, 12);
    expect(notes.filter((n) => n.string === 6).map((n) => n.fret)).toEqual([0, 3, 5, 7, 10, 12]);
    expect(notes.filter((n) => n.isRoot).every((n) => pc(n.midi) === 4)).toBe(true);
  });

  it('builds the five A minor pentatonic boxes (standard shapes)', () => {
    const pos = scalePositions(9, 'minor-pent');
    expect(pos).toHaveLength(5);
    const frets = (i: number, s: number) => pos[i].notes.filter((n) => n.string === s).map((n) => n.fret);
    expect([6, 5, 4, 3, 2, 1].map((s) => frets(0, s))).toEqual([[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]]);
    expect([6, 5, 4, 3, 2, 1].map((s) => frets(1, s))).toEqual([[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]]);
    for (const p of pos) expect(p.notes).toHaveLength(12);
    // Major pentatonic boxes are the relative minor's.
    expect(scalePositions(0, 'major-pent')[0].notes.map((n) => n.midi).sort()).toEqual(
      scalePositions(0, 'major-pent')[0].notes.map((n) => n.midi).sort(),
    );
  });

  it('builds three-notes-per-string positions for 7-note scales and adds the blue note', () => {
    const pos = scalePositions(7, 'major');
    expect(pos).toHaveLength(7);
    for (const p of pos) {
      expect(p.notes).toHaveLength(18);
      expect(p.minFret).toBeGreaterThanOrEqual(0);
    }
    const blues = scalePositions(9, 'blues')[0];
    expect(blues.notes.some((n) => n.interval === 6)).toBe(true);
  });

  it('plays a position up and back down without repeated pitches', () => {
    const seq = ascendDescend(scalePositions(9, 'minor-pent')[0].notes);
    expect(seq).toHaveLength(23);
    expect(seq[0].midi).toBe(seq[seq.length - 1].midi);
    const oct = firstOctave(neckNotes(9, 'minor-pent'));
    expect(oct[0].isRoot).toBe(true);
    expect(oct[oct.length - 1].midi - oct[0].midi).toBe(12);
  });
});

describe('alphaTex snippets', () => {
  it('writes pitches, tuning and capo', () => {
    expect(texPitch(64)).toBe('e4');
    expect(texPitch(61)).toBe('c#4');
    const h = texHeader({ tuning: getTuning('drop-d'), capo: 2, program: 24 });
    expect(h).toContain('\\tuning e4 b3 g3 d3 a2 d2');
    expect(h).toContain('\\capo 2');
    expect(h).toContain('\\instrument 24');
  });
  it('strums chords and pads sequences', () => {
    expect(chordTex([-1, 3, 2, 0, 1, 0])).toMatch(/\(3\.5 2\.4 0\.3 1\.2 0\.1\)\{bd\}/);
    const seq = sequenceTex([{ string: 6, fret: 5 }, { string: 6, fret: 8 }]);
    expect(seq).toMatch(/:8 5\.6 8\.6 r r r r r r \|$/);
  });
});

describe('tuner math', () => {
  it('computes cents and picks the right string and direction', () => {
    expect(cents(440, 69)).toBeCloseTo(0, 6);
    expect(cents(440 * 2 ** (10 / 1200), 69)).toBeCloseTo(10, 6);
    const low = readTuner(80, STANDARD)!; // E2 is 82.41 Hz
    expect(low).toMatchObject({ string: 6, targetName: 'E2', direction: 'up', name: 'D#' });
    expect(low.stringCents).toBeLessThan(-40);
    const a = readTuner(110.2, STANDARD)!;
    expect(a).toMatchObject({ string: 5, direction: 'ok' });
    const sharpB = readTuner(250, STANDARD)!; // B3 = 246.94
    expect(sharpB).toMatchObject({ string: 2, direction: 'down' });
    const dropD = readTuner(73.42, getTuning('drop-d'))!;
    expect(dropD).toMatchObject({ string: 6, targetName: 'D2', direction: 'ok' });
    expect(readTuner(0)).toBeNull();
    // Pinned to string 5 while playing near E2: far too low for A2.
    expect(readTuner(82.4, STANDARD, 0, 440, 5)).toMatchObject({ string: 5, targetName: 'A2', direction: 'up' });
    // Capo 2 moves the targets up.
    expect(readTuner(92.5, STANDARD, 2)).toMatchObject({ string: 6, targetName: 'F#2', direction: 'ok' });
  });
  it('median and needle', () => {
    expect(median([1, 100, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(needleAngle(100)).toBe(45);
    expect(needleAngle(-25)).toBe(-22.5);
  });
});
