import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FretNote, GuitarProfile } from '@guitar3d/shared';
import {
  currentNotes, ghostOpacity, markerDiameter, markerLabel, moveArrows, moveGuides, arcPoint, arrowOpacity, popScale, upcomingFade, upcomingMarkers,
} from './markers';
import { cameraFraming, clampZoom, followWindow } from './camera';
import { fretX, guitarXRange } from './geometry';

const profile = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/guitar/veston.profile.json', import.meta.url)), 'utf8'),
) as GuitarProfile;

const n = (string: number, fret: number, state: FretNote['state'] = 'now', extra: Partial<FretNote> = {}): FretNote => ({ string, fret, state, ...extra });

describe('upcoming markers', () => {
  it('falls back to the notes with state next', () => {
    const m = upcomingMarkers([n(1, 3), n(2, 5, 'next')]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ rank: 0, key: '2:5' });
  });

  it('ranks the given beats nearest first, max 3, without repeating positions', () => {
    const m = upcomingMarkers([n(1, 3)], [[n(1, 3, 'next'), n(2, 1, 'next')], [n(2, 1, 'next'), n(3, 2, 'next')], [n(4, 2, 'next')], [n(5, 3, 'next')]]);
    expect(m.map((u) => `${u.rank}/${u.key}`)).toEqual(['0/2:1', '1/3:2', '2/4:2']);
  });

  it('fades continuously with distance in time', () => {
    const near = upcomingFade(0, 0);
    const mid = upcomingFade(1, 0);
    const far = upcomingFade(2, 0);
    expect(near.opacity).toBeGreaterThan(mid.opacity);
    expect(mid.opacity).toBeGreaterThan(far.opacity);
    expect(near.scale).toBeGreaterThan(mid.scale);
    expect(near.arc).toBe(true);
    expect(mid.arc).toBe(false);
    // the end of one beat looks like the start of the next: rank 1 at progress 1 == rank 0 at progress 0
    expect(upcomingFade(1, 1).opacity).toBeCloseTo(upcomingFade(0, 0).opacity);
    expect(upcomingFade(1, 1).scale).toBeCloseTo(upcomingFade(0, 0).scale);
    expect(upcomingFade(0, 1).opacity).toBeLessThanOrEqual(1);
    expect(far.opacity).toBeGreaterThanOrEqual(0.1);
  });

  it('guides the hand along a string only when the fret changes', () => {
    const cur = currentNotes([n(1, 3), n(2, 1), n(3, 0, 'now', { muted: true })]);
    const next = upcomingMarkers(cur, [[n(1, 5, 'next'), n(2, 1, 'next'), n(3, 2, 'next')]]);
    expect(moveGuides(cur, next)).toEqual([{ string: 1, fromFret: 3, toFret: 5 }]);
  });

  it('labels with the finger when known, else the fret', () => {
    expect(markerLabel(n(1, 7, 'now', { finger: 2 }))).toBe('2');
    expect(markerLabel(n(1, 7, 'now', { finger: 0 }))).toBe('T');
    expect(markerLabel(n(1, 7))).toBe('7');
  });

  it('keeps markers screen-constant within clamps, pops and ghosts', () => {
    const a = markerDiameter(60, 900, 30);
    expect(markerDiameter(100, 900, 30)).toBeCloseTo((a * 5) / 3);
    expect(markerDiameter(5, 900, 30)).toBe(0.9);
    expect(markerDiameter(1000, 900, 30)).toBe(2);
    expect(popScale(0)).toBeCloseTo(0.7);
    expect(popScale(1)).toBe(1);
    expect(Math.max(...[0.1, 0.15, 0.2].map(popScale))).toBeGreaterThan(1);
    expect(ghostOpacity(0)).toBeCloseTo(0.5);
    expect(ghostOpacity(10)).toBe(0);
  });
});

