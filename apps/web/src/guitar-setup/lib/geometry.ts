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
  pxPerCm: number;
}

export const toGuitar = (f: PhotoFrame, p: Pt): Pt => {
  const d = sub(p, f.origin);
  return [dot(d, f.ax) / f.pxPerCm, dot(d, f.ay) / f.pxPerCm];
};

export const toImage = (f: PhotoFrame, g: Pt): Pt => add(f.origin, add(scale(f.ax, g[0] * f.pxPerCm), scale(f.ay, g[1] * f.pxPerCm)));

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
  warnings: string[];
}

/**
 * Fits the guitar's centre line through the clicked landmarks, sets the scale from the chosen size
 * and returns the photo frame. `lowESide` says on which side of the image the low E string is when
 * the neck points up (right-handed guitar photographed from the front: 'left').
 */
export function solveFrame(lm: Landmarks, size: SizeSpec, lowESide: 'left' | 'right' = 'left'): FrameSolution {
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
  const totalPx = proj(lm.headTip) - proj(lm.bodyEnd);
  const saddlePx = -proj(lm.saddle);
  if (totalPx <= 0 || saddlePx <= 0) throw new Error('Noktaların sırası tutarsız: baş ucu, nut, eğer ve gövde altı sap boyunca sıralı olmalı.');
  const fretPx = lm.fret ? -proj(lm.fret.p) / (1 - 2 ** (-lm.fret.n / 12)) : undefined;
  if (lm.fret && (fretPx! <= 0 || fretPx! > totalPx)) throw new Error('Perde noktası nut ile eğer arasında olmalı.');
  // The fret click is the most reliable scale estimate (the saddle is compensated a few mm).
  const scalePx = fretPx ?? saddlePx;
  const pxPerCm = size.kind === 'total' ? totalPx / size.cm : scalePx / size.cm;
  if (off > 0.03 * totalPx) warnings.push('Tıklanan noktalar tek bir çizgide değil; fotoğraf eğik çekilmiş olabilir.');
  if (fretPx && Math.abs(fretPx - saddlePx) / saddlePx > 0.03) {
    warnings.push(`Perde ve eğer tıklamaları farklı tel boyları veriyor (${(fretPx / pxPerCm).toFixed(1)} / ${(saddlePx / pxPerCm).toFixed(1)} cm). Perde değeri kullanıldı.`);
  }
  const frame: PhotoFrame = { origin, ax, ay, pxPerCm };
  const scaleLengthCm = scalePx / pxPerCm;
  if (scaleLengthCm < 50 || scaleLengthCm > 75) warnings.push(`Tel boyu ${scaleLengthCm.toFixed(1)} cm çıktı; akustik gitarlarda genelde 62–66 cm olur. Ölçüyü ya da noktaları kontrol et.`);
  return {
    frame,
    totalLengthCm: totalPx / pxPerCm,
    scaleLengthCm,
    scaleFromSaddleCm: saddlePx / pxPerCm,
    scaleFromFretCm: fretPx ? fretPx / pxPerCm : undefined,
    warnings,
  };
}

/** Converts a centre + edge click into a circle in the guitar frame. */
export function circleFromClicks(f: PhotoFrame, centre: Pt, edge: Pt) {
  const [x, y] = toGuitar(f, centre);
  return { x, y, radiusCm: dist(centre, edge) / f.pxPerCm };
}
