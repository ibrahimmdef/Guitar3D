import type { model } from '@coderline/alphatab';

/** Tab-style string numbering: 1 = high e, 6 = low E. */
export interface SimpleNote {
  string: number;
  fret: number;
  hammer: boolean;
  slide: boolean;
  bend: boolean;
  palmMute: boolean;
  tied: boolean;
}

export interface SimpleBeat {
  /** Length in quarter notes (1 = quarter, 0.5 = eighth). */
  quarters: number;
  notes: SimpleNote[];
}

export interface SimpleBar {
  index: number;
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
  return {
    string: toTabString(n.string, stringCount),
    fret: n.fret,
    hammer: n.isHammerPullOrigin,
    slide: n.slideOutType !== 0,
    bend: n.hasBend,
    palmMute: n.isPalmMute,
    tied: n.isTieDestination,
  };
}

export function toSimpleBars(track: model.Track, scoreTempo: number): SimpleBar[] {
  const staff = track.staves[0];
  const stringCount = staff.tuning.length || 6;
  let tempo = scoreTempo;
  return staff.bars.map((bar) => {
    const auto = bar.masterBar.tempoAutomation;
    if (auto) tempo = auto.value;
    const voice = bar.voices[0];
    return {
      index: bar.index,
      tempo,
      beats: voice.beats
        .filter((b) => !b.isEmpty)
        .map((b) => ({
          quarters: beatQuarters(b.duration, b.dots, b.tupletNumerator, b.tupletDenominator),
          notes: b.isRest ? [] : b.notes.filter((n) => !n.isPercussion).map((n) => toSimpleNote(n, stringCount)),
        })),
    };
  });
}
