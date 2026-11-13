import { chordIntervals, type ChordType } from './chords';
import { noteName, pc, SOLFEGE } from './notes';
import { texHeader, type TexOptions } from './tex';
import { STANDARD, type Tuning } from './tunings';

/** Ear training: interval, chord-quality and "find it on the neck" question generators. Pure. */

export interface IntervalDef {
  semitones: number;
  short: string;
  name: string;
}

export const INTERVALS: IntervalDef[] = [
  { semitones: 1, short: 'k2', name: 'Küçük ikili' },
  { semitones: 2, short: 'B2', name: 'Büyük ikili' },
  { semitones: 3, short: 'k3', name: 'Küçük üçlü' },
  { semitones: 4, short: 'B3', name: 'Büyük üçlü' },
  { semitones: 5, short: 'T4', name: 'Tam dörtlü' },
  { semitones: 6, short: 'A4', name: 'Artık dörtlü' },
  { semitones: 7, short: 'T5', name: 'Tam beşli' },
  { semitones: 8, short: 'k6', name: 'Küçük altılı' },
  { semitones: 9, short: 'B6', name: 'Büyük altılı' },
  { semitones: 10, short: 'k7', name: 'Küçük yedili' },
  { semitones: 11, short: 'B7', name: 'Büyük yedili' },
  { semitones: 12, short: 'T8', name: 'Oktav' },
];

export const intervalDef = (s: number) => INTERVALS.find((i) => i.semitones === s)!;

/** Interval sets per level (1..4). */
export const INTERVAL_LEVELS: number[][] = [
  [4, 7, 12],
  [3, 4, 5, 7, 12],
  [2, 3, 4, 5, 7, 9, 10, 12],
  INTERVALS.map((i) => i.semitones),
];

export const QUALITY_LABEL: Partial<Record<ChordType, string>> = {
  maj: 'Majör', m: 'Minör', '7': 'Dominant 7', maj7: 'Majör 7', m7: 'Minör 7', sus2: 'sus2', sus4: 'sus4',
};

