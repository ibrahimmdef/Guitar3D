import { pc, SHARP_NAMES } from './notes';
import { STANDARD, type Tuning } from './tunings';

/** Tiny alphaTex snippets for "play this chord / scale" through the alphaTab synth. */

export interface TexOptions {
  tempo?: number;
  tuning?: Tuning;
  /** General MIDI program (see audio/sounds.ts). */
  program?: number;
  capo?: number;
}

/** alphaTex tuning token: 64 → "e4", 61 → "c#4". */
export function texPitch(midi: number): string {
  return `${SHARP_NAMES[pc(midi)].toLowerCase()}${Math.floor(midi / 12) - 1}`;
}

export function texHeader({ tempo = 90, tuning = STANDARD, program = 25, capo = 0 }: TexOptions = {}): string {
  return [
    `\\tempo ${tempo}`,
    '.',
    '\\track "Gitar"',
    '\\staff {tabs}',
    `\\instrument ${program}`,
    `\\tuning ${tuning.midi.map(texPitch).join(' ')}`,
    capo ? `\\capo ${capo}` : '',
  ].filter(Boolean).join('\n');
}

/** A chord (frets lowest string first, -1 = muted) strummed down once and let ring for a bar. */
export function chordTex(frets: number[], opts: TexOptions = {}): string {
  const notes = frets.flatMap((f, i) => (f < 0 ? [] : [`${f}.${6 - i}`]));
  if (!notes.length) return `${texHeader(opts)}\n:1 r |`;
  return `${texHeader(opts)}\n:1 (${notes.join(' ')}){bd} |`;
}

/** Single notes in order as eighth notes, padded with rests to whole bars. */
export function sequenceTex(notes: { string: number; fret: number }[], opts: TexOptions = {}): string {
  const tokens = notes.map((n) => `${n.fret}.${n.string}`);
  while (tokens.length % 8 !== 0 || tokens.length === 0) tokens.push('r');
  const bars: string[] = [];
  for (let i = 0; i < tokens.length; i += 8) bars.push(tokens.slice(i, i + 8).join(' '));
  return `${texHeader(opts)}\n:8 ${bars.join(' | ')} |`;
}
