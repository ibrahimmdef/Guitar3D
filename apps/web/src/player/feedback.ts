/**
 * Post-play feedback for listen mode: every judged note gets an outcome, then results are grouped
 * per bar so the hardest bars can be looped.
 */
export type NoteOutcome = 'clean' | 'missed' | 'early' | 'late';

export interface NoteResult {
  /** 0-based bar index. */
  bar: number;
  outcome: NoteOutcome;
}

export interface NoteObservation {
  /** A wrong, stable pitch was heard before the right one. */
  missed: boolean;
  /** The wrong pitch was the next note: the player ran ahead. */
  early: boolean;
  /** How long the cursor waited at this note before it was hit. */
  waitMs: number;
  /** Written length of the note at the song's tempo. */
  beatMs: number;
}

/** A note counts as late when it took longer than twice its length (at least 1.2 s) to arrive. */
export const lateAfterMs = (beatMs: number) => Math.max(1200, 2 * beatMs);

export function classifyNote(o: NoteObservation): NoteOutcome {
  if (o.early) return 'early';
  if (o.missed) return 'missed';
  if (o.waitMs > lateAfterMs(o.beatMs)) return 'late';
  return 'clean';
}

export interface Tally {
  total: number;
  clean: number;
  missed: number;
  early: number;
  late: number;
  /** Clean notes over all notes, 0..100. */
  accuracy: number;
}

export interface BarFeedback extends Tally {
  bar: number;
}

const emptyTally = (): Tally => ({ total: 0, clean: 0, missed: 0, early: 0, late: 0, accuracy: 0 });
const withAccuracy = <T extends Tally>(t: T): T => ({ ...t, accuracy: t.total ? Math.round((t.clean / t.total) * 100) : 0 });

export function aggregateFeedback(results: NoteResult[]): { bars: BarFeedback[]; overall: Tally } {
  const byBar = new Map<number, BarFeedback>();
  const overall = emptyTally();
  for (const r of results) {
    const b = byBar.get(r.bar) ?? { bar: r.bar, ...emptyTally() };
    b.total += 1;
    b[r.outcome] += 1;
    overall.total += 1;
    overall[r.outcome] += 1;
    byBar.set(r.bar, b);
  }
  return { bars: [...byBar.values()].sort((a, b) => a.bar - b.bar).map(withAccuracy), overall: withAccuracy(overall) };
}

/** Bars below `threshold` %, worst first (ties: more notes first, then earlier bar). */
export function worstBars(bars: BarFeedback[], max = 3, threshold = 100): BarFeedback[] {
  return bars
    .filter((b) => b.total > 0 && b.accuracy < threshold)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total || a.bar - b.bar)
    .slice(0, max);
}

/**
 * The loop for "zor ölçüleri döngüye al": the contiguous window of up to `maxLen` bars with the most
 * non-clean notes (ties: the shorter, then earlier window). Null when everything was clean.
 */
export function hardestRange(bars: BarFeedback[], maxLen = 2): [number, number] | null {
  const bad = new Map(bars.map((b) => [b.bar, b.total - b.clean]));
  let best: { from: number; to: number; score: number } | null = null;
  for (const b of bars) {
    for (let len = 1; len <= maxLen; len++) {
      const from = b.bar;
      const to = b.bar + len - 1;
      let score = 0;
      for (let i = from; i <= to; i++) score += bad.get(i) ?? 0;
      if (score > 0 && (!best || score > best.score)) best = { from, to, score };
    }
  }
  if (!best) return null;
  // Trim clean bars from the ends.
  let { from, to } = best;
  while (to > from && !(bad.get(to) ?? 0)) to -= 1;
  while (from < to && !(bad.get(from) ?? 0)) from += 1;
  return [from, to];
}
