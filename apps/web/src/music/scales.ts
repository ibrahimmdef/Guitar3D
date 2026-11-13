import type { FretNote } from '@guitar3d/shared';
import { pc } from './notes';
import { STANDARD, type Tuning } from './tunings';

export type ScaleId =
  | 'major' | 'minor' | 'major-pent' | 'minor-pent' | 'blues' | 'harmonic-minor'
  | 'ionian' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian' | 'locrian';

export interface ScaleDef {
  id: ScaleId;
  label: string;
  intervals: number[];
  group: 'temel' | 'mod';
}

export const SCALES: ScaleDef[] = [
  { id: 'major', label: 'Majör', intervals: [0, 2, 4, 5, 7, 9, 11], group: 'temel' },
  { id: 'minor', label: 'Doğal minör', intervals: [0, 2, 3, 5, 7, 8, 10], group: 'temel' },
  { id: 'major-pent', label: 'Majör pentatonik', intervals: [0, 2, 4, 7, 9], group: 'temel' },
  { id: 'minor-pent', label: 'Minör pentatonik', intervals: [0, 3, 5, 7, 10], group: 'temel' },
  { id: 'blues', label: 'Blues', intervals: [0, 3, 5, 6, 7, 10], group: 'temel' },
  { id: 'harmonic-minor', label: 'Armonik minör', intervals: [0, 2, 3, 5, 7, 8, 11], group: 'temel' },
  { id: 'ionian', label: 'İyonyen', intervals: [0, 2, 4, 5, 7, 9, 11], group: 'mod' },
  { id: 'dorian', label: 'Doryen', intervals: [0, 2, 3, 5, 7, 9, 10], group: 'mod' },
  { id: 'phrygian', label: 'Frigyen', intervals: [0, 1, 3, 5, 7, 8, 10], group: 'mod' },
  { id: 'lydian', label: 'Lidyen', intervals: [0, 2, 4, 6, 7, 9, 11], group: 'mod' },
  { id: 'mixolydian', label: 'Miksolidyen', intervals: [0, 2, 4, 5, 7, 9, 10], group: 'mod' },
  { id: 'aeolian', label: 'Eolyen', intervals: [0, 2, 3, 5, 7, 8, 10], group: 'mod' },
  { id: 'locrian', label: 'Lokriyen', intervals: [0, 1, 3, 5, 6, 8, 10], group: 'mod' },
];

export const getScale = (id: ScaleId) => SCALES.find((s) => s.id === id) ?? SCALES[0];

/** Pitch classes of the scale, root first. */
export const scalePcs = (root: number, id: ScaleId) => getScale(id).intervals.map((i) => pc(root + i));

/** Degree label of an interval: 0 → "1", 3 → "♭3", 6 → "♭5" … */
const DEGREES = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
export const degreeLabel = (interval: number) => DEGREES[pc(interval)];

export interface NeckNote {
  /** Tab string, 1 = highest. */
  string: number;
  fret: number;
  midi: number;
  isRoot: boolean;
  /** Semitones above the root (0..11). */
  interval: number;
}

/** Every scale note on the neck between fret 0 and `maxFret`. */
export function neckNotes(root: number, id: ScaleId, tuning: Tuning = STANDARD, maxFret = 15): NeckNote[] {
  const set = new Set(scalePcs(root, id));
  const out: NeckNote[] = [];
  tuning.midi.forEach((open, i) => {
    for (let fret = 0; fret <= maxFret; fret++) {
      const midi = open + fret;
      if (!set.has(pc(midi))) continue;
      out.push({ string: i + 1, fret, midi, isRoot: pc(midi) === pc(root), interval: pc(midi - root) });
    }
  });
  return out;
}

export interface ScalePosition {
  index: number;
  notes: NeckNote[];
  minFret: number;
  maxFret: number;
}

/**
 * Fingering boxes. Pentatonic scales get the five CAGED-style boxes (two notes per string), seven-note
 * scales the seven three-notes-per-string positions; blues is the minor pentatonic box plus the blue
 * note wherever it falls inside the box. Each position starts on a scale note of the lowest string and
 * then takes consecutive scale notes upwards, so it follows any tuning.
 */
