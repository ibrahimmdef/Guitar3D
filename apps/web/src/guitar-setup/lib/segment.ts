/**
 * Guitar vs background segmentation: colour distance from a sampled background, threshold,
 * morphological open/close, hole filling and component selection (seed click or largest).
 */
import { createMask, median, type Mask, type Pt, type RGBAImage } from './image';

export type RGB = [number, number, number];

/** Median colour of a border band (fraction of the shorter side). Photos are usually framed with background around the guitar. */
export function sampleBackground(img: RGBAImage, band = 0.04): RGB {
  const { width: w, height: h, data } = img;
  const b = Math.max(1, Math.round(Math.min(w, h) * band));
  const r: number[] = [], g: number[] = [], bl: number[] = [];
  const step = Math.max(1, Math.floor((w * h) / 40000));
  let k = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= b && x < w - b && y >= b && y < h - b) continue;
      if (k++ % step) continue;
      const i = (y * w + x) * 4;
      r.push(data[i]);
      g.push(data[i + 1]);
      bl.push(data[i + 2]);
    }
  }
  return [median(r), median(g), median(bl)];
}

/**
 * Background palette: k-means (k ≤ `k`) over the border band. Real photos rarely have a single
 * background colour (wall + floor, patterned wallpaper), so the distance map uses the nearest of
 * these. Clusters are sorted by size; tiny ones (< 2 % of the band) are dropped.
 */
function kmeans(px: RGB[], k: number, minShare = 0.02): RGB[] {
  if (!px.length) return [];
  // deterministic init: spread along luminance order
  const sorted = [...px].sort((a, c) => a[0] + a[1] + a[2] - (c[0] + c[1] + c[2]));
  let centres: RGB[] = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]);
  let counts = new Array<number>(k).fill(0);
  for (let it = 0; it < 12; it++) {
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const d = (p[0] - centres[c][0]) ** 2 + (p[1] - centres[c][1]) ** 2 + (p[2] - centres[c][2]) ** 2;
        if (d < bd) [bd, bi] = [d, c];
      }
      sum[bi][0] += p[0];
      sum[bi][1] += p[1];
      sum[bi][2] += p[2];
      sum[bi][3]++;
    }
    centres = centres.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c));
    counts = sum.map((s) => s[3]);
  }
  const order = centres.map((c, i) => ({ c, n: counts[i] })).sort((a, c) => c.n - a.n).filter((e, i) => i === 0 || e.n >= minShare * px.length);
  // merge near-duplicates
  const out: RGB[] = [];
  for (const e of order) if (!out.some((o) => rgbDist(o, e.c) < 12)) out.push(e.c);
  return out;
}

const rgbDist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** True when `c` looks like background colour `b` in shadow (same hue, 55–110 % of its brightness). */
function isShadeOf(c: RGB, b: RGB) {
  const s = (c[0] * b[0] + c[1] * b[1] + c[2] * b[2]) / (b[0] * b[0] + b[1] * b[1] + b[2] * b[2] || 1);
  return s >= 0.55 && s <= 1.1 && rgbDist(c, [b[0] * s, b[1] * s, b[2] * s]) < 18;
}

function collect(img: RGBAImage, x0: number, y0: number, x1: number, y1: number, max = 6000, skip?: (x: number, y: number) => boolean): RGB[] {
  const { width: w, height: h, data } = img;
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1));
  y1 = Math.min(h, Math.ceil(y1));
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / max)));
  const px: RGB[] = [];
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      if (skip?.(x, y)) continue;
      const i = (y * w + x) * 4;
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return px;
}

/**
 * Background palette: k-means (k ≤ `k`) over the border band. Real photos rarely have a single
 * background colour (wall + floor, patterned wallpaper), so the distance map uses the nearest of
 * these. Clusters are sorted by size; tiny ones (< 2 % of the band) are dropped.
 */
export function sampleBackgroundPalette(img: RGBAImage, k = 5, band = 0.04): RGB[] {
  const { width: w, height: h } = img;
  const b = Math.max(1, Math.round(Math.min(w, h) * band));
  const px = collect(img, 0, 0, w, h, w * h, (x, y) => x >= b && x < w - b && y >= b && y < h - b);
  const step = Math.max(1, Math.floor(px.length / 6000));
  const out = kmeans(px.filter((_, i) => i % step === 0), k);
  return out.length ? out : [[255, 255, 255]];
}

