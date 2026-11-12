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
}

export interface SegmentResult {
  mask: Mask;
  threshold: number;
  background: RGB;
  /** Distance map, handy for a live threshold slider without recomputing. */
  distance: Float32Array;
  area: number;
}

/** Full pipeline on a (preferably downscaled) photo. */
export function segmentGuitar(img: RGBAImage, opts: SegmentOptions = {}, cachedDistance?: Float32Array): SegmentResult {
  const background = opts.background ?? sampleBackground(img);
  const distance = cachedDistance ?? colorDistance(img, background);
  const threshold = opts.threshold ?? otsuThreshold(distance);
  const r = opts.radius ?? Math.max(1, Math.round(Math.max(img.width, img.height) * 0.004));
  let m = thresholdMask(distance, img.width, img.height, threshold);
  m = close(open(m, r), r * 2);
  m = fillHoles(m);
  let comp = opts.seed ? floodFill(m, opts.seed) : null;
  if (!comp || maskArea(comp) === 0) comp = largestComponent(m);
  return { mask: comp, threshold, background, distance, area: maskArea(comp) };
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
