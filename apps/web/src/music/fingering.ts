import { chordComfort, reach } from '../tips/analyze';

/**
 * Fingering optimiser: for a sequence of beats (single notes or chords) it picks, for every pitch,
 * a string/fret position and a left-hand finger so the hand moves as little as possible. Dynamic
 * programming (Viterbi) over the candidate positions of each beat; reach and stretch limits follow
 * the tips analysis (tips/analyze: `reach`, `chordComfort`).
 */

export interface Placed {
  /** Tab string, 1 = high e. */
  string: number;
  fret: number;
  /** 1–4, 0 for an open string. */
  finger: number;
}

export interface FingeringOptions {
  maxFret?: number;
  /** Candidates kept per beat (cheapest by their own cost). */
  beam?: number;
}

/** A beat as MIDI pitches, given by the positions written in the tab. */
export type BeatPositions = { string: number; fret: number }[];

const fretted = (ps: { fret: number }[]) => ps.filter((p) => p.fret > 0).map((p) => p.fret);

/** Hand position (fret under the index finger) for a set of positions, or null for open strings only. */
export function handPosition(ps: { fret: number }[]): number | null {
  const f = fretted(ps);
  return f.length ? Math.min(...f) : null;
}

/** Cost of holding one beat's positions: stretches beyond comfort, high frets a little. */
export function shapeCost(ps: { string: number; fret: number }[]): number {
  const f = fretted(ps);
  if (!f.length) return 0;
  const lo = Math.min(...f);
  const span = Math.max(...f) - lo;
  const over = Math.max(0, span - (ps.length > 1 ? chordComfort(lo) : reach(lo)));
  return over * 4 + (span > reach(lo) ? 6 : 0) + lo * 0.04;
}

/** Hand positions (index-finger fret) from which every fretted note is within reach. */
export function feasiblePositions(ps: { fret: number }[], maxFret = 15): number[] {
  const f = fretted(ps);
  const all = Array.from({ length: maxFret }, (_, i) => i + 1);
  if (!f.length) return all;
  const ok = all.filter((p) => f.every((x) => x >= p && x <= p + reach(p)));
  // a stretch wider than the reach: the index finger takes the lowest fret (shapeCost pays for it)
  return ok.length ? ok : [Math.min(...f)];
}

/** Moving the hand: a fixed cost for any shift plus the distance. */
export const shiftCost = (from: number, to: number) => (from === to ? 0 : 1 + Math.abs(to - from) * 0.6);

/** Big string jumps cost the picking hand a little. */
export function stringJumpCost(from: { string: number }[], to: { string: number }[]): number {
  if (!from.length || !to.length) return 0;
  const a = from.reduce((s, x) => s + x.string, 0) / from.length;
  const b = to.reduce((s, x) => s + x.string, 0) / to.length;
  return Math.max(0, Math.abs(a - b) - 1) * 0.15;
}

/** Every way to play these pitches on distinct strings within maxFret. */
export function candidates(midis: number[], tuning: readonly number[], maxFret = 15): BeatPositions[] {
  const out: BeatPositions[] = [];
  const walk = (i: number, used: Set<number>, acc: BeatPositions) => {
    if (out.length > 400) return;
    if (i === midis.length) {
      out.push(acc);
      return;
    }
    tuning.forEach((open, si) => {
      const s = si + 1;
      const f = midis[i] - open;
      if (f < 0 || f > maxFret || used.has(s)) return;
      used.add(s);
      walk(i + 1, used, [...acc, { string: s, fret: f }]);
      used.delete(s);
    });
  };
  walk(0, new Set(), []);
  return out;
}

/** Fingers for a beat at hand position `pos`: one finger per fret from the index finger. */
export function assignFingers(ps: BeatPositions, pos: number | null): Placed[] {
  const p = pos ?? handPosition(ps) ?? 1;
  return ps.map((x) => ({ ...x, finger: x.fret <= 0 ? 0 : Math.max(1, Math.min(4, x.fret - p + 1)) }));
}

export interface FingeringResult {
  beats: Placed[][];
  cost: number;
  /** Cost of the positions as written, for comparison. */
  originalCost: number;
  /** Beats whose positions differ from the tab. */
  changed: number[];
}

