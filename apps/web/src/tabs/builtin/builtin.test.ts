import { importer, LogLevel, Settings, type model } from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { listBuiltinLessons, loadBuiltinLesson } from './index';

function load(id: string): model.Score {
  const settings = new Settings();
  settings.core.logLevel = LogLevel.None;
  return importer.ScoreLoader.loadAlphaTex(loadBuiltinLesson(id), settings);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pitchName = (midi: number) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

function beatsOf(score: model.Score) {
  return score.tracks[0].staves[0].bars.map((bar) => bar.voices[0].beats.filter((b) => !b.isEmpty));
}

/** Pitches of the single-note beats of the first `bars` bars. */
function melody(score: model.Score, bars: number): string[] {
  return beatsOf(score)
    .slice(0, bars)
    .flat()
    .map((b) => pitchName(b.notes[0].realValue));
}

function quarters(b: model.Beat): number {
  let q = 4 / b.duration;
  if (b.dots === 1) q *= 1.5;
  return q;
}

const all = listBuiltinLessons();
const lessons = all.filter((l) => !l.group);
const turkuler = all.filter((l) => l.group === 'turkuler');

describe('built-in lesson list', () => {
  it('has 10 lessons with complete Turkish metadata, ordered easy to medium', () => {
    expect(lessons).toHaveLength(10);
    expect(new Set(lessons.map((l) => l.id)).size).toBe(10);
    for (const l of lessons) {
      expect(l.id).toMatch(/^[a-z0-9-]+$/);
      expect(l.title.length).toBeGreaterThan(3);
      expect(l.level).toBeGreaterThanOrEqual(1);
      expect(l.level).toBeLessThanOrEqual(5);
      expect(l.tempo).toBeGreaterThanOrEqual(50);
      expect(l.tempo).toBeLessThanOrEqual(120);
      expect(l.goal.length).toBeGreaterThan(10);
      expect(l.description.length).toBeGreaterThan(10);
      expect(l.tip.length).toBeGreaterThan(10);
      expect(['original', 'public-domain']).toContain(l.source);
      expect(l).not.toHaveProperty('bars');
    }
    const levels = lessons.map((l) => l.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(levels[0]).toBe(1);
  });

  it('has the Türküler pack: 8 original pieces, levelled, no lyrics', () => {
    expect(turkuler).toHaveLength(8);
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    expect(turkuler.every((l) => l.source === 'original')).toBe(true);
    const levels = turkuler.map((l) => l.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    for (const l of turkuler) expect(loadBuiltinLesson(l.id)).not.toMatch(/\\lyrics/);
  });

  it('throws for an unknown lesson id', () => {
    expect(() => loadBuiltinLesson('nope')).toThrow(/bulunamadı/);
  });
});

describe.each(all)('lesson $id', (lesson) => {
  const score = load(lesson.id);
  const staff = score.tracks[0].staves[0];
  const bars = beatsOf(score);

  it('parses with title, tempo and standard 6-string tuning', () => {
    expect(score.title).toBe(lesson.title);
    expect(score.tempo).toBe(lesson.tempo);
    expect(score.tracks).toHaveLength(1);
    expect(staff.tuning).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it('has only full bars', () => {
    expect(score.masterBars.length).toBeGreaterThan(0);
    expect(bars.length).toBe(score.masterBars.length);
    bars.forEach((beats, i) => {
      const mb = score.masterBars[i];
      expect(beats.length, `bar ${i + 1} is empty`).toBeGreaterThan(0);
      expect(beats.reduce((s, b) => s + quarters(b), 0), `bar ${i + 1} length`).toBeCloseTo((mb.timeSignatureNumerator * 4) / mb.timeSignatureDenominator);
    });
  });

  it('stays within frets 0–12 on strings 1–6', () => {
    const notes = bars.flat().flatMap((b) => b.notes);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.fret).toBeGreaterThanOrEqual(0);
      expect(n.fret).toBeLessThanOrEqual(12);
      expect(n.string).toBeGreaterThanOrEqual(1);
      expect(n.string).toBeLessThanOrEqual(6);
    }
  });
});

describe('lesson content', () => {
  it('open strings starts on the low E and visits all six strings', () => {
    const score = load('open-strings');
    expect(melody(score, 1)).toEqual(['E2', 'E2', 'E2', 'E2']);
    expect(melody(score, 7).slice(-4)).toEqual(['E4', 'B3', 'G3', 'D3']);
    expect(beatsOf(score).flat().every((b) => b.notes.every((n) => n.fret === 0))).toBe(true);
  });

  it('chromatic warm-up walks frets 1-2-3-4 on each string', () => {
    const first = beatsOf(load('chromatic-warmup'))[0].map((b) => b.notes[0].fret);
    expect(first).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    expect(melody(load('chromatic-warmup'), 1).slice(0, 4)).toEqual(['F2', 'F#2', 'G2', 'G#2']);
  });

  it('Twinkle Twinkle: C C G G A A G', () => {
    expect(melody(load('twinkle'), 4)).toEqual(['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4']);
  });

  it('Frère Jacques: C D E C, then E F G', () => {
    const score = load('frere-jacques');
    expect(melody(score, 4)).toEqual(['C4', 'D4', 'E4', 'C4', 'C4', 'D4', 'E4', 'C4', 'E4', 'F4', 'G4', 'E4', 'F4', 'G4']);
    expect(melody(score, 8).slice(-3)).toEqual(['C4', 'G3', 'C4']);
  });

  it('Ode to Joy: E E F G G F E D C C D E E D D', () => {
    const score = load('ode-to-joy');
    expect(melody(score, 4)).toEqual(['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4']);
    const bar4 = beatsOf(score)[3];
    expect(bar4.map((b) => [b.duration, b.dots])).toEqual([[4, 1], [8, 0], [2, 0]]);
  });

  it('E minor pentatonic uses only E G A B D', () => {
    const score = load('em-pentatonic');
    expect(melody(score, 2).slice(0, 12)).toEqual(['E2', 'G2', 'A2', 'B2', 'D3', 'E3', 'G3', 'A3', 'B3', 'D4', 'E4', 'G4']);
    const classes = new Set(beatsOf(score).flat().flatMap((b) => b.notes.map((n) => NOTE_NAMES[n.realValue % 12])));
    expect([...classes].sort()).toEqual(['A', 'B', 'D', 'E', 'G']);
  });

  it('arpeggio pattern outlines Am, C, G and Em', () => {
    const score = load('arpeggio-pattern');
    const classesOf = (bar: number) => [...new Set(beatsOf(score)[bar].flatMap((b) => b.notes.map((n) => NOTE_NAMES[n.realValue % 12])))].sort();
    expect(classesOf(0)).toEqual(['A', 'C', 'E']);
    expect(classesOf(1)).toEqual(['C', 'E', 'G']);
    expect(classesOf(2)).toEqual(['B', 'D', 'G']);
    expect(classesOf(3)).toEqual(['B', 'E', 'G']);
  });

  it('open chords are C, G, Am and F', () => {
    const score = load('open-chords');
    const chord = (bar: number, beat = 0) => [...new Set(beatsOf(score)[bar][beat].notes.map((n) => NOTE_NAMES[n.realValue % 12]))].sort();
    expect(chord(0)).toEqual(['C', 'E', 'G']);
    expect(chord(1)).toEqual(['B', 'D', 'G']);
    expect(chord(2)).toEqual(['A', 'C', 'E']);
    expect(chord(3)).toEqual(['A', 'C', 'F']);
    expect(chord(4, 1)).toEqual(['B', 'D', 'G']);
  });

  it('hammer-on / pull-off drill marks legato pairs in both directions', () => {
    const bars = beatsOf(load('hammer-pull'));
    const pairs = (bar: number) => bars[bar].filter((b) => b.notes[0].isHammerPullOrigin).map((b) => [b.notes[0].fret, b.notes[0].hammerPullDestination!.fret]);
    expect(pairs(0)).toEqual([[0, 2], [0, 3], [0, 1], [0, 3]]);
    expect(pairs(2)).toEqual([[3, 0], [2, 0], [3, 0], [1, 0]]);
  });

  it('the original melody is in A minor within the first five frets', () => {
    const score = load('morning-walk');
    expect(melody(score, 2)).toEqual(['A3', 'C4', 'E4', 'C4', 'D4', 'E4', 'F4', 'E4']);
    expect(Math.max(...beatsOf(score).flat().flatMap((b) => b.notes.map((n) => n.fret)))).toBe(5);
    expect(melody(score, 8).at(-1)).toBe('A3');
  });
});
