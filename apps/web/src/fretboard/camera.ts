/**
 * Pure camera framing for the three automatic camera modes (no three.js). Targets and directions are
 * in the guitar frame (see geometry.ts); Guitar3D turns them into world space for the current view.
 */
import type { GuitarProfile } from '@guitar3d/shared';
import { FB_TOP, fitDistance, fretAtX, fretX, guitarXRange } from './geometry';

export type FramedMode = 'follow' | 'neck' | 'overview';

export interface Framing {
  /** Look-at point in the guitar frame. */
  target: [number, number, number];
  /** Direction from the target towards the camera (guitar frame, not normalised). */
  dir: [number, number, number];
  distance: number;
}

/** Vertical field of view used by Guitar3D. */
export const CAMERA_FOV = 30;

/** Camera directions: a low three-quarter view over the treble side, slightly from the body end. */
export const CAMERA_DIRS: Record<FramedMode, [number, number, number]> = {
  follow: [-0.2, -0.85, 1],
  neck: [-0.06, -0.6, 1],
  overview: [0.04, -0.34, 1],
};

export function clampZoom(zoom: number | undefined) {
  const z = zoom ?? 1;
  return Number.isFinite(z) ? Math.min(2.5, Math.max(0.5, z)) : 1;
}

/** Frets shown by the follow camera: ~8 around the played position, kept on the fretboard. */
export const FOLLOW_FRETS = 8;

/** The stretch of neck the follow camera frames around `x` (a position along the neck). */
export function followWindow(p: GuitarProfile, x: number, frets = FOLLOW_FRETS) {
  const L = p.scaleLengthCm;
  const half = frets / 2;
  const fc = Math.min(Math.max(fretAtX(L, Math.min(0, x)), half), Math.max(half, p.fretCount - half + 0.5));
  const lo = Math.max(0, fc - half);
  const hi = Math.min(p.fretCount, fc + half);
  const x0 = fretX(L, lo) + (lo === 0 ? 1.2 : 0); // a little room for the nut and the open-string marks
  const x1 = fretX(L, hi);
  return { lo, hi, x0, x1, centerX: (x0 + x1) / 2, width: x0 - x1 };
}

/** Half the width of the body (largest |y| of the outline). */
function bodyHalfWidth(p: GuitarProfile) {
  let m = 0;
  for (const [, y] of p.body.outline) m = Math.max(m, Math.abs(y));
  return m;
}

/**
 * Framing of an automatic camera mode. `followX` is the follow target along the neck (null = 5th fret),
 * `aspect` the canvas width / height, `zoom` > 1 moves closer.
 */
export function cameraFraming(p: GuitarProfile, mode: FramedMode, aspect: number, followX: number | null, zoom = 1): Framing {
  const z = clampZoom(zoom);
  const a = Math.max(0.2, aspect);
  if (mode === 'overview') {
    const [x0, x1] = guitarXRange(p);
    const d = fitDistance((x1 - x0) * 1.1, bodyHalfWidth(p) * 2 * 1.2, CAMERA_FOV, a);
    return { target: [(x0 + x1) / 2, 0, -3], dir: CAMERA_DIRS.overview, distance: d / z };
  }
  if (mode === 'neck') {
    const xe = fretX(p.scaleLengthCm, p.fretCount);
    const d = fitDistance(-xe + 5, 11, CAMERA_FOV, a);
    return { target: [xe / 2 + 0.6, 0, FB_TOP], dir: CAMERA_DIRS.neck, distance: d / z };
  }
  const w = followWindow(p, followX ?? fretX(p.scaleLengthCm, 5));
  const d = fitDistance(w.width * 1.08, 11, CAMERA_FOV, a);
  return { target: [w.centerX, 0, FB_TOP], dir: CAMERA_DIRS.follow, distance: d / z };
}
