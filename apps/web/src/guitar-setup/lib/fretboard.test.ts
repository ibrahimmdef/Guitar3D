import { describe, it, expect } from 'vitest';
import { createImage, dist, luminance, type Pt, type RGBAImage } from './image';
import { detectFrets, fitPerspective, fretboardWidths, highPass, tetFraction, warpFretboard, type FretLine } from './fretboard';
import { buildHeadstock, sideAt } from './headstock';
import { fretDistance } from './geometry';

const SCALE = 64.8;
const N = 12;
const L = fretDistance(SCALE, N);

/**
 * Synthetic close-up: board seen with 1-D perspective along the neck, fret wires slanting
 * (low E end further along than the high e end), strings and inlay dots.
 */
function board(opts: { persp?: number; slant?: number } = {}) {
  const W = 1100, H = 260;
  const x0 = 60, k = 950, y0 = 70, wPx = 120;
  const p = opts.persp ?? 0.25;
  const slant = opts.slant ?? 14; // px at the last fret
  // physical s (cm from nut), v (0 low E edge … 1 high e edge) → image
  const fwd = (s: number, v: number): Pt => {
    const t = s / L;
    return [x0 + (k * ((1 + p) * t)) / (1 + p * t) + slant * t * (0.5 - v), y0 + v * wPx];
  };
  const inv = (x: number, y: number) => {
    const v = (y - y0) / wPx;
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const t = s / L;
      const xx = x - slant * t * (0.5 - v);
      const tt = (xx - x0) / k; // = (1+p)t/(1+pt) → t = tt/(1+p - p tt)
      s = (tt / (1 + p - p * tt)) * L;
    }
    return { s, v };
  };
  const img = createImage(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { s, v } = inv(x + 0.5, y + 0.5);
      let c = 25;
      if (v >= 0 && v <= 1 && s >= -0.5 && s <= L + 1) {
        c = 70;
        for (let n = 0; n <= N + 1; n++) if (Math.abs(s - fretDistance(SCALE, n)) < 0.09) c = 225;
        for (let st = 0; st < 6; st++) if (Math.abs(v - (0.08 + st * 0.168)) < 0.012) c = Math.max(c, 160);
        for (const n of [3, 5, 7, 9]) {
          const sc = (fretDistance(SCALE, n - 1) + fretDistance(SCALE, n)) / 2;
          if (Math.hypot(s - sc, (v - 0.5) * 5) < 0.35) c = 240;
        }
      }
      const i = (y * W + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c * 0.8;
      img.data[i + 2] = c * 0.6;
      img.data[i + 3] = 255;
    }
  }
  const truth: FretLine[] = Array.from({ length: N + 1 }, (_, n) => ({
    n,
    low: fwd(fretDistance(SCALE, n), 0),
    high: fwd(fretDistance(SCALE, n), 1),
    confidence: 1,
  }));
  return { img, truth, fwd };
}

describe('fret detection', () => {
  it('helpers: 12-TET fraction, high-pass, perspective fit', () => {
    expect(tetFraction(12, 12)).toBe(1);
    expect(tetFraction(0, 12)).toBe(0);
    expect(tetFraction(6, 12)).toBeCloseTo((1 - 2 ** -0.5) / 0.5, 9);
    const hp = highPass(new Float32Array([0, 0, 0, 10, 0, 0, 0]), 2);
    expect(hp[3]).toBeGreaterThan(7);
    const f = fitPerspective([0.1, 0.3, 0.5, 0.8].map((s) => ({ s, t: (1.2 * s) / (1 + 0.2 * s) })));
    expect(f(0.6)).toBeCloseTo((1.2 * 0.6) / 1.12, 2);
  });

  for (const persp of [0, 0.25]) {
    it(`finds every fret wire incl. slant (perspective ${persp})`, () => {
      const { img, truth } = board({ persp });
      const lines = detectFrets(luminance(img), { nut: { low: truth[0].low, high: truth[0].high }, last: { n: N, low: truth[N].low, high: truth[N].high } });
      expect(lines.map((l) => l.n)).toEqual(truth.map((l) => l.n));
      for (let n = 1; n < N; n++) {
        expect(lines[n].confidence).toBeGreaterThan(0.3);
        expect(dist(lines[n].low, truth[n].low)).toBeLessThan(2.5);
        expect(dist(lines[n].high, truth[n].high)).toBeLessThan(2.5);
      }
    });
  }

  it('falls back to 12-TET positions on a blank board', () => {
    const img = createImage(400, 100);
    img.data.fill(90);
    const lines = detectFrets(luminance(img), { nut: { low: [10, 10], high: [10, 90] }, last: { n: 12, low: [390, 10], high: [390, 90] } });
    expect(lines).toHaveLength(13);
    expect(lines[6].confidence).toBe(0);
    expect(lines[6].low[0]).toBeCloseTo(10 + 380 * tetFraction(6, 12), 0);
  });
});

