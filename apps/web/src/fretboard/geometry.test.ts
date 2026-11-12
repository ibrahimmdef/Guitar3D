import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GuitarProfile, Point2 } from '@guitar3d/shared';
import {
  bodyDepthAt, bodyWidthAt, ccw, fitDistance, followTarget, fretAtX, fretboardEndX, fretboardWidth, fretX, guitarXRange,
  hitToFret, interpTable, modelledLength, noteX, offsetOutline, outlineXRange, outwardNormals, polygonArea, saddleX,
  scaleOutline, smoothstep, speakingFraction, stringY, stringZ, FB_TOP, SADDLE_TOP,
} from './geometry';

const profile = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/guitar/veston.profile.json', import.meta.url)), 'utf8'),
) as GuitarProfile;
const L = profile.scaleLengthCm;

describe('frets', () => {
  it('places the 12th fret at half the scale and the nut at 0', () => {
    expect(fretX(L, 0)).toBeCloseTo(0);
    expect(fretX(L, 12)).toBeCloseTo(-L / 2);
    expect(fretX(L, 24)).toBeCloseTo((-L * 3) / 4);
  });
  it('fretAtX inverts fretX', () => {
    for (const n of [0, 1, 5, 12, 20]) expect(fretAtX(L, fretX(L, n))).toBeCloseTo(n, 6);
  });
  it('draws notes between the two frets, nearer the higher one; open strings behind the nut', () => {
    for (let n = 1; n <= 20; n++) {
      const x = noteX(L, n);
      expect(x).toBeLessThan(fretX(L, n - 1));
      expect(x).toBeGreaterThan(fretX(L, n));
      expect(Math.abs(x - fretX(L, n))).toBeLessThan(Math.abs(x - fretX(L, n - 1)));
    }
    expect(noteX(L, 0)).toBeGreaterThan(0);
  });
  it('halves the speaking length every octave', () => {
    expect(speakingFraction(0)).toBe(1);
    expect(speakingFraction(12)).toBeCloseTo(0.5);
  });
});

describe('strings and fretboard', () => {
  it('puts the low E on +y and spreads towards the saddle', () => {
    expect(stringY(profile, 6, 0)).toBeCloseTo(profile.stringSpacingNutCm / 2);
    expect(stringY(profile, 1, 0)).toBeCloseTo(-profile.stringSpacingNutCm / 2);
    expect(stringY(profile, 6, -L)).toBeCloseTo(profile.stringSpacingSaddleCm / 2);
  });
  it('keeps every string over the fretboard and above the frets', () => {
    for (let n = 0; n <= profile.fretCount; n++) {
      const x = fretX(L, n);
      expect(Math.abs(stringY(profile, 6, x))).toBeLessThan(fretboardWidth(profile, x) / 2 - 0.2);
      expect(stringZ(profile, x)).toBeGreaterThan(FB_TOP + 0.11);
    }
    expect(stringZ(profile, -L)).toBeCloseTo(SADDLE_TOP);
  });
  it('tapers the fretboard from the nut width to the end width', () => {
    expect(fretboardWidth(profile, 0)).toBeCloseTo(profile.nutWidthCm);
    expect(fretboardWidth(profile, fretX(L, profile.fretCount))).toBeCloseTo(profile.endWidthCm);
    expect(fretboardEndX(profile)).toBeLessThan(fretX(L, profile.fretCount));
  });
  it('compensates the bass side of the saddle', () => {
    expect(saddleX(profile, 6)).toBeLessThan(saddleX(profile, 1));
    expect(saddleX(profile, 1)).toBeLessThan(-L);
  });
  it('maps a fretboard hit to string and fret', () => {
    expect(hitToFret(profile, noteX(L, 3), stringY(profile, 2, noteX(L, 3)))).toEqual({ string: 2, fret: 3 });
    expect(hitToFret(profile, noteX(L, 12), 5)).toEqual({ string: 6, fret: 12 });
    expect(hitToFret(profile, 0.5, -5)).toEqual({ string: 1, fret: 0 });
    expect(hitToFret(profile, -L, 0).fret).toBe(profile.fretCount);
  });
});

