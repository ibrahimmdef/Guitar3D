/** Pure pitch-class helpers shared by chords, scales, tunings and the tuner. */

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
/** Turkish solfège (Do Re Mi), used as a secondary label and in search. */
export const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'] as const;

/** Pitch class 0..11 (0 = C) of a MIDI number or pitch class. */
export const pc = (n: number) => ((Math.round(n) % 12) + 12) % 12;

export function noteName(midiOrPc: number, flats = false): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pc(midiOrPc)];
}

/** Scientific pitch name, e.g. 40 → "E2", 64 → "E4". */
export function noteWithOctave(midi: number): string {
  const m = Math.round(midi);
  return `${noteName(m)}${Math.floor(m / 12) - 1}`;
}

/** Root display label: "C#" plus solfège "Do#". */
export const rootLabel = (p: number) => SHARP_NAMES[pc(p)];

const LETTER: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const SOLF: [string, number][] = [['sol', 7], ['do', 0], ['re', 2], ['mi', 4], ['fa', 5], ['la', 9], ['si', 11]];

/**
 * Parses the root at the start of `s` ("C#", "db", "Sol", "re#"…). Returns the pitch class and how
 * many characters were consumed, or null.
 */
export function parseRoot(s: string): { pc: number; length: number } | null {
  const t = s.trim().toLocaleLowerCase('tr');
  let base: number | null = null;
  let len = 0;
  for (const [name, v] of SOLF) {
    if (t.startsWith(name)) {
      base = v;
      len = name.length;
      break;
    }
  }
  if (base == null && t[0] in LETTER) {
    base = LETTER[t[0]];
    len = 1;
  }
  if (base == null) return null;
  const acc = t[len];
  if (acc === '#' || acc === '♯') return { pc: pc(base + 1), length: len + 1 };
  if ((acc === 'b' || acc === '♭') && len === 1) return { pc: pc(base - 1), length: len + 1 };
  return { pc: base, length: len };
}
