/**
 * Pure geometry of a GuitarProfile (no three.js): fret and string positions, heights,
 * outline helpers. Guitar frame and units as in packages/shared/src/guitar.ts:
 * x along the guitar (nut 0, body negative), y across (+ = low E side), z up out of the top, cm.
 */
import type { GuitarProfile, Point2 } from '@guitar3d/shared';

/** Height of the fretboard surface above the body top. */
export const FB_TOP = 0.65;
export const FB_THICK = 0.6;
export const FRET_HEIGHT = 0.11;
/** Saddle crest height above the body top. */
export const SADDLE_TOP = 1.32;
export const NUT_LENGTH = 0.5;
/** Rosette ring texture: soundhole edge as a fraction of the outer radius. */
export const ROSETTE_INNER = 0.78;

/** String gauges (diameter, cm) for a 12–53 acoustic set, tab numbering 1 = high e … 6 = low E. */
export const STRING_GAUGE = [0.030, 0.041, 0.061, 0.081, 0.107, 0.135];
export const STRING_WOUND = [false, false, true, true, true, true];
/** Electric 10–46 set (plain G) and a normal-tension nylon set. */
export const STRING_GAUGE_ELECTRIC = [0.025, 0.033, 0.043, 0.066, 0.091, 0.117];
export const STRING_GAUGE_NYLON = [0.071, 0.082, 0.103, 0.076, 0.089, 0.111];

/** Diameter (cm) and winding of string `s` (1 = high e) for the profile's string set. */
export function stringGauge(p: Pick<GuitarProfile, 'kind' | 'strings'>, s: number) {
  const i = Math.min(5, Math.max(0, s - 1));
  if (p.strings === 'nylon' || (p.kind === 'classical' && p.strings !== 'steel')) return { diameter: STRING_GAUGE_NYLON[i], wound: i >= 3 };
  if (p.kind === 'electric') return { diameter: STRING_GAUGE_ELECTRIC[i], wound: i >= 3 };
  return { diameter: STRING_GAUGE[i], wound: STRING_WOUND[i] };
}

/**
 * Where the neck meets the body: the largest x of the outline near the centre line. Equal to the
 * outline's max x for acoustics; solid bodies with horns reach further towards the headstock.
 */
export function neckJoinX(outline: Point2[]) {
  let best = -Infinity;
  for (const [x, y] of outline) if (Math.abs(y) <= 3.5) best = Math.max(best, x);
  return Number.isFinite(best) ? best : outlineXRange(outline)[1];
}

export function fretX(scale: number, n: number) {
  return -scale * (1 - Math.pow(2, -n / 12));
}

/** Where a fretted note is drawn: between fret n-1 and n, closer to fret n like a real fingertip. */
export function noteX(scale: number, fret: number) {
  if (fret <= 0) return 0.9; // open strings: just behind the nut, over the headstock
  return fretX(scale, fret - 1) * 0.38 + fretX(scale, fret) * 0.62;
}

/** Fractional fret number of a position along the neck (inverse of fretX). */
export function fretAtX(scale: number, x: number) {
  const d = Math.min(0.999, Math.max(0, -x / scale));
  return -12 * Math.log2(1 - d);
}

export function fretboardEndX(p: GuitarProfile) {
  return fretX(p.scaleLengthCm, p.fretCount) - 0.8;
}

/** Fretboard width at x (linear taper nut → last fret). */
export function fretboardWidth(p: GuitarProfile, x: number) {
  const end = fretX(p.scaleLengthCm, p.fretCount);
  const t = Math.min(1.02, Math.max(0, x / end));
  return p.nutWidthCm + (p.endWidthCm - p.nutWidthCm) * t;
}

/** Saddle x for a string (the saddle is slanted: bass strings are compensated further back). */
export function saddleX(p: GuitarProfile, string: number) {
  const k = (string - 1) / 5; // 0 = high e, 1 = low E
  return -p.scaleLengthCm - 0.12 - 0.22 * k;
}

/** Across position of a string at x (spacing grows linearly from nut to saddle). */
export function stringY(p: GuitarProfile, string: number, x: number) {
  const t = Math.min(1, Math.max(0, -x / p.scaleLengthCm));
  const spacing = p.stringSpacingNutCm + (p.stringSpacingSaddleCm - p.stringSpacingNutCm) * t;
  return ((string - 3.5) / 5) * spacing;
}

/** Height of a string above the body top at x (straight line nut → saddle). */
export function stringZ(p: GuitarProfile, x: number) {
  const nutZ = FB_TOP + FRET_HEIGHT + 0.06;
  const t = Math.min(1, Math.max(0, -x / p.scaleLengthCm));
  return nutZ + (SADDLE_TOP - nutZ) * t;
}

