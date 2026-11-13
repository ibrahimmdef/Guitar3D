/** Body outline, measurements, soundhole detection and the rectified body-top texture. */
import type { Point2 } from '@guitar3d/shared';
import { createImage, median, sampleBilinear, sampleGray, type GrayImage, type Mask, type Pt, type RGBAImage } from './image';
import { crossingsAtX, polygonArea, rasterizePolygon, resampleClosed, smoothClosed, traceContour } from './contour';
import { closeDiskFilled, floodFill, largestComponent, maskArea, openDisk } from './segment';
import { fretDistance, pxPerCmAt, toGuitar, toImage, type PhotoFrame } from './geometry';

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface BodyMeasurements {
  outline: Point2[];
  bounds: Bounds;
  lengthCm: number;
  bouts: { upperCm: number; waistCm: number; lowerCm: number; upperX: number; waistX: number; lowerX: number };
  /** Neck width measured from the mask around frets 3–9 (cm). */
  neckWidthCm: number;
  /** Body-only mask (same size as the input mask). */
  bodyMask: Mask;
}

/** Full width (cm) of the mask across the guitar at position x, scanning ±halfSpan cm. */
export function maskWidthAt(mask: Mask, frame: PhotoFrame, x: number, halfSpan = 30): number {
  const step = 1 / pxPerCmAt(frame, x);
  let count = 0;
  for (let y = -halfSpan; y <= halfSpan; y += step) {
    const [px, py] = toImage(frame, [x, y]);
    const ix = Math.floor(px), iy = Math.floor(py);
    if (ix >= 0 && iy >= 0 && ix < mask.width && iy < mask.height && mask.data[iy * mask.width + ix]) count++;
  }
  return count * step;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Width of a closed outline at x (max - min crossing). */
export function outlineWidthAt(outline: Point2[], x: number) {
  const ys = crossingsAtX(outline as Pt[], x);
  return ys.length >= 2 ? ys[ys.length - 1] - ys[0] : 0;
}

export function outlineBounds(outline: Point2[]): Bounds {
  return {
    minX: Math.min(...outline.map((p) => p[0])),
    maxX: Math.max(...outline.map((p) => p[0])),
    minY: Math.min(...outline.map((p) => p[1])),
    maxY: Math.max(...outline.map((p) => p[1])),
  };
}

export function measureBouts(outline: Point2[]) {
  const b = outlineBounds(outline);
  const N = 200;
  const xs = Array.from({ length: N }, (_, i) => b.minX + ((i + 0.5) / N) * (b.maxX - b.minX));
  const ws = xs.map((x) => outlineWidthAt(outline, x));
  // Waist = narrowest point in the middle of the body; bouts = widest points either side of it.
  let waist = Infinity, waistX = (b.minX + b.maxX) / 2;
  xs.forEach((x, i) => {
    const t = (x - b.minX) / (b.maxX - b.minX);
    if (t > 0.3 && t < 0.8 && ws[i] < waist) [waist, waistX] = [ws[i], x];
  });
  let lower = 0, lowerX = b.minX, upper = 0, upperX = b.maxX;
  xs.forEach((x, i) => {
    if (x <= waistX && ws[i] > lower) [lower, lowerX] = [ws[i], x];
    if (x >= waistX && ws[i] > upper) [upper, upperX] = [ws[i], x];
  });
  if (!Number.isFinite(waist)) waist = Math.min(lower, upper);
  return { upperCm: r2(upper), waistCm: r2(waist), lowerCm: r2(lower), upperX: r2(upperX), waistX: r2(waistX), lowerX: r2(lowerX) };
}

/**
 * Mirror-symmetric version of an outline about the centre line (y = 0): at every x the half width is
 * the smaller of the two sides. A photo taken slightly from the side shows the guitar's rim (and
 * shadows or clutter stick to one side only), which only ever adds to the silhouette.
 */
export function symmetrizeOutline(outline: Point2[], points = outline.length): Point2[] {
  const b = outlineBounds(outline);
  const cx = (b.minX + b.maxX) / 2, hw = (b.maxX - b.minX) / 2;
  const M = 200;
  const top: Pt[] = [];
  for (let i = 0; i <= M; i++) {
    const x = cx - hw * Math.cos((i / M) * Math.PI); // dense at both ends
    const ys = crossingsAtX(outline as Pt[], Math.min(b.maxX - 1e-6, Math.max(b.minX + 1e-6, x)));
    const half = ys.length >= 2 ? Math.max(0, Math.min(ys[ys.length - 1], -ys[0])) : 0;
    top.push([x, i === 0 || i === M ? Math.min(half, 0.01) : half]);
  }
  // clockwise in the x-right / y-up frame: along +y from the tail to the neck, back along -y
  const loop: Pt[] = [...top, ...top.slice(1, -1).reverse().map(([x, y]) => [x, -y] as Pt)];
  return resampleClosed(loop, points) as Point2[];
}

export interface ExtractBodyOptions {
  points?: number;
  /** Mirror the outline about the centre line (default true; turn off for cutaway bodies). */
  symmetric?: boolean;
}

/**
 * Separates the body from neck + headstock with a morphological opening wider than the neck, traces
 * the outline and converts it to the guitar frame. `frame` must be in the mask's pixel space.
 */
export function extractBody(mask: Mask, frame: PhotoFrame, scaleLengthCm: number, options: ExtractBodyOptions | number = {}): BodyMeasurements {
  const opts: ExtractBodyOptions = typeof options === 'number' ? { points: options } : options;
  const points = opts.points ?? 240;
  const neckSamples: number[] = [];
  for (let n = 3; n <= 9; n++) neckSamples.push(maskWidthAt(mask, frame, -fretDistance(scaleLengthCm, n), 10));
  const measured = median(neckSamples.filter((w) => w > 0));
  // On busy photos the neck may be missing from the mask or fused with clutter: fall back to a typical width.
  const neckWidthCm = measured >= 3.5 && measured <= 8 ? measured : 5.5;
  const ppc = pxPerCmAt(frame, -scaleLengthCm * 0.8);
  const r = Math.max(1, Math.round(0.7 * neckWidthCm * ppc));
  // Seal the fretboard channel / soundhole first so the opening sees a solid body.
  const solid = closeDiskFilled(mask, Math.max(1, Math.round(0.45 * neckWidthCm * ppc)));
  const opened = openDisk(solid, r);
  // Seed between soundhole and bridge: certainly body.
  const seed = toImage(frame, [-scaleLengthCm * 0.88, 0]);
  let body = floodFill(opened, seed);
  if (maskArea(body) === 0) body = largestComponent(opened);
  if (maskArea(body) === 0) throw new Error('Gövde maskeden ayrılamadı. Eşiği düşürmeyi ya da gövdeye tıklamayı dene.');
  const contour = traceContour(body);
  let outline = smoothClosed(contour.map((p) => toGuitar(frame, p)), 2);
  outline = resampleClosed(outline, points);
  if (opts.symmetric !== false) outline = symmetrizeOutline(outline as Point2[], points) as Pt[];
  if (polygonArea(outline) > 0) outline.reverse(); // clockwise in the x-right / y-up guitar frame
  const out = outline.map(([x, y]) => [r2(x), r2(y)] as Point2);
  const bounds = outlineBounds(out);
  return { outline: out, bounds, lengthCm: r2(bounds.maxX - bounds.minX), bouts: measureBouts(out), neckWidthCm: r2(neckWidthCm), bodyMask: body };
}

export interface SoundholeGuess {
  x: number;
  y: number;
  radiusCm: number;
  /** Mean luminance step across the rim; > ~12 is a clear hole. */
  score: number;
  confident: boolean;
}

/**
 * Looks for a dark circle on the centre line around the 19th–20th fret position (where acoustic
 * soundholes sit). `gray` and `frame` share pixel space.
 */
export function detectSoundhole(gray: GrayImage, frame: PhotoFrame, scaleLengthCm: number, opts: { xRange?: [number, number]; rRange?: [number, number] } = {}): SoundholeGuess {
  const [x0, x1] = opts.xRange ?? [-scaleLengthCm * 0.8, -scaleLengthCm * 0.56];
  const [rmin, rmax] = opts.rRange ?? [3.5, 6.5];
  const step = Math.max(0.2, 1.5 / pxPerCmAt(frame, (x0 + x1) / 2));
  const A = 36;
  const cos = Array.from({ length: A }, (_, i) => Math.cos((i / A) * 2 * Math.PI));
  const sin = Array.from({ length: A }, (_, i) => Math.sin((i / A) * 2 * Math.PI));
  const L = (x: number, y: number) => {
    const [px, py] = toImage(frame, [x, y]);
    return sampleGray(gray, px, py);
  };
  const ringMean = (cx: number, cy: number, r: number) => {
    let s = 0;
    for (let i = 0; i < A; i++) s += L(cx + r * cos[i], cy + r * sin[i]);
    return s / A;
  };
  let best: SoundholeGuess = { x: (x0 + x1) / 2, y: 0, radiusCm: 5, score: -Infinity, confident: false };
  const d = 0.35;
  for (let cx = x0; cx <= x1; cx += step) {
    for (let cy = -2; cy <= 2; cy += step) {
      for (let r = rmin; r <= rmax; r += step) {
        // edge strength: brighter just outside than just inside, plus darker inside overall
        const edge = ringMean(cx, cy, r + d) - ringMean(cx, cy, r - d);
        const contrast = ringMean(cx, cy, r * 1.25) - ringMean(cx, cy, r * 0.55);
        const score = edge + 0.5 * contrast;
        if (score > best.score) best = { x: cx, y: cy, radiusCm: r, score, confident: false };
      }
    }
  }
  best.confident = best.score > 12;
  best.x = r2(best.x);
  best.y = r2(best.y);
  best.radiusCm = r2(best.radiusCm);
  best.score = r2(best.score);
  return best;
}

/**
 * Rectified body-top texture: u → x (left = minX/tail), rows top → bottom = maxY (low E) → minY.
 * Alpha comes from the outline (anti-aliased). `frame` is in `img`'s pixel space.
 */
export function rectifyBodyTop(img: RGBAImage, frame: PhotoFrame, outline: Point2[], bounds: Bounds = outlineBounds(outline), pxPerCm = 16, maxDim = 2048): RGBAImage {
  const wCm = bounds.maxX - bounds.minX;
  const hCm = bounds.maxY - bounds.minY;
  const ppc = Math.min(pxPerCm, maxDim / Math.max(wCm, hCm));
  const W = Math.max(1, Math.round(wCm * ppc));
  const H = Math.max(1, Math.round(hCm * ppc));
  const poly = outline.map(([x, y]) => [((x - bounds.minX) / wCm) * W, ((bounds.maxY - y) / hCm) * H] as Pt);
  const alpha = rasterizePolygon(poly, W, H);
  const out = createImage(W, H);
  const px = [0, 0, 0, 0];
  for (let j = 0; j < H; j++) {
    const y = bounds.maxY - ((j + 0.5) / H) * hCm;
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!alpha[k]) continue;
      const x = bounds.minX + ((i + 0.5) / W) * wCm;
      const [ix, iy] = toImage(frame, [x, y]);
      sampleBilinear(img, ix, iy, px);
      out.data[k * 4] = px[0];
      out.data[k * 4 + 1] = px[1];
      out.data[k * 4 + 2] = px[2];
      out.data[k * 4 + 3] = alpha[k];
    }
  }
  return out;
}
