import type { FretNote, NoteState } from '@guitar3d/shared';

/**
 * Pure helpers over alphaTab's beat graph. They use structural types so tests can build small
 * fake scores; alphaTab's model.Beat / model.Note satisfy them.
 */
export interface NoteLike {
  /** alphaTab string number: 1 = lowest string. */
  string: number;
  fret: number;
  isPercussion: boolean;
  isTieDestination: boolean;
  isDead?: boolean;
  /** Sounding MIDI pitch. */
  readonly realValue?: number;
}

export interface BeatLike {
  isRest: boolean;
  notes: NoteLike[];
  nextBeat: BeatLike | null;
}

export interface BarLike {
  voices: { beats: BeatLike[] }[];
}

/** alphaTab string number (1 = lowest) to tab numbering (1 = highest). */
export const toTabString = (alphaTabString: number, stringCount: number) => stringCount + 1 - alphaTabString;

/** Notes that are struck on this beat: no rests, ties or percussion. */
export function struckNotes(beat: BeatLike): NoteLike[] {
  return beat.isRest ? [] : beat.notes.filter((n) => !n.isPercussion && !n.isTieDestination);
}

export const isSounding = (beat: BeatLike) => struckNotes(beat).length > 0;

/** First beat after `beat` that strikes a note (rests and pure ties skipped). */
export function nextSoundingBeat<B extends BeatLike>(beat: B | null, maxSkip = 64): B | null {
  let b = (beat?.nextBeat ?? null) as B | null;
  for (let i = 0; b && i < maxSkip; i++) {
    if (isSounding(b)) return b;
    b = b.nextBeat as B | null;
  }
  return null;
}

/** Up to `count` sounding beats after `beat`, nearest first. */
export function upcomingBeats<B extends BeatLike>(beat: B | null, count = 3): B[] {
  const out: B[] = [];
  let b = beat;
  while (out.length < count) {
    b = nextSoundingBeat(b);
    if (!b) break;
    out.push(b);
  }
  return out;
}

export function toFretNotes(notes: NoteLike[], stringCount: number, state: NoteState): FretNote[] {
  return notes.map((n) => ({
    string: toTabString(n.string, stringCount),
    fret: n.fret,
    state,
    ...(n.isDead ? { muted: true } : {}),
  }));
}

/** Notes held/sounding on the current beat (ties included so held notes stay lit). */
export function currentFretNotes(beat: BeatLike, stringCount: number): FretNote[] {
  return beat.isRest ? [] : toFretNotes(beat.notes.filter((n) => !n.isPercussion), stringCount, 'now');
}

/** The next `count` sounding beats as FretNote groups for Guitar3D's `upcoming` prop. */
export function upcomingFretNotes(beat: BeatLike, stringCount: number, count = 3): FretNote[][] {
  return upcomingBeats(beat, count).map((b) => toFretNotes(struckNotes(b), stringCount, 'next'));
}

/** Current notes plus the first upcoming beat as 'next' (deduplicated). */
export function beatToNotes(beat: BeatLike, stringCount: number, upcoming = upcomingFretNotes(beat, stringCount, 1)): FretNote[] {
  const now = currentFretNotes(beat, stringCount);
  const next = (upcoming[0] ?? []).filter((n) => !now.some((m) => m.string === n.string && m.fret === n.fret));
  return [...now, ...next];
}

/** Struck notes per bar, e.g. for a density timeline. */
export function barDensity(bars: BarLike[]): number[] {
  return bars.map((bar) => bar.voices.reduce((sum, v) => sum + v.beats.reduce((s, b) => s + struckNotes(b).length, 0), 0));
}

/** Scales counts into 0..1 by the busiest bar. */
export function normalize(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? v / max : 0));
}