/** Colours of a patch around `p` (k-means, k ≤ 3): what a click on the guitar / on the background samples. */
export function samplePatchPalette(img: RGBAImage, p: Pt, radiusFrac = 0.025, k = 3): RGB[] {
  const r = Math.max(2, Math.round(Math.max(img.width, img.height) * radiusFrac));
  return kmeans(collect(img, p[0] - r, p[1] - r, p[0] + r + 1, p[1] + r + 1), k, 0.1);
}

/**
 * Guess of the guitar's own colours when the user has not clicked yet: clusters of the central part of
 * the photo that do not look like any background colour.
 */
export function sampleForegroundPalette(img: RGBAImage, background: RGB[], k = 4): RGB[] {
  const { width: w, height: h } = img;
  const px = collect(img, w * 0.4, h * 0.3, w * 0.6, h * 0.7);
  // The dominant non-background cluster is the guitar; smaller ones must stand out more clearly, since
  // shaded wallpaper/floor patterns next to the guitar also land in the centre crop.
  const fg = kmeans(px, k, 0.06).filter((c) => background.every((b) => rgbDist(b, c) > 40 && !isShadeOf(c, b)));
  return fg.filter((c, i) => i === 0 || background.every((b) => rgbDist(b, c) > 60));
}

/** Distance to the nearest palette colour (see colorDistance). */
export function paletteDistance(img: RGBAImage, palette: RGB[]): Float32Array {
  let out = colorDistance(img, palette[0]);
  for (let k = 1; k < palette.length; k++) {
    const d = colorDistance(img, palette[k]);
    for (let i = 0; i < out.length; i++) if (d[i] < out[i]) out[i] = d[i];
  }
  return out;
}

/**
 * Per-pixel distance from the background colour, 0..~441. Mixes RGB distance with a weighted
 * luminance difference so both colour and brightness contrasts count.
 */
export function colorDistance(img: RGBAImage, bg: RGB): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  const bgL = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] - bg[0], g = d[i * 4 + 1] - bg[1], b = d[i * 4 + 2] - bg[2];
    const l = Math.abs(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2] - bgL);
    out[i] = Math.max(Math.sqrt(r * r + g * g + b * b), l * 1.2);
  }
  return out;
}

/** Otsu's threshold over values in [0, max]. */
export function otsuThreshold(values: ArrayLike<number>, max = 442, bins = 256): number {
  const hist = new Float64Array(bins);
  for (let i = 0; i < values.length; i++) hist[Math.min(bins - 1, Math.floor((values[i] / max) * bins))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestT = 0, bestEnd = 0;
  for (let t = 0; t < bins; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best * (1 + 1e-9)) {
      best = between;
      bestT = bestEnd = t;
    } else if (between >= best * (1 - 1e-9)) bestEnd = t;
  }
  // Empty bins between two clusters give a plateau; take its middle.
  return (((bestT + bestEnd) / 2 + 1) / bins) * max;
}

export function thresholdMask(values: ArrayLike<number>, width: number, height: number, t: number): Mask {
  const m = createMask(width, height);
  for (let i = 0; i < m.data.length; i++) m.data[i] = values[i] > t ? 1 : 0;
  return m;
}

/** 1-D running min/max over a window of radius r (O(n) via counts on binary data). */
function morph1d(src: Uint8Array, dst: Uint8Array, len: number, stride: number, offset: number, r: number, erode: boolean) {
  // count of ones in window [i-r, i+r]
  let count = 0;
  const at = (i: number) => (i < 0 || i >= len ? (erode ? 0 : 0) : src[offset + i * stride]);
  for (let i = -r; i <= r; i++) count += at(i);
  for (let i = 0; i < len; i++) {
    const lo = Math.max(0, i - r), hi = Math.min(len - 1, i + r);
    const size = erode ? 2 * r + 1 : hi - lo + 1;
    dst[offset + i * stride] = erode ? (count === size ? 1 : 0) : count > 0 ? 1 : 0;
    count += at(i + r + 1) - at(i - r);
  }
}

function morph(m: Mask, r: number, erode: boolean): Mask {
  if (r <= 0) return { ...m, data: m.data.slice() };
  const { width: w, height: h } = m;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) morph1d(m.data, tmp, w, 1, y * w, r, erode);
  for (let x = 0; x < w; x++) morph1d(tmp, out, h, w, x, r, erode);
  return { width: w, height: h, data: out };
}

