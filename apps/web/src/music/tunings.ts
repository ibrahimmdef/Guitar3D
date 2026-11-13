import type { FretNote } from '@guitar3d/shared';
import { noteName, noteWithOctave, pc } from './notes';

/**
 * A six-string tuning. `midi[0]` is tab string 1 (the highest, thinnest string), `midi[5]` string 6.
 */
export interface Tuning {
  id: string;
  label: string;
  midi: number[];
}

export const TUNINGS: Tuning[] = [
  { id: 'standard', label: 'Standart', midi: [64, 59, 55, 50, 45, 40] },
  { id: 'half-down', label: 'Yarım ton pes', midi: [63, 58, 54, 49, 44, 39] },
  { id: 'drop-d', label: 'Drop D', midi: [64, 59, 55, 50, 45, 38] },
  { id: 'dadgad', label: 'DADGAD', midi: [62, 57, 55, 50, 45, 38] },
  { id: 'open-g', label: 'Open G', midi: [62, 59, 55, 50, 43, 38] },
  { id: 'open-d', label: 'Open D', midi: [62, 57, 54, 50, 45, 38] },
];

export const STANDARD = TUNINGS[0];
export const MAX_CAPO = 12;

export function getTuning(id: string | null | undefined): Tuning {
  return TUNINGS.find((t) => t.id === id) ?? STANDARD;
}

/** Known tuning with exactly these string pitches (tab order), or null. */
export function findTuning(midi: readonly number[]): Tuning | null {
  return TUNINGS.find((t) => t.midi.length === midi.length && t.midi.every((m, i) => m === midi[i])) ?? null;
}

/** Sounding MIDI pitch of `fret` (relative to the capo) on tab string `string` (1 = highest). */
export function fretMidi(t: Tuning, string: number, fret: number, capo = 0): number {
  return t.midi[string - 1] + capo + fret;
}

/** Note name at a position, e.g. ("standard", 6, 3) → "G". */
export function noteAt(t: Tuning, string: number, fret: number, capo = 0, flats = false): string {
  return noteName(fretMidi(t, string, fret, capo), flats);
}

/** "E A D G B E", lowest string first. */
export function tuningNotes(t: Tuning): string {
  return [...t.midi].reverse().map((m) => noteName(m)).join(' ');
}

/** Open-string targets for the tuner, lowest string first, e.g. { string: 6, midi: 40, name: "E2" }. */
export function tunerTargets(t: Tuning, capo = 0) {
  return t.midi
    .map((m, i) => ({ string: i + 1, midi: m + capo, name: noteWithOctave(m + capo), pc: pc(m + capo) }))
    .reverse();
}

/** Clamps a capo value to 0…MAX_CAPO. */
export const clampCapo = (c: number) => Math.max(0, Math.min(MAX_CAPO, Math.round(c) || 0));

/**
 * Fret notes of a tab (frets relative to the capo) moved to their place on the real neck. Open strings
 * land on the capo fret; muted notes stay where they are.
 */
export function withCapo(notes: FretNote[], capo: number): FretNote[] {
  if (!capo) return notes;
  return notes.map((n) => (n.muted ? n : { ...n, fret: n.fret + capo }));
}

/** Semitone offset of every string from `from` to `to` (tab order). */
export function tuningDelta(from: readonly number[], to: Tuning): number[] {
  return to.midi.map((m, i) => m - (from[i] ?? m));
}
