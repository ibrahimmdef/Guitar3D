/**
 * Strum patterns: the rhythm part of a song as down / up strokes on a sixteenth grid, and the
 * repeating 1- or 2-bar pattern in it. Built by the transcriber from the guitar stem and by the
 * player from Guitar Pro strokes (pick strokes / brushes).
 */

/** D = down, U = up, X = muted "chuck" (percussive strum), - = nothing new on this step. */
export type StrumToken = 'D' | 'U' | 'X' | '-';

/** One 4/4 bar of strums. */
export interface StrumBar {
  /** 16 characters, one per sixteenth: D, U, X or -. */
  s: string;
  /** Accented sixteenths (0..15). */
  a?: number[];
  /** Chord in the first and second half of the bar (null: none detected). */
  c: [string | null, string | null];
}

export interface StrumPattern {
  /** Steps per bar: 8 (eighths, "1 & 2 &") or 16 (sixteenths, "1 e & a"). */
  resolution: StrumResolution;
  bars: 1 | 2;
  /** resolution × bars steps. */
  steps: StrumToken[];
  accents: boolean[];
  /** e.g. "D - D U - U D U". */
  text: string;
  /** First bar of every occurrence. */
  starts: number[];
  /** Share of the strummed bars the pattern covers (0..1). */
  coverage: number;
}

export type StrumResolution = 8 | 16;

export interface StrumAnalysis {
  v: 1;
  tempo: number;
  resolution: StrumResolution;
  /** Every bar of the tab (bars without strums are all "-"). */
  bars: StrumBar[];
  /** The most common pattern (same as `patterns[0]`). */
  pattern: StrumPattern | null;
  /** The main pattern and the patterns of the remaining bars (sections), most covering first. */
  patterns?: StrumPattern[];
  /** How directions were decided: beat position only, beat position refined by the attack (low vs high strings first), or written in the score. */
  method: 'grid' | 'grid+spectral' | 'score';
  /** Strums found (chucks included). */
  strums: number;
  /** Start time (s) of every bar in the source audio plus the end of the last bar (song sync). */
  barTimes?: number[];
}

export const SLOTS = 16;
export const EMPTY_BAR = '-'.repeat(SLOTS);
export const isStrum = (t: string) => t === 'D' || t === 'U' || t === 'X';

/**
 * The "constant motion" rule: the hand moves down on the beat and up between, so with eighths the
 * beat is down and the "&" up; with sixteenths "1" and "&" are down, "e" and "a" up.
 */
export function gridDirection(slot: number, resolution: StrumResolution): 'D' | 'U' {
  const s = ((slot % SLOTS) + SLOTS) % SLOTS;
  return resolution === 16 ? (s % 2 === 0 ? 'D' : 'U') : s % 4 === 0 ? 'D' : 'U';
}

/**
 * Sixteenths feel when strums on "e" / "a" (odd sixteenths) recur: an odd position counts when it
 * is strummed in at least 30% of the strummed bars, and those strums make at least 10% of all.
 * Stray odd onsets (noise, bleed, sloppy timing) keep the eighths feel. `slots` count from the
 * first bar line (bar = slot / 16).
 */
export function chooseResolution(slots: readonly number[]): StrumResolution {
  if (!slots.length) return 8;
  const bars = new Set(slots.map((s) => Math.floor(s / SLOTS))).size;
  const byPos = new Map<number, number>();
  for (const s of slots) if (s % 2 !== 0) byPos.set(s % SLOTS, (byPos.get(s % SLOTS) ?? 0) + 1);
  let real = 0;
  for (const n of byPos.values()) if (n >= 2 && n >= 0.3 * bars) real += n;
  return real >= 2 && real / slots.length >= 0.1 ? 16 : 8;
}

/** The bar's steps at a resolution (eighths keep the even sixteenths). */
export function barSteps(bar: StrumBar, resolution: StrumResolution): StrumToken[] {
  const step = SLOTS / resolution;
  return Array.from({ length: resolution }, (_, i) => (bar.s[i * step] ?? '-') as StrumToken);
}