export const QUALITY_LEVELS: ChordType[][] = [
  ['maj', 'm'],
  ['maj', 'm', '7', 'sus4'],
  ['maj', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4'],
];

export type IntervalMode = 'up' | 'down' | 'together';

export interface IntervalQuestion {
  kind: 'interval';
  root: number;
  semitones: number;
  mode: IntervalMode;
  options: number[];
}

export interface QualityQuestion {
  kind: 'quality';
  root: number;
  quality: ChordType;
  options: ChordType[];
  /** MIDI notes of the chord, lowest first. */
  midi: number[];
}

export interface NeckQuestion {
  kind: 'neck';
  midi: number;
  maxFret: number;
  /** Accept the same note in any octave. */
  anyOctave: boolean;
}

const pick = <T,>(xs: T[], rng: () => number) => xs[Math.floor(rng() * xs.length)];
const clampLevel = (l: number, n: number) => Math.max(1, Math.min(n, Math.round(l))) - 1;

export function intervalQuestion(level: number, rng: () => number = Math.random, modes: IntervalMode[] = ['up']): IntervalQuestion {
  const options = INTERVAL_LEVELS[clampLevel(level, INTERVAL_LEVELS.length)];
  const semitones = pick(options, rng);
  const mode = pick(modes, rng);
  // keep both notes inside the comfortable guitar range E2..E5
  // (two notes sounding together need two strings: start from A2 so the lower one can sit on the 6th)
  const lo = mode === 'down' ? 40 + semitones : mode === 'together' ? 45 : 40;
  const hi = mode === 'down' ? 64 : 64 - semitones + 12;
  const root = lo + Math.floor(rng() * Math.max(1, hi - lo));
  return { kind: 'interval', root, semitones, mode, options };
}

/** The two MIDI notes of an interval question, in playing order. */
export function intervalNotes(q: IntervalQuestion): [number, number] {
  return q.mode === 'down' ? [q.root, q.root - q.semitones] : [q.root, q.root + q.semitones];
}

export function qualityQuestion(level: number, rng: () => number = Math.random): QualityQuestion {
  const options = QUALITY_LEVELS[clampLevel(level, QUALITY_LEVELS.length)];
  const quality = pick(options, rng);
  const root = 45 + Math.floor(rng() * 10); // A2..F#3
  return { kind: 'quality', root, quality, options, midi: chordIntervals(quality).map((i) => root + i) };
}

export function neckQuestion(level: number, tuning: Tuning = STANDARD, rng: () => number = Math.random): NeckQuestion {
  const maxFret = level <= 1 ? 0 : level === 2 ? 5 : 12;
  const string = 1 + Math.floor(rng() * tuning.midi.length);
  const fret = Math.floor(rng() * (maxFret + 1));
  return { kind: 'neck', midi: tuning.midi[string - 1] + fret, maxFret, anyOctave: level >= 3 };
}

export function checkNeck(q: NeckQuestion, string: number, fret: number, tuning: Tuning = STANDARD): boolean {
  const m = tuning.midi[string - 1] + fret;
  return q.anyOctave ? pc(m) === pc(q.midi) : m === q.midi;
}

export const noteLabelTr = (midi: number) => `${SOLFEGE[pc(midi)]} (${noteName(midi)})`;

/* ---------- playing through alphaTab ---------- */

export interface Pos {
  string: number;
  fret: number;
}

/**
 * Puts MIDI notes (any order) on distinct strings, higher notes on higher strings, so a chord can be
 * written as alphaTex. Picks the placement with the lowest highest fret; null when nothing fits in
 * frets 0..maxFret.
 */
export function placeNotes(midis: number[], tuning: Tuning = STANDARD, maxFret = 15): Pos[] | null {
  const sorted = [...midis].sort((a, b) => a - b);
  let best: Pos[] | null = null;
  let bestCost = Infinity;
  const walk = (i: number, below: number, acc: Pos[], cost: number) => {
    if (cost >= bestCost) return;
    if (i === sorted.length) {
      best = acc;
      bestCost = cost;
      return;
    }
    for (let s = below; s >= 1; s--) {
      const f = sorted[i] - tuning.midi[s - 1];
      if (f >= 0 && f <= maxFret) walk(i + 1, s - 1, [...acc, { string: s, fret: f }], Math.max(cost, f));
    }
  };
  walk(0, tuning.midi.length, [], 0);
  return best;
}

/** Lowest-fret position of a single note. */
export function placeNote(midi: number, tuning: Tuning = STANDARD): Pos | null {
  let best: Pos | null = null;
  tuning.midi.forEach((open, i) => {
    const f = midi - open;
    if (f >= 0 && f <= 20 && (!best || f < best.fret)) best = { string: i + 1, fret: f };
  });
  return best;
}

const beat = (ps: Pos[]) => (ps.length === 1 ? `${ps[0].fret}.${ps[0].string}` : `(${ps.map((p) => `${p.fret}.${p.string}`).join(' ')})`);

/**
 * alphaTex for a sequence of note groups (each group sounds together) as half notes, e.g.
 * [[45], [52]] = an ascending interval, [[45, 52]] = a harmonic one.
 */
export function earTex(groups: number[][], opts: TexOptions = {}): string | null {
  const tuning = opts.tuning ?? STANDARD;
  const beats: string[] = [];
  for (const g of groups) {
    const ps = g.length === 1 ? (placeNote(g[0], tuning) ? [placeNote(g[0], tuning)!] : null) : placeNotes(g, tuning);
    if (!ps) return null;
    beats.push(beat(ps));
  }
  while (beats.length % 2) beats.push('r');
  const bars: string[] = [];
  for (let i = 0; i < beats.length; i += 2) bars.push(beats.slice(i, i + 2).join(' '));
  return `${texHeader({ tempo: 80, ...opts })}\n:2 ${bars.join(' | ')} |`;
}

/** What to play for a question: interval notes in order / together; a chord broken then together. */
export function questionGroups(q: IntervalQuestion | QualityQuestion | NeckQuestion): number[][] {
  switch (q.kind) {
    case 'interval': {
      const [a, b] = intervalNotes(q);
      return q.mode === 'together' ? [[a, b]] : [[a], [b]];
    }
    case 'quality':
      return [...q.midi.map((m) => [m]), q.midi];
    case 'neck':
      return [[q.midi]];
  }
}

/** Suggests the next level after `need` right answers among the last `of`. */
export function shouldLevelUp(recent: boolean[], need = 8, of = 10): boolean {
  const last = recent.slice(-of);
  return last.length >= of && last.filter(Boolean).length >= need;
}
