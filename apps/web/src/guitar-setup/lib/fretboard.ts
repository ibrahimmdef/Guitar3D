/**
 * Fretboard close-up: fret-wire detection and the fret-by-fret warp ported from
 * scripts/build-veston-textures.py (build_fretboard).
 */
import { createImage, dist, lerp, lerpPt, median, sampleBilinear, sampleGray, type GrayImage, type Pt, type RGBAImage } from './image';

/** A fret wire in image px: `low` = end on the low E edge, `high` = end on the high e edge. n = 0 is the nut. */
export interface FretLine {
  n: number;
  low: Pt;
  high: Pt;
  /** 0..1, 1 = clicked by the user or a clear peak; 0 = position predicted from 12-TET only. */
  confidence: number;
}

/** Relative position of fret n between the nut (0) and fret N (1) on a straight, undistorted board. */
export const tetFraction = (n: number, N: number) => (1 - 2 ** (-n / 12)) / (1 - 2 ** (-N / 12));

export interface DetectInput {
  nut: { low: Pt; high: Pt };
  /** The last fret the user marked and its number. */
  last: { n: number; low: Pt; high: Pt };
}

/** Bilinear quad nut → last fret: t along the neck (0 nut, 1 last), v across (0 low E edge, 1 high e edge). */
export function quadMap(inp: DetectInput) {
  return (t: number, v: number): Pt => lerpPt(lerpPt(inp.nut.low, inp.last.low, t), lerpPt(inp.nut.high, inp.last.high, t), v);
}

/** Mean luminance per strip column for v in [v0, v1], `len` samples along t. */
export function stripProfile(gray: GrayImage, map: (t: number, v: number) => Pt, len: number, v0: number, v1: number, rows = 12): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = (i + 0.5) / len;
    let s = 0;
    for (let r = 0; r < rows; r++) {
      const [x, y] = map(t, lerp(v0, v1, (r + 0.5) / rows));
      s += sampleGray(gray, x, y);
    }
    out[i] = s / rows;
  }
  return out;
}