/** Square structuring element of side 2r+1. Outside the image counts as background. */
export const erode = (m: Mask, r: number) => morph(m, r, true);
export const dilate = (m: Mask, r: number) => morph(m, r, false);
export const open = (m: Mask, r: number) => dilate(erode(m, r), r);
export const close = (m: Mask, r: number) => erode(dilate(m, r), r);

/** 4-connected flood fill of pixels equal to `value` starting at `seed`; returns the filled region. */
export function floodFill(m: Mask, seed: Pt, value = 1): Mask {
  const { width: w, height: h } = m;
  const out = createMask(w, h);
  const sx = Math.floor(seed[0]), sy = Math.floor(seed[1]);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || m.data[sy * w + sx] !== value) return out;
  const stack = new Int32Array(w * h);
  let sp = 0;
  stack[sp++] = sy * w + sx;
  out.data[sy * w + sx] = 1;
  while (sp) {
    const i = stack[--sp];
    const x = i % w, y = (i - x) / w;
    const push = (j: number) => {
      if (!out.data[j] && m.data[j] === value) {
        out.data[j] = 1;
        stack[sp++] = j;
      }
    };
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  return out;
}

/** Fills background regions not connected to the image border (e.g. the dark soundhole). */
export function fillHoles(m: Mask): Mask {
  const { width: w, height: h } = m;
  const outside = createMask(w, h);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!m.data[i] && !outside.data[i]) {
      outside.data[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i - x) / w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  const out = createMask(w, h);
  for (let i = 0; i < out.data.length; i++) out.data[i] = outside.data[i] ? 0 : 1;
  return out;
}