describe('camera framing', () => {
  it('clamps zoom', () => {
    expect(clampZoom(undefined)).toBe(1);
    expect(clampZoom(9)).toBe(2.5);
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(NaN)).toBe(1);
  });

  it('follow frames ~8 frets around the played position and stays on the neck', () => {
    const L = profile.scaleLengthCm;
    const w = followWindow(profile, fretX(L, 7));
    expect(w.hi - w.lo).toBeCloseTo(8);
    expect(w.lo).toBeGreaterThan(2);
    const open = followWindow(profile, fretX(L, 1));
    expect(open.lo).toBe(0);
    const high = followWindow(profile, fretX(L, 19));
    expect(high.hi).toBeLessThanOrEqual(profile.fretCount);
    // zooming in halves the distance; the follow camera is much closer than the overview
    const f = cameraFraming(profile, 'follow', 16 / 9, fretX(L, 5));
    expect(cameraFraming(profile, 'follow', 16 / 9, fretX(L, 5), 2).distance).toBeCloseTo(f.distance / 2);
    expect(f.distance).toBeLessThan(cameraFraming(profile, 'overview', 16 / 9, null).distance / 2.5);
  });

  it('overview fits the whole guitar at any aspect, portrait included', () => {
    const [x0, x1] = guitarXRange(profile);
    for (const aspect of [0.45, 0.75, 1, 16 / 9, 2.4]) {
      const f = cameraFraming(profile, 'overview', aspect, null);
      const halfW = f.distance * Math.tan((15 * Math.PI) / 180) * aspect;
      expect(halfW * 2).toBeGreaterThanOrEqual((x1 - x0) * 1.05);
    }
  });

  it('neck framing spans the nut to the last fret', () => {
    const f = cameraFraming(profile, 'neck', 16 / 9, null);
    const halfW = f.distance * Math.tan((15 * Math.PI) / 180) * (16 / 9);
    expect(f.target[0] - halfW).toBeLessThan(fretX(profile.scaleLengthCm, profile.fretCount));
    expect(f.target[0] + halfW).toBeGreaterThan(0);
  });
});

describe('moveArrows', () => {
  const n = (string: number, fret: number, extra: Partial<FretNote> = {}): FretNote => ({ string, fret, state: 'now', ...extra });
  it('connects single notes, on one string or across strings, and chains upcoming beats', () => {
    const arrows = moveArrows([n(2, 3)], [[n(2, 7)], [n(3, 5)], [n(3, 9)]]);
    expect(arrows).toEqual([
      { from: { string: 2, fret: 3 }, to: { string: 2, fret: 7 }, rank: 0 },
      { from: { string: 2, fret: 7 }, to: { string: 3, fret: 5 }, rank: 1 },
    ]);
  });
  it('between chords only connects strings whose fret changes', () => {
    const c = [n(1, 0), n(2, 1), n(3, 0)];
    const g = [n(1, 3), n(2, 0), n(3, 0)];
    expect(moveArrows(c, [g]).map((a) => a.from.string)).toEqual([1, 2]);
  });
  it('skips repeats, rests and muted notes', () => {
    expect(moveArrows([n(1, 5)], [[n(1, 5)]])).toEqual([]);
    expect(moveArrows([], [[n(1, 5)]])).toEqual([]);
    expect(moveArrows([n(1, 5)], [[n(1, 7, { muted: true })]])).toEqual([]);
  });
  it('arc starts and ends on the notes and bulges in between', () => {
    const a: [number, number, number] = [0, 0, 1];
    const b: [number, number, number] = [-10, 0, 1];
    expect(arcPoint(a, b, 0, 1)).toEqual(a);
    expect(arcPoint(a, b, 1, 1)).toEqual(b);
    expect(arcPoint(a, b, 0.5, 1)[2]).toBeGreaterThan(1);
  });
  it('nearest arrow is the most visible', () => {
    expect(arrowOpacity(0, 0)).toBeGreaterThan(arrowOpacity(1, 0));
    expect(arrowOpacity(0, 1)).toBeGreaterThan(arrowOpacity(0, 0));
  });
});
