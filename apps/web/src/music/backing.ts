import { noteName, parseRoot, pc } from './notes';

/**
 * Backing tracks: a chord progression → one bar per chord of simple drums, bass and an optional
 * pad, on a 16-step grid. Pure data; audio/backing.ts plays it with Web Audio.
 */

export type Quality = 'maj' | 'm' | '7' | 'm7' | 'maj7' | 'dim' | '5';
export interface BackingChord {
  root: number;
  quality: Quality;
}

const QUALITY_INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], '5': [0, 7],
};
const SUFFIX: Record<Quality, string> = { maj: '', m: 'm', '7': '7', m7: 'm7', maj7: 'maj7', dim: 'dim', '5': '5' };

export const chordLabel = (c: BackingChord) => `${noteName(c.root)}${SUFFIX[c.quality]}`;

/** "Am F C G", "Am - F | C, G7", "Lam Fa Do Sol" → chords; null when any token is unreadable. */
export function parseProgression(text: string): BackingChord[] | null {
  const tokens = text.split(/[\s|,–—-]+/).filter(Boolean);
  if (!tokens.length) return null;
  const out: BackingChord[] = [];
  for (const tok of tokens) {
    const r = parseRoot(tok);
    if (!r) return null;
    const q = parseQuality(tok.slice(r.length));
    if (!q) return null;
    out.push({ root: r.pc, quality: q });
  }
  return out;
}

function parseQuality(s: string): Quality | null {
  const t = s.trim();
  const table: [RegExp, Quality][] = [
    [/^(maj7|M7|Δ7?)$/, 'maj7'], [/^(m7|min7|-7)$/, 'm7'], [/^7$/, '7'], [/^(m|min|-)$/, 'm'], [/^(dim|°|o)$/, 'dim'], [/^5$/, '5'], [/^(maj|M)?$/, 'maj'],
  ];
  for (const [re, q] of table) if (re.test(t)) return q;
  return null;
}

/** Roman numeral presets, relative to the key. */
export interface Preset {
  id: string;
  label: string;
  minor: boolean;
  /** [semitones above the key, quality] per bar. */
  steps: [number, Quality][];
}

export const PRESETS: Preset[] = [
  { id: 'pop', label: 'I–V–vi–IV', minor: false, steps: [[0, 'maj'], [7, 'maj'], [9, 'm'], [5, 'maj']] },
  { id: 'fifties', label: 'I–vi–IV–V', minor: false, steps: [[0, 'maj'], [9, 'm'], [5, 'maj'], [7, 'maj']] },
  { id: 'jazz', label: 'ii–V–I', minor: false, steps: [[2, 'm7'], [7, '7'], [0, 'maj7'], [0, 'maj7']] },
  {
    id: 'blues', label: '12 ölçü blues', minor: false,
    steps: [[0, '7'], [5, '7'], [0, '7'], [0, '7'], [5, '7'], [5, '7'], [0, '7'], [0, '7'], [7, '7'], [5, '7'], [0, '7'], [7, '7']],
  },
  { id: 'minor-rock', label: 'i–VII–VI–VII', minor: true, steps: [[0, 'm'], [10, 'maj'], [8, 'maj'], [10, 'maj']] },
  { id: 'minor', label: 'i–iv–v–i', minor: true, steps: [[0, 'm'], [5, 'm'], [7, 'm'], [0, 'm']] },
  { id: 'andalusian', label: 'i–VII–VI–V', minor: true, steps: [[0, 'm'], [10, 'maj'], [8, 'maj'], [7, 'maj']] },
];

export function presetChords(presetId: string, key: number): BackingChord[] {
  const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS[0];
  return p.steps.map(([iv, quality]) => ({ root: pc(key + iv), quality }));
}

export type BackingStyle = 'rock' | 'ballad' | 'shuffle';
export const STYLE_LABEL: Record<BackingStyle, string> = { rock: 'Rock', ballad: 'Balad', shuffle: 'Shuffle' };

export type BackingEvent =
  | { step: number; kind: 'kick' | 'snare' | 'hat' }
  | { step: number; kind: 'bass'; midi: number; len: number }
  | { step: number; kind: 'pad'; midi: number[]; len: number };

/** Bass register: root between E1 (28) and D#2 (39). */
export const bassMidi = (root: number) => 28 + pc(root - 4);

/** Pad voicing around middle C. */
export function padMidi(c: BackingChord): number[] {
  const base = 48 + pc(c.root);
  return QUALITY_INTERVALS[c.quality].map((i) => base + i).map((m) => (m > 64 ? m - 12 : m)).sort((a, b) => a - b);
}

/** Events of one 4/4 bar on 16 sixteenth steps. Shuffle places off-beats on the triplet grid (see `stepTime`). */
export function barEvents(c: BackingChord, style: BackingStyle, pad: boolean): BackingEvent[] {
  const ev: BackingEvent[] = [];
  const root = bassMidi(c.root);
  const fifth = root + (c.quality === 'dim' ? 6 : 7);
  if (style === 'ballad') {
    ev.push({ step: 0, kind: 'kick' }, { step: 6, kind: 'kick' }, { step: 8, kind: 'snare' });
    for (let s = 0; s < 16; s += 4) ev.push({ step: s, kind: 'hat' });
    ev.push({ step: 0, kind: 'bass', midi: root, len: 6 }, { step: 6, kind: 'bass', midi: root, len: 2 }, { step: 8, kind: 'bass', midi: fifth, len: 8 });
  } else {
    ev.push({ step: 0, kind: 'kick' }, { step: 8, kind: 'kick' }, { step: 4, kind: 'snare' }, { step: 12, kind: 'snare' });
    if (style === 'rock') ev.push({ step: 10, kind: 'kick' });
    for (let s = 0; s < 16; s += 2) ev.push({ step: s, kind: 'hat' });
    for (let s = 0; s < 16; s += 2) ev.push({ step: s, kind: 'bass', midi: style === 'shuffle' && s % 4 === 2 ? fifth : root, len: 2 });
  }
  if (pad) ev.push({ step: 0, kind: 'pad', midi: padMidi(c), len: 16 });
  return ev.sort((a, b) => a.step - b.step);
}

/** Seconds from bar start to `step` (sixteenths) at `bpm`; shuffle swings the off-beat eighths to 2/3. */
export function stepTime(step: number, bpm: number, style: BackingStyle): number {
  const beat = 60 / bpm;
  const q = Math.floor(step / 4);
  const r = step % 4;
  const within = style === 'shuffle' ? (r === 2 ? 2 / 3 : r / 4) : r / 4;
  return (q + within) * beat;
}

/** Scale suggestion for improvising over a progression in this key. */
export const improviseHint = (key: number, minor: boolean) => (minor ? `${noteName(key)} minör pentatonik` : `${noteName(pc(key + 9))} minör / ${noteName(key)} majör pentatonik`);
