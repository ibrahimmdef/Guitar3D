/**
 * Photo ↔ guitar frame geometry. The guitar frame (see packages/shared/src/guitar.ts):
 * x along the guitar, 0 at the nut, positive towards the headstock, negative towards the body;
 * +y = low E side. Units: cm.
 */
import { add, dist, dot, norm, scale, sub, type Pt } from './image';

/** Distance from the nut to fret n for a given scale length (12-TET). */
export const fretDistance = (scaleLength: number, n: number) => scaleLength * (1 - 2 ** (-n / 12));
/** Fractional fret number at a distance from the nut. */
export const fretAt = (scaleLength: number, d: number) => -12 * Math.log2(1 - Math.min(0.999, d / scaleLength));

export interface PhotoFrame {
  /** Nut centre in image px. */
  origin: Pt;
  /** Unit vector (image px) pointing from the nut towards the headstock: +x. */
  ax: Pt;
  /** Unit vector (image px) pointing to the low E side: +y. */
  ay: Pt;
  /** Pixels per cm along the guitar at the nut. */
  pxPerCm: number;
  /**
   * Perspective along the guitar (a photo taken from above or below a leaning guitar): the plane
   * projects with the 1-D homography  a = k·x / (1 + c·x)  along the axis and  b = g·k·y / (1 + c·x)
   * across it (a, b in px from the nut; x, y in cm; k = pxPerCm). c < 0 when the body is further
   * from the camera than the headstock. Absent = fronto-parallel photo.
   */
  persp?: { c: number; acrossGain: number };
}

export const toGuitar = (f: PhotoFrame, p: Pt): Pt => {
  const d = sub(p, f.origin);
  const a = dot(d, f.ax), b = dot(d, f.ay);
  if (!f.persp) return [a / f.pxPerCm, b / f.pxPerCm];
  const x = a / (f.pxPerCm - f.persp.c * a);
  return [x, (b * (1 + f.persp.c * x)) / (f.persp.acrossGain * f.pxPerCm)];
};

export const toImage = (f: PhotoFrame, g: Pt): Pt => {
  if (!f.persp) return add(f.origin, add(scale(f.ax, g[0] * f.pxPerCm), scale(f.ay, g[1] * f.pxPerCm)));
  const w = Math.max(0.05, 1 + f.persp.c * g[0]);
  return add(f.origin, add(scale(f.ax, (g[0] * f.pxPerCm) / w), scale(f.ay, (f.persp.acrossGain * g[1] * f.pxPerCm) / w)));
};

/** Pixels per cm across the guitar at position x (equals pxPerCm without perspective). */
export const pxPerCmAt = (f: PhotoFrame, x: number) => (f.persp ? (f.persp.acrossGain * f.pxPerCm) / Math.max(0.05, 1 + f.persp.c * x) : f.pxPerCm);

/** Same frame for an image resampled by `s` (e.g. a downscaled segmentation mask). */
export const scaleFrame = (f: PhotoFrame, s: number): PhotoFrame => ({ ...f, origin: scale(f.origin, s), pxPerCm: f.pxPerCm * s });

export interface Landmarks {
  headTip: Pt;
  nut: Pt;
  /** Any fret the user can identify (usually the 12th), centre of the fretboard. */
  fret?: { n: number; p: Pt };
  saddle: Pt;
  bodyEnd: Pt;
}

export type SizeSpec =
  /** Overall length tip → tail (e.g. a 42" preset = 106.7 cm). */
  | { kind: 'total'; cm: number }
  /** Scale length nut → saddle. */
  | { kind: 'scale'; cm: number };

export interface FrameSolution {
  frame: PhotoFrame;
  totalLengthCm: number;
  scaleLengthCm: number;
  /** Scale length implied by the saddle click and by the fret click (when given), for cross-checking. */
  scaleFromSaddleCm: number;
  scaleFromFretCm?: number;
  /** Perspective strength q = −c·scale (0 = none; 0.16 = the body looks 16 % smaller per scale length). */
  perspective: number;
  warnings: string[];
}

export interface SolveOptions {
  /** 'left' when the low E string is on the image's left with the neck pointing up (right-handed guitar seen from the front). */
  lowESide?: 'left' | 'right';
  /** Correct the perspective along the guitar from the fret + saddle clicks (default true). */
  perspective?: boolean;
  /** Longer image side / focal length in px; 1.38 ≈ a phone's main camera (26 mm equivalent). Only affects the across gain. */
  sensorOverFocal?: number;
  /** Longer side of the photo in px (needed with `sensorOverFocal`; default: estimated from the clicks). */
  imageLongSidePx?: number;
}

/**
 * Fits the guitar's centre line through the clicked landmarks, sets the scale from the chosen size
 * and returns the photo frame. With both a fret and the saddle clicked, the three collinear points
 * with known ratios (nut, fret n, saddle) also give the perspective along the guitar, so a photo
 * taken from above a leaning guitar still measures correctly.
 */
