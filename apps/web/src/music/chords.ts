import type { FretNote } from '@guitar3d/shared';
import { noteName, parseRoot, pc, SOLFEGE } from './notes';
import { STANDARD, type Tuning } from './tunings';

/**
 * Chord library: hand-written open chords plus E- and A-shape barre chords for all 12 roots.
 * Frets and fingers are listed lowest string first ("x32010" style): index 0 = string 6 (low E).
 * -1 = muted string; finger 0 = open string / not fretted.
 */
export type ChordType = 'maj' | 'm' | '7' | 'maj7' | 'm7' | 'sus2' | 'sus4' | 'add9' | '5';

export const CHORD_TYPES: { id: ChordType; suffix: string; label: string; intervals: number[] }[] = [
  { id: 'maj', suffix: '', label: 'Majör', intervals: [0, 4, 7] },
  { id: 'm', suffix: 'm', label: 'Minör', intervals: [0, 3, 7] },
  { id: '7', suffix: '7', label: '7 (dominant)', intervals: [0, 4, 7, 10] },
  { id: 'maj7', suffix: 'maj7', label: 'Majör 7', intervals: [0, 4, 7, 11] },
  { id: 'm7', suffix: 'm7', label: 'Minör 7', intervals: [0, 3, 7, 10] },
  { id: 'sus2', suffix: 'sus2', label: 'sus2', intervals: [0, 2, 7] },
  { id: 'sus4', suffix: 'sus4', label: 'sus4', intervals: [0, 5, 7] },
  { id: 'add9', suffix: 'add9', label: 'add9', intervals: [0, 2, 4, 7] },
  { id: '5', suffix: '5', label: 'Power (5)', intervals: [0, 7] },
];

export type ChordShape = 'open' | 'E' | 'A';
export const SHAPE_LABEL: Record<ChordShape, string> = { open: 'Açık', E: 'E kalıbı', A: 'A kalıbı' };

export interface Barre {
  fret: number;
  /** Tab strings covered, `from` the lower-pitched (higher number) to `to`. */
  from: number;
  to: number;
}

export interface ChordVoicing {
  id: string;
  root: number;
  type: ChordType;
  name: string;
  shape: ChordShape;
  frets: number[];
  fingers: number[];
  barre?: Barre;
}

const typeInfo = (t: ChordType) => CHORD_TYPES.find((c) => c.id === t)!;
export const chordName = (root: number, type: ChordType) => `${noteName(root)}${typeInfo(type).suffix}`;
export const chordIntervals = (type: ChordType) => typeInfo(type).intervals;
export const chordPcs = (root: number, type: ChordType) => chordIntervals(type).map((i) => pc(root + i));

const parse = (s: string) => s.split('').map((c) => (c === 'x' ? -1 : Number(c)));

/** [name root, type, frets, fingers, barre?] */
const OPEN: [string, ChordType, string, string, Barre?][] = [
  ['C', 'maj', 'x32010', 'x32010'],
  ['A', 'maj', 'x02220', 'x01230'],
  ['G', 'maj', '320003', '210003'],
  ['E', 'maj', '022100', '023100'],
  ['D', 'maj', 'xx0232', 'xx0132'],
  ['A', 'm', 'x02210', 'x02310'],
  ['E', 'm', '022000', '023000'],
  ['D', 'm', 'xx0231', 'xx0231'],
  ['C', '7', 'x32310', 'x32410'],
  ['A', '7', 'x02020', 'x02030'],
  ['G', '7', '320001', '320001'],
  ['E', '7', '020100', '020100'],
  ['D', '7', 'xx0212', 'xx0213'],
  ['B', '7', 'x21202', 'x21304'],
  ['C', 'maj7', 'x32000', 'x32000'],
  ['A', 'maj7', 'x02120', 'x02130'],
  ['D', 'maj7', 'xx0222', 'xx0123'],
  ['F', 'maj7', 'xx3210', 'xx3210'],
  ['G', 'maj7', '320002', '320001'],
  ['E', 'maj7', '021100', '031200'],
  ['A', 'm7', 'x02010', 'x02010'],
  ['E', 'm7', '022030', '023040'],
  ['D', 'm7', 'xx0211', 'xx0211', { fret: 1, from: 2, to: 1 }],
  ['D', 'sus2', 'xx0230', 'xx0130'],
  ['A', 'sus2', 'x02200', 'x01200'],
  ['D', 'sus4', 'xx0233', 'xx0134'],
  ['A', 'sus4', 'x02230', 'x01230'],
  ['E', 'sus4', '022200', '023400'],
  ['C', 'add9', 'x32030', 'x21030'],
  ['E', '5', '022xxx', '012xxx'],
  ['A', '5', 'x022xx', 'x012xx'],
  ['D', '5', 'xx023x', 'xx013x'],
];

/** Movable shapes: offsets from the barre fret (root on string 6 for E, string 5 for A). */
const SHAPES: Record<'E' | 'A', Partial<Record<ChordType, { frets: string; fingers: string; barre?: [number, number] }>>> = {
  E: {
    maj: { frets: '022100', fingers: '134211', barre: [6, 1] },
    m: { frets: '022000', fingers: '134111', barre: [6, 1] },
    '7': { frets: '020100', fingers: '131211', barre: [6, 1] },
    maj7: { frets: '0x110x', fingers: '1x342x' },
    m7: { frets: '020000', fingers: '131111', barre: [6, 1] },
    sus4: { frets: '022200', fingers: '123411', barre: [6, 1] },
    '5': { frets: '022xxx', fingers: '134xxx' },
  },
  A: {
    maj: { frets: 'x02220', fingers: 'x13331', barre: [5, 1] },
    m: { frets: 'x02210', fingers: 'x13421', barre: [5, 1] },
    '7': { frets: 'x02020', fingers: 'x13141', barre: [5, 1] },
    maj7: { frets: 'x02120', fingers: 'x13241', barre: [5, 1] },
    m7: { frets: 'x02010', fingers: 'x13121', barre: [5, 1] },
    sus2: { frets: 'x02200', fingers: 'x13411', barre: [5, 1] },
    sus4: { frets: 'x02230', fingers: 'x12341', barre: [5, 1] },
    add9: { frets: 'x02420', fingers: 'x12431', barre: [5, 1] },
    '5': { frets: 'x022xx', fingers: 'x134xx' },
  },
};

