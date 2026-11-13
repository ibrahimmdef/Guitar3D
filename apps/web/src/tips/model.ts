import type { model } from '@coderline/alphatab';

/** Tab-style string numbering: 1 = high e, 6 = low E. */
export interface SimpleNote {
  string: number;
  fret: number;
  /** Origin of a hammer-on or pull-off (the next note on this string is not picked). */
  hammer: boolean;
  slide: boolean;
  bend: boolean;
  palmMute: boolean;
  tied: boolean;
  /** The legato goes down (pull-off). When missing, the analysis compares with the next note on the string. */
  pull?: boolean;
  /** Natural or artificial harmonic. */
  harmonic?: boolean;
  /** Dead (muted, "x") note. */
  dead?: boolean;
  ghost?: boolean;
  letRing?: boolean;
}

export interface SimpleBeat {
  /** Length in quarter notes (1 = quarter, 0.5 = eighth); tuplets and dots included, grace beats are 0. */
  quarters: number;
  notes: SimpleNote[];
  /** Tuplet numerator (3 for triplets), when the beat is part of one. */
  tuplet?: number;
  grace?: boolean;
}

export interface SimpleBar {
  index: number;
  /** Tempo in quarter notes per minute that applies to this bar. */
  tempo: number;
  beats: SimpleBeat[];
}

export function beatQuarters(duration: number, dots: number, tupletNum = 0, tupletDen = 0): number {
  let q = 4 / duration;
  let add = q / 2;
  for (let i = 0; i < dots; i++) {
    q += add;
    add /= 2;
  }
  if (tupletNum > 0 && tupletDen > 0) q = (q * tupletDen) / tupletNum;
  return q;
}

export function toTabString(alphaTabString: number, stringCount: number): number {
  return stringCount + 1 - alphaTabString;
}

export function toSimpleNote(n: model.Note, stringCount: number): SimpleNote {
  const dest = n.isHammerPullOrigin ? n.hammerPullDestination : null;
  return {
    string: toTabString(n.string, stringCount),
    fret: n.fret,
    hammer: n.isHammerPullOrigin,
    pull: dest ? dest.fret < n.fret : false,
    slide: n.slideOutType !== 0 || n.slideInType !== 0,
    bend: n.hasBend,
    palmMute: n.isPalmMute,
    tied: n.isTieDestination,
    harmonic: n.harmonicType !== 0,
    dead: n.isDead,
    ghost: n.isGhost,
    letRing: n.isLetRing,
  };
}

/** Tempo change that starts with this bar, if any (later in-bar changes are ignored). */
function barTempo(masterBar: model.MasterBar): number | null {
  const list = masterBar.tempoAutomations;
  if (!list || list.length === 0) return null;
  const first = list.reduce((a, b) => (b.ratioPosition < a.ratioPosition ? b : a));
  return first.value > 0 ? first.value : null;
}

export function toSimpleBars(track: model.Track, scoreTempo: number): SimpleBar[] {
  const staff = track.staves[0];
  const stringCount = staff.tuning.length || 6;
  let tempo = scoreTempo > 0 ? scoreTempo : 120;
  return staff.bars.map((bar) => {
    tempo = barTempo(bar.masterBar) ?? tempo;
    const voice = bar.voices[0];
    return {
      index: bar.index,
      tempo,
      beats: voice.beats
        .filter((b) => !b.isEmpty)
        .map((b) => {
          const grace = b.graceType !== 0;
          const beat: SimpleBeat = {
            quarters: grace ? 0 : beatQuarters(b.duration, b.dots, b.tupletNumerator, b.tupletDenominator),
            notes: b.isRest ? [] : b.notes.filter((n) => !n.isPercussion).map((n) => toSimpleNote(n, stringCount)),
          };
          if (b.tupletNumerator > 1) beat.tuplet = b.tupletNumerator;
          if (grace) beat.grace = true;
          return beat;
        }),
    };
  });
}