export function barAccents(bar: StrumBar, resolution: StrumResolution): boolean[] {
  const step = SLOTS / resolution;
  const a = new Set(bar.a ?? []);
  return Array.from({ length: resolution }, (_, i) => a.has(i * step));
}

/** Matching steps over the steps where either side strums (0 when neither does). */
export function stepSimilarity(a: readonly StrumToken[], b: readonly StrumToken[]): number {
  let both = 0;
  let same = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? '-';
    const y = b[i] ?? '-';
    if (x === '-' && y === '-') continue;
    both++;
    if (x === y) same++;
  }
  return both ? same / both : 0;
}

export const patternText = (steps: readonly StrumToken[]) => steps.join(' ');

/** Count syllables for the steps: "1 & 2 & …" or "1 e & a …". */
export function countLabels(resolution: StrumResolution, bars = 1): string[] {
  const beat = resolution === 16 ? ['', 'e', '&', 'a'] : ['', '&'];
  const one = Array.from({ length: 4 }, (_, b) => beat.map((s) => s || String(b + 1))).flat();
  return Array.from({ length: bars }, () => one).flat();
}

/** A bar counts as strummed with two or more strums. */
const strummed = (steps: StrumToken[]) => steps.filter(isStrum).length >= 2;

export interface PatternOptions {
  /** Step similarity from which two bars count as the same pattern (default 0.8). */
  minSimilarity?: number;
}

/**
 * The most common 1- or 2-bar pattern and where it repeats. Every strummed bar (and bar pair) is a
 * candidate; a candidate's score is how many bars its non-overlapping matches cover (each bar must
 * match its counterpart). A 2-bar pattern wins only when it clearly covers more than the best
 * 1-bar one and its halves differ. The returned steps are the per-step majority over all
 * occurrences. Bars in `skip` are left out (used to find further patterns).
 */
export function findPattern(bars: readonly StrumBar[], resolution: StrumResolution, opts: PatternOptions & { skip?: ReadonlySet<number> } = {}): StrumPattern | null {
  const minSim = opts.minSimilarity ?? 0.8;
  const skip = opts.skip ?? new Set<number>();
  const steps = bars.map((b, i) => (skip.has(i) ? (Array(resolution).fill('-') as StrumToken[]) : barSteps(b, resolution)));
  const accents = bars.map((b) => barAccents(b, resolution));
  const strummedCount = steps.filter(strummed).length;
  if (strummedCount < 2) return null;
  const windowAt = (i: number, len: number) => steps.slice(i, i + len).flat();
  const matches = (j: number, seed: number, len: number) => {
    for (let k = 0; k < len; k++) if (!strummed(steps[j + k]) || stepSimilarity(steps[j + k], steps[seed + k]) < minSim) return false;
    return true;
  };

  const best: Record<1 | 2, { starts: number[]; seed: number } | null> = { 1: null, 2: null };
  for (const len of [1, 2] as const) {
    for (let i = 0; i + len <= steps.length; i++) {
      if (!steps.slice(i, i + len).every(strummed)) continue;
      if (len === 2 && stepSimilarity(steps[i], steps[i + 1]) >= minSim) continue;
      const starts: number[] = [];
      for (let j = 0; j + len <= steps.length;) {
        if (matches(j, i, len)) {
          starts.push(j);
          j += len;
        } else j++;
      }
      const cur = best[len];
      if (starts.length >= 2 && (!cur || starts.length > cur.starts.length)) best[len] = { starts, seed: i };
    }
  }
  const cover = (len: 1 | 2) => (best[len]?.starts.length ?? 0) * len;
  const len: 1 | 2 | null = best[2] && cover(2) > cover(1) * 1.25 ? 2 : best[1] ? 1 : null;
  if (!len) return null;
  const { starts, seed } = best[len]!;

  // per-step majority over the occurrences (ties keep the seed's step)
  const seedSteps = windowAt(seed, len);
  const out: StrumToken[] = seedSteps.map((s, k) => {
    const votes = new Map<StrumToken, number>();
    for (const st of starts) {
      const t = windowAt(st, len)[k];
      votes.set(t, (votes.get(t) ?? 0) + 1);
    }
    let pick = s;
    for (const [t, n] of votes) if (n > (votes.get(pick) ?? 0)) pick = t;
    return pick;
  });
  const acc = out.map((t, k) => t !== '-' && starts.filter((st) => accents.slice(st, st + len).flat()[k]).length * 2 > starts.length);
  return {
    resolution,
    bars: len,
    steps: out,
    accents: acc,
    text: patternText(out),
    starts,
    coverage: Math.min(1, (starts.length * len) / strummedCount),
  };
}

