const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const CHORDS: [string, number[]][] = [
  ['', [0, 4, 7]],
  ['m', [0, 3, 7]],
  ['7', [0, 4, 7, 10]],
  ['7', [0, 4, 10]],
  ['maj7', [0, 4, 7, 11]],
  ['m7', [0, 3, 7, 10]],
  ['6', [0, 4, 7, 9]],
  ['m6', [0, 3, 7, 9]],
  ['sus2', [0, 2, 7]],
  ['sus4', [0, 5, 7]],
  ['add9', [0, 2, 4, 7]],
  ['dim', [0, 3, 6]],
  ['aug', [0, 4, 8]],
  ['5', [0, 7]],
];

/**
 * Chord symbol for three or more sounding pitches (MIDI), or null. Tries the bass note as root first
 * and writes a slash chord when another root fits better.
 */
export function chordName(pitches: number[]): string | null {
  if (pitches.length < 3) return null;
  const sorted = [...pitches].sort((a, b) => a - b);
  const pcs = [...new Set(sorted.map((p) => ((p % 12) + 12) % 12))];
  const bass = pcs[0];
  const roots = [bass, ...pcs.slice(1)];
  for (const root of roots) {
    const rel = pcs.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b);
    const hit = CHORDS.find(([, iv]) => iv.length === rel.length && iv.every((x, i) => x === rel[i]));
    if (hit) return `${NAMES[root]}${hit[0]}${root === bass ? '' : `/${NAMES[bass]}`}`;
  }
  return null;
}
