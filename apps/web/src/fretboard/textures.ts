import * as THREE from 'three';

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Procedural wood grain running along the texture's u axis. */
export function woodTexture(base: string, grain: string, seed: number, opts: { w?: number; h?: number; lines?: number; wobble?: number } = {}) {
  const { w = 1024, h = 256, lines = 90, wobble = 6 } = opts;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  g.strokeStyle = grain;
  for (let i = 0; i < lines; i++) {
    const y = r() * h;
    g.globalAlpha = 0.08 + r() * 0.22;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    const ph = r() * 10;
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / (80 + r() * 40) + ph) * wobble * r());
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function imageTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

type Pt = [number, number];

/** Homography mapping the unit square (u,v) to the quad p00,p10,p01,p11 (Heckbert's square-to-quad). */
export function squareToQuad(p00: Pt, p10: Pt, p01: Pt, p11: Pt) {
  const [x0, y0] = p00, [x1, y1] = p10, [x3, y3] = p01, [x2, y2] = p11;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  return (u: number, v: number): Pt => {
    const w = g * u + h * v + 1;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
}

/**
 * Rectifies a fretboard photo. Corners are in image pixels:
 * nut / target fret, on the low-E edge and the high-e edge.
 * Output: left = nut, right = target fret, top row = low-E edge.
 */
export function rectifyFretboard(
  img: HTMLImageElement,
  corners: { nutLow: Pt; fretLow: Pt; nutHigh: Pt; fretHigh: Pt },
  outW = 2048,
  outH = 320,
): HTMLCanvasElement {
  const src = document.createElement('canvas');
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sg = src.getContext('2d')!;
  sg.drawImage(img, 0, 0);
  const sd = sg.getImageData(0, 0, src.width, src.height).data;

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const og = out.getContext('2d')!;
  const od = og.createImageData(outW, outH);
  const map = squareToQuad(corners.nutLow, corners.fretLow, corners.nutHigh, corners.fretHigh);
  for (let j = 0; j < outH; j++) {
    for (let i = 0; i < outW; i++) {
      const [x, y] = map((i + 0.5) / outW, (j + 0.5) / outH);
      const xi = Math.min(src.width - 1, Math.max(0, Math.round(x)));
      const yi = Math.min(src.height - 1, Math.max(0, Math.round(y)));
      const s = (yi * src.width + xi) * 4;
      const o = (j * outW + i) * 4;
      od.data[o] = sd[s];
      od.data[o + 1] = sd[s + 1];
      od.data[o + 2] = sd[s + 2];
      od.data[o + 3] = 255;
    }
  }
  og.putImageData(od, 0, 0);
  return out;
}
