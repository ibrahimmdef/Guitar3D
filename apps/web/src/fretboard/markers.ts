/**
 * Pure helpers behind the note markers drawn on the 3D fretboard (no three.js):
 * which notes are shown as current / upcoming, how upcoming beats fade with their
 * distance in time, the pop and ghost animations and the screen-constant marker size.
 */
import type { FretNote } from '@guitar3d/shared';

/** How many upcoming beats are drawn at most. */
export const MAX_UPCOMING_BEATS = 3;

export interface UpcomingMarker {
  note: FretNote;
  /** 0 = the next beat, 1 = the beat after it, … */
  rank: number;
  key: string;
}

/** Position key of a note: muted notes share one key per string. */
export function noteKey(n: Pick<FretNote, 'string' | 'fret' | 'muted'>) {
  return `${n.string}:${n.muted ? 'x' : Math.max(0, n.fret)}`;
}

const valid = (n: FretNote) => n.string >= 1 && n.string <= 6;

/** Notes of the current beat (state 'now'), one per position. */
export function currentNotes(notes: FretNote[]): FretNote[] {
  const seen = new Set<string>();
  return notes.filter((n) => {
    if (n.state !== 'now' || !valid(n)) return false;
    const k = noteKey(n);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Upcoming markers, nearest beat first. `upcoming` lists the beats after the current one; without it
 * the notes with state 'next' form the only upcoming beat. A position that is already shown (as a
 * current note or by a nearer beat) is not repeated.
 */
export function upcomingMarkers(notes: FretNote[], upcoming?: FretNote[][], maxBeats = MAX_UPCOMING_BEATS): UpcomingMarker[] {
  const beats = upcoming && upcoming.length ? upcoming.slice(0, maxBeats) : [notes.filter((n) => n.state === 'next')];
  const taken = new Set(currentNotes(notes).map(noteKey));
  const out: UpcomingMarker[] = [];
  beats.forEach((beat, rank) => {
    const here: string[] = [];
    for (const n of beat) {
      if (!valid(n)) continue;
      const key = noteKey(n);
      if (taken.has(key) || here.includes(key)) continue;
      here.push(key);
      out.push({ note: n, rank, key });
    }
    here.forEach((k) => taken.add(k));
  });
  return out;
}

/**
 * Look of an upcoming marker `rank` beats after the next one while the current beat is `progress`
 * (0..1) done. The distance in time d = rank + 1 - progress (beats) is continuous across beat changes:
 * when a beat starts, rank 1 becomes rank 0 at the same d, so markers never jump.
 */
export function upcomingFade(rank: number, progress: number) {
  const p = Math.min(1, Math.max(0, progress || 0));
  const d = Math.max(0, rank + 1 - p);
  const opacity = Math.min(1, Math.max(0.1, 0.92 * Math.exp(-0.78 * (d - 1))));
  const scale = 0.66 + 0.34 * Math.exp(-0.6 * d);
  return { d, opacity, scale, arc: rank === 0 };
}

export interface MoveGuide {
  string: number;
  fromFret: number;
  toFret: number;
}

/** Same-string moves from the current notes to the next beat (only where the fret changes). */
export function moveGuides(current: FretNote[], next: UpcomingMarker[]): MoveGuide[] {
  const out: MoveGuide[] = [];
  for (const c of current) {
    if (c.muted) continue;
    const n = next.find((u) => u.rank === 0 && !u.note.muted && u.note.string === c.string);
    if (n && n.note.fret !== c.fret) out.push({ string: c.string, fromFret: c.fret, toFret: n.note.fret });
  }
  return out;
}

/** Label of a marker: the finger (T = thumb) when the tab gives one, else the fret. */
export function markerLabel(n: FretNote) {
  if (n.finger !== undefined && n.finger !== null) return n.finger === 0 ? 'T' : String(n.finger);
  return String(Math.max(0, n.fret));
}

/** Size in world units of something that should look `px` pixels tall at `distance`, clamped. */
export function screenConstantSize(distance: number, viewportHeightPx: number, fovDeg: number, px: number, min: number, max: number) {
  const perPx = (2 * distance * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, viewportHeightPx);
  return Math.min(max, Math.max(min, px * perPx));
}

/** Marker disc diameter (cm): ~30 px on screen, never smaller than 0.9 cm nor larger than 2 cm. */
export function markerDiameter(distance: number, viewportHeightPx: number, fovDeg: number) {
  return screenConstantSize(distance, viewportHeightPx, fovDeg, 30, 0.9, 2.0);
}

export const POP_TIME = 0.24;

/** Scale of a marker `t` seconds after its note started: a short ease-out-back pop from 0.7 to 1. */
export function popScale(t: number) {
  if (t <= 0) return 0.7;
  if (t >= POP_TIME) return 1;
  const u = t / POP_TIME - 1;
  const c1 = 1.70158;
  return 0.7 + 0.3 * (1 + (c1 + 1) * u * u * u + c1 * u * u);
}

/** 0..1 phase of the expanding ring drawn when a note starts (1 = finished). */
export function popRing(t: number) {
  return Math.min(1, Math.max(0, t / 0.45));
}

export const GHOST_TIME = 0.6;

/** Opacity of the ghost of the previous beat's note `t` seconds after it ended. */
export function ghostOpacity(t: number) {
  if (t >= GHOST_TIME) return 0;
  const k = 1 - Math.max(0, t) / GHOST_TIME;
  return 0.5 * k * k;
}
