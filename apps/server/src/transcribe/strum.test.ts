import { describe, expect, it } from 'vitest';
import {
  barSteps,
  buildStrumAnalysis,
  chooseResolution,
  countLabels,
  findPattern,
  findPatterns,
  gridDirection,
  patternForBar,
  readAutoTabInfo,
  stepSimilarity,
  type StrumBar,
  type StrumToken,
} from '@guitar3d/shared';
import { chooseDownbeat, fixedGrid, type QNote, type RawNote, type RawStrum } from './grid.js';
import { applyStrums, analyzeStrums, assignDirections, isChuck, nameChord, type Strum } from './strum.js';
import { buildAlphaTex, renderTrack, type PlacedEvent, type TabEvent } from './tab.js';
import { buildAutoTab } from './index.js';

/** "D-DU-UDU" (eighths) → 16-slot bar string. */
const eighths = (p: string) => [...p].map((c) => `${c}-`).join('');
const bar = (s: string, c: [string | null, string | null] = ['G', 'G'], a?: number[]): StrumBar => ({ s: s.length === 8 ? eighths(s) : s, c, ...(a ? { a } : {}) });
const toks = (s: string) => s.split('') as StrumToken[];

describe('direction rule and resolution', () => {
  it('eighths: down on the beat, up on the "&"', () => {
    expect([0, 2, 4, 6, 8, 10, 12, 14].map((s) => gridDirection(s, 8)).join('')).toBe('DUDUDUDU');
  });
  it('sixteenths: down on 1 and &, up on e and a', () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => gridDirection(s, 16)).join('')).toBe('DUDUDU');
    expect(gridDirection(16 + 3, 16)).toBe('U'); // next bar
  });
  it('picks sixteenths only when strums on e / a recur', () => {
    const bars = (n: number, inBar: number[]) => Array.from({ length: n }, (_, b) => inBar.map((s) => b * 16 + s)).flat();
    expect(chooseResolution(bars(4, [0, 4, 6, 10, 12, 14]))).toBe(8);
    expect(chooseResolution(bars(4, [0, 2, 3, 4, 6, 7, 8, 11]))).toBe(16);
    // stray odd onsets at random places (bleed, sloppy timing) keep the eighths
    expect(chooseResolution([...bars(8, [0, 2, 4, 6, 8, 10, 12, 14]), 3, 16 + 9, 32 + 13, 48 + 5])).toBe(8);
  });

  it('counts "1 & 2 &" and "1 e & a"', () => {
    expect(countLabels(8).join(' ')).toBe('1 & 2 & 3 & 4 &');
    expect(countLabels(16).slice(0, 5).join(' ')).toBe('1 e & a 2');
    expect(countLabels(8, 2)).toHaveLength(16);
  });
});

describe('repetition finder', () => {
  it('finds a 1-bar pattern that repeats, through one-off variations', () => {
    const bars = ['D-DU-UDU', 'D-DU-UDU', 'D-DU-UDD', 'D-DU-UDU', 'D---D---', 'D-DU-UDU'].map((p) => bar(p));
    const p = findPattern(bars, 8)!;
    expect(p.text).toBe('D - D U - U D U');
    expect(p.bars).toBe(1);
    expect(p.starts).toEqual([0, 1, 2, 3, 5]); // "D-DU-UDD" is close enough, "D---D---" is not
    expect(p.coverage).toBeCloseTo(5 / 6);
  });

  it('takes the per-step majority of the occurrences', () => {
    const bars = ['D-DU-UDD', 'D-DU-UDU', 'D-DU-UDU'].map((p) => bar(p));
    expect(findPattern(bars, 8, { minSimilarity: 0.8 })!.text).toBe('D - D U - U D U');
  });

  it('finds a 2-bar pattern when bars alternate', () => {
    const a = 'D-DU-UDU';
    const b = 'D---D-DU';
    const p = findPattern([a, b, a, b, a, b].map((x) => bar(x)), 8)!;
    expect(p.bars).toBe(2);
    expect(p.starts).toEqual([0, 2, 4]);
    expect(p.steps).toHaveLength(16);
  });

  it('keeps sections apart: verse pattern, then chorus pattern with chucks', () => {
    const bars = [...Array(8).fill('D-DU-UDU'), ...Array(4).fill('D-XU-UXU')].map((x) => bar(x));
    const ps = findPatterns(bars, 8);
    expect(ps.map((p) => [p.text, p.bars, p.starts.length])).toEqual([
      ['D - D U - U D U', 1, 8],
      ['D - X U - U X U', 1, 4],
    ]);
    expect(patternForBar({ pattern: ps[0], patterns: ps }, 9)).toBe(ps[1]);
    expect(patternForBar({ pattern: ps[0], patterns: ps }, 2)).toBe(ps[0]);
  });

  it('marks accents that most occurrences share', () => {
    const bars = [bar('D-DU-UDU', ['G', 'G'], [0]), bar('D-DU-UDU', ['G', 'G'], [0, 6]), bar('D-DU-UDU', ['G', 'G'], [0])];
    expect(findPattern(bars, 8)!.accents.map((a) => (a ? 1 : 0)).join('')).toBe('10000000');
  });

  it('needs at least two strummed bars', () => {
    expect(findPattern([bar('D-DU-UDU'), bar('--------')], 8)).toBeNull();
    expect(stepSimilarity(toks('D-D-'), toks('D---'))).toBe(0.5);
    expect(barSteps(bar('D-DU-UDU'), 8).join('')).toBe('D-DU-UDU');
  });
});

