import type { Onset } from './onsets';

/** One note (or strum) the player should play in a pass, with its time in the recording. */
export interface ExpectedNote {
  /** 0-based bar index. */
  bar: number;
  /** Index of the beat in the bar's first voice (to mark it in the tab). */
  beat: number;
  /** Metric beat within the bar, 0-based (by the time signature's denominator). */
  beatInBar: number;
  /** When it should sound, in ms from the start of the recording. */
  ms: number;
  /** Sounding MIDI pitches (dead notes left out). */
  midi: number[];
  /** Tab positions (1 = high e), for the 3D fretboard. */
  frets: { string: number; fret: number }[];
  /** Strummed: only the timing of the strum is judged, not the pitch. */
  strum: boolean;
  /** Sounded by a hammer-on / pull-off / slide (no pick attack). */
  legato?: boolean;
  /** The hand lands here after a position shift of this many frets. */
  shift?: number;
}

export type Outcome = 'clean' | 'early' | 'late' | 'wrong' | 'missed';

export interface NoteScore {
  note: ExpectedNote;
  outcome: Outcome;
  /** Heard minus expected, latency removed (ms); null when nothing was heard. */
  deltaMs: number | null;
  heardMidi: number | null;
}

export interface PassScore {
  /** Clean notes over all notes, 0..100. */
  score: number;
  notes: NoteScore[];
  counts: Record<Outcome, number>;
  /** Attacks that matched no note (stray noise, extra notes). */
  extra: number;
  /** Median timing of the matched notes (ms, + = behind the beat). */
  medianDeltaMs: number | null;
}

export interface ScoreOptions {
  /** A note within this many ms of its time is on time. */
  toleranceMs?: number;
  /** Measured input + output latency: subtracted from every heard time. */
  latencyMs?: number;
  /** Pitch tolerance in semitones. */
  pitchTolerance?: number;
  /** How far from its time a note is still looked for (ms, also capped at half the gap to its neighbours). */
  searchMs?: number;
}

export const DEFAULT_TOLERANCE_MS = 60;

function pitchMatches(heard: number, targets: number[], tol: number): boolean {
  // octave slips are a detector weakness more often than a player's mistake
  return targets.some((t) => [0, 12, -12].some((o) => Math.abs(heard - (t + o)) <= tol));
}

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Matches heard onsets to the expected notes of one pass. Each note looks for an attack inside
 * its own window (half way to its neighbours, at most `searchMs`): the closest one with the right
 * pitch wins (strums: the closest one). Within `toleranceMs` it is clean, otherwise early / late;
 * an attack with a wrong pitch is "wrong", no attack at all is "missed".
 */
export function scorePass(expected: ExpectedNote[], onsets: Onset[], opts: ScoreOptions = {}): PassScore {
  const { toleranceMs = DEFAULT_TOLERANCE_MS, latencyMs = 0, pitchTolerance = 0.5, searchMs = 250 } = opts;
  const notes = [...expected].sort((a, b) => a.ms - b.ms);
  const heard = onsets.map((o) => ({ ...o, t: o.ms - latencyMs })).sort((a, b) => a.t - b.t);
  const used = new Set<number>();
  const results: NoteScore[] = notes.map((n, i) => {
    const before = i > 0 ? (n.ms - notes[i - 1].ms) / 2 : searchMs;
    const after = i + 1 < notes.length ? (notes[i + 1].ms - n.ms) / 2 : searchMs;
    const lo = n.ms - Math.min(searchMs, Math.max(before, 1));
    const hi = n.ms + Math.min(searchMs, Math.max(after, 1));
    let best = -1;
    let bestRight = false;
    heard.forEach((h, k) => {
      if (used.has(k) || h.t < lo || h.t >= hi) return;
      const right = n.strum || n.midi.length === 0 || h.midi == null || pitchMatches(h.midi, n.midi, pitchTolerance);
      const closer = best < 0 || Math.abs(h.t - n.ms) < Math.abs(heard[best].t - n.ms);
      if ((right && !bestRight) || (right === bestRight && closer)) {
        best = k;
        bestRight = right;
      }
    });
    if (best < 0) return { note: n, outcome: 'missed', deltaMs: null, heardMidi: null };
    used.add(best);
    const h = heard[best];
    const deltaMs = Math.round(h.t - n.ms);
    const outcome: Outcome = !bestRight ? 'wrong' : Math.abs(deltaMs) <= toleranceMs ? 'clean' : deltaMs < 0 ? 'early' : 'late';
    return { note: n, outcome, deltaMs, heardMidi: h.midi };
  });
  const counts: Record<Outcome, number> = { clean: 0, early: 0, late: 0, wrong: 0, missed: 0 };
  for (const r of results) counts[r.outcome]++;
  const first = notes[0]?.ms ?? 0;
  const last = notes[notes.length - 1]?.ms ?? 0;
  // only attacks inside the pass count as extra (the next pass may already have begun)
  const extra = heard.filter((h, k) => !used.has(k) && !h.legato && h.t > first - 100 && h.t < last + 100).length;
  return {
    score: results.length ? Math.round((counts.clean / results.length) * 100) : 0,
    notes: results,
    counts,
    extra,
    medianDeltaMs: median(results.flatMap((r) => (r.deltaMs != null && r.outcome !== 'wrong' ? [r.deltaMs] : []))),
  };
}