function build(): ChordVoicing[] {
  const out: ChordVoicing[] = [];
  for (const [r, type, frets, fingers, barre] of OPEN) {
    const root = parseRoot(r)!.pc;
    out.push({ id: `${chordName(root, type)}:open`, root, type, name: chordName(root, type), shape: 'open', frets: parse(frets), fingers: parse(fingers).map((f) => Math.max(0, f)), barre });
  }
  for (const shape of ['E', 'A'] as const) {
    const openPc = shape === 'E' ? 4 : 9;
    for (let root = 0; root < 12; root++) {
      // Fret 1–12: fret 0 would just be the open chord.
      const base = pc(root - openPc) || 12;
      for (const ct of CHORD_TYPES) {
        const s = SHAPES[shape][ct.id];
        if (!s) continue;
        const frets = parse(s.frets).map((f) => (f < 0 ? -1 : f + base));
        out.push({
          id: `${chordName(root, ct.id)}:${shape}`,
          root,
          type: ct.id,
          name: chordName(root, ct.id),
          shape,
          frets,
          fingers: parse(s.fingers).map((f) => Math.max(0, f)),
          barre: s.barre ? { fret: base, from: s.barre[0], to: s.barre[1] } : undefined,
        });
      }
    }
  }
  return out;
}

export const VOICINGS: ChordVoicing[] = build();

/** Lowest fretted fret (for the "3. perde" label of a diagram), 1 for open shapes. */
export function baseFret(v: ChordVoicing): number {
  const fretted = v.frets.filter((f) => f > 0);
  return fretted.length ? Math.min(...fretted) : 1;
}

/** Sounding MIDI pitches, lowest string first (muted strings skipped). */
export function voicingMidi(v: ChordVoicing, tuning: Tuning = STANDARD, capo = 0): number[] {
  return v.frets.flatMap((f, i) => (f < 0 ? [] : [tuning.midi[5 - i] + capo + f]));
}

/** The voicing as 3D markers: fretted/open strings as 'now' with finger numbers, muted as ×. */
export function voicingNotes(v: ChordVoicing): FretNote[] {
  return v.frets.map((f, i) => {
    const string = 6 - i;
    if (f < 0) return { string, fret: 0, state: 'now' as const, muted: true };
    return { string, fret: f, state: 'now' as const, finger: f > 0 && v.fingers[i] > 0 ? v.fingers[i] : undefined };
  });
}

export interface ChordQuery {
  root?: number | null;
  type?: ChordType | null;
  text?: string;
}

/** Case-, accent- and solfège-aware search ("am", "La minör", "f#m7", "sol7"). */
export function searchChords(q: ChordQuery, all = VOICINGS): ChordVoicing[] {
  let list = all;
  if (q.root != null) list = list.filter((v) => v.root === q.root);
  if (q.type) list = list.filter((v) => v.type === q.type);
  const text = (q.text ?? '').trim();
  if (text) {
    const r = parseRoot(text);
    const fold = text.toLocaleLowerCase('tr');
    if (r) {
      const rest = text.slice(r.length).trim().toLocaleLowerCase('tr').replace(/\s+/g, '');
      list = list.filter((v) => v.root === r.pc && matchesSuffix(v.type, rest));
    } else {
      list = list.filter((v) => typeInfo(v.type).label.toLocaleLowerCase('tr').includes(fold));
    }
  }
  return list;
}

function matchesSuffix(type: ChordType, rest: string) {
  if (!rest) return true;
  const info = typeInfo(type);
  const words: Record<ChordType, string[]> = {
    maj: ['maj', 'majör', 'major'],
    m: ['m', 'min', 'minör', 'minor'],
    '7': ['7', 'dom7'],
    maj7: ['maj7', 'majör7'],
    m7: ['m7', 'min7', 'minör7'],
    sus2: ['sus2'],
    sus4: ['sus4', 'sus'],
    add9: ['add9'],
    '5': ['5', 'power'],
  };
  return [info.suffix.toLowerCase(), ...words[type].map((w) => w.toLocaleLowerCase('tr'))].some((w) => w && w === rest);
}

/** Chord names grouped: one entry per (root, type) with its voicings, open first. */
export function groupVoicings(list: ChordVoicing[]) {
  const map = new Map<string, ChordVoicing[]>();
  for (const v of list) {
    const k = v.name;
    map.set(k, [...(map.get(k) ?? []), v]);
  }
  const order: Record<ChordShape, number> = { open: 0, E: 1, A: 2 };
  return [...map.entries()].map(([name, vs]) => ({ name, root: vs[0].root, type: vs[0].type, voicings: vs.sort((a, b) => order[a.shape] - order[b.shape]) }));
}

export const solfegeName = (v: ChordVoicing) => `${SOLFEGE[v.root]} ${typeInfo(v.type).label.toLocaleLowerCase('tr')}`;
