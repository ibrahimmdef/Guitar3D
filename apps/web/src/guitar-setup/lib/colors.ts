import { median, type Mask, type Pt, type RGBAImage } from './image';

export type RGB = [number, number, number];

export const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

export function fromHex(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Per-channel median of the pixels within `radius` of `p` (robust to glare and grain). */
export function sampleColorAt(img: RGBAImage, p: Pt, radius = 4): RGB {
  const r: number[] = [], g: number[] = [], b: number[] = [];
  const cx = Math.round(p[0]), cy = Math.round(p[1]);
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height || (x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = (y * img.width + x) * 4;
      r.push(img.data[i]);
      g.push(img.data[i + 1]);
      b.push(img.data[i + 2]);
    }
  }
  return [median(r), median(g), median(b)];
}

/** Per-channel median over a mask (same size as the image), subsampled for speed. */
export function maskedMedianColor(img: RGBAImage, mask: Mask, maxSamples = 20000): RGB {
  const r: number[] = [], g: number[] = [], b: number[] = [];
  let count = 0;
  for (let i = 0; i < mask.data.length; i++) count += mask.data[i];
  const step = Math.max(1, Math.floor(count / maxSamples));
  let k = 0;
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i] || k++ % step) continue;
    r.push(img.data[i * 4]);
    g.push(img.data[i * 4 + 1]);
    b.push(img.data[i * 4 + 2]);
  }
  return [median(r), median(g), median(b)];
}