/* ---------- What to tell the player ---------- */

export interface Tendency {
  kind: 'overall' | 'beat' | 'shift' | 'bar';
  text: string;
  bar?: number;
}

const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const ms = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))} ms`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Specific, honest feedback from one scored pass: an overall lean ahead of / behind the beat,
 * a beat of the bar that is consistently rushed or dragged, trouble on the landing of a position
 * shift (from the tips engine), and the bars with the most mistakes.
 */
export function tendencies(p: PassScore, opts: { toleranceMs?: number } = {}): Tendency[] {
  const tol = opts.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const out: Tendency[] = [];
  const timed = p.notes.filter((r) => r.deltaMs != null && r.outcome !== 'wrong');
  const overall = timed.length >= 4 ? median(timed.map((r) => r.deltaMs!)) ?? 0 : 0;

  // position shifts: the landing note is late, wrong or missing
  const shifts = p.notes.filter((r) => (r.note.shift ?? 0) >= 2 && r.outcome !== 'clean' && r.outcome !== 'early');
  shifts.sort((a, b) => (b.deltaMs ?? 1e9) - (a.deltaMs ?? 1e9));
  const sh = shifts[0];
  if (sh) {
    const what = sh.outcome === 'late' ? `Late on the position shift in bar ${sh.note.bar + 1} (${ms(sh.deltaMs!)})` : sh.outcome === 'wrong' ? `Wrong note after the position shift in bar ${sh.note.bar + 1}` : `Missed the landing of the position shift in bar ${sh.note.bar + 1}`;
    out.push({ kind: 'shift', bar: sh.note.bar, text: `${what}: look at the target fret early and move the hand ${sh.note.shift} frets before the note is due.` });
  }

  // one beat of the bar rushed / dragged compared with the rest
  const byBeat = new Map<number, number[]>();
  for (const r of timed) byBeat.set(r.note.beatInBar, [...(byBeat.get(r.note.beatInBar) ?? []), r.deltaMs!]);
  let worst: { beat: number; dev: number } | null = null;
  for (const [beat, ds] of byBeat) {
    if (ds.length < 2) continue;
    const dev = (median(ds) ?? 0) - overall;
    if (Math.abs(dev) >= tol * 0.6 && (!worst || Math.abs(dev) > Math.abs(worst.dev))) worst = { beat, dev };
  }
  if (worst) out.push({ kind: 'beat', text: worst.dev < 0 ? `You rush beat ${worst.beat + 1} (${ms(worst.dev)} against the rest).` : `You drag beat ${worst.beat + 1} (${ms(worst.dev)} against the rest).` });

  if (Math.abs(overall) >= tol * 0.5) {
    out.push({ kind: 'overall', text: overall < 0 ? `Overall you play ahead of the beat (${ms(overall)}): relax and let the click lead.` : `Overall you play behind the beat (${ms(overall)}): anticipate each note a little.` });
  }

  // bars with the most mistakes
  const bars = new Map<number, Record<Outcome, number>>();
  for (const r of p.notes) {
    if (r.outcome === 'clean') continue;
    const c = bars.get(r.note.bar) ?? { clean: 0, early: 0, late: 0, wrong: 0, missed: 0 };
    c[r.outcome]++;
    bars.set(r.note.bar, c);
  }
  const total = (c: Record<Outcome, number>) => c.early + c.late + c.wrong + c.missed;
  [...bars].sort((a, b) => total(b[1]) - total(a[1]) || a[0] - b[0]).slice(0, 2).forEach(([bar, c]) => {
    const parts = [c.missed && `${c.missed} missed`, c.wrong && plural(c.wrong, 'wrong note'), c.late && `${c.late} late`, c.early && `${c.early} early`].filter(Boolean);
    out.push({ kind: 'bar', bar, text: `Bar ${bar + 1}: ${parts.join(', ')}.` });
  });
  return out;
}

/** "3rd string, 5th fret" style label of a note's first position. */
export const noteWhere = (n: ExpectedNote) => (n.frets[0] ? `${ord(n.frets[0].string)} string, fret ${n.frets[0].fret}` : '');
