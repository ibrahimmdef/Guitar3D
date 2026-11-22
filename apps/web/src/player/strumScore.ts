import type { model } from '@coderline/alphatab';
import { buildStrumAnalysis, chordName, chooseResolution, EMPTY_BAR, gridDirection, SLOTS, type StrumAnalysis, type StrumBar, type StrumToken } from '@guitar3d/shared';

/** PickStroke / BrushType values in alphaTab's model (1 = up, 2 = down; brushes 3 / 4 are arpeggios up / down). */
const UP = new Set([1, 3]);
const DOWN = new Set([2, 4]);

/** Down / up stroke written on a beat (pick stroke or brush), or null. */
export function beatStroke(beat: Pick<model.Beat, 'pickStroke' | 'brushType'>): 'D' | 'U' | null {
  const p = beat.pickStroke as number;
  const b = beat.brushType as number;
  if (p === 2 || DOWN.has(b)) return 'D';
  if (p === 1 || UP.has(b)) return 'U';
  return null;
}

/** Fewer written strokes than this and the track isn't treated as strummed. */
export const MIN_STROKES = 4;

const isFourFour = (mb: model.MasterBar) => mb.timeSignatureNumerator === 4 && mb.timeSignatureDenominator === 4;

/** Beats that start something (not rests, not only tied notes). */
const sounding = (b: model.Beat) => !b.isRest && b.notes.some((n) => !n.isTieDestination);

/**
 * The strum pattern written in a score (Guitar Pro strokes / brushes): picks the track with the
 * most strokes, puts every sounding beat of its 4/4 bars on the sixteenth grid (written strokes
 * keep their direction, unmarked strums follow the beat rule, all-dead beats are chucks) and finds
 * the repeating pattern. Null when no track has at least `MIN_STROKES` strokes.
 */
export function strumFromScore(score: model.Score): { analysis: StrumAnalysis; trackIndex: number } | null {
  let best: { track: model.Track; strokes: number } | null = null;
  for (const t of score.tracks) {
    if (t.isPercussion) continue;
    let strokes = 0;
    for (const bar of t.staves[0]?.bars ?? []) for (const b of bar.voices[0]?.beats ?? []) if (sounding(b) && beatStroke(b)) strokes++;
    if (strokes >= MIN_STROKES && (!best || strokes > best.strokes)) best = { track: t, strokes };
  }
  if (!best) return null;
  const staff = best.track.staves[0];

  type Hit = { slot: number; stroke: 'D' | 'U' | null; dead: boolean; accent: boolean; pitches: number[]; chord: string | null };
  const perBar: Hit[][] = staff.bars.map((bar) => {
    const mb = score.masterBars[bar.index];
    if (!mb || !isFourFour(mb)) return [];
    const unit = mb.calculateDuration() / SLOTS;
    const hits: Hit[] = [];
    for (const b of bar.voices[0]?.beats ?? []) {
      if (!sounding(b)) continue;
      const slot = Math.round(b.playbackStart / unit);
      if (slot < 0 || slot >= SLOTS) continue;
      const notes = b.notes.filter((n) => !n.isTieDestination);
      hits.push({
        slot,
        stroke: beatStroke(b),
        dead: notes.every((n) => n.isDead),
        accent: notes.some((n) => (n.accentuated as number) > 0),
        pitches: notes.filter((n) => !n.isDead).map((n) => n.realValue),
        chord: b.chord?.name || null,
      });
    }
    return hits;
  });
  // strums only: chords (2+ notes), written strokes or chucks
  const strums = perBar.map((hs) => hs.filter((h) => h.stroke || h.dead || h.pitches.length >= 2));
  const resolution = chooseResolution(strums.flatMap((hs, bi) => hs.map((h) => bi * SLOTS + h.slot)));
  let carry: string | null = null;
  const bars: StrumBar[] = strums.map((hs) => {
    if (!hs.length) return { s: EMPTY_BAR, c: [null, null] };
    const tokens = EMPTY_BAR.split('') as StrumToken[];
    for (const h of hs) tokens[h.slot] = h.dead ? 'X' : (h.stroke ?? gridDirection(h.slot, resolution));
    const c: [string | null, string | null] = [null, null];
    for (const half of [0, 1] as const) {
      const inHalf = hs.filter((h) => (h.slot < SLOTS / 2 ? 0 : 1) === half);
      const name = inHalf.map((h) => h.chord ?? chordName(h.pitches)).find(Boolean) ?? null;
      if (name) carry = name;
      c[half] = name ?? (inHalf.length ? carry : null);
    }
    const a = hs.filter((h) => h.accent).map((h) => h.slot);
    return { s: tokens.join(''), ...(a.length ? { a } : {}), c };
  });
  return { analysis: buildStrumAnalysis({ bars, tempo: score.tempo, method: 'score', resolution }), trackIndex: best.track.index };
}
