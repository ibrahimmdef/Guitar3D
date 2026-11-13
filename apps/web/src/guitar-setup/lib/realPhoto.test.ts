/**
 * Runs the photo → profile pipeline on the owner's real photos (assets/photos). The landmark
 * coordinates below were read off the photos by hand, the way a user would click them.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { downscale, luminance, lerpPt, type Pt, type RGBAImage } from './image';
import { segmentGuitar } from './segment';
import { polygonArea } from './contour';
import { scaleFrame, solveFrame, toGuitar, toImage, type Landmarks } from './geometry';
import { detectSoundhole, extractBody } from './body';
import { detectFrets, warpFretboard, fretboardWidths } from './fretboard';
import { assembleProfile } from './profile';
import { autoLandmarks } from './auto';
import { maskedMedianColor } from './colors';

const PHOTOS = path.resolve(__dirname, '../../../../../assets/photos');
const has = fs.existsSync(path.join(PHOTOS, 'front-full.jpg')) && fs.existsSync(path.join(PHOTOS, 'front-neck.jpg'));

function load(name: string): RGBAImage {
  const j = jpeg.decode(fs.readFileSync(path.join(PHOTOS, name)), { useTArray: true, maxMemoryUsageInMB: 1024 });
  return { width: j.width, height: j.height, data: new Uint8ClampedArray(j.data.buffer, j.data.byteOffset, j.data.length) };
}

/** front-full.jpg (1512 × 2016): black 42" dreadnought leaning on patterned wallpaper, wooden floor. */
const FULL: Landmarks = {
  headTip: [830, 188],
  nut: [816, 454],
  fret: { n: 12, p: [795, 943] },
  saddle: [777, 1368],
  bodyEnd: [770, 1600],
};

/** front-neck.jpg: fretboard edges at the nut and at the 15th fret; fret wire rows on the centre line. */
const NECK = {
  nut: { low: [703, 624] as Pt, high: [827, 624] as Pt },
  last: { n: 15, low: [687, 1697] as Pt, high: [825, 1677] as Pt },
  rows: [742, 849, 947, 1037, 1120, 1197, 1268, 1335, 1397, 1455, 1510, 1560, 1608, 1652],
};