describe('chucks and directions from attack features', () => {
  it('a fast-dying, unpitched or noisy attack is a chuck', () => {
    expect(isChuck({ decay: 0.05, flatness: 0.1 }, true)).toBe(true); // gone at once
    expect(isChuck({ decay: 0.25, flatness: 0.1 }, false)).toBe(true); // short, no pitch
    expect(isChuck({ decay: 0.25, flatness: 0.4 }, true)).toBe(true); // short, noise-like
    expect(isChuck({ decay: 0.25, flatness: 0.1 }, true)).toBe(false); // short but a real chord
    expect(isChuck({ decay: 0.6, flatness: 0.5 }, false)).toBe(false); // rings on
    expect(isChuck({}, false)).toBe(false);
  });

  const strum = (slot: number, spread: number | null): Omit<Strum, 'dir'> => ({ slot, spread, chuck: false, accent: false, strength: 1, level: 1 });

  it('uses the beat rule when the attack cue is noise', () => {
    const list = Array.from({ length: 8 }, (_, b) => [0, 4, 6, 10, 12, 14].map((s) => strum(b * 16 + s, (s + b) % 3 ? 0.003 : -0.003))).flat();
    const r = assignDirections(list, 8);
    expect(r.method).toBe('grid');
    expect(r.strums.slice(0, 6).map((s) => s.dir).join('')).toBe('DDUUDU');
  });

  it('flips a whole position when a reliable cue says so (all-down eighths)', () => {
    // every strum low strings first: on-beat cue agrees with the rule, so the "&"s are down too
    const list = Array.from({ length: 6 }, (_, b) => [0, 2, 4, 6, 8, 10, 12, 14].map((s) => strum(b * 16 + s, 0.006))).flat();
    const r = assignDirections(list, 8);
    expect(r.method).toBe('grid+spectral');
    expect(r.strums.slice(0, 8).map((s) => s.dir).join('')).toBe('DDDDDDDD');
  });

  it('keeps the rule where the cue agrees (constant motion)', () => {
    const list = Array.from({ length: 6 }, (_, b) => [0, 2, 4, 6, 8, 10, 12, 14].map((s) => strum(b * 16 + s, s % 4 ? -0.006 : 0.006))).flat();
    const r = assignDirections(list, 8);
    expect(r.method).toBe('grid+spectral');
    expect(r.strums.slice(0, 8).map((s) => s.dir).join('')).toBe('DUDUDUDU');
  });
});

const q = (slot: number, pitch: number, len = 4, conf = 0.8): QNote => ({ slot, len, pitch, conf });
const G = [43, 47, 50, 55, 59, 67];
const C = [48, 52, 55, 60, 64];
const chordEv = (slot: number, ps: number[]): TabEvent => ({ slot, notes: ps.map((p) => q(slot, p)) });