export function solveFrame(lm: Landmarks, size: SizeSpec, options: SolveOptions | 'left' | 'right' = {}): FrameSolution {
  const opts: SolveOptions = typeof options === 'string' ? { lowESide: options } : options;
  const lowESide = opts.lowESide ?? 'left';
  const warnings: string[] = [];
  const pts = [lm.headTip, lm.nut, lm.saddle, lm.bodyEnd, ...(lm.fret ? [lm.fret.p] : [])];
  // Principal axis of the clicked points (they all lie on the centre line).
  const c: Pt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) {
    const d = sub(p, c);
    sxx += d[0] * d[0];
    sxy += d[0] * d[1];
    syy += d[1] * d[1];
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ax: Pt = [Math.cos(theta), Math.sin(theta)];
  if (dot(sub(lm.headTip, lm.bodyEnd), ax) < 0) ax = [-ax[0], -ax[1]];
  ax = norm(ax);
  // Neck up (ax = (0,-1)) → image left is (-1,0) = (ax.y, -ax.x).
  const left: Pt = [ax[1], -ax[0]];
  const ay: Pt = lowESide === 'left' ? left : [-left[0], -left[1]];
  const proj = (p: Pt) => dot(sub(p, lm.nut), ax);
  const origin = add(c, scale(ax, dot(sub(lm.nut, c), ax))); // nut projected onto the centre line
  const off = Math.max(...pts.map((p) => Math.abs(dot(sub(p, c), [-ax[1], ax[0]]))));
  // px distances from the nut, positive towards the body
  const headPx = -proj(lm.headTip);
  const endPx = -proj(lm.bodyEnd);
  const totalPx = endPx - headPx;
  const saddlePx = -proj(lm.saddle);
  if (headPx >= 0 || saddlePx <= 0 || endPx <= saddlePx) throw new Error('Noktaların sırası tutarsız: baş ucu, nut, eğer ve gövde altı sap boyunca sıralı olmalı.');
  const uf = lm.fret ? 1 - 2 ** (-lm.fret.n / 12) : 0;
  const fretOnly = lm.fret ? -proj(lm.fret.p) / uf : undefined;
  if (lm.fret && (fretOnly! <= 0 || -proj(lm.fret.p) >= saddlePx)) throw new Error('Perde noktası nut ile eğer arasında olmalı.');
  if (off > 0.03 * totalPx) warnings.push('Tıklanan noktalar tek bir çizgide değil; fotoğraf eğik çekilmiş olabilir.');

  // p(u) = K·u / (1 + q·u), u = distance from the nut in scale lengths.
  let q = 0;
  let K = fretOnly ?? saddlePx;
  if (lm.fret && opts.perspective !== false) {
    const pf = -proj(lm.fret.p);
    const ps = saddlePx;
    const raw = (ps * uf - pf) / (uf * (pf - ps));
    q = Math.max(-0.3, Math.min(0.45, raw));
    K = q === raw ? ps * (1 + q) : pf * (1 + q * uf) / uf;
    if (Math.abs(raw) > 0.3) {
      warnings.push('Perde ve eğer tıklamaları farklı tel boyları veriyor: fotoğraf çok eğik çekilmiş ya da noktalardan biri yanlış. Mümkünse gitarı tam karşıdan çek.');
    }
  }
  const uOf = (p: number) => p / (K - q * p);
  const uHead = uOf(headPx), uEnd = uOf(endPx);
  if (!(uEnd > 1) || !(uHead < 0) || !Number.isFinite(uEnd)) throw new Error('Noktalardan ölçü çıkarılamadı; noktaları kontrol et.');
  const scaleLengthCm = size.kind === 'total' ? size.cm / (uEnd - uHead) : size.cm;
  const pxPerCm = K / scaleLengthCm;
  const frame: PhotoFrame = { origin, ax, ay, pxPerCm };
  if (Math.abs(q) > 1e-4) {
    // Pinhole model of a plane tilted by θ: tan θ = q·f / K, across gain = 1 / cos θ.
    const long = opts.imageLongSidePx ?? totalPx / 0.7;
    const f = long / (opts.sensorOverFocal ?? 1.38);
    const tan = (q * f) / K;
    frame.persp = { c: -q / scaleLengthCm, acrossGain: Math.sqrt(1 + tan * tan) };
  }
  if (scaleLengthCm < 50 || scaleLengthCm > 75) warnings.push(`Tel boyu ${scaleLengthCm.toFixed(1)} cm çıktı; akustik gitarlarda genelde 62–66 cm olur. Ölçüyü ya da noktaları kontrol et.`);
  const flat = totalPx / (size.kind === 'total' ? size.cm : (uEnd - uHead) * scaleLengthCm);
  return {
    frame,
    totalLengthCm: (uEnd - uHead) * scaleLengthCm,
    scaleLengthCm,
    scaleFromSaddleCm: saddlePx / flat,
    scaleFromFretCm: fretOnly ? fretOnly / flat : undefined,
    perspective: q,
    warnings,
  };
}

/** Converts a centre + edge click into a circle in the guitar frame. */
export function circleFromClicks(f: PhotoFrame, centre: Pt, edge: Pt) {
  const [x, y] = toGuitar(f, centre);
  return { x, y, radiusCm: dist(centre, edge) / pxPerCmAt(f, x) };
}
