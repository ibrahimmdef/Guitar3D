import { describe, it, expect } from 'vitest';
import { importer, Settings, LogLevel, model } from '@coderline/alphatab';
import { asciiTabToAlphaTex, findTabSystems, looksLikeAsciiTab, parseStringSegment, parseTabLine, splitSixteenths, tuningFromLabels } from './asciiTab';

function load(tex: string) {
  const s = new Settings();
  s.core.logLevel = LogLevel.None;
  return importer.ScoreLoader.loadAlphaTex(tex, s);
}

/** [string(1=high e), fret] per beat of a bar, plus duration. alphaTab's note.string is 1 = low E for 6 strings. */
function beats(score: model.Score, bar: number) {
  return score.tracks[0].staves[0].bars[bar].voices[0].beats.map((b) => ({
    d: b.duration as number,
    dots: b.dots,
    rest: b.isRest,
    notes: b.notes.map((n) => [7 - n.string, n.isDead ? 'x' : n.fret, n.isTieDestination ? 't' : ''] as const),
  }));
}

/** Total length of a bar in sixteenths. */
function barSixteenths(score: model.Score, bar: number) {
  return score.tracks[0].staves[0].bars[bar].voices[0].beats.reduce((s, b) => s + (16 / b.duration) * (b.dots ? 1.5 : 1), 0);
}

// All riffs below are invented for these tests.
const EIGHTHS = `
Title: Test Riff One
Artist: Nobody
e|-0-0-0-0-0-0-0-0-|
B|-----------------|
G|-----------------|
D|-----------------|
A|-----------------|
E|-----------------|
`;

const QUARTER_CHORDS = `
e|--0---3---5---0---|
B|--1---3---5---1---|
G|--2---0---5---2---|
D|--2---0---7---2---|
A|--0---2---7---0---|
E|------3---5-------|
`;

const TECHNIQUES = `
Tempo: 132
e|---------------|-------------------|
B|---5h7p5-------|-------------------|
G|---------7/9---|--7b9r7---9~~~-----|
D|-------------x-|-------------------|
A|---------------|---<12>------------|
E|-10------------|-12----------------|
`;

const TWO_SYSTEMS_DROP_D = `
Some intro text that is not tab.

D|--0-0-0-----|--0-0-5-3---|
A|--0-0-0-----|--0-0-5-3---|
D|--0-0-0-----|--0-0-5-3---|
G|------------|------------|
B|------------|------------|
e|------------|------------|

   (play twice)

d|-----------|
B|-----------|
G|-----------|
D|--3---2----|
A|--3---2----|
D|--3---2----|
`;

const NO_LABELS = `
|----------------|
|-----3----------|
|---2---2--------|
|-0-------0------|
|----------------|
|----------------|
`;

const NO_BARS = `
e ---0---0---0---0---0---0---0---0---0---0---0---0---0---0---0---0---
B --------------------------------------------------------------------
G --------------------------------------------------------------------
D --------------------------------------------------------------------
A --------------------------------------------------------------------
E --------------------------------------------------------------------
`;

describe('line and system detection', () => {
  it('recognises tab lines with and without labels', () => {
    expect(parseTabLine('e|--0--3--|')).toEqual({ label: 'e', content: '--0--3--|' });
    expect(parseTabLine('Eb|--0--|')?.label).toBe('Eb');
    expect(parseTabLine('|--0--|')?.label).toBe('');
    expect(parseTabLine('E|--0--|  x4')?.content).toBe('--0--|');
    expect(parseTabLine('Am    G    C')).toBeNull();
    expect(parseTabLine('This is a sentence.')).toBeNull();
    expect(parseTabLine('')).toBeNull();
  });

  it('finds systems and warns about non six-line blocks', () => {
    const warnings: string[] = [];
    expect(findTabSystems(TWO_SYSTEMS_DROP_D, warnings)).toHaveLength(2);
    const bass = 'G|--0--|\nD|--2--|\nA|--2--|\nE|--0--|';
    expect(findTabSystems(bass, warnings)).toHaveLength(0);
    expect(warnings.some((w) => w.includes('4 satırlık'))).toBe(true);
    expect(looksLikeAsciiTab(EIGHTHS)).toBe(true);
    expect(looksLikeAsciiTab('\\title "x" :4 0.6')).toBe(false);
  });

  it('derives tunings from labels', () => {
    expect(tuningFromLabels(['e', 'B', 'G', 'D', 'A', 'E'])).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);
    expect(tuningFromLabels(['e', 'B', 'G', 'D', 'A', 'D'])).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'D2']);
    expect(tuningFromLabels(['Eb', 'Bb', 'Gb', 'Db', 'Ab', 'Eb'])).toEqual(['D#4', 'A#3', 'F#3', 'C#3', 'G#2', 'D#2']);
    expect(tuningFromLabels(['', '', '', '', '', ''])).toBeNull();
  });

  it('tokenises techniques and multi-digit frets', () => {
    const n = parseStringSegment('-12h14p12-x-7b9r7-5/7-3~-<12>-', 2);
    expect(n.map((x) => x.fret)).toEqual([12, 14, 12, -1, 7, 5, 7, 3, 12]);
    expect(n[0].hammer && n[1].hammer).toBe(true);
    expect(n[2].hammer).toBeFalsy();
    expect(n[4].bend).toEqual([0, 4, 0]);
    expect(n[5].slide).toBe(true);
    expect(n[7].vibrato).toBe(true);
    expect(n[8].harmonic).toBe(true);
    expect(parseStringSegment('-35-', 1).map((x) => x.fret)).toEqual([3, 5]);
    expect(parseStringSegment('-7b-', 1)[0].bend).toEqual([0, 4]);
  });

  it('splits lengths into note values', () => {
    expect(splitSixteenths(16)).toEqual([16]);
    expect(splitSixteenths(7)).toEqual([6, 1]);
    expect(splitSixteenths(10)).toEqual([8, 2]);
  });
});

