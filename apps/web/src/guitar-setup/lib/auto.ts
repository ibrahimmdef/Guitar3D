/** Landmark guesses from the segmentation mask alone (quick mode and pre-filled handles). */
import { type Mask, type Pt } from './image';
import type { Landmarks } from './geometry';

/** Typical acoustic proportions as fractions of the overall length, measured from the headstock tip. */
export const TYPICAL = { nut: 0.165, saddle: 0.775, scaleOverTotal: 0.61 };

/**
 * Principal axis of the mask → headstock tip (narrow end) and body end (wide end); nut and saddle
 * are placed at typical proportions, the nut refined to where the headstock narrows into the neck.
 * Returns null for an empty or blob-like mask. Points are in the mask's pixel space.
 */
export function autoLandmarks(mask: Mask): (Landmarks & { fret: undefined }) | null {
  const { width: w, height: h, data } = mask;
  let n = 0, mx = 0, my = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) { n++; mx += x; my += y; }
  if (n < 50) return null;
  mx /= n;
  my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ax: Pt = [Math.cos(theta), Math.sin(theta)];
  const nx: Pt = [-ax[1], ax[0]];
  // width profile along the axis
  let lo = Infinity, hi = -Infinity;
  const proj = (x: number, y: number) => (x - mx) * ax[0] + (y - my) * ax[1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) { const t = proj(x, y); if (t < lo) lo = t; if (t > hi) hi = t; }
  const len = hi - lo;
  if (len < 20) return null;
  const B = Math.max(40, Math.min(400, Math.round(len)));
  const count = new Float64Array(B), off = new Float64Array(B);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) {
    const i = Math.min(B - 1, Math.floor(((proj(x, y) - lo) / len) * B));
    count[i]++;
    off[i] += (x - mx) * nx[0] + (y - my) * nx[1];
  }
  const binLen = len / B;
  const width = Array.from(count, (c) => c / binLen);
  if (Math.max(...width) > 0.85 * len) return null; // not elongated
  // the body is the wide half
  const half = B >> 1;
  const sum = (a: number, b: number) => width.slice(a, b).reduce((s, v) => s + v, 0);
  const bodyAtHi = sum(half, B) > sum(0, half);
  // t from the headstock tip (0) to the body end (1)
  const bin = (t: number) => Math.max(0, Math.min(B - 1, Math.round((bodyAtHi ? t : 1 - t) * (B - 1))));
  // centre line through the centres of the neck-ish and body parts (robust to clutter on one side)
  const centreAt = (t: number) => {
    const i = bin(t);
    const o = count[i] ? off[i] / count[i] : 0;
    const s = lo + ((i + 0.5) / B) * len;
    return [mx + ax[0] * s + nx[0] * o, my + ax[1] * s + nx[1] * o] as Pt;
  };
  const med = (a: number, b: number) => {
    const pts: Pt[] = [];
    for (let t = a; t <= b; t += 0.02) pts.push(centreAt(t));
    const xs = pts.map((p) => p[0]).sort((p, q) => p - q), ys = pts.map((p) => p[1]).sort((p, q) => p - q);
    return [xs[xs.length >> 1], ys[ys.length >> 1]] as Pt;
  };
  const a = med(0.03, 0.14); // headstock
  const b = med(0.6, 0.95); // body
  const dir: Pt = [b[0] - a[0], b[1] - a[1]];
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  ax = [dir[0] / dl, dir[1] / dl];
  // extent of the mask along the refined line, near the line only (ignores clutter far to the side)
  const maxW = Math.max(...width);
  let t0 = Infinity, t1 = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) {
    const t = (x - a[0]) * ax[0] + (y - a[1]) * ax[1];
    const o = Math.abs(-(x - a[0]) * ax[1] + (y - a[1]) * ax[0]);
    if (o > 0.08 * maxW) continue;
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
  }
  const at = (t: number): Pt => [a[0] + ax[0] * (t0 + t * (t1 - t0)), a[1] + ax[1] * (t0 + t * (t1 - t0))];
  // nut: steepest narrowing between 9 % and 24 % of the length (headstock → neck), else the typical spot
  let nutT = TYPICAL.nut, best = 0;
  const wAt = (t: number) => width[bin(t)];
  for (let t = 0.09; t <= 0.24; t += 0.005) {
    const drop = wAt(t - 0.03) - wAt(t + 0.03);
    if (drop > best) [best, nutT] = [drop, t];
  }
  if (best < 0.15 * wAt(0.08)) nutT = TYPICAL.nut;
  return { headTip: at(0), nut: at(nutT), fret: undefined, saddle: at(nutT + TYPICAL.scaleOverTotal), bodyEnd: at(1) };
}
