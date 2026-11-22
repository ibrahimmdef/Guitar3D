import { CHORD_TYPES } from './chords';
import { parseRoot, pc } from './notes';

/**
 * A guitar-like voicing (MIDI, low to high) for a chord symbol such as "G", "Am7" or "C/E", for
 * the practice strum sound: the bass between E2 and D#3, then chord tones at least a third apart up
 * to G4, at most six notes. Unknown symbols give null.
 */
export function chordVoicing(name: string | null | undefined): number[] | null {
  if (!name) return null;
  const [main, slash] = name.split('/');
  const root = parseRoot(main);
  if (!root) return null;
  const suffix = main.slice(root.length);
  const type = CHORD_TYPES.find((t) => t.suffix === suffix) ?? (suffix === '6' ? { intervals: [0, 4, 7, 9] } : suffix === 'm6' ? { intervals: [0, 3, 7, 9] } : suffix === 'dim' ? { intervals: [0, 3, 6] } : suffix === 'aug' ? { intervals: [0, 4, 8] } : null);
  if (!type) return null;
  const pcs = new Set(type.intervals.map((i) => pc(root.pc + i)));
  const bassPc = slash ? parseRoot(slash)?.pc ?? root.pc : root.pc;
  const bass = 40 + pc(bassPc - 4);
  const out = [bass];
  for (let m = bass + 3; m <= 67 && out.length < 6; m++) if (pcs.has(pc(m)) && m - out[out.length - 1] >= 3) out.push(m);
  return out;
}

/** Strings in the order a stroke hits them: down = low to high, up = the top four, high to low. */
export function strokeOrder(voicing: readonly number[], dir: 'D' | 'U'): number[] {
  return dir === 'D' ? [...voicing] : voicing.slice(-4).reverse();
}
