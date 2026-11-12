/** Framework-free raster helpers. Images are plain RGBA arrays, compatible with the DOM `ImageData`. */

export type Pt = [number, number];

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Single channel float image (e.g. luminance 0..255). */
export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

/** Binary mask, 1 = foreground. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

export function createImage(width: number, height: number): RGBAImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function createMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
export const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const norm = (a: Pt): Pt => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

/** Bilinear RGBA sample with edge clamping, written into `out`. */
export function sampleBilinear(img: RGBAImage, x: number, y: number, out: number[] | Float32Array = [0, 0, 0, 0]) {
  const { width: w, height: h, data } = img;
  const fx = clamp(x - 0.5, 0, w - 1.0001);
  const fy = clamp(y - 0.5, 0, h - 1.0001);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const a = data[i00 + c] * (1 - tx) + data[i10 + c] * tx;
    const b = data[i01 + c] * (1 - tx) + data[i11 + c] * tx;
    out[c] = a * (1 - ty) + b * ty;
  }
  return out;
}

/** Bilinear sample of a gray image (pixel centres at +0.5). */
export function sampleGray(img: GrayImage, x: number, y: number) {
  const { width: w, height: h, data } = img;
  const fx = clamp(x - 0.5, 0, w - 1.0001);
  const fy = clamp(y - 0.5, 0, h - 1.0001);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = data[y0 * w + x0] * (1 - tx) + data[y0 * w + x1] * tx;
  const b = data[y1 * w + x0] * (1 - tx) + data[y1 * w + x1] * tx;
  return a * (1 - ty) + b * ty;
}

/** Mask value 0..1 with bilinear interpolation (for anti-aliased alpha). */
export function sampleMask(m: Mask, x: number, y: number) {
  const { width: w, height: h, data } = m;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const fx = clamp(x - 0.5, 0, w - 1.0001);
  const fy = clamp(y - 0.5, 0, h - 1.0001);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = data[y0 * w + x0] * (1 - tx) + data[y0 * w + x1] * tx;
  const b = data[y1 * w + x0] * (1 - tx) + data[y1 * w + x1] * tx;
  return a * (1 - ty) + b * ty;
}

/** Rec. 601 luma. */
export function luminance(img: RGBAImage): GrayImage {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { width: img.width, height: img.height, data: out };
}

/** Box-filter downscale so the longer side is at most `maxDim`. Returns the factor (out px per in px). */
export function downscale(img: RGBAImage, maxDim: number): { image: RGBAImage; scale: number } {
  const s = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (s >= 1) return { image: img, scale: 1 };
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const out = createImage(w, h);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const ya = Math.floor(y * sy), yb = Math.max(ya + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const xa = Math.floor(x * sx), xb = Math.max(xa + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = ya; yy < yb; yy++) {
        for (let xx = xa; xx < xb; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          a += img.data[i + 3];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
      out.data[o + 3] = a / n;
    }
  }
  return { image: out, scale: w / img.width };
}

/** Median of a numeric array (copies). */
export function median(xs: ArrayLike<number>) {
  if (!xs.length) return 0;
  const s = Array.from(xs).sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