describe('analyzeStrums (synthetic features)', () => {
  // 120 BPM, beat 0 at 1 s: a sixteenth is 0.125 s. Bars 0–3 "D-DU-UDU" (G G C C), bar 4 with chucks.
  const grid = fixedGrid(120, 1);
  const t = (slot: number) => 1 + slot * 0.125;
  const strums: RawStrum[] = [];
  const notes: RawNote[] = [];
  const pattern = (b: number, p: string) =>
    [...eighths(p)].forEach((c, i) => {
      if (c === '-') return;
      const slot = b * 16 + i;
      const chuck = c === 'X';
      strums.push({ t: t(slot) + 0.01, strength: 0.6, spread: null, flatness: chuck ? 0.4 : 0.05, decay: chuck ? 0.1 : 0.6, level: i === 0 ? 0.5 : 0.3 });
      if (!chuck) notes.push({ start: t(slot), end: t(slot) + 0.3, pitch: 55, conf: 0.8 });
    });
  ['D-DU-UDU', 'D-DU-UDU', 'D-DU-UDU', 'D-DU-UDU', 'D-XU-UXU'].forEach((p, b) => pattern(b, p));
  strums.push({ t: t(3 * 16 + 9), strength: 0.02, spread: null }); // too weak: ignored
  const rhythm = [chordEv(0, G), chordEv(16, G), chordEv(32, C), chordEv(40, C), chordEv(48, C), chordEv(64, G)];

  it('puts strums on the grid with directions, chucks, accents and chords', () => {
    const r = analyzeStrums({ strums, grid, origin: 0, barCount: 5, notes, rhythm })!;
    const a = r.analysis;
    expect(a.resolution).toBe(8);
    expect(a.method).toBe('grid');
    expect(a.bars.map((b) => b.s)).toEqual([eighths('D-DU-UDU'), eighths('D-DU-UDU'), eighths('D-DU-UDU'), eighths('D-DU-UDU'), eighths('D-XU-UXU')]);
    expect(a.bars.map((b) => b.c)).toEqual([['G', 'G'], ['G', 'G'], ['C', 'C'], ['C', 'C'], ['G', 'G']]);
    expect(a.bars[0].a).toEqual([0]);
    expect(a.pattern!.text).toBe('D - D U - U D U');
    expect(a.pattern!.accents[0]).toBe(true);
    expect(a.barTimes!.slice(0, 3)).toEqual([1, 3, 5]);
    expect(a.strums).toBe(30);
  });

  it('drops note-less ringing onsets (drum bleed) and stray odd sixteenths', () => {
    const bleed: RawStrum[] = [
      { t: t(8) + 0.005, strength: 0.5, spread: null, flatness: 0.1, decay: 0.9 }, // kick on beat 3: no note, rings
      { t: t(16 + 8), strength: 0.5, spread: null, flatness: 0.1, decay: 0.9 },
      { t: t(32 + 5), strength: 0.6, spread: null, flatness: 0.1, decay: 0.7 },
    ];
    notes.push({ start: t(37), end: t(37) + 0.3, pitch: 59, conf: 0.8 }); // pitched, but a lone odd sixteenth
    const r = analyzeStrums({ strums: [...strums, ...bleed], grid, origin: 0, barCount: 5, notes, rhythm })!;
    notes.pop();
    expect(r.analysis.bars.slice(0, 3).map((b) => b.s)).toEqual([eighths('D-DU-UDU'), eighths('D-DU-UDU'), eighths('D-DU-UDU')]);
    expect(r.analysis.resolution).toBe(8);
  });

  it('is null without chords to strum', () => {
    expect(analyzeStrums({ strums, grid, origin: 0, barCount: 5, notes, rhythm: [] })).toBeNull();
  });

  it('names chords by majority, ignoring the bass of partial strums', () => {
    expect(nameChord([chordEv(0, G), chordEv(2, [50, 55, 59, 67])])).toBe('G'); // G + G/D
    expect(nameChord([chordEv(0, [50, 55, 59, 67])])).toBe('G/D');
    expect(nameChord([chordEv(0, [40, 41, 42])])).toBeNull();
  });
});

describe('downbeat of strummed parts', () => {
  it('chord changes vote for the bar line', () => {
    // strums on every beat but 3 of the bar; the chord changes every 16 slots starting at grid beat 1
    const ns: QNote[] = [];
    const chords = [G, C, G, C];
    chords.forEach((ps, b) => [0, 4, 12].forEach((s) => ps.forEach((p) => ns.push(q(4 + b * 16 + s, p)))));
    ns.push(q(-8, 64)); // a pickup note before the first chord
    expect(chooseDownbeat(ns)).toBe(1);
  });
});

