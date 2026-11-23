import type { model } from '@coderline/alphatab';

/**
 * Timing helpers for playing an auto-transcribed tab along with the song it came from.
 * `barTimes[b]` is where bar b starts in the song (seconds); the last entry ends the last bar.
 */

/** alphaTab sync points: bar b of the tab starts at barTimes[b] of the audio. */
export function syncPointsFor(barTimes: readonly number[], barCount: number): model.FlatSyncPoint[] {
  const n = Math.min(barCount, barTimes.length);
  return Array.from({ length: n }, (_, b) => ({ barIndex: b, barOccurence: 0, barPosition: 0, millisecondOffset: Math.round(barTimes[b] * 1000) }));
}

/** Beat times (s) of the bars: each bar split into `beatsPerBar` equal beats; flags downbeats. */
export function beatTimes(barTimes: readonly number[], beatsPerBar = 4): { t: number; down: boolean }[] {
  const out: { t: number; down: boolean }[] = [];
  for (let b = 0; b + 1 < barTimes.length; b++) {
    const len = (barTimes[b + 1] - barTimes[b]) / beatsPerBar;
    for (let i = 0; i < beatsPerBar; i++) out.push({ t: barTimes[b] + i * len, down: i === 0 });
  }
  return out;
}

/** Index of the first beat at or after `t` (binary search). */
export function firstBeatFrom(beats: readonly { t: number }[], t: number): number {
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