/** Largest 4-connected foreground component. */
export function largestComponent(m: Mask): Mask {
  const { width: w, height: h } = m;
  const label = new Int32Array(w * h);
  let best = 0, bestSize = 0, next = 1;
  const stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!m.data[s] || label[s]) continue;
    let sp = 0, size = 0;
    stack[sp++] = s;
    label[s] = next;
    while (sp) {
      const i = stack[--sp];
      size++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
      for (const j of nb) {
        if (j >= 0 && m.data[j] && !label[j]) {
          label[j] = next;
          stack[sp++] = j;
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
    next++;
  }
  const out = createMask(w, h);
  for (let i = 0; i < out.data.length; i++) out.data[i] = label[i] === best && best ? 1 : 0;
  return out;
}

export const maskArea = (m: Mask) => m.data.reduce((s, v) => s + v, 0);

export function maskBBox(m: Mask) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (!m.data[y * m.width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

export interface SegmentOptions {
  /** Distance threshold (0..441). Default: Otsu on the distance map. */
  threshold?: number;
  /** A click inside the guitar body (image px). Picks that component instead of the largest. */
  seed?: Pt;
  /** Morphology radius in px (default ~0.4% of the longer side). */
  radius?: number;
  background?: RGB;
  /** Explicit background colours (overrides the automatic border palette). */
  palette?: RGB[];
  /** Extra clicks on the guitar (image px): their colours join the foreground model. The first one also acts as `seed`. */
  fgSeeds?: Pt[];
  /** Clicks on background that leaked into the mask: their colours join the background model. */
  bgSeeds?: Pt[];
  /** Explicit guitar colours (skips the automatic centre sampling). Pass [] to force plain background distance. */
  foreground?: RGB[];
}

export interface SegmentResult {
  mask: Mask;
  threshold: number;
  background: RGB;
  /** Background colours the distance map was computed against. */
  palette: RGB[];
  /** Guitar colours used by the two-model classification (empty: background distance + Otsu). */
  foreground: RGB[];
  /** Distance map, handy for a live threshold slider without recomputing. */
  distance: Float32Array;
  area: number;
}

/**
 * Score map 0..442: how much more a pixel looks like the guitar than like the background,
 * 442 · dBg / (dBg + dFg). 221 means "equally far from both models".
 */
export function modelScore(img: RGBAImage, background: RGB[], foreground: RGB[]): Float32Array {
  const dB = paletteDistance(img, background);
  const dF = paletteDistance(img, foreground);
  const out = new Float32Array(dB.length);
  for (let i = 0; i < out.length; i++) out[i] = (442 * dB[i]) / (dB[i] + dF[i] + 1e-3);
  return out;
}

/** Threshold used with a foreground model: slightly on the guitar's side of "equally far". */
export const MODEL_THRESHOLD = 221;

/**
 * Full pipeline on a (preferably downscaled) photo.
 *
 * Two colour models are compared per pixel: the background (border band + `bgSeeds`) and the guitar
 * (centre of the photo, or the user's `fgSeeds`). Without any usable guitar colour it falls back to
 * the distance from the background with Otsu's threshold. `cachedDistance` must come from a call
 * with the same seeds/palettes (only the threshold may differ).
 */
export function segmentGuitar(img: RGBAImage, opts: SegmentOptions = {}, cachedDistance?: Float32Array): SegmentResult {
  let palette = opts.palette ?? (opts.background ? [opts.background] : sampleBackgroundPalette(img));
  for (const p of opts.bgSeeds ?? []) palette = [...palette, ...samplePatchPalette(img, p)];
  const background = palette[0];
  const seeds = opts.fgSeeds ?? [];
  let foreground = opts.foreground ?? (seeds.length ? [] : opts.palette || opts.background ? [] : sampleForegroundPalette(img, palette));
  for (const p of seeds) foreground = [...foreground, ...samplePatchPalette(img, p)];
  const useModel = foreground.length > 0;
  const distance = cachedDistance ?? (useModel ? modelScore(img, palette, foreground) : paletteDistance(img, palette));
  const threshold = opts.threshold ?? (useModel ? MODEL_THRESHOLD : otsuThreshold(distance));
  const r = opts.radius ?? Math.max(1, Math.round(Math.max(img.width, img.height) * 0.004));
  let m = thresholdMask(distance, img.width, img.height, threshold);
  m = close(open(close(m, r), r), r * 2);
  m = fillHoles(m);
  const seed = opts.seed ?? seeds[0];
  let comp = seed ? floodFill(m, seed) : null;
  if (!comp || maskArea(comp) === 0) comp = largestComponent(m);
  return { mask: comp, threshold, background, palette, foreground, distance, area: maskArea(comp) };
}

/**
 * Approximate Euclidean distance (px) of every pixel to the nearest pixel with value `target`
 * (two-pass 5-7-11 chamfer, error < 2 %). Outside the image counts as `target` when `borderIsTarget`.
 */
export function distanceTransform(m: Mask, target: 0 | 1, borderIsTarget = true): Float32Array {
  const { width: w, height: h } = m;
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = m.data[i] === target ? 0 : INF;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? (borderIsTarget ? 0 : INF) : d[y * w + x]);
  const fwd: [number, number, number][] = [[-1, 0, 5], [-1, -1, 7], [0, -1, 5], [1, -1, 7], [-2, -1, 11], [-1, -2, 11], [1, -2, 11], [2, -1, 11]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = d[y * w + x];
      for (const [dx, dy, c] of fwd) v = Math.min(v, at(x + dx, y + dy) + c);
      d[y * w + x] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      let v = d[y * w + x];
      for (const [dx, dy, c] of fwd) v = Math.min(v, at(x - dx, y - dy) + c);
      d[y * w + x] = v;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 5;
  return d;
}

/** Opening with a disc of radius r: removes parts narrower than 2r (e.g. the neck) without shaving round edges. */
export function openDisk(m: Mask, r: number): Mask {
  const toBg = distanceTransform(m, 0);
  const core = createMask(m.width, m.height);
  for (let i = 0; i < core.data.length; i++) core.data[i] = toBg[i] > r ? 1 : 0;
  const toCore = distanceTransform(core, 1, false);
  const out = createMask(m.width, m.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = toCore[i] <= r + 0.5 && m.data[i] ? 1 : 0;
  return out;
}

/** Closing with a disc of radius r followed by hole filling: seals channels narrower than 2r (the fretboard gap, string shadows) and fills the soundhole. */
export function closeDiskFilled(m: Mask, r: number): Mask {
  const toFg = distanceTransform(m, 1, false);
  const grown = createMask(m.width, m.height);
  for (let i = 0; i < grown.data.length; i++) grown.data[i] = toFg[i] <= r ? 1 : 0;
  const filled = fillHoles(grown);
  // the image border must not count as background here, or bodies touching the frame would be eaten
  const toBg = distanceTransform(filled, 0, false);
  const out = createMask(m.width, m.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = toBg[i] > r || m.data[i] ? 1 : 0;
  return fillHoles(out);
}
