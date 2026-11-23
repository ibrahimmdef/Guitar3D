import { median } from './scorePass';

/**
 * Latency calibration: the player plays (or taps the guitar) along with a few clicks. What the
 * recording hears is late by output latency (speaker) + input latency (mic) + the player's own
 * reaction to what they hear, which is exactly the offset to remove before judging timing.
 */
export const CAL_BPM = 90;
export const CAL_COUNT_IN = 4;
export const CAL_CLICKS = 8;
/** Clicks counted as valid when within this distance of a heard attack (ms). */
const MATCH_MS = 300;

/** Click times (ms from the start) of the count-in and the clicks to play along with. */
export function calibrationClicks(bpm = CAL_BPM, countIn = CAL_COUNT_IN, clicks = CAL_CLICKS, leadMs = 400): { countIn: number[]; play: number[] } {
  const beat = 60000 / bpm;
  const all = Array.from({ length: countIn + clicks }, (_, i) => leadMs + i * beat);
  return { countIn: all.slice(0, countIn), play: all.slice(countIn) };
}

export interface CalibrationResult {
  latencyMs: number;
  /** Clicks with a matching attack. */
  matched: number;
  /** Median absolute deviation from the latency (ms): how steady the taps were. */
  spreadMs: number;
  ok: boolean;
}

/**
 * Latency from heard attacks against the clicks: each click takes the nearest attack after the
 * previous click's half-way point; the median offset is the latency. Needs at least 5 of 8
 * clicks and steady taps (spread ≤ 40 ms) to be trusted.
 */
export function latencyFromTaps(clicks: number[], attacks: number[], minMatched = 5): CalibrationResult {
  const sorted = [...attacks].sort((a, b) => a - b);
  const offsets: number[] = [];
  const beat = clicks.length > 1 ? clicks[1] - clicks[0] : 600;
  for (const c of clicks) {
    // a player hears the click late, so look mostly after it
    const cand = sorted.filter((a) => a >= c - beat * 0.3 && a <= c + Math.min(MATCH_MS, beat * 0.7));
    if (!cand.length) continue;
    const near = cand.reduce((x, y) => (Math.abs(y - c) < Math.abs(x - c) ? y : x));
    offsets.push(near - c);
  }
  const lat = median(offsets) ?? 0;
  const spread = median(offsets.map((o) => Math.abs(o - lat))) ?? 0;
  return { latencyMs: Math.round(lat), matched: offsets.length, spreadMs: Math.round(spread), ok: offsets.length >= minMatched && spread <= 40 };
}
