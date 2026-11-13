import type { ChordVoicing } from './chords';

/** Chord change trainer: shared fingers, change counting and score history. Pure (storage helpers aside). */

export interface Anchor {
  /** Tab string (1 = high e). */
  string: number;
  fret: number;
  finger: number;
}

export interface Guide {
  string: number;
  finger: number;
  from: number;
  to: number;
}

const fingerAt = (v: ChordVoicing, i: number) => (v.frets[i] > 0 ? v.fingers[i] || 0 : 0);

/**
 * Fingers that stay put between two voicings (anchors: same finger, same string, same fret) and
 * fingers that only slide along their string (guides: same finger, same string, other fret).
 */
export function sharedFingers(a: ChordVoicing, b: ChordVoicing): { anchors: Anchor[]; guides: Guide[] } {
  const anchors: Anchor[] = [];
  const guides: Guide[] = [];
  for (let i = 0; i < 6; i++) {
    const fa = fingerAt(a, i);
    const fb = fingerAt(b, i);
    if (!fa || fa !== fb) continue;
    const string = 6 - i;
    if (a.frets[i] === b.frets[i]) anchors.push({ string, fret: a.frets[i], finger: fa });
    else guides.push({ string, finger: fa, from: a.frets[i], to: b.frets[i] });
  }
  return { anchors, guides };
}

/** Turkish description of what to keep, e.g. "2. parmak 4. telde 2. perdede kalır". */
export function sharedText(s: { anchors: Anchor[]; guides: Guide[] }): string[] {
  return [
    ...s.anchors.map((a) => `${a.finger}. parmak ${a.string}. telde ${a.fret}. perdede kalır`),
    ...s.guides.map((g) => `${g.finger}. parmak ${g.string}. telde kayar (${g.from} → ${g.to})`),
  ];
}

/**
 * Strums from the microphone → completed chord changes. Onsets closer than `minGap` seconds to the
 * last counted one belong to the same strum (or the same chord); every further strum is a change.
 */
export function countChanges(onsets: number[], minGap = 0.6): number {
  let last = -Infinity;
  let strums = 0;
  for (const t of [...onsets].sort((x, y) => x - y)) {
    if (t - last < minGap) continue;
    last = t;
    strums++;
  }
  return Math.max(0, strums - 1);
}

/** Incremental version for live counting: returns whether this onset counts as a new strum. */
export function acceptStrum(lastAccepted: number, t: number, minGap = 0.6): boolean {
  return t - lastAccepted >= minGap;
}

export const pairKey = (a: string, b: string) => [a, b].sort().join('|');

export interface TrainerResult {
  pair: string;
  changes: number;
  seconds: number;
  date: string;
}

/** Changes scaled to a full minute (rounds shorter than 60 s compare fairly). */
export const perMinute = (r: Pick<TrainerResult, 'changes' | 'seconds'>) => (r.seconds > 0 ? Math.round((r.changes * 60) / r.seconds) : 0);

export function bestFor(history: TrainerResult[], pair: string): TrainerResult | null {
  return history.filter((h) => h.pair === pair).reduce<TrainerResult | null>((b, h) => (!b || perMinute(h) > perMinute(b) ? h : b), null);
}

/** Best result per pair, best first. */
export function leaderboard(history: TrainerResult[]): TrainerResult[] {
  const pairs = [...new Set(history.map((h) => h.pair))];
  return pairs.map((p) => bestFor(history, p)!).sort((a, b) => perMinute(b) - perMinute(a));
}

export const SUGGESTED_PAIRS: [string, string][] = [
  ['C', 'G'], ['G', 'D'], ['Am', 'E'], ['Em', 'C'], ['D', 'A'], ['Am', 'Dm'], ['C', 'F'], ['G', 'Em'],
];

const KEY = 'guitar3d.chordtrainer.v1';
const MAX = 200;

export function loadHistory(): TrainerResult[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function addResult(r: TrainerResult): TrainerResult[] {
  const all = [...loadHistory(), r].slice(-MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return all;
}
