import type { model } from '@coderline/alphatab';
import { shiftLandings } from '../tips/analyze';
import { toSimpleBars } from '../tips/model';
import { beatStroke } from '../player/strumScore';
import type { ExpectedNote } from './scorePass';

/** An expected note before it has a time in the recording: its position in score ticks. */
export type PlannedNote = Omit<ExpectedNote, 'ms'> & { tick: number };

/**
 * What the player should play in bars [from, to] of a track: every struck beat (rests, ties and
 * grace notes left out) with its score tick. Beats with three or more strings, a written stroke
 * or only dead notes are strums (judged on timing only). Shift landings come from the tips engine.
 */
export function plannedNotes(track: model.Track, from: number, to: number): PlannedNote[] {
  const staff = track.staves[0];
  if (!staff) return [];
  const strings = staff.tuning.length || 6;
  const score = track.score;
  const shifts = new Map(shiftLandings(toSimpleBars(track, score.tempo)).map((s) => [`${s.bar}:${s.beat}`, s.dist]));
  const out: PlannedNote[] = [];
  for (let bi = Math.max(0, from); bi <= Math.min(to, staff.bars.length - 1); bi++) {
    const bar = staff.bars[bi];
    const mb = score.masterBars[bi];
    const unit = 3840 / (mb.timeSignatureDenominator || 4);
    let simple = 0;
    (bar.voices[0]?.beats ?? []).forEach((b, i) => {
      // toSimpleBars skips empty beats: keep its numbering for the shift lookup
      const k = b.isEmpty ? -1 : simple++;
      if (b.isRest || b.graceType !== 0) return;
      const struck = b.notes.filter((n) => !n.isPercussion && !n.isTieDestination);
      if (!struck.length) return;
      const live = struck.filter((n) => !n.isDead);
      const legato = live.length > 0 && live.every((n) => n.isHammerPullDestination || n.slideOrigin != null);
      const shift = shifts.get(`${bi}:${k}`);
      out.push({
        bar: bi,
        beat: i,
        beatInBar: Math.max(0, Math.floor(b.playbackStart / unit)),
        tick: mb.start + b.playbackStart,
        midi: [...new Set(live.map((n) => n.realValue))],
        frets: struck.map((n) => ({ string: strings + 1 - n.string, fret: n.fret })),
        strum: live.length >= 3 || live.length === 0 || (beatStroke(b) != null && live.length >= 2),
        ...(legato ? { legato: true } : {}),
        ...(shift ? { shift } : {}),
      });
    });
  }
  return out;
}

/** (performance time, tick) samples taken from the player while a pass runs. */
export interface Anchor {
  perf: number;
  tick: number;
}

/**
 * Time (performance clock, ms) at which a tick sounds, from the anchors seen during the pass: a
 * least-squares line through the anchors near it, so timer jitter of single events averages out.
 */
export function tickToPerf(anchors: Anchor[], tick: number, spanTicks = 3840): number | null {
  if (anchors.length < 2) return null;
  let near = anchors.filter((a) => Math.abs(a.tick - tick) <= spanTicks);
  if (near.length < 4) near = anchors;
  const n = near.length;
  const mt = near.reduce((s, a) => s + a.tick, 0) / n;
  const mp = near.reduce((s, a) => s + a.perf, 0) / n;
  let num = 0;
  let den = 0;
  for (const a of near) {
    num += (a.tick - mt) * (a.perf - mp);
    den += (a.tick - mt) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return mp + slope * (tick - mt);
}
