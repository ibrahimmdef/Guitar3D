/**
 * "Practice the hardest bars": the run of `minLen`–`maxLen` consecutive bars where the tips
 * engine's difficulty piles up most. A bar only extends the window when it is harder than the
 * piece's average bar, so an easy bar is never added just to make the window longer.
 * Ties go to the shorter, then the earlier window. Empty (all-rest) bars never join a window.
 */
export interface BarDifficulty {
  bar: number;
  /** Raw difficulty score from the tips engine (higher = harder). */
  score: number;
  /** Bar has notes to play. */
  playable?: boolean;
}

export function pickHardestSection(bars: BarDifficulty[], minLen = 2, maxLen = 4): [number, number] | null {
  const list = [...bars].sort((a, b) => a.bar - b.bar);
  if (!list.length) return null;
  const playable = list.filter((b) => b.playable !== false);
  if (!playable.length) return null;
  const typical = playable.reduce((s, b) => s + b.score, 0) / playable.length;
  let best: { from: number; to: number; value: number } | null = null;
  for (let i = 0; i < list.length; i++) {
    let sum = 0;
    for (let len = 1; len <= maxLen && i + len - 1 < list.length; len++) {
      const b = list[i + len - 1];
      if (b.playable === false || (len > 1 && b.bar !== list[i + len - 2].bar + 1)) break;
      sum += b.score - typical;
      if (len < Math.min(minLen, playable.length)) continue;
      const value = sum + 1e-6 * (maxLen - len);
      if (!best || value > best.value + 1e-9) best = { from: list[i].bar, to: b.bar, value };
    }
  }
  if (best) return [best.from, best.to];
  // fewer consecutive playable bars than minLen: the hardest single bar
  const top = playable.reduce((a, b) => (b.score > a.score ? b : a));
  return [top.bar, top.bar];
}