/** Profile minus its moving average (window 2w+1): thin bright lines become positive peaks. */
export function highPass(p: Float32Array, w: number): Float32Array {
  const n = p.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + p[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n, i + w + 1);
    out[i] = p[i] - (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

/** Index of the maximum of `p` in [a, b] with sub-sample parabolic refinement. */
function peakIn(p: Float32Array, a: number, b: number) {
  a = Math.max(1, Math.floor(a));
  b = Math.min(p.length - 2, Math.ceil(b));
  let bi = -1, bv = -Infinity;
  for (let i = a; i <= b; i++) if (p[i] > bv) [bv, bi] = [p[i], i];
  if (bi < 0) return { pos: (a + b) / 2, value: 0 };
  const l = p[bi - 1], c = p[bi], r = p[bi + 1];
  const den = l - 2 * c + r;
  const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
  return { pos: bi + off, value: bv };
}

/** Fits t = a·s / (1 + b·s) with a = 1 + b (so t(1) = 1): a 1-D perspective between nut and last fret. */
export function fitPerspective(samples: { s: number; t: number }[]): (s: number) => number {
  let best = 0, bestErr = Infinity;
  for (let b = -0.6; b <= 0.6; b += 0.005) {
    let e = 0;
    for (const { s, t } of samples) e += ((1 + b) * s / (1 + b * s) - t) ** 2;
    if (e < bestErr) [bestErr, best] = [e, b];
  }
  return (s) => ((1 + best) * s) / (1 + best * s);
}

/**
 * Finds the fret wires between the nut and the last marked fret. Each fret is searched near its
 * 12-TET position (refined by a perspective fit after a first pass); the slant of every wire comes
 * from separate searches in the low-E and high-e halves of the board.
 * Returns lines for n = 0 … last.n (nut and last are the user's clicks).
 */
export function detectFrets(gray: GrayImage, inp: DetectInput): FretLine[] {
  const N = inp.last.n;
  const map = quadMap(inp);
  const lenPx = dist(lerpPt(inp.nut.low, inp.nut.high, 0.5), lerpPt(inp.last.low, inp.last.high, 0.5));
  const len = Math.max(64, Math.round(lenPx));
  const minGap = (tetFraction(N, N) - tetFraction(N - 1, N)) * len;
  const w = Math.max(2, Math.round(minGap * 0.35));
  const full = highPass(stripProfile(gray, map, len, 0.12, 0.88), w);
  const top = highPass(stripProfile(gray, map, len, 0.1, 0.45), w);
  const bot = highPass(stripProfile(gray, map, len, 0.55, 0.9), w);
  const noise = median(Array.from(full, Math.abs)) * 1.4826 || 1;

  let expect = (s: number) => s;
  let found: { n: number; t: number; strength: number }[] = [];
  for (let pass = 0; pass < 2; pass++) {
    found = [];
    for (let n = 1; n < N; n++) {
      const tc = expect(tetFraction(n, N)) * len;
      const gap = (expect(tetFraction(n + 1, N)) - expect(tetFraction(n, N))) * len;
      const pk = peakIn(full, tc - gap * 0.3, tc + gap * 0.3);
      found.push({ n, t: pk.pos, strength: pk.value / noise });
    }
    const good = found.filter((f) => f.strength > 3).map((f) => ({ s: tetFraction(f.n, N), t: (f.t + 0.5) / len }));
    if (good.length >= 3) expect = fitPerspective(good);
  }

  const lines: FretLine[] = [{ n: 0, low: inp.nut.low, high: inp.nut.high, confidence: 1 }];
  for (const f of found) {
    const ok = f.strength > 3;
    let tCentre = ok ? f.t : expect(tetFraction(f.n, N)) * len - 0.5;
    let slope = 0; // dt per unit v
    if (ok) {
      const gap = (expect(tetFraction(f.n + 1, N)) - expect(tetFraction(f.n, N))) * len;
      const a = peakIn(top, f.t - gap * 0.2, f.t + gap * 0.2);
      const b = peakIn(bot, f.t - gap * 0.2, f.t + gap * 0.2);
      if (a.value / noise > 2 && b.value / noise > 2) {
        slope = (b.pos - a.pos) / (0.725 - 0.275);
        tCentre = (a.pos + b.pos) / 2;
      }
    }
    const tAt = (v: number) => (tCentre + slope * (v - 0.5) + 0.5) / len;
    lines.push({ n: f.n, low: map(tAt(0), 0), high: map(tAt(1), 1), confidence: ok ? Math.min(1, f.strength / 8) : 0 });
  }
  lines.push({ n: N, low: inp.last.low, high: inp.last.high, confidence: 1 });
  return lines;
}

/**
 * Port of build_fretboard(): for every output column compute the fractional fret from 12-TET,
 * interpolate the wire between the two neighbouring measured lines (slant included) and sample
 * along it bilinearly. Output: left = nut, right = `toFret`, top row = low E edge.
 * Consecutive lines interpolate linearly in fret number (like the script); gaps in the list use the
 * 12-TET ratio.
 */
export function warpFretboard(img: RGBAImage, lines: FretLine[], toFret = Math.max(...lines.map((l) => l.n)), outW = 2048, outH = 256): RGBAImage {
  const ls = [...lines].sort((a, b) => a.n - b.n);
  if (ls[0]?.n !== 0) throw new Error('Nut çizgisi (n = 0) gerekli.');
  if (ls[ls.length - 1].n < toFret) throw new Error(`${toFret}. perde işaretlenmemiş.`);
  const total = 1 - 2 ** (-toFret / 12);
  const d = (n: number) => 1 - 2 ** (-n / 12);
  const out = createImage(outW, outH);
  const px = [0, 0, 0, 0];
  let k = 0;
  for (let i = 0; i < outW; i++) {
    const u = (i + 0.5) / outW;
    const f = -12 * Math.log2(1 - u * total);
    while (k < ls.length - 2 && ls[k + 1].n <= f) k++;
    const a = ls[k], b = ls[k + 1];
    const t = b.n - a.n === 1 ? f - a.n : (d(f) - d(a.n)) / (d(b.n) - d(a.n));
    const low = lerpPt(a.low, b.low, t);
    const high = lerpPt(a.high, b.high, t);
    for (let j = 0; j < outH; j++) {
      const v = (j + 0.5) / outH;
      sampleBilinear(img, lerp(low[0], high[0], v), lerp(low[1], high[1], v), px);
      const o = (j * outW + i) * 4;
      out.data[o] = px[0];
      out.data[o + 1] = px[1];
      out.data[o + 2] = px[2];
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Fretboard widths from a close-up whose frets are known: local px/cm along the neck near the nut
 * and near the last fret (assumes the camera looks straight at the board), then a linear taper
 * extrapolated to `fretCount`.
 */
export function fretboardWidths(lines: FretLine[], scaleLengthCm: number, fretCount: number) {
  const ls = [...lines].sort((a, b) => a.n - b.n);
  const mid = (l: FretLine) => lerpPt(l.low, l.high, 0.5);
  const fd = (n: number) => scaleLengthCm * (1 - 2 ** (-n / 12));
  const nut = ls[0];
  const near = ls[Math.min(3, ls.length - 1)];
  const last = ls[ls.length - 1];
  const prev = ls[Math.max(0, ls.length - 4)];
  const ppcNut = dist(mid(nut), mid(near)) / (fd(near.n) - fd(nut.n));
  const ppcLast = dist(mid(prev), mid(last)) / (fd(last.n) - fd(prev.n));
  const nutWidthCm = dist(nut.low, nut.high) / ppcNut;
  const lastWidthCm = dist(last.low, last.high) / ppcLast;
  const slope = (lastWidthCm - nutWidthCm) / fd(last.n);
  const endWidthCm = nutWidthCm + slope * fd(fretCount);
  const r = (v: number) => Math.round(v * 100) / 100;
  return { nutWidthCm: r(nutWidthCm), widthAtLastCm: r(lastWidthCm), endWidthCm: r(endWidthCm) };
}