describe('strums in the tab', () => {
  const strum = (slot: number, dir: 'D' | 'U', extra: Partial<Strum> = {}): Strum => ({ slot, dir, chuck: false, accent: false, strength: 1, level: 1, spread: null, ...extra });

  it('makes every strum a rhythm event with stroke, chord change, chuck and absorbs chord-tone lead notes', () => {
    const rhythm = [chordEv(0, G), chordEv(17, C)];
    const lead: TabEvent[] = [{ slot: 6, notes: [q(6, 59)] }, { slot: 7, notes: [q(7, 61)] }];
    const strums = [strum(0, 'D', { accent: true }), strum(4, 'D', { chuck: true }), strum(6, 'U'), strum(16, 'D')];
    const r = applyStrums(rhythm, lead, strums);
    expect(r.rhythm.map((e) => [e.slot, e.stroke, e.chord ?? '', e.notes.length])).toEqual([
      [0, 'D', 'G', 6],
      [4, 'D', '', 6],
      [6, 'U', '', 6],
      [16, 'D', 'C', 5], // the C chord a sixteenth later merges into the strum
    ]);
    expect(r.rhythm[0].accent).toBe(true);
    expect(r.rhythm[1].notes.every((n) => n.dead)).toBe(true);
    expect(r.lead.map((e) => e.slot)).toEqual([7]); // B (in G) moved out, C# stays
  });

  it('does not turn picked riff notes into copies of the last chord', () => {
    // a G chord, then single picked notes outside it (F, A#): onsets, but no strums to fill
    const rhythm = [chordEv(0, G)];
    const lead: TabEvent[] = [{ slot: 4, notes: [q(4, 53)] }, { slot: 8, notes: [q(8, 46)] }];
    const r = applyStrums(rhythm, lead, [strum(0, 'D'), strum(4, 'D'), strum(8, 'D')]);
    expect(r.rhythm.map((e) => e.slot)).toEqual([0]);
    expect(r.lead.map((e) => e.slot)).toEqual([4, 8]);
  });

  it('writes pick strokes, chord names, dead notes and accents in alphaTex', () => {
    const ev = (slot: number, extra: Partial<PlacedEvent>, dead = false): PlacedEvent => ({
      slot,
      notes: [{ ...q(slot, 55), string: 3, fret: 0, dead }, { ...q(slot, 59), string: 2, fret: 0, dead }],
      ...extra,
    });
    const r = renderTrack([ev(0, { stroke: 'D', chord: 'G', accent: true }), ev(4, { stroke: 'D' }, true), ev(6, { stroke: 'U' })], 1);
    expect(r.bars[0]).toBe('(0.2{ac} 0.3{ac}).4{sd ch "G"} (0.2{x} 0.3{x}).8{sd} (0.2 0.3).8{su} r.2');
  });

  it('stores the analysis in the header and the summary', () => {
    const analysis = buildStrumAnalysis({ bars: [bar('D-DU-UDU'), bar('D-DU-UDU')], tempo: 100, method: 'grid' });
    const { tex } = buildAlphaTex({ title: 't', tempo: 100, tuning: [64, 59, 55, 50, 45, 40], capo: 0, parts: [{ name: 'Rhythm', events: [] }], detected: '', barCount: 2, strum: analysis });
    expect(readAutoTabInfo(tex)!.strum!.pattern!.text).toBe('D - D U - U D U');
    expect(tex.split('\n').filter((l) => l.endsWith('|'))).toHaveLength(2);
  });

  it('buildAutoTab: strummed chords from raw notes and onsets', () => {
    // 100 BPM fixed grid, offset 0: an eighth is 0.3 s. Two bars of G "D-DU-UDU", two of C.
    const notes: RawNote[] = [];
    const strums: RawStrum[] = [];
    ['G', 'G', 'C', 'C'].forEach((c, b) => {
      [...'D-DU-UDU'].forEach((x, i) => {
        if (x === '-') return;
        const t0 = (b * 8 + i) * 0.3;
        strums.push({ t: t0, strength: 0.7, decay: 0.6, flatness: 0.05, level: 0.3 });
        if (i === 0) (c === 'G' ? G : C).forEach((p) => notes.push({ start: t0, end: t0 + 0.5, pitch: p, conf: 0.8 }));
      });
    });
    const auto = buildAutoTab({ duration: 10, notes, strums }, { title: 'x', bpm: 100, offset: 0 });
    expect(auto.summary.strum!.pattern!.text).toBe('D - D U - U D U');
    expect(auto.summary.strum!.bars.map((b) => b.c[0])).toEqual(['G', 'G', 'C', 'C']);
    expect(auto.tex).toContain('{su}');
    expect(auto.tex).toContain('{sd ch "C"}');
    expect(auto.info.strum!.strums).toBe(24);
  });
});
