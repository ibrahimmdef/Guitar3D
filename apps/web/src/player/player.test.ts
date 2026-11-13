import { describe, expect, it } from 'vitest';
import { barDensity, beatToNotes, nextSoundingBeat, normalize, upcomingBeats, upcomingFretNotes, type BeatLike, type NoteLike } from './beats';
import { chordName, cueLabel, stringLetters } from './noteNames';
import { computeSections, nextSectionIndex, sectionAt, sectionLabel } from './sections';

const note = (string: number, fret: number, extra: Partial<NoteLike> = {}): NoteLike => ({ string, fret, isPercussion: false, isTieDestination: false, ...extra });
const rest = (): BeatLike => ({ isRest: true, notes: [], nextBeat: null });
const beat = (...notes: NoteLike[]): BeatLike => ({ isRest: false, notes, nextBeat: null });
function chain(...beats: BeatLike[]) {
  beats.forEach((b, i) => (b.nextBeat = beats[i + 1] ?? null));
  return beats;
}

describe('upcoming beats', () => {
  const bs = chain(
    beat(note(4, 2)), // 0 current
    rest(), // 1 skipped
    beat(note(4, 2, { isTieDestination: true })), // 2 pure tie: skipped
    beat(note(5, 3)), // 3
    beat(note(6, 0), note(3, 2)), // 4
    beat(note(1, 3)), // 5
    beat(note(2, 0)), // 6
  );

  it('skips rests and ties, nearest first', () => {
    expect(nextSoundingBeat(bs[0])).toBe(bs[3]);
    expect(upcomingBeats(bs[0], 3)).toEqual([bs[3], bs[4], bs[5]]);
    expect(upcomingBeats(bs[5], 3)).toEqual([bs[6]]);
    expect(upcomingBeats(bs[6], 3)).toEqual([]);
    expect(upcomingBeats(null)).toEqual([]);
  });

  it('maps to tab strings as upcoming FretNote groups', () => {
    expect(upcomingFretNotes(bs[0], 6, 2)).toEqual([
      [{ string: 2, fret: 3, state: 'next' }],
      [{ string: 1, fret: 0, state: 'next' }, { string: 4, fret: 2, state: 'next' }],
    ]);
  });

  it('keeps the legacy now + next list without duplicates', () => {
    const a = chain(beat(note(4, 2)), beat(note(4, 2), note(5, 0)))[0];
    expect(beatToNotes(a, 6)).toEqual([{ string: 3, fret: 2, state: 'now' }, { string: 2, fret: 0, state: 'next' }]);
    expect(beatToNotes(rest(), 6)).toEqual([]);
  });

  it('marks dead notes as muted', () => {
    const a = chain(beat(note(1, 0)), beat(note(1, 0, { isDead: true })))[0];
    expect(upcomingFretNotes(a, 6)[0][0].muted).toBe(true);
  });
});

describe('bar density', () => {
  it('counts struck notes over all voices and normalises', () => {
    const bars = [
      { voices: [{ beats: [beat(note(1, 0), note(2, 0)), rest()] }, { beats: [beat(note(6, 0))] }] },
      { voices: [{ beats: [beat(note(1, 0, { isTieDestination: true })), beat(note(1, 0, { isPercussion: true }))] }] },
      { voices: [{ beats: [beat(note(1, 1))] }] },
    ];
    expect(barDensity(bars)).toEqual([3, 0, 1]);
    expect(normalize([3, 0, 1])).toEqual([1, 0, 1 / 3]);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});

describe('sections', () => {
  it('labels A–Z then A2', () => {
    expect(sectionLabel(0)).toBe('A');
    expect(sectionLabel(25)).toBe('Z');
    expect(sectionLabel(26)).toBe('A2');
  });

  it('falls back to 4-bar phrases', () => {
    const s = computeSections(Array.from({ length: 10 }, () => ({ section: null })));
    expect(s.map((x) => [x.label, x.startBar, x.endBar])).toEqual([['A', 0, 3], ['B', 4, 7], ['C', 8, 9]]);
  });

  it('uses score markers and adds a lead-in section', () => {
    const mbs = Array.from({ length: 8 }, () => ({ section: null as { marker: string; text: string } | null }));
    mbs[2].section = { marker: 'A', text: 'Verse' };
    mbs[5].section = { marker: 'B', text: '' };
    const s = computeSections(mbs);
    expect(s).toEqual([
      { label: 'A', name: '', startBar: 0, endBar: 1 },
      { label: 'B', name: 'Verse', startBar: 2, endBar: 4 },
      { label: 'C', name: 'B', startBar: 5, endBar: 7 },
    ]);
    expect(sectionAt(s, 3)).toBe(1);
    expect(nextSectionIndex(s, 3)).toBe(2);
    expect(nextSectionIndex(s, 7)).toBe(0);
    expect(computeSections([])).toEqual([]);
  });
});

describe('note names', () => {
  it('derives string letters from the tuning (top line first)', () => {
    expect(stringLetters([64, 59, 55, 50, 45, 40])).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
    expect(stringLetters([62, 57, 53, 48, 43, 38])).toEqual(['d', 'A', 'F', 'C', 'G', 'D']);
    expect(stringLetters([], 6)).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
  });

  it('formats cue labels low string first', () => {
    const L = stringLetters(null);
    expect(cueLabel([{ string: 2, fret: 1 }, { string: 5, fret: 0 }, { string: 6, fret: 3, muted: true }], L)).toBe('E·x A·0 B·1');
  });

  it('names common chords', () => {
    expect(chordName([48, 52, 55, 60, 64])).toBe('C'); // open C
    expect(chordName([45, 52, 57, 60, 64])).toBe('Am');
    expect(chordName([40, 47, 52, 55, 59, 64])).toBe('Em');
    expect(chordName([50, 57, 62, 66])).toBe('D');
    expect(chordName([43, 47, 50, 53])).toBe('G7');
    expect(chordName([40, 47, 52])).toBe('E5');
    expect(chordName([52, 55, 60])).toBe('C/E');
    expect(chordName([40, 41, 42])).toBeNull();
    expect(chordName([40, 44])).toBeNull();
  });
});
