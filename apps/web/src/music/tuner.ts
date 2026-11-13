import { noteName, noteWithOctave } from './notes';
import { STANDARD, type Tuning } from './tunings';

export const freqToMidi = (freq: number, a4 = 440) => 69 + 12 * Math.log2(freq / a4);
export const midiToFreq = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);
/** Cents from `midi`'s exact pitch to `freq` (positive = sharp). */
export const cents = (freq: number, midi: number, a4 = 440) => 1200 * Math.log2(freq / midiToFreq(midi, a4));

/** ±cents that count as in tune. */
export const IN_TUNE_CENTS = 5;

export type TuneDirection = 'up' | 'down' | 'ok';

export interface TunerReading {
  freq: number;
  /** Nearest chromatic note. */
  midi: number;
  name: string;
  octaveName: string;
  /** Cents off the nearest chromatic note, -50..50. */
  cents: number;
  /** The open string this most likely is (tab numbering) and its target. */
  string: number;
  targetMidi: number;
  targetName: string;
  /** Cents off the string's target, clamped to ±1200. */
  stringCents: number;
  /** Which way to turn the peg: 'up' = tighten (too low), 'down' = loosen (too high). */
  direction: TuneDirection;
}

/**
 * Turns a detected frequency into a tuner reading against `tuning` (+ capo). The string is the one
 * whose open pitch is nearest in cents (ties go to the lower string), unless `fixedString` pins it.
 */
export function readTuner(freq: number, tuning: Tuning = STANDARD, capo = 0, a4 = 440, fixedString?: number): TunerReading | null {
  if (!(freq > 0) || !Number.isFinite(freq)) return null;
  const exact = freqToMidi(freq, a4);
  const midi = Math.round(exact);
  let best = 6;
  let bestDist = Infinity;
  for (let s = tuning.midi.length; s >= 1; s--) {
    const d = Math.abs(exact - (tuning.midi[s - 1] + capo));
    if (d < bestDist - 1e-9) {
      best = s;
      bestDist = d;
    }
  }
  if (fixedString && fixedString >= 1 && fixedString <= tuning.midi.length) best = fixedString;
  const targetMidi = tuning.midi[best - 1] + capo;
  const stringCents = Math.max(-1200, Math.min(1200, cents(freq, targetMidi, a4)));
  return {
    freq,
    midi,
    name: noteName(midi),
    octaveName: noteWithOctave(midi),
    cents: cents(freq, midi, a4),
    string: best,
    targetMidi,
    targetName: noteWithOctave(targetMidi),
    stringCents,
    direction: Math.abs(stringCents) <= IN_TUNE_CENTS ? 'ok' : stringCents < 0 ? 'up' : 'down',
  };
}

/** Median of the last readings' frequencies (robust against octave blips). */
export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Needle angle in degrees for a cents value (±50 cents → ±45°). */
export const needleAngle = (c: number) => Math.max(-45, Math.min(45, (c / 50) * 45));