describe('asciiTabToAlphaTex → alphaTab', () => {
  it('converts evenly spaced eighths', () => {
    const r = asciiTabToAlphaTex(EIGHTHS);
    expect(r).toMatchObject({ title: 'Test Riff One', artist: 'Nobody', bars: 1, notes: 8, tempo: 90 });
    const score = load(r.alphaTex);
    expect(score.title).toBe('Test Riff One');
    expect(score.artist).toBe('Nobody');
    const b = beats(score, 0);
    expect(b).toHaveLength(8);
    expect(b.every((x) => x.d === 8 && x.notes[0][0] === 1 && x.notes[0][1] === 0)).toBe(true);
  });

  it('converts chords in quarters', () => {
    const score = load(asciiTabToAlphaTex(QUARTER_CHORDS).alphaTex);
    const b = beats(score, 0);
    expect(b.map((x) => x.d)).toEqual([4, 4, 4, 4]);
    expect(b[1].notes.map((n) => n[1])).toEqual([3, 3, 0, 0, 2, 3]);
    expect(b[0].notes).toHaveLength(5);
    expect(barSixteenths(score, 0)).toBe(16);
  });

  it('keeps techniques and the tempo line', () => {
    const r = asciiTabToAlphaTex(TECHNIQUES, { quantize: 16 });
    expect(r.tempo).toBe(132);
    const score = load(r.alphaTex);
    expect(score.tempo).toBe(132);
    expect(score.masterBars).toHaveLength(2);
    const notes = score.tracks[0].staves[0].bars.flatMap((bar) => bar.voices[0].beats.flatMap((b) => b.notes));
    expect(notes.some((n) => n.isHammerPullOrigin && n.fret === 5)).toBe(true);
    expect(notes.some((n) => n.isHammerPullOrigin && n.fret === 7)).toBe(true);
    expect(notes.some((n) => n.slideOutType !== 0 && n.fret === 7)).toBe(true);
    expect(notes.some((n) => n.isDead)).toBe(true);
    expect(notes.some((n) => n.hasBend && n.fret === 7)).toBe(true);
    expect(notes.some((n) => n.vibrato !== 0 && n.fret === 9)).toBe(true);
    expect(notes.some((n) => n.harmonicType !== 0 && n.fret === 12)).toBe(true);
    // the "10" on low E is one note, not "1" and "0"
    expect(notes.filter((n) => n.string === 1).map((n) => n.fret)).toEqual([10, 12]);
    for (let i = 0; i < 2; i++) expect(barSixteenths(score, i)).toBe(16);
  });

  it('handles several systems, alternative tuning labels and sustains', () => {
    const r = asciiTabToAlphaTex(TWO_SYSTEMS_DROP_D);
    expect(r.systems).toBe(2);
    expect(r.bars).toBe(3);
    // First system lists the low string first (D A D G B e) and gets flipped → drop D.
    expect(r.tuning).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'D2']);
    expect(r.warnings.some((w) => w.includes('çevrildi'))).toBe(true);
    const score = load(r.alphaTex);
    expect(score.tracks[0].staves[0].tuning).toEqual(r.tuning.map(midi));
    const first = beats(score, 0);
    expect(first[0].notes.map((n) => n[0])).toEqual([4, 5, 6]);
    const last = beats(score, 2);
    expect(last[0].notes.map((n) => n[1])).toEqual([3, 3, 3]);
    expect(barSixteenths(score, 2)).toBe(16);
  });

  it('uses standard tuning without labels and inserts leading rests', () => {
    const r = asciiTabToAlphaTex(NO_LABELS, { quantize: 8 });
    expect(r.tuning).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);
    const score = load(r.alphaTex);
    const b = beats(score, 0);
    expect(b[0].notes).toEqual([[4, 0, '']]);
    expect(b.map((x) => x.notes[0]?.[1])).toContain(3);
    expect(barSixteenths(score, 0)).toBe(16);
  });

  it('falls back to absolute spacing without bar lines', () => {
    const r = asciiTabToAlphaTex(NO_BARS, { tempo: 100, timeSignature: [4, 4] });
    expect(r.notes).toBe(16);
    expect(r.bars).toBe(2);
    const score = load(r.alphaTex);
    expect(score.tempo).toBe(100);
    expect(beats(score, 0).filter((b) => !b.rest && b.notes.every((n) => n[2] !== 't'))).toHaveLength(8);
  });

  it('honours charsPerBeat and 3/4 time', () => {
    const r = asciiTabToAlphaTex(QUARTER_CHORDS, { charsPerBeat: 4, timeSignature: [3, 4] });
    const score = load(r.alphaTex);
    expect(score.masterBars[0].timeSignatureNumerator).toBe(3);
    expect(score.masterBars.length).toBe(2);
    expect(barSixteenths(score, 0)).toBe(12);
  });

  it('throws on text without tab', () => {
    expect(() => asciiTabToAlphaTex('hello world')).toThrow(/ASCII tab/);
  });
});

function midi(name: string) {
  const m = /^([A-G])(#?)(\d)$/.exec(name)!;
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]]! + (m[2] ? 1 : 0);
  return 12 * (Number(m[3]) + 1) + pc;
}
