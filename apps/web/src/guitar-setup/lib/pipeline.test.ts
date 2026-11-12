import { describe, it, expect } from 'vitest';
import { createMask, luminance, downscale, type Mask, type Pt } from './image';
import { close, dilate, erode, fillHoles, floodFill, largestComponent, maskArea, open, otsuThreshold, sampleBackground, segmentGuitar } from './segment';
import { pointInPolygon, polygonArea, rasterizePolygon, resampleClosed, traceContour } from './contour';
import { circleFromClicks, fretDistance, scaleFrame, solveFrame, toGuitar, toImage } from './geometry';
import { detectSoundhole, extractBody, measureBouts, rectifyBodyTop } from './body';
import { assembleProfile } from './profile';
import { maskedMedianColor, toHex, fromHex, sampleColorAt } from './colors';
import { SYN, frameAt, inBody, regionAt, renderGuitar } from './synthetic.test-utils';

function maskFrom(w: number, h: number, f: (x: number, y: number) => boolean): Mask {
  const m = createMask(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m.data[y * w + x] = f(x, y) ? 1 : 0;
  return m;
}

describe('morphology and components', () => {
  it('erodes, dilates, opens and closes with a square element', () => {
    const m = maskFrom(20, 20, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15);
    expect(maskArea(erode(m, 1))).toBe(64);
    expect(maskArea(dilate(m, 1))).toBe(144);
    expect(maskArea(open(m, 1))).toBe(100);
    // a single-pixel speck disappears with opening, a 1px gap is bridged by closing
    const speck = maskFrom(20, 20, (x, y) => (x === 2 && y === 2) || (x >= 5 && x < 15 && y >= 5 && y < 15 && x !== 10));
    expect(maskArea(open(speck, 1))).toBe(90);
    expect(maskArea(close(speck, 1))).toBeGreaterThanOrEqual(100);
  });

  it('fills holes, flood fills and keeps the largest component', () => {
    const ring = maskFrom(30, 30, (x, y) => {
      const d = Math.hypot(x - 15, y - 15);
      return d < 10 && d > 4;
    });
    expect(maskArea(fillHoles(ring))).toBeGreaterThan(maskArea(ring) + 40);
    const two = maskFrom(30, 10, (x) => (x > 1 && x < 6) || (x > 10 && x < 25));
    expect(maskArea(largestComponent(two))).toBe(140);
    expect(maskArea(floodFill(two, [3, 3]))).toBe(40);
    expect(maskArea(floodFill(two, [8, 3]))).toBe(0);
  });

  it('finds an Otsu threshold between two populations', () => {
    const v = new Float32Array(1000).map((_, i) => (i < 600 ? 20 + (i % 10) : 200 + (i % 10)));
    const t = otsuThreshold(v);
    expect(t).toBeGreaterThan(30);
    expect(t).toBeLessThan(200);
  });
});

describe('contours', () => {
  it('traces a rectangle and a disc with the right area', () => {
    const rect = maskFrom(40, 30, (x, y) => x >= 5 && x < 35 && y >= 5 && y < 25);
    const c = traceContour(rect);
    expect(Math.abs(polygonArea(c))).toBeCloseTo(29 * 19, 0);
    const disc = maskFrom(80, 80, (x, y) => Math.hypot(x + 0.5 - 40, y + 0.5 - 40) < 30);
    const d = traceContour(disc);
    expect(Math.abs(polygonArea(d)) / (Math.PI * 30 * 30)).toBeGreaterThan(0.93);
    expect(resampleClosed(d, 100)).toHaveLength(100);
    // concave shape (L) is traced completely
    const L = maskFrom(30, 30, (x, y) => (x >= 2 && x < 10 && y >= 2 && y < 28) || (x >= 2 && x < 28 && y >= 20 && y < 28));
    expect(Math.abs(polygonArea(traceContour(L)))).toBeGreaterThan(0.85 * maskArea(L));
  });

  it('rasterises polygons with anti-aliased coverage', () => {
    const a = rasterizePolygon([[2, 2], [8, 2], [8, 8], [2, 8]], 10, 10);
    expect(a[5 * 10 + 5]).toBe(255);
    expect(a[0]).toBe(0);
    const half = rasterizePolygon([[2.5, 0], [10, 0], [10, 10], [2.5, 10]], 10, 10);
    expect(half[5 * 10 + 2]).toBeGreaterThan(110);
    expect(half[5 * 10 + 2]).toBeLessThan(145);
    expect(pointInPolygon([5, 5], [[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(true);
  });
});

describe('frame from landmarks', () => {
  const truth = frameAt([300, 150], 20, 6);
  const lm = (f = truth) => ({
    headTip: toImage(f, [SYN.headLen, 0]),
    nut: toImage(f, [0, 0]),
    fret: { n: 12, p: toImage(f, [-fretDistance(SYN.scale, 12), 0]) },
    saddle: toImage(f, [-SYN.scale, 0]),
    bodyEnd: toImage(f, [SYN.bodyEnd, 0]),
  });

  it('recovers scale, axis and handedness from a total-length preset', () => {
    const s = solveFrame(lm(), { kind: 'total', cm: SYN.headLen - SYN.bodyEnd });
    expect(s.frame.pxPerCm).toBeCloseTo(6, 3);
    expect(s.scaleLengthCm).toBeCloseTo(SYN.scale, 2);
    expect(s.warnings).toEqual([]);
    const p = toImage(truth, [-30, 10]);
    const g = toGuitar(s.frame, p);
    expect(g[0]).toBeCloseTo(-30, 2);
    expect(g[1]).toBeCloseTo(10, 2);
    expect(toGuitar(solveFrame(lm(), { kind: 'total', cm: 108 }, 'right').frame, p)[1]).toBeCloseTo(-10, 2);
  });

  it('uses the scale length when given and flags inconsistent clicks', () => {
    const s = solveFrame(lm(), { kind: 'scale', cm: 64 });
    expect(s.totalLengthCm).toBeCloseTo(108, 2);
    const bad = { ...lm(), saddle: toImage(truth, [-70, 0]) };
    expect(solveFrame(bad, { kind: 'scale', cm: 64 }).warnings.join(' ')).toMatch(/farklı tel boyları/);
    expect(() => solveFrame({ ...lm(), saddle: toImage(truth, [5, 0]) }, { kind: 'scale', cm: 64 })).toThrow();
    const c = circleFromClicks(s.frame, toImage(truth, [-44, 1]), toImage(truth, [-44, 6]));
    expect(c.x).toBeCloseTo(-44, 2);
    expect(c.radiusCm).toBeCloseTo(5, 2);
  });
});

describe('body from a synthetic photo', () => {
  const W = 420, H = 760;
  const truth = frameAt([210, 130], 0, 6);
  const img = renderGuitar(W, H, truth);
  const lm = {
    headTip: toImage(truth, [SYN.headLen, 0]),
    nut: toImage(truth, [0, 0]),
    fret: { n: 12, p: toImage(truth, [-fretDistance(SYN.scale, 12), 0]) },
    saddle: toImage(truth, [-SYN.scale, 0]),
    bodyEnd: toImage(truth, [SYN.bodyEnd, 0]),
  };
  const sol = solveFrame(lm, { kind: 'total', cm: 108 });

  it('segments the guitar against the background', () => {
    expect(sampleBackground(img)[0]).toBeGreaterThan(200);
    const seg = segmentGuitar(img, { seed: toImage(truth, [-70, 5]) });
    let tp = 0, fp = 0, fn = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const g = toGuitar(truth, [x + 0.5, y + 0.5]);
        const fg = regionAt(g[0], g[1]) !== 'bg';
        const m = seg.mask.data[y * W + x] === 1;
        if (fg && m) tp++;
        else if (m) fp++;
        else if (fg) fn++;
      }
    }
    expect(tp / (tp + fp + fn)).toBeGreaterThan(0.97);
    // soundhole is filled in
    const hole = toImage(truth, [SYN.hole.x, 0]);
    expect(seg.mask.data[Math.floor(hole[1]) * W + Math.floor(hole[0])]).toBe(1);
  });

  it('extracts the outline, length and bouts in cm', () => {
    const small = downscale(img, 500);
    const seg = segmentGuitar(small.image);
    const body = extractBody(seg.mask, scaleFrame(sol.frame, small.scale), sol.scaleLengthCm);
    expect(body.lengthCm).toBeCloseTo(SYN.bodyTop - SYN.bodyEnd, -0.5); // ±1.5
    expect(Math.abs(body.bounds.minX - SYN.bodyEnd)).toBeLessThan(1);
    expect(Math.abs(body.bounds.maxX - SYN.bodyTop)).toBeLessThan(1.2);
    expect(Math.abs(body.bouts.lowerCm - 38)).toBeLessThan(1);
    expect(Math.abs(body.bouts.upperCm - 29)).toBeLessThan(1);
    expect(body.bouts.waistCm).toBeLessThan(body.bouts.upperCm);
    expect(Math.abs(body.bouts.lowerX - SYN.lower.cx)).toBeLessThan(2);
    expect(Math.abs(body.neckWidthCm - 2 * SYN.neckHalf)).toBeLessThan(0.6);
    expect(polygonArea(body.outline as Pt[])).toBeLessThan(0); // clockwise
    expect(body.outline.length).toBe(240);
    // every outline point is on the true body edge (within ~0.9 cm; the synthetic waist is a sharp cusp that closing rounds off)
    const far: [number, number][] = [];
    // (the neck joint may keep a small bump where the disc opening touches the neck)
    for (const [x, y] of body.outline.filter(([x, y], i) => i % 5 === 0 && !(x > SYN.bodyTop - 3 && Math.abs(y) < 5))) {
      const inside = inBody(x, y);
      const near = [-0.9, 0.9].some((d) => inBody(x + d, y) !== inside || inBody(x, y + d) !== inside);
      if (!near) far.push([x, y]);
    }
    expect(far).toEqual([]);
  });

  it('detects the soundhole and builds the body-top texture', () => {
    const gray = luminance(img);
    const sh = detectSoundhole(gray, sol.frame, sol.scaleLengthCm);
    expect(sh.confident).toBe(true);
    expect(Math.abs(sh.x - SYN.hole.x)).toBeLessThan(0.5);
    expect(Math.abs(sh.y)).toBeLessThan(0.5);
    expect(Math.abs(sh.radiusCm - SYN.hole.r)).toBeLessThan(0.5);

    const seg = segmentGuitar(img);
    const body = extractBody(seg.mask, sol.frame, sol.scaleLengthCm);
    const tex = rectifyBodyTop(img, sol.frame, body.outline, body.bounds, 8);
    const wCm = body.bounds.maxX - body.bounds.minX, hCm = body.bounds.maxY - body.bounds.minY;
    expect(tex.width).toBe(Math.round(wCm * 8));
    expect(tex.height).toBe(Math.round(hCm * 8));
    const at = (x: number, y: number) => {
      const i = Math.floor(((x - body.bounds.minX) / wCm) * tex.width);
      const j = Math.floor(((body.bounds.maxY - y) / hCm) * tex.height);
      return Array.from(tex.data.slice((j * tex.width + i) * 4, (j * tex.width + i) * 4 + 4));
    };
    expect(at(SYN.hole.x, 0)[0]).toBeLessThan(20);
    expect(at(SYN.hole.x, 0)[3]).toBe(255);
    expect(at(-70, 10)[0]).toBeGreaterThan(30);
    expect(at(-70, 10)[0]).toBeLessThan(70);
    expect(tex.data[3]).toBe(0); // corner outside the outline

    expect(toHex(maskedMedianColor(img, body.bodyMask))).toMatch(/^#[23][0-9a-f]/);
    expect(fromHex(toHex([48, 36, 28]))).toEqual([48, 36, 28]);
    expect(sampleColorAt(img, toImage(truth, [-70, 10]), 3)[0]).toBeCloseTo(48, -1);

    const prof = assembleProfile({ name: 'Sentetik', totalLengthCm: 108, scaleLengthCm: sol.scaleLengthCm, body, soundhole: sh });
    expect(prof.bodyJoinFret).toBe(Math.min(16, Math.max(12, Math.round(-12 * Math.log2(1 + body.bounds.maxX / sol.scaleLengthCm)))));
    expect(prof.body.bridge.x).toBeLessThan(-SYN.scale);
    expect(prof.body.bounds).toEqual(body.bounds);
    expect(prof.finish.gloss).toBeGreaterThan(0);
  });

  it('measures bouts of a simple outline', () => {
    const rect: [number, number][] = [[-10, 5], [0, 5], [0, -5], [-10, -5]];
    expect(measureBouts(rect).lowerCm).toBeCloseTo(10, 5);
  });
});