/** The main pattern, then patterns of the bars it leaves (e.g. verse and chorus), at most `max`. */
export function findPatterns(bars: readonly StrumBar[], resolution: StrumResolution, max = 3): StrumPattern[] {
  const out: StrumPattern[] = [];
  const skip = new Set<number>();
  const total = bars.filter((b) => barSteps(b, resolution).filter(isStrum).length >= 2).length;
  while (out.length < max) {
    const p = findPattern(bars, resolution, { skip });
    if (!p) break;
    // coverage relative to all strummed bars, not just the ones left
    out.push({ ...p, coverage: total ? Math.min(1, (p.starts.length * p.bars) / total) : 0 });
    for (const s of p.starts) for (let k = 0; k < p.bars; k++) skip.add(s + k);
  }
  return out;
}

/** The pattern whose occurrence contains `bar`, else the main one. */
export function patternForBar(analysis: Pick<StrumAnalysis, 'pattern' | 'patterns'>, bar: number): StrumPattern | null {
  for (const p of analysis.patterns ?? []) if (patternBarOffset(p, bar) != null) return p;
  return analysis.pattern;
}

/** Puts the parts together: resolution from the strum positions, then the pattern. */
export function buildStrumAnalysis(input: { bars: StrumBar[]; tempo: number; method: StrumAnalysis['method']; barTimes?: number[]; resolution?: StrumResolution }): StrumAnalysis {
  const slots = input.bars.flatMap((b, bi) => [...b.s].flatMap((c, i) => (isStrum(c) ? [bi * SLOTS + i] : [])));
  const resolution = input.resolution ?? chooseResolution(slots);
  const patterns = findPatterns(input.bars, resolution);
  return {
    v: 1,
    tempo: input.tempo,
    resolution,
    bars: input.bars,
    pattern: patterns[0] ?? null,
    patterns,
    method: input.method,
    strums: slots.length,
    ...(input.barTimes ? { barTimes: input.barTimes } : {}),
  };
}

/** Writes a 16-slot bar string from slot → token. */
export function barString(tokens: ReadonlyMap<number, StrumToken> | readonly (readonly [number, StrumToken])[]): string {
  const arr = Array.from({ length: SLOTS }, () => '-');
  for (const [slot, t] of tokens instanceof Map ? tokens : new Map(tokens as [number, StrumToken][])) if (slot >= 0 && slot < SLOTS) arr[slot] = t;
  return arr.join('');
}

/**
 * Where to look inside the pattern for a bar: the occurrence that contains `bar` (pattern-relative
 * bar 0 or 1), or null outside the occurrences.
 */
export function patternBarOffset(pattern: StrumPattern, bar: number): number | null {
  for (const s of pattern.starts) if (bar >= s && bar < s + pattern.bars) return bar - s;
  return null;
}

/** Chords of a bar as a list without repeats ("G", or "G" "C" for a change at half bar). */
export function barChords(bar: StrumBar): string[] {
  const [a, b] = bar.c;
  return a && b && a !== b ? [a, b] : a || b ? [(a || b)!] : [];
}
