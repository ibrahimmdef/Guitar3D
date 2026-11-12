/** Synthetic photos for the pipeline tests. Not imported by app code. */
import { createImage, type Pt, type RGBAImage } from './image';
import { toGuitar, type PhotoFrame } from './geometry';

export const SYN = {
  scale: 64,
  neckHalf: 2.6,
  headLen: 18,
  headHalf: 4,
  lower: { cx: -70, ax: 20, ay: 19 },
  upper: { cx: -46, ax: 13, ay: 14.5 },
  hole: { x: -44, y: 0, r: 5 },
  bodyEnd: -90,
  bodyTop: -33,
};

const inEllipse = (x: number, y: number, e: { cx: number; ax: number; ay: number }) => ((x - e.cx) / e.ax) ** 2 + (y / e.ay) ** 2 <= 1;

export function inBody(x: number, y: number) {
  return inEllipse(x, y, SYN.lower) || inEllipse(x, y, SYN.upper);
}

export type Region = 'bg' | 'body' | 'hole' | 'neck' | 'head';

export function regionAt(x: number, y: number): Region {
  if (inBody(x, y)) return (x - SYN.hole.x) ** 2 + (y - SYN.hole.y) ** 2 <= SYN.hole.r ** 2 ? 'hole' : 'body';
  if (x <= 0 && x >= -40 && Math.abs(y) <= SYN.neckHalf) return 'neck';
  if (x > 0 && x <= SYN.headLen && Math.abs(y) <= SYN.headHalf) return 'head';
  return 'bg';
}

const COLORS: Record<Region, [number, number, number]> = {
  bg: [222, 220, 214],
  body: [48, 36, 28],
  hole: [6, 6, 6],
  neck: [60, 44, 30],
  head: [30, 30, 30],
};

/** Deterministic noise. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Renders the synthetic guitar into an image with the given frame. */
export function renderGuitar(w: number, h: number, frame: PhotoFrame, noise = 6, seed = 7): RGBAImage {
  const img = createImage(w, h);
  const r = rng(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [gx, gy] = toGuitar(frame, [x + 0.5, y + 0.5]);
      const c = COLORS[regionAt(gx, gy)];
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) img.data[i + k] = c[k] + (r() - 0.5) * 2 * noise;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

export function frameAt(origin: Pt, angleDeg: number, pxPerCm: number): PhotoFrame {
  // angle 0 = neck pointing up in the image
  const a = (angleDeg * Math.PI) / 180;
  const ax: Pt = [Math.sin(a), -Math.cos(a)];
  const ay: Pt = [ax[1], -ax[0]];
  return { origin, ax, ay, pxPerCm };
}
