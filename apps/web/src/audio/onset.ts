/**
 * Onset (attack) detection on an RMS envelope and timing scores. Pure, so it is testable in Node:
 * the Web Audio side (useMicOnsets) only feeds frame levels in.
 */

export interface OnsetOptions {
  /** Absolute level below which nothing counts (room noise). */
  minLevel?: number;
  /** The frame must be this many times louder than the recent average. */
  ratio?: number;
  /** Seconds after an onset during which no new one is reported (strings ringing out). */
  refractory?: number;
  /** Smoothing of the background level, 0..1 (higher = slower). */
  decay?: number;
}

export interface OnsetState {
  background: number;
  lastOnset: number;
  prev: number;
}

export const initialOnset = (): OnsetState => ({ background: 0, lastOnset: -Infinity, prev: 0 });

/**
 * Feeds one frame level (RMS) at time `t` seconds. Returns the new state and whether this frame is
 * an onset: a sharp rise over the background level, not too soon after the last onset.
 */
export function onsetStep(st: OnsetState, level: number, t: number, opts: OnsetOptions = {}): { state: OnsetState; onset: boolean } {
  const { minLevel = 0.02, ratio = 1.8, refractory = 0.09, decay = 0.85 } = opts;
  const rising = level > st.prev * 1.15;
  const onset = level >= minLevel && rising && level > st.background * ratio && t - st.lastOnset >= refractory;
  const background = st.background * decay + level * (1 - decay);
  return { state: { background, lastOnset: onset ? t : st.lastOnset, prev: level }, onset };
}

/** Onset times (seconds) in a series of frame levels taken every `frameSec` seconds. */
export function detectOnsets(levels: number[], frameSec: number, opts: OnsetOptions = {}): number[] {
  let st = initialOnset();
  const out: number[] = [];
  levels.forEach((lv, i) => {
    const r = onsetStep(st, lv, i * frameSec, opts);
    st = r.state;
    if (r.onset) out.push(i * frameSec);
  });
  return out;
}

export interface TimingHit {
  /** Index into the expected times. */
  index: number;
  /** Played minus expected, in ms: negative = early, positive = late. */
  offsetMs: number;
}

/** Closest expected time to an onset, within `windowMs`; null when nothing is near. */
export function nearestExpected(expected: number[], onset: number, windowMs = 160): TimingHit | null {
  let best = -1;
  let bestD = Infinity;
  expected.forEach((t, i) => {
    const d = Math.abs(onset - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best < 0 || bestD * 1000 > windowMs) return null;
  return { index: best, offsetMs: Math.round((onset - expected[best]) * 1000) };
}

/**
 * Matches played onsets to expected stroke times (both in seconds). Each expected stroke takes at
 * most one onset (the closest); onsets matching nothing are extras.
 */
export function matchOnsets(expected: number[], onsets: number[], windowMs = 160): { hits: TimingHit[]; missed: number[]; extra: number } {
  const taken = new Map<number, TimingHit>();
  let extra = 0;
  for (const o of onsets) {
    const h = nearestExpected(expected, o, windowMs);
    if (!h) {
      extra++;
      continue;
    }
    const cur = taken.get(h.index);
    if (!cur || Math.abs(h.offsetMs) < Math.abs(cur.offsetMs)) {
      if (cur) extra++;
      taken.set(h.index, h);
    } else extra++;
  }
  const hits = [...taken.values()].sort((a, b) => a.index - b.index);
  const missed = expected.map((_, i) => i).filter((i) => !taken.has(i));
  return { hits, missed, extra };
}

export type TimingVerdict = 'early' | 'late' | 'ok';

/** "On time" is within ±`toleranceMs`. */
export function verdict(offsetMs: number, toleranceMs = 40): TimingVerdict {
  if (offsetMs < -toleranceMs) return 'early';
  if (offsetMs > toleranceMs) return 'late';
  return 'ok';
}

export interface TimingSummary {
  hits: number;
  onTime: number;
  early: number;
  late: number;
  missed: number;
  /** Mean signed offset (ms): the overall tendency to rush (<0) or drag (>0). */
  meanOffsetMs: number;
  /** Mean absolute offset (ms). */
  meanAbsMs: number;
  /** 0..100. */
  score: number;
}

export function summarizeTiming(hits: TimingHit[], expectedCount: number, toleranceMs = 40): TimingSummary {
  const v = hits.map((h) => verdict(h.offsetMs, toleranceMs));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const onTime = v.filter((x) => x === 'ok').length;
  const missed = Math.max(0, expectedCount - hits.length);
  const meanAbs = mean(hits.map((h) => Math.abs(h.offsetMs)));
  // on-time strokes count fully, the others by how close they were
  const credit = hits.reduce((s, h) => s + Math.max(0, 1 - Math.max(0, Math.abs(h.offsetMs) - toleranceMs) / 120), 0);
  return {
    hits: hits.length,
    onTime,
    early: v.filter((x) => x === 'early').length,
    late: v.filter((x) => x === 'late').length,
    missed,
    meanOffsetMs: Math.round(mean(hits.map((h) => h.offsetMs))),
    meanAbsMs: Math.round(meanAbs),
    score: expectedCount ? Math.round((100 * credit) / expectedCount) : 0,
  };
}

/** "18 ms erken" / "zamanında" / "25 ms geç". */
export function offsetLabel(offsetMs: number, toleranceMs = 40): string {
  const v = verdict(offsetMs, toleranceMs);
  if (v === 'ok') return 'zamanında';
  return `${Math.abs(offsetMs)} ms ${v === 'early' ? 'erken' : 'geç'}`;
}
