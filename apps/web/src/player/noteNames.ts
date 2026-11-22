const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STANDARD = ['e', 'B', 'G', 'D', 'A', 'E'];

export const pitchClassName = (midi: number) => NAMES[((Math.round(midi) % 12) + 12) % 12];

/**
 * Letters per tab string (index 0 = tab string 1 = highest), from alphaTab's staff tuning, which
 * lists the top tab line first. The highest string is lower-cased when it shares the lowest string's
 * name (E … e), as tab players write it.
 */
export function stringLetters(tuning: number[] | null | undefined, stringCount = 6): string[] {
  if (!tuning?.length) return STANDARD.slice(0, stringCount).concat(Array.from({ length: Math.max(0, stringCount - 6) }, (_, i) => String(7 + i)));
  const names = tuning.map(pitchClassName);
  if (names.length > 1 && names[0] === names[names.length - 1]) names[0] = names[0].toLowerCase();
  return names;
}

export interface CueNote {
  /** Tab numbering: 1 = highest. */
  string: number;
  fret: number;
  muted?: boolean;
}

/** "A·0 D·2 G·2" with the lowest string first. */
export function cueLabel(notes: CueNote[], letters: string[]): string {
  return [...notes]
    .sort((a, b) => b.string - a.string)
    .map((n) => `${letters[n.string - 1] ?? n.string}·${n.muted ? 'x' : n.fret}`)
    .join(' ');
}

/** Chord symbols live in the shared package (the transcriber names chords too). */
export { chordName } from '@guitar3d/shared';