describe.skipIf(!has)('pipeline on the real photos', () => {
  const img = has ? load('front-full.jpg') : (null as never);
  const small = has ? downscale(img, 700) : (null as never);
  const sol = has ? solveFrame(FULL, { kind: 'total', cm: 106.7 }, { imageLongSidePx: 2016 }) : (null as never);

  it('solves a perspective-corrected frame from five clicks', () => {
    // 12th fret is visibly past the middle of nut → saddle: the photo was taken from above
    expect(sol.perspective).toBeGreaterThan(0.08);
    expect(sol.perspective).toBeLessThan(0.3);
    expect(sol.totalLengthCm).toBeCloseTo(106.7, 3);
    expect(sol.scaleLengthCm).toBeGreaterThan(62);
    expect(sol.scaleLengthCm).toBeLessThan(71);
    // round trip, and the 12th fret lands at half the scale
    const p: Pt = [700, 1400];
    const back = toImage(sol.frame, toGuitar(sol.frame, p));
    expect(Math.hypot(back[0] - p[0], back[1] - p[1])).toBeLessThan(0.01);
    expect(-toGuitar(sol.frame, FULL.fret!.p)[0] / sol.scaleLengthCm).toBeCloseTo(0.5, 2);
  });

  it('segments the guitar without any click and extracts a sane body', () => {
    const seg = segmentGuitar(small.image);
    const share = seg.area / (small.image.width * small.image.height);
    expect(share).toBeGreaterThan(0.07);
    expect(share).toBeLessThan(0.2);
    const at = (p: Pt) => seg.mask.data[Math.floor(p[1] * small.scale) * small.image.width + Math.floor(p[0] * small.scale)];
    expect(at([700, 1450])).toBe(1); // lower bout
    expect(at([787, 1186])).toBe(1); // soundhole is filled
    expect(at([300, 1800])).toBe(0); // floor
    expect(at([300, 500])).toBe(0); // wallpaper

    const body = extractBody(seg.mask, scaleFrame(sol.frame, small.scale), sol.scaleLengthCm);
    // closed, clockwise, finite outline
    expect(body.outline).toHaveLength(240);
    expect(body.outline.flat().every(Number.isFinite)).toBe(true);
    expect(polygonArea(body.outline as Pt[])).toBeLessThan(-800);
    const d0 = Math.hypot(body.outline[0][0] - body.outline[239][0], body.outline[0][1] - body.outline[239][1]);
    expect(d0).toBeLessThan(2);
    expect(body.lengthCm).toBeGreaterThan(45);
    expect(body.lengthCm).toBeLessThan(55);
    expect(body.bouts.lowerCm).toBeGreaterThan(body.bouts.upperCm + 4);
    expect(body.bouts.lowerCm).toBeGreaterThan(34);
    expect(body.bouts.lowerCm).toBeLessThan(44);
    expect(body.bouts.upperCm).toBeGreaterThan(24);
    expect(body.bouts.waistCm).toBeLessThan(body.bouts.upperCm);
    // symmetric about the centre line
    expect(Math.abs(body.bounds.maxY + body.bounds.minY)).toBeLessThan(0.3);

    const hole = detectSoundhole(luminance(img), sol.frame, sol.scaleLengthCm);
    expect(Math.abs(hole.y)).toBeLessThan(1.5);
    expect(hole.radiusCm).toBeGreaterThan(3.5);
    const rgb = maskedMedianColor(small.image, body.bodyMask);
    expect(Math.max(...rgb)).toBeLessThan(70); // a black guitar

    const prof = assembleProfile({ name: 'Veston', totalLengthCm: sol.totalLengthCm, scaleLengthCm: sol.scaleLengthCm, body, soundhole: hole });
    expect(prof.bodyJoinFret).toBeGreaterThanOrEqual(13);
    expect(prof.bodyJoinFret).toBeLessThanOrEqual(15);
  });

  it('guesses the landmarks from the mask alone (quick mode)', () => {
    const seg = segmentGuitar(small.image);
    const auto = autoLandmarks(seg.mask);
    expect(auto).not.toBeNull();
    const up = (p: Pt): Pt => [p[0] / small.scale, p[1] / small.scale];
    const near = (a: Pt, b: Pt, tol: number) => expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(tol);
    near(up(auto!.headTip), FULL.headTip, 40);
    near(up(auto!.bodyEnd), FULL.bodyEnd, 40);
    near(up(auto!.nut), FULL.nut, 90);
    near(up(auto!.saddle), FULL.saddle, 90);
    const quick = solveFrame({ ...auto!, fret: undefined }, { kind: 'total', cm: 106.7 });
    const body = extractBody(seg.mask, quick.frame, quick.scaleLengthCm);
    expect(body.lengthCm).toBeGreaterThan(42);
    expect(body.lengthCm).toBeLessThan(55);
    expect(body.bouts.lowerCm).toBeGreaterThan(body.bouts.upperCm);
  });

  it('finds the fret wires on the neck close-up', () => {
    const neck = load('front-neck.jpg');
    const lines = detectFrets(luminance(neck), NECK);
    expect(lines).toHaveLength(16);
    const errs = NECK.rows.map((y, i) => Math.abs(lerpPt(lines[i + 1].low, lines[i + 1].high, 0.5)[1] - y));
    const ok = errs.filter((e) => e < 6).length;
    // nut + 15th are given; of the 14 wires in between at least 13 must be found → ≥ 15 of 16 lines
    expect(ok).toBeGreaterThanOrEqual(13);
    const tex = warpFretboard(neck, lines, 15, 1024, 128);
    expect(tex.width).toBe(1024);
    const w = fretboardWidths(lines, 65, 20);
    expect(w.nutWidthCm).toBeGreaterThan(3.8);
    expect(w.nutWidthCm).toBeLessThan(5);
    expect(w.endWidthCm).toBeGreaterThan(w.nutWidthCm);
  });
});
