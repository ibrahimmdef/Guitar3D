import { fingerPitches } from '@guitar3d/shared';

/**
 * Tuning and capo detection from transcribed pitches.
 *
 * A guitar can't play below its lowest open string, so the lowest note that really occurs tells a
 * down-tuned guitar apart from standard tuning (Eb2 → half step down, D2 → drop D / D standard…).
 * When two tunings share the lowest note, the one with the easier fingering wins. A capo is
 * suggested when it makes the whole part clearly easier to finger.
 */

export interface TuningDef {
  id: string;
  label: string;
  /** MIDI per string, tab order (string 1 = high e first). */
  midi: number[];
}

export const TUNING_DEFS: TuningDef[] = [
  { id: 'standard', label: 'E standard', midi: [64, 59, 55, 50, 45, 40] },
  { id: 'half-down', label: 'Eb standard (½ step down)', midi: [63, 58, 54, 49, 44, 39] },
  { id: 'drop-d', label: 'Drop D', midi: [64, 59, 55, 50, 45, 38] },
  { id: 'd-standard', label: 'D standard (whole step down)', midi: [62, 57, 53, 48, 43, 38] },
  { id: 'drop-c#', label: 'Drop C# (½ step down)', midi: [63, 58, 54, 49, 44, 37] },
  { id: 'drop-c', label: 'Drop C', midi: [62, 57, 53, 48, 43, 36] },
];

const lowest = (t: TuningDef) => Math.min(...t.midi);

/**
 * The lowest pitch that is really played: confident notes only, and it must occur at least twice
 * and in at least 1 % of them (a stray low note is more likely a transcription error or bleed from
 * the bass). Null when there are no notes.
 */
export function lowestPlayed(notes: { pitch: number; conf: number }[], minConf = 0.3): number | null {
  if (!notes.length) return null;
  const sure = notes.filter((n) => n.conf >= minConf);
  const pool = sure.length ? sure : notes;
  const count = new Map<number, number>();
  for (const n of pool) count.set(n.pitch, (count.get(n.pitch) ?? 0) + 1);
  // A low string is played again and again; a few bass notes bleeding into a separated guitar
  // track are not (2 stray C2s among 2,400 notes once turned E standard into drop C).
  const need = Math.max(2, Math.ceil(pool.length * 0.01));
  const repeated = [...count.entries()].filter(([, c]) => c >= need).map(([p]) => p);
  return Math.min(...(repeated.length ? repeated : [...count.keys()]));
}

/** Fingering cost per beat of the chords/notes in `beats` (MIDI) on `tuning` with `capo`. */
export function fingeringCost(beats: number[][], tuning: readonly number[], capo = 0): { cost: number; dropped: number } {
  if (!beats.length) return { cost: 0, dropped: 0 };
  const shifted = tuning.map((m) => m + capo);
  const r = fingerPitches(beats, shifted, { maxFret: 17 - capo });
  const dropped = r.beats.reduce((s, b) => s + b.filter((p) => !p).length, 0);
  return { cost: r.cost / beats.length, dropped };
}

/** Tuning whose lowest string matches the lowest played note (standard when nothing goes below E2). */
export function detectTuning(notes: { pitch: number; conf: number }[], beats: number[][]): TuningDef {
  const low = lowestPlayed(notes);
  if (low == null || low >= 40) return TUNING_DEFS[0];
  const exact = TUNING_DEFS.filter((t) => lowest(t) === low);
  if (!exact.length) return TUNING_DEFS[TUNING_DEFS.length - 1];
  if (exact.length === 1) return exact[0];
  // same lowest note (drop D vs D standard): the easier fingering wins, the first listed on a tie
  let best = exact[0];
  let bestCost = fingeringCost(beats, best.midi).cost;
  for (const t of exact.slice(1)) {
    const c = fingeringCost(beats, t.midi).cost;
    if (c < bestCost * 0.9) [best, bestCost] = [t, c];
  }
  return best;
}

export const MAX_SUGGESTED_CAPO = 7;

/**
 * Capo fret (0 = none) that makes the part clearly easier: at least `gain` cheaper per beat, no
 * note lost, and no note below the capo'd lowest string.
 */
export function suggestCapo(notes: { pitch: number; conf: number }[], beats: number[][], tuning: readonly number[], gain = 0.25): number {
  const low = lowestPlayed(notes);
  if (low == null || !beats.length) return 0;
  const minAll = Math.min(...notes.map((n) => n.pitch));
  const base = fingeringCost(beats, tuning, 0);
  let best = 0;
  let bestCost = base.cost;
  for (let c = 1; c <= MAX_SUGGESTED_CAPO; c++) {
    if (minAll < Math.min(...tuning) + c) break;
    const r = fingeringCost(beats, tuning, c);
    if (r.dropped > base.dropped) continue;
    if (r.cost < bestCost && r.cost <= base.cost * (1 - gain)) [best, bestCost] = [c, r.cost];
  }
  return best;
}

/** "Eb standard (½ step down)", plus the detune when the whole guitar is noticeably off A440. */
export function tuningLabel(t: TuningDef, cents = 0, capo = 0): string {
  const parts = [t.label];
  if (Math.abs(cents) >= 20) parts.push(`about ${Math.abs(Math.round(cents))} cents ${cents < 0 ? 'flat' : 'sharp'}`);
  if (capo) parts.push(`capo ${capo}`);
  return parts.join(' · ');
}
