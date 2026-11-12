import type { Mask, Pt } from './image';

/**
 * Outer boundary of the first foreground component in scan order (Moore-neighbour tracing).
 * Returns pixel-corner-ish coordinates (pixel centres + 0.5), in tracing order.
 */
export function traceContour(m: Mask): Pt[] {
  const { width: w, height: h, data } = m;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1;
  let start = -1;
  for (let i = 0; i < w * h; i++) {
    if (data[i]) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];
  // 8 neighbours clockwise in image coords (y down), starting west.
  const dirs: Pt[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const sx = start % w, sy = (start - sx) / w;
  const out: Pt[] = [[sx + 0.5, sy + 0.5]];
  let cx = sx, cy = sy;
  let back = 0; // we entered the start pixel from the west (scan order guarantees west is empty)
  const maxSteps = 4 * w * h + 8;
  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (at(nx, ny)) {
        // new backtrack direction: the neighbour checked just before, seen from the new pixel
        back = (d + 4 + 1) % 8 === 8 ? 0 : (d + 5) % 8;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel
    if (cx === sx && cy === sy) break;
    out.push([cx + 0.5, cy + 0.5]);
  }
  return out;
}

/** Signed area (shoelace). Positive = counter-clockwise in a y-up frame. */
export function polygonArea(p: Pt[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export function perimeter(p: Pt[]) {
  let l = 0;
  for (let i = 0; i < p.length; i++) l += Math.hypot(p[(i + 1) % p.length][0] - p[i][0], p[(i + 1) % p.length][1] - p[i][1]);
  return l;
}

/** Circular moving average (k neighbours each side). */
export function smoothClosed(p: Pt[], k: number): Pt[] {
  if (k <= 0 || p.length < 3) return p.map((q) => [q[0], q[1]] as Pt);
  const n = p.length;
  return p.map((_, i) => {
    let x = 0, y = 0;
    for (let j = -k; j <= k; j++) {
      const q = p[(i + j + n) % n];
      x += q[0];
      y += q[1];
    }
    return [x / (2 * k + 1), y / (2 * k + 1)] as Pt;
  });
}

/** Resamples a closed polygon to `n` points equally spaced by arc length. */
export function resampleClosed(p: Pt[], n: number): Pt[] {
  const total = perimeter(p);
  if (!total || p.length < 2) return p.slice();
  const out: Pt[] = [];
  let seg = 0, segStart = 0;
  const segLen = (i: number) => Math.hypot(p[(i + 1) % p.length][0] - p[i][0], p[(i + 1) % p.length][1] - p[i][1]);
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (segStart + segLen(seg) < target && seg < p.length - 1) {
      segStart += segLen(seg);
      seg++;
    }
    const l = segLen(seg) || 1;
    const t = Math.min(1, (target - segStart) / l);
    const a = p[seg], b = p[(seg + 1) % p.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Point-in-polygon (even-odd). */
export function pointInPolygon(pt: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Sorted y values where the vertical line at x crosses the polygon. */
export function crossingsAtX(poly: Pt[], x: number): number[] {
  const ys: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (xi > x !== xj > x) ys.push(yi + ((x - xi) * (yj - yi)) / (xj - xi));
  }
  return ys.sort((a, b) => a - b);
}

/**
 * Rasterises a polygon (output pixel coords) into an alpha channel with horizontal anti-aliasing
 * (4 sub-rows per pixel, exact horizontal coverage). Fast enough for 2048² outputs.
 */
export function rasterizePolygon(poly: Pt[], width: number, height: number): Uint8Array {
  const acc = new Float32Array(width * height);
  const SUB = 4;
  for (let y = 0; y < height; y++) {
    for (let s = 0; s < SUB; s++) {
      const sy = y + (s + 0.5) / SUB;
      const xs: number[] = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi > sy !== yj > sy) xs.push(xi + ((sy - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, xs[k]), b = Math.min(width, xs[k + 1]);
        if (b <= a) continue;
        const ia = Math.floor(a), ib = Math.floor(b);
        const row = y * width;
        if (ia === ib) {
          acc[row + ia] += (b - a) / SUB;
          continue;
        }
        acc[row + ia] += (ia + 1 - a) / SUB;
        for (let x = ia + 1; x < ib; x++) acc[row + x] += 1 / SUB;
        if (ib < width) acc[row + ib] += (b - ib) / SUB;
      }
    }
  }
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.min(1, acc[i]) * 255);
  return out;
}