export function scalePositions(root: number, id: ScaleId, tuning: Tuning = STANDARD): ScalePosition[] {
  const base: ScaleId = id === 'blues' ? 'minor-pent' : id;
  const intervals = getScale(base).intervals;
  const perString = intervals.length === 5 ? 2 : 3;
  const set = new Set(scalePcs(root, base));
  const strings = tuning.midi.length;
  const low = tuning.midi[strings - 1];
  // Scale notes on the lowest string, frets 0..11, in order of the scale starting from the root.
  const lowFrets: number[] = [];
  for (let f = 0; f < 12; f++) if (set.has(pc(low + f))) lowFrets.push(f);
  const rootFret = pc(root - low);
  lowFrets.sort((a, b) => ((a - rootFret + 12) % 12) - ((b - rootFret + 12) % 12));
  const isScale = (m: number) => set.has(pc(m));
  const positions: ScalePosition[] = lowFrets.map((startFret, index) => {
    let midi = low + startFret;
    const notes: NeckNote[] = [];
    for (let s = strings; s >= 1; s--) {
      const open = tuning.midi[s - 1];
      for (let k = 0; k < perString; k++) {
        if (s === strings && k === 0) {
          // first note given
        } else {
          midi += 1;
          while (!isScale(midi)) midi += 1;
        }
        notes.push({ string: s, fret: midi - open, midi, isRoot: pc(midi) === pc(root), interval: pc(midi - root) });
      }
    }
    return withRange(index, notes);
  });
  // Boxes that start below the nut (only possible with odd tunings) move up an octave.
  const fixed = positions.map((p) => (p.minFret < 0 ? withRange(p.index, p.notes.map((n) => ({ ...n, fret: n.fret + 12, midi: n.midi + 12 }))) : p));
  if (id !== 'blues') return fixed;
  const blue = pc(root + 6);
  return fixed.map((p) => {
    const extra: NeckNote[] = [];
    for (let s = 1; s <= strings; s++) {
      const frets = p.notes.filter((n) => n.string === s).map((n) => n.fret);
      for (let f = Math.min(...frets); f <= Math.max(...frets); f++) {
        const midi = tuning.midi[s - 1] + f;
        if (pc(midi) === blue) extra.push({ string: s, fret: f, midi, isRoot: false, interval: 6 });
      }
    }
    return withRange(p.index, [...p.notes, ...extra]);
  });
}

function withRange(index: number, notes: NeckNote[]): ScalePosition {
  const frets = notes.map((n) => n.fret);
  return { index, notes, minFret: Math.min(...frets), maxFret: Math.max(...frets) };
}

/** Markers for the 3D neck: roots as filled ('now') bubbles, the other notes as rings ('next'). */
export function scaleMarkers(notes: NeckNote[]): FretNote[] {
  return notes.map((n) => ({ string: n.string, fret: n.fret, state: n.isRoot ? 'now' : 'next' }));
}

/** Notes in playing order (lowest pitch first, then the same back down). */
export function ascendDescend(notes: NeckNote[]): NeckNote[] {
  const up = [...notes].sort((a, b) => a.midi - b.midi || b.string - a.string);
  // Same pitch on two strings: keep the first (lower string) only.
  const uniq = up.filter((n, i) => i === 0 || n.midi !== up[i - 1].midi);
  return [...uniq, ...uniq.slice(0, -1).reverse()];
}

/** One octave + root from the lowest root inside the notes (for "çal" on the whole neck). */
export function firstOctave(notes: NeckNote[]): NeckNote[] {
  const sorted = [...notes].sort((a, b) => a.midi - b.midi || b.string - a.string);
  const first = sorted.find((n) => n.isRoot);
  if (!first) return sorted;
  return sorted.filter((n, i) => n.midi >= first.midi && n.midi <= first.midi + 12 && (i === 0 || n.midi !== sorted[i - 1].midi));
}