/** Nearest string (1..6) and fret (0..fretCount) for a point on the fretboard. */
export function hitToFret(p: GuitarProfile, x: number, y: number) {
  let best = 1;
  let bestD = Infinity;
  for (let s = 1; s <= 6; s++) {
    const d = Math.abs(stringY(p, s, x) - y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (x > 0) return { string: best, fret: 0 };
  const fret = Math.min(p.fretCount, Math.ceil(fretAtX(p.scaleLengthCm, x)));
  return { string: best, fret };
}

/** Body depth (top to back) at x: dreadnoughts are ~15 % shallower at the neck than at the tail. */
export function bodyDepthAt(p: GuitarProfile, x: number) {
  const [x0] = outlineXRange(p.body.outline);
  const x1 = neckJoinX(p.body.outline);
  const t = Math.min(1, Math.max(0, (x1 - x) / (x1 - x0)));
  return p.body.depthCm * (0.86 + 0.14 * t);
}

/** [min x, max x] of an outline. */
export function outlineXRange(outline: Point2[]): [number, number] {
  let a = Infinity;
  let b = -Infinity;
  for (const [x] of outline) {
    a = Math.min(a, x);
    b = Math.max(b, x);
  }
  return [a, b];
}

export function polygonArea(pts: Point2[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** Outline as counter-clockwise points (positive area) — what three.js shapes expect. */
export function ccw(pts: Point2[]): Point2[] {
  return polygonArea(pts) < 0 ? [...pts].reverse() : pts;
}

/** Outward unit normals of a CCW closed polyline (averaged over the two adjacent edges). */
export function outwardNormals(pts: Point2[]): Point2[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const [ax, ay] = pts[(i - 1 + n) % n];
    const [bx, by] = pts[(i + 1) % n];
    const tx = bx - ax;
    const ty = by - ay;
    const l = Math.hypot(tx, ty) || 1;
    return [ty / l, -tx / l];
  });
}

/** Offsets a CCW outline outwards (d > 0) or inwards (d < 0). */
export function offsetOutline(pts: Point2[], d: number): Point2[] {
  const ns = outwardNormals(pts);
  return pts.map(([x, y], i) => [x + ns[i][0] * d, y + ns[i][1] * d]);
}

/** Scales an outline uniformly about a point (used when a profile is resized to a new total length). */
export function scaleOutline(pts: Point2[], k: number, about: Point2 = [0, 0]): Point2[] {
  return pts.map(([x, y]) => [about[0] + (x - about[0]) * k, about[1] + (y - about[1]) * k]);
}

/** Half width of the body at x (largest |y| span of the outline crossing x). */
export function bodyWidthAt(outline: Point2[], x: number) {
  const ys: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    if ((x0 - x) * (x1 - x) <= 0 && x0 !== x1) ys.push(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
  }
  if (ys.length < 2) return 0;
  return Math.max(...ys) - Math.min(...ys);
}

/** Linear interpolation in a [d, value] table (clamped). */
export function interpTable(tbl: Point2[], d: number) {
  if (d <= tbl[0][0]) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) {
    if (d <= tbl[i][0]) {
      const [d0, v0] = tbl[i - 1];
      const [d1, v1] = tbl[i];
      return v0 + ((v1 - v0) * (d - d0)) / (d1 - d0);
    }
  }
  return tbl[tbl.length - 1][1];
}

/** Overall extent along x: [body end, headstock tip] (headstock projected with its back angle). */
export function guitarXRange(p: GuitarProfile): [number, number] {
  const [x0] = outlineXRange(p.body.outline);
  const tip = p.headstock.lengthCm * Math.cos((p.headstock.angleDeg * Math.PI) / 180);
  return [x0, tip];
}

/** Total length as modelled (should equal profile.totalLengthCm within a few mm). */
export function modelledLength(p: GuitarProfile) {
  const [a, b] = guitarXRange(p);
  return b - a;
}

export function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Camera distance at which a w × h (cm) box fills a perspective view (vertical fov in degrees). */
export function fitDistance(w: number, h: number, fovDeg: number, aspect: number) {
  const t = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return Math.max(w / 2 / (t * aspect), h / 2 / t);
}

/** Vibrating fraction of the string measured from the saddle for a note at `fret` (1 for open). */
export function speakingFraction(fret: number) {
  return Math.pow(2, -Math.max(0, fret) / 12);
}

/**
 * Follow-camera target along the neck: the mean x of the played notes, kept while the new
 * notes stay within `window` cm of the current target so the camera does not jitter.
 */
export function followTarget(scale: number, frets: number[], current: number | null, window = 3.5) {
  const fretted = frets.filter((f) => f > 0);
  if (!fretted.length) return current;
  const xs = fretted.map((f) => noteX(scale, f));
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const mid = (lo + hi) / 2;
  if (current !== null && lo >= current - window && hi <= current + window) return current;
  return mid;
}

/** Box placement of a capo just behind fret wire `fret` (guitar frame, cm). */
export function capoLayout(profile: GuitarProfile, fret: number) {
  const f = Math.min(Math.max(1, Math.round(fret)), profile.fretCount - 1);
  const x = fretX(profile.scaleLengthCm, f) + 0.5; // the nut is at x = 0, frets go towards -x
  const width = fretboardWidth(profile, x) + 0.5;
  const sz = stringZ(profile, x);
  return {
    x,
    width,
    pad: { z: (FB_TOP + sz) / 2 + 0.12, h: Math.max(0.25, sz - FB_TOP + 0.22), len: 0.9 },
    bar: { z: sz + 0.38, h: 0.3, len: 0.7 },
  };
}