const pitches = (b: BeatPositions, tuning: readonly number[]) => b.map((p) => tuning[p.string - 1] + p.fret);

interface Path {
  cost: number;
  /** Chosen option and hand position per beat. */
  steps: { k: number; pos: number }[];
}

/**
 * Viterbi over (option, hand position) states. Open-string-only beats keep the hand where it is;
 * the hand rests slightly cheaper low on the neck.
 */
function viterbi(options: BeatPositions[][], extra: (i: number, k: number) => number, maxFret: number): Path {
  type Cell = { cost: number; prevK: number; prevP: number; strings: BeatPositions };
  const layers: Map<string, Cell>[] = [];
  const keyOf = (k: number, p: number) => `${k}|${p}`;
  options.forEach((opts, i) => {
    const layer = new Map<string, Cell>();
    opts.forEach((o, k) => {
      const own = shapeCost(o) + extra(i, k);
      const positions = feasiblePositions(o, maxFret);
      for (const p of positions) {
        const rest = p * 0.02;
        if (i === 0) {
          layer.set(keyOf(k, p), { cost: own + rest, prevK: -1, prevP: -1, strings: o });
          continue;
        }
        let best: Cell | null = null;
        for (const [pk, pc] of layers[i - 1]) {
          const pp = Number(pk.split('|')[1]);
          const c = pc.cost + own + rest + shiftCost(pp, p) + stringJumpCost(pc.strings, o);
          if (!best || c < best.cost) best = { cost: c, prevK: Number(pk.split('|')[0]), prevP: pp, strings: o.length ? o : pc.strings };
        }
        layer.set(keyOf(k, p), best!);
      }
    });
    layers.push(layer);
  });
  if (!layers.length) return { cost: 0, steps: [] };
  let bestKey = '';
  let bestCost = Infinity;
  for (const [key, c] of layers[layers.length - 1]) if (c.cost < bestCost) [bestKey, bestCost] = [key, c.cost];
  const steps: Path['steps'] = [];
  let [k, p] = bestKey.split('|').map(Number);
  for (let i = layers.length - 1; i >= 0; i--) {
    steps[i] = { k, pos: p };
    const c = layers[i].get(keyOf(k, p))!;
    [k, p] = [c.prevK, c.prevP];
  }
  return { cost: bestCost, steps };
}

/** Total cost of playing the beats as given (with the best hand positions for them). */
export function sequenceCost(beats: BeatPositions[], maxFret = 15): number {
  return viterbi(beats.map((b) => [b]), () => 0, Math.max(maxFret, ...beats.flat().map((p) => p.fret))).cost;
}

/**
 * The easiest positions for `beats` (positions as written in the tab, tab strings) on a guitar
 * tuned `tuning` (MIDI, tab order). Pitches stay the same; strings and frets may change.
 */
export function suggestFingering(beats: BeatPositions[], tuning: readonly number[], opts: FingeringOptions = {}): FingeringResult {
  const { maxFret = 15, beam = 16 } = opts;
  const key = (x: BeatPositions) => x.map((p) => `${p.string}:${p.fret}`).sort().join(',');
  const options = beats.map((b) => {
    if (!b.length) return [b];
    const c = candidates(pitches(b, tuning), tuning, maxFret).sort((x, y) => shapeCost(x) - shapeCost(y)).slice(0, beam);
    // the written position always stays an option
    if (!c.some((x) => key(x) === key(b))) c.push(b);
    return c;
  });
  const top = Math.max(maxFret, ...beats.flat().map((p) => p.fret));
  // ties go to the tab as written
  const path = viterbi(options, (i, k) => (key(options[i][k]) === key(beats[i]) ? 0 : 0.01), top);
  const chosen = path.steps.map((st, i) => options[i][st.k]);
  const same = (a: BeatPositions, b: BeatPositions) => a.length === b.length && a.every((p) => b.some((q) => q.string === p.string && q.fret === p.fret));
  return {
    beats: chosen.map((b, i) => assignFingers(b, path.steps[i].pos)),
    cost: Math.round(path.cost * 100) / 100,
    originalCost: Math.round(sequenceCost(beats, top) * 100) / 100,
    changed: beats.flatMap((b, i) => (same(b, chosen[i]) ? [] : [i])),
  };
}