describe('fret-by-fret warp', () => {
  const brightAt = (img: RGBAImage, i: number) => {
    let s = 0;
    for (let j = 0; j < img.height; j++) s += img.data[(j * img.width + i) * 4];
    return s / img.height;
  };

  it('puts every fret wire on its 12-TET column, straight and unslanted', () => {
    const { img, truth } = board();
    const out = warpFretboard(img, truth, N, 1200, 64);
    expect(out.width).toBe(1200);
    for (let n = 1; n < N; n++) {
      const col = Math.round(tetFraction(n, N) * 1200 - 0.5);
      const midCol = Math.round(((tetFraction(n, N) + tetFraction(n + 1, N)) / 2) * 1200);
      // bright in the top and the bottom rows at the same column → the slant is removed
      const top = out.data[(2 * 1200 + col) * 4];
      const bottom = out.data[(61 * 1200 + col) * 4];
      expect(Math.max(top, out.data[(2 * 1200 + col + 1) * 4], out.data[(2 * 1200 + col - 1) * 4])).toBeGreaterThan(180);
      expect(Math.max(bottom, out.data[(61 * 1200 + col + 1) * 4], out.data[(61 * 1200 + col - 1) * 4])).toBeGreaterThan(180);
      expect(brightAt(out, midCol)).toBeLessThan(120);
    }
  });

  it('interpolates over missing frets with the 12-TET ratio and validates input', () => {
    const { img, truth } = board({ persp: 0 });
    const sparse = truth.filter((l) => l.n % 4 === 0);
    const out = warpFretboard(img, sparse, N, 1200, 32);
    const col = Math.round(tetFraction(5, N) * 1200 - 0.5);
    expect(Math.max(...[-1, 0, 1].map((d) => out.data[(16 * 1200 + col + d) * 4]))).toBeGreaterThan(150);
    expect(() => warpFretboard(img, truth.slice(1), N)).toThrow(/Nut/);
    expect(() => warpFretboard(img, truth.slice(0, 5), N)).toThrow(/12/);
  });

  it('estimates nut and end widths from the marked frets', () => {
    // straight-on board: 10 px per cm, 4.3 cm at the nut, 5.3 cm at fret 12
    const ppc = 10;
    const lines: FretLine[] = Array.from({ length: 13 }, (_, n) => {
      const x = 20 + fretDistance(SCALE, n) * ppc;
      const w = 4.3 + (1.0 * fretDistance(SCALE, n)) / L;
      return { n, low: [x, 100 - (w / 2) * ppc] as Pt, high: [x, 100 + (w / 2) * ppc] as Pt, confidence: 1 };
    });
    const w = fretboardWidths(lines, SCALE, 20);
    expect(w.nutWidthCm).toBeCloseTo(4.3, 2);
    expect(w.widthAtLastCm).toBeCloseTo(5.3, 2);
    expect(w.endWidthCm).toBeCloseTo(4.3 + fretDistance(SCALE, 20) / L, 2);
  });
});

describe('headstock', () => {
  it('straightens the headstock and measures profile and tuners', () => {
    const img = createImage(300, 600);
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < 300; x++) {
        const i = (y * 300 + x) * 4;
        img.data[i] = x < 130 ? 220 : 20;
        img.data[i + 2] = x < 130 ? 20 : 220;
        img.data[i + 3] = 255;
      }
    }
    const res = buildHeadstock(
      img,
      {
        lowSide: [[100, 500], [90, 300], [80, 100]],
        highSide: [[160, 500], [170, 300], [180, 100]],
        tunersLowE: [[95, 250], [92, 350], [98, 150]],
        tunersHighE: [[165, 350]],
        pxPerCmAcross: 10,
      },
      64,
      128,
    );
    expect(res.lengthCm).toBeCloseTo(40, 3);
    expect(res.profile).toHaveLength(21);
    expect(res.profile[0]).toEqual([0, 3]);
    expect(res.profile[20]).toEqual([40, 5]);
    expect(res.profile[10][1]).toBeCloseTo(4, 3);
    expect(res.tunersLowE).toEqual([15, 25, 35]);
    expect(res.tunersHighE).toEqual([15]);
    // left columns = low E side (red), right = high e side (blue); top row = tip
    expect(res.texture.data[(64 * 64 + 2) * 4]).toBe(220);
    expect(res.texture.data[(64 * 64 + 61) * 4 + 2]).toBe(220);
    expect(sideAt([[0, 10], [0, 0]], 0.5, [0, -1])).toEqual([0, 5]);
    expect(() => buildHeadstock(img, { lowSide: [[0, 0]], highSide: [[1, 1], [2, 2]], pxPerCmAcross: 1 })).toThrow();
  });

  it('applies the along-foreshortening factor', () => {
    const img = createImage(10, 10);
    const r = buildHeadstock(img, { lowSide: [[2, 9], [2, 1]], highSide: [[8, 9], [8, 1]], pxPerCmAcross: 2, alongFactor: 1.07 }, 4, 4);
    expect(r.lengthCm).toBeCloseTo((8 * 1.07) / 2, 3);
  });
});
