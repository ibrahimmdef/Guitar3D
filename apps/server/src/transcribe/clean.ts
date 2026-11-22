import type { RawNote } from './grid.js';

/**
 * Removes the usual polyphonic-transcription ghosts before quantising:
 *  - overtones of a single note (octave, octave + fifth, two octaves… above a stronger note that
 *    starts together with it). Only for one note + its ghost: in a real chord the octave is
 *    usually played (E5 power chord = E2 B2 E3), so groups of three or more are left alone;
 *  - short, weak blips starting together with a strong note (attack noise, overtones).
 */

/** Onsets closer than this count as "together" (s). */
export const ONSET_WINDOW = 0.06;
/** Harmonic intervals above a fundamental, in semitones. */
export const HARMONICS = [12, 19, 24, 28, 31];

export function cleanNotes(notes: RawNote[]): RawNote[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const drop = new Set<RawNote>();
  // clusters of notes starting together
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].start - sorted[i].start <= ONSET_WINDOW) j++;
    const group = sorted.slice(i, j);
    if (group.length === 2) {
      const [lo, hi] = group[0].pitch <= group[1].pitch ? group : [group[1], group[0]];
      if (HARMONICS.includes(hi.pitch - lo.pitch) && hi.conf < lo.conf) drop.add(hi);
    }
    i = j;
  }
  for (const n of sorted) {
    if (drop.has(n) || n.end - n.start >= 0.12 || n.conf >= 0.4) continue;
    const masked = sorted.some((m) => m !== n && !drop.has(m) && m.conf >= 0.6 && Math.abs(m.start - n.start) <= ONSET_WINDOW);
    if (masked) drop.add(n);
  }
  return sorted.filter((n) => !drop.has(n));
}