describe('outline helpers', () => {
  const square: Point2[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
  it('computes signed area and normalises to CCW', () => {
    expect(polygonArea(square)).toBe(4);
    const cw = [...square].reverse();
    expect(polygonArea(cw)).toBe(-4);
    expect(polygonArea(ccw(cw))).toBe(4);
    expect(ccw(square)).toBe(square);
  });
  it('normals point outwards and offsets grow the shape', () => {
    const ns = outwardNormals(square);
    expect(ns[0][0]).toBeLessThan(0);
    expect(ns[0][1]).toBeLessThan(0);
    expect(polygonArea(offsetOutline(square, 0.5))).toBeGreaterThan(4);
    expect(polygonArea(offsetOutline(square, -0.5))).toBeLessThan(4);
  });
  it('scales about a point', () => {
    expect(scaleOutline(square, 2, [2, 2])[0]).toEqual([-2, -2]);
    expect(outlineXRange(scaleOutline(square, 2))).toEqual([0, 4]);
  });
  it('measures width at x and interpolates tables', () => {
    expect(bodyWidthAt(square, 1)).toBe(2);
    expect(bodyWidthAt(square, 5)).toBe(0);
    const t: Point2[] = [[0, 1], [10, 3]];
    expect(interpTable(t, -1)).toBe(1);
    expect(interpTable(t, 5)).toBe(2);
    expect(interpTable(t, 99)).toBe(3);
  });
  it('smoothstep clamps', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });
});

describe('Veston profile', () => {
  it('is modelled at 42 inches overall', () => {
    expect(Math.abs(modelledLength(profile) - profile.totalLengthCm)).toBeLessThan(1);
    expect(guitarXRange(profile)[1]).toBeGreaterThan(0);
  });
  it('has dreadnought proportions', () => {
    const o = profile.body.outline;
    const [x0, x1] = outlineXRange(o);
    const len = x1 - x0;
    const widths = Array.from({ length: 99 }, (_, i) => bodyWidthAt(o, x0 + (len * (i + 1)) / 100));
    const lower = Math.max(...widths.slice(0, 50));
    const upper = Math.max(...widths.slice(65));
    const waist = Math.min(...widths.slice(45, 75));
    expect(len).toBeGreaterThan(48);
    expect(len).toBeLessThan(53);
    expect(lower).toBeGreaterThan(37);
    expect(lower).toBeLessThan(42);
    expect(upper).toBeLessThan(lower);
    expect(waist).toBeLessThan(upper);
    // the neck meets the body at the join fret, the saddle sits on the bridge
    expect(Math.abs(x1 - fretX(L, profile.bodyJoinFret))).toBeLessThan(1);
    expect(Math.abs(profile.body.bridge.x + L)).toBeLessThan(profile.body.bridge.lengthCm / 2);
  });
  it('is shallower at the neck than at the tail', () => {
    const [x0, x1] = outlineXRange(profile.body.outline);
    expect(bodyDepthAt(profile, x0)).toBeCloseTo(profile.body.depthCm);
    expect(bodyDepthAt(profile, x1)).toBeLessThan(bodyDepthAt(profile, x0));
  });
});

describe('camera helpers', () => {
  it('fits the limiting dimension', () => {
    const d = fitDistance(100, 10, 30, 2);
    expect(d).toBeCloseTo(50 / (Math.tan((15 * Math.PI) / 180) * 2));
    expect(fitDistance(10, 100, 30, 2)).toBeCloseTo(50 / Math.tan((15 * Math.PI) / 180));
  });
  it('follows the hand but ignores small moves and open strings', () => {
    const a = followTarget(L, [3, 5], null)!;
    expect(a).toBeCloseTo((noteX(L, 3) + noteX(L, 5)) / 2);
    expect(followTarget(L, [4], a)).toBe(a);
    expect(followTarget(L, [0], a)).toBe(a);
    expect(followTarget(L, [], null)).toBeNull();
    const b = followTarget(L, [12], a)!;
    expect(b).toBeCloseTo(noteX(L, 12));
  });
});
