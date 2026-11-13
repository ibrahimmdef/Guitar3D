/**
 * Parametric guitar templates: body outlines, pickguards, headstocks and complete GuitarProfiles,
 * generated from a few measurements per instrument (pure, no three.js). The JSON files in
 * public/guitar/templates are written from here by scripts/gen-guitar-templates.ts — edit the
 * specs below and re-run that script, never the JSON by hand. All shapes are original.
 */
import type { GuitarFinish, GuitarProfile, Point2 } from '@guitar3d/shared';
import { fretX, modelledLength, polygonArea } from './geometry';

/* ------------------------------------------------------------------ outlines */

export interface BodySpec {
  lengthCm: number;
  /** Full widths of the upper bout, waist and lower bout. */
  upperCm: number;
  waistCm: number;
  lowerCm: number;
  /** Their positions as fractions of the body length from the neck end. */
  upperT: number;
  waistT: number;
  lowerT: number;
  /** End-cap exponents: higher = squarer shoulders / flatter tail. */
  shoulder: number;
  tail: number;
  /** Venetian cutaway on the treble (-y) side. */
  cutaway?: { heelHalfCm: number; lengthT: number };
}

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};

/** Smooth half-width profile through the bout key points (zero slope at every key). */
function boutHalfWidth(b: BodySpec, t: number) {
  const keys: Point2[] = [[0, b.upperCm / 2], [b.upperT, b.upperCm / 2], [b.waistT, b.waistCm / 2], [b.lowerT, b.lowerCm / 2], [1, b.lowerCm / 2]];
  let h = keys[keys.length - 1][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, h0] = keys[i - 1];
      const [t1, h1] = keys[i];
      const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
      h = h0 + (h1 - h0) * (1 - Math.cos(Math.PI * u)) / 2;
      break;
    }
  }
  const capA = 0.2;
  const capB = 1 - b.lowerT + 0.04;
  const cap = (u: number, p: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, u), p)), 1 / p);
  if (t < capA) h *= cap(1 - t / capA, b.shoulder);
  if (t > 1 - capB) h *= cap((t - (1 - capB)) / capB, b.tail);
  return h;
}

/**
 * Closed acoustic body outline in the guitar frame, clockwise like the measured profiles:
 * starts at the neck end on the centre line, runs down the treble (-y) side to the tail and back up
 * the bass side. `xTop` is where the body meets the neck.
 */
export function acousticOutline(b: BodySpec, xTop: number, samples = 120): Point2[] {
  const ts: number[] = [];
  for (let i = 0; i <= samples; i++) ts.push((1 - Math.cos((Math.PI * i) / samples)) / 2);
  const treble = (t: number) => {
    let h = boutHalfWidth(b, t);
    const c = b.cutaway;
    if (c && t < c.lengthT * 1.25) {
      const u = Math.min(1, t / c.lengthT);
      const H = boutHalfWidth(b, c.lengthT);
      const hc = u >= 1 ? 1e3 : c.heelHalfCm + (H - c.heelHalfCm) * (1 - Math.sqrt(1 - u * u));
      h = t === 0 ? 0 : smin(h, Math.max(hc, c.heelHalfCm), 3.2);
    }
    return h;
  };
  const out: Point2[] = [];
  for (const t of ts) out.push([r2(xTop - t * b.lengthCm), r2(-treble(t))]);
  for (let i = ts.length - 2; i >= 1; i--) out.push([r2(xTop - ts[i] * b.lengthCm), r2(boutHalfWidth(b, ts[i]))]);
  return dedupe(out);
}

/** Closed centripetal Catmull-Rom spline through control points (used for the solid body). */
export function closedSpline(ctrl: Point2[], perSegment = 10): Point2[] {
  const n = ctrl.length;
  const out: Point2[] = [];
  const knot = (a: Point2, b: Point2) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let k = 0; k < perSegment; k++) {
      const t = t1 + ((t2 - t1) * k) / perSegment;
      const lerp = (a: Point2, b: Point2, ta: number, tb: number): Point2 => {
        const w = (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
      };
      const a1 = lerp(p0, p1, 0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, 0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      const c = lerp(b1, b2, t1, t2);
      out.push([r2(c[0]), r2(c[1])]);
    }
  }
  return dedupe(out);
}

/**
 * Original offset double-cutaway solid body (no brand shape): control points relative to the neck
 * pocket (dx along -x towards the tail), the bass horn longer than the treble horn. Clockwise.
 */
export function solidBodyOutline(xTop: number, lengthCm = 44.6): Point2[] {
  const k = lengthCm / 44.6;
  const ctrl: Point2[] = [
    [0, -2.9], [-4.6, -3.6], [-6.8, -6.4], [-5.2, -10.2], [-1.2, -12.6], [1.4, -13.6], [0.2, -15.2], [-5.5, -15.9],
    [-13.5, -14.0], [-21.5, -14.9], [-29.5, -16.6], [-37.5, -15.6], [-42.6, -11.0], [-44.6, -4.0], [-44.6, 4.0],
    [-42.6, 11.0], [-37.5, 15.9], [-29.5, 16.6], [-21.5, 15.3], [-14.5, 14.5], [-7.0, 15.1], [0.5, 15.3], [5.4, 14.2],
    [6.4, 12.0], [3.2, 9.4], [-2.4, 6.6], [-4.6, 3.8],
  ];
  return closedSpline(ctrl.map(([dx, y]) => [xTop + dx * k, y * k] as Point2), 9);
}

/** Teardrop pickguard on the treble side behind the soundhole, hugging its edge. Clockwise. */
export function teardropPickguard(sh: { x: number; y: number; radiusCm: number }, scale = 1): Point2[] {
  const r = sh.radiusCm;
  const cx = sh.x - 2.4 * scale;
  const cy = sh.y - (r + 2.6 * scale);
  const a = (r + 4.2) * scale;
  const b = 4.4 * scale;
  const out: Point2[] = [];
  const margin = r + 0.9;
  for (let i = 0; i < 64; i++) {
    const t = -(i / 64) * Math.PI * 2; // clockwise
    // a teardrop: fuller towards the tail
    const stretch = 1 + 0.18 * Math.cos(t);
    let x = cx + a * Math.cos(t);
    let y = cy + b * stretch * Math.sin(t);
    const dx = x - sh.x;
    const dy = y - sh.y;
    const d = Math.hypot(dx, dy);
    if (d < margin) {
      x = sh.x + (dx / d) * margin;
      y = sh.y + (dy / d) * margin;
    }
    out.push([r2(x), r2(y)]);
  }
  return dedupe(out);
}

/** Headstock [distance from nut, half width] table: flares from the nut to `fullHalf` by `flareTo`. */
export function headstockProfile(lengthCm: number, nutHalf: number, fullHalf: number, flareTo: number, tipHalf = fullHalf): Point2[] {
  const out: Point2[] = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const d = (lengthCm * i) / n;
    const u = Math.min(1, d / flareTo);
    const flare = nutHalf + (fullHalf - nutHalf) * Math.sin((u * Math.PI) / 2);
    const h = d <= flareTo ? flare : fullHalf + (tipHalf - fullHalf) * ((d - flareTo) / (lengthCm - flareTo));
    out.push([r2(d), Math.round(h * 1000) / 1000]);
  }
  return out;
}

function r2(v: number) {
  return Math.round(v * 100) / 100 || 0;
}

function dedupe(pts: Point2[]): Point2[] {
  const out: Point2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02) out.push(p);
  }
  const f = out[0];
  const l = out[out.length - 1];
  if (out.length > 2 && Math.hypot(f[0] - l[0], f[1] - l[1]) <= 0.02) out.pop();
  return out;
}

export function pointInPolygon(pt: Point2, poly: Point2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a closed polyline. */
function distToPolyline(pt: Point2, poly: Point2[]) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy));
  }
  return best;
}

/** Shrinks a shape uniformly about `centre` until it lies inside `outline`, `margin` from its edge. */
export function keepInside(pts: Point2[], outline: Point2[], centre: Point2, margin: number): Point2[] {
  const ok = (q: Point2) => pointInPolygon(q, outline) && distToPolyline(q, outline) >= margin;
  let k = 1;
  const at = (p: Point2): Point2 => [r2(centre[0] + (p[0] - centre[0]) * k), r2(centre[1] + (p[1] - centre[1]) * k)];
  while (k > 0.4 && !pts.every((p) => ok(at(p)))) k -= 0.02;
  return pts.map(at);
}

/** True when no two non-adjacent edges of the closed polygon cross. */
export function isSimplePolygon(pts: Point2[]) {
  const n = pts.length;
  const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ templates */

export interface TemplateSpec {
  id: string;
  name: string;
  description: string;
  /** Short family label shown in the template picker. */
  label: string;
  kind: GuitarProfile['kind'];
  strings?: GuitarProfile['strings'];
  inlay: NonNullable<GuitarProfile['inlay']>;
  scaleLengthCm: number;
  fretCount: number;
  bodyJoinFret: number;
  nutWidthCm: number;
  endWidthCm: number;
  stringSpacingNutCm: number;
  stringSpacingSaddleCm: number;
  body: BodySpec | { solid: true; lengthCm: number };
  depthCm: number;
  /** 0 = no soundhole. */
  soundholeRadiusCm: number;
  /** Gap between the fretboard end and the soundhole edge. */
  soundholeGapCm?: number;
  bridge: { widthCm: number; lengthCm: number; style: 'pin' | 'tieblock' | 'electric' };
  pickguard: boolean;
  headstock: { lengthCm: number; nutHalf: number; fullHalf: number; flareTo: number; tipHalf?: number; tuners: number[]; angleDeg: number; slotted?: boolean };
  finish: GuitarFinish;
  electric?: GuitarProfile['electric'];
}

const DREAD: BodySpec = { lengthCm: 50.8, upperCm: 29.2, waistCm: 27.0, lowerCm: 39.7, upperT: 0.2, waistT: 0.44, lowerT: 0.74, shoulder: 3.2, tail: 2.4 };

export const TEMPLATE_SPECS: TemplateSpec[] = [
  {
    id: 'natural-dreadnought', name: 'Doğal Dreadnought', label: 'Dreadnought',
    description: 'Ladin kapak, gül ağacı sırt ve yanlar, nokta işaretler. Klasik akustik ses.',
    kind: 'acoustic', inlay: 'dots', scaleLengthCm: 64.5, fretCount: 20, bodyJoinFret: 14, nutWidthCm: 4.3, endWidthCm: 5.6,
    stringSpacingNutCm: 3.6, stringSpacingSaddleCm: 5.4, body: DREAD, depthCm: 12.0, soundholeRadiusCm: 5.0, soundholeGapCm: 0.7,
    bridge: { widthCm: 15.2, lengthCm: 3.8, style: 'pin' }, pickguard: true,
    headstock: { lengthCm: 18.4, nutHalf: 2.2, fullHalf: 3.6, flareTo: 4.2, tuners: [5.8, 9.8, 13.6], angleDeg: 14 },
    finish: {
      top: '#dcbb87', sides: '#4b2a1b', back: '#4b2a1b', neck: '#7a4a2c', headstock: '#2b1a12', fretboard: '#2c1d16', binding: '#efe6d0',
      pickguard: '#3b1d10', bridge: '#25170f', hardware: 'chrome', gloss: 0.8,
      topWood: 'spruce', backWood: 'rosewood', neckWood: 'mahogany', fretboardWood: 'rosewood',
    },
  },
  {
    id: 'sunburst-dreadnought', name: 'Sunburst Dreadnought', label: 'Dreadnought',
    description: 'Kenarlara doğru koyulaşan sunburst ladin kapak, maun gövde. Sıcak ve dolgun.',
    kind: 'acoustic', inlay: 'dots', scaleLengthCm: 64.5, fretCount: 20, bodyJoinFret: 14, nutWidthCm: 4.3, endWidthCm: 5.6,
    stringSpacingNutCm: 3.6, stringSpacingSaddleCm: 5.4, body: DREAD, depthCm: 12.0, soundholeRadiusCm: 5.0, soundholeGapCm: 0.7,
    bridge: { widthCm: 15.2, lengthCm: 3.8, style: 'pin' }, pickguard: true,
    headstock: { lengthCm: 18.4, nutHalf: 2.2, fullHalf: 3.6, flareTo: 4.2, tuners: [5.8, 9.8, 13.6], angleDeg: 14 },
    finish: {
      top: '#d89a46', sides: '#4e2614', back: '#4e2614', neck: '#5e3420', headstock: '#120c09', fretboard: '#2c1d16', binding: '#efe6d0',
      pickguard: '#0f0b09', bridge: '#25170f', hardware: 'chrome', gloss: 0.85, sunburstEdge: '#150a05',
      topWood: 'spruce', backWood: 'mahogany', neckWood: 'mahogany', fretboardWood: 'rosewood',
    },
  },
  {
    id: 'classical', name: 'Klasik Gitar', label: 'Klasik',
    description: 'Naylon teller, 5,2 cm geniş eşik, oluklu kafa, 12. perdeden birleşen sap. Parmak stili için.',
    kind: 'classical', strings: 'nylon', inlay: 'none', scaleLengthCm: 65, fretCount: 19, bodyJoinFret: 12, nutWidthCm: 5.2, endWidthCm: 6.2,
    stringSpacingNutCm: 4.3, stringSpacingSaddleCm: 5.8,
    body: { lengthCm: 48.6, upperCm: 28.2, waistCm: 23.8, lowerCm: 36.8, upperT: 0.22, waistT: 0.45, lowerT: 0.74, shoulder: 2.5, tail: 2.3 },
    depthCm: 9.8, soundholeRadiusCm: 4.3, soundholeGapCm: 0.6,
    bridge: { widthCm: 18.8, lengthCm: 2.9, style: 'tieblock' }, pickguard: false,
    headstock: { lengthCm: 19.0, nutHalf: 2.75, fullHalf: 2.95, flareTo: 3.0, tipHalf: 3.15, tuners: [5.2, 8.7, 12.2], angleDeg: 12, slotted: true },
    finish: {
      top: '#c08a52', sides: '#4a281a', back: '#4a281a', neck: '#7a4a2c', headstock: '#3a2216', fretboard: '#1d1513', binding: '#c9a57a',
      pickguard: null, bridge: '#3a2216', hardware: 'gold', gloss: 0.75,
      topWood: 'cedar', backWood: 'rosewood', neckWood: 'mahogany', fretboardWood: 'ebony',
    },
  },
  {
    id: 'mahogany-parlor', name: 'Maun Parlor', label: 'Parlor',
    description: 'Küçük, rahat gövde; maun kapak ve gövde, kısa tel boyu. Yumuşak, odaklı ton.',
    kind: 'acoustic', inlay: 'dots', scaleLengthCm: 62.9, fretCount: 18, bodyJoinFret: 12, nutWidthCm: 4.5, endWidthCm: 5.6,
    stringSpacingNutCm: 3.75, stringSpacingSaddleCm: 5.3,
    body: { lengthCm: 47.4, upperCm: 24.6, waistCm: 20.8, lowerCm: 34.3, upperT: 0.23, waistT: 0.46, lowerT: 0.74, shoulder: 2.5, tail: 2.3 },
    depthCm: 10.5, soundholeRadiusCm: 4.4, soundholeGapCm: 0.6,
    bridge: { widthCm: 14.0, lengthCm: 3.4, style: 'pin' }, pickguard: true,
    headstock: { lengthCm: 17.0, nutHalf: 2.3, fullHalf: 3.35, flareTo: 3.8, tipHalf: 3.2, tuners: [5.4, 9.0, 12.6], angleDeg: 14 },
    finish: {
      top: '#6e3b20', sides: '#5e321c', back: '#5e321c', neck: '#6a3a22', headstock: '#24160f', fretboard: '#2c1d16', binding: '#e9dcc0',
      pickguard: '#2b1209', bridge: '#22150e', hardware: 'chrome', gloss: 0.35,
      topWood: 'mahogany', backWood: 'mahogany', neckWood: 'mahogany', fretboardWood: 'rosewood',
    },
  },
  {
    id: 'cutaway-grand-auditorium', name: 'Kesik Grand Auditorium', label: 'Grand Auditorium',
    description: 'Doğal ladin kapak, akçaağaç gövde, tiz tarafta kesik. Yüksek perdelere kolay erişim.',
    kind: 'acoustic', inlay: 'blocks', scaleLengthCm: 64.8, fretCount: 20, bodyJoinFret: 14, nutWidthCm: 4.45, endWidthCm: 5.7,
    stringSpacingNutCm: 3.65, stringSpacingSaddleCm: 5.45,
    body: { lengthCm: 50.2, upperCm: 29.0, waistCm: 24.2, lowerCm: 40.6, upperT: 0.21, waistT: 0.44, lowerT: 0.72, shoulder: 2.7, tail: 2.3, cutaway: { heelHalfCm: 3.3, lengthT: 0.2 } },
    depthCm: 11.5, soundholeRadiusCm: 4.9, soundholeGapCm: 0.7,
    bridge: { widthCm: 15.0, lengthCm: 3.8, style: 'pin' }, pickguard: true,
    headstock: { lengthCm: 18.0, nutHalf: 2.25, fullHalf: 3.5, flareTo: 4.0, tipHalf: 3.3, tuners: [5.6, 9.6, 13.4], angleDeg: 14 },
    finish: {
      top: '#e2c592', sides: '#b98a52', back: '#b98a52', neck: '#7a4a2c', headstock: '#151112', fretboard: '#151112', binding: '#f0e8d4',
      pickguard: '#2a1a10', bridge: '#151112', hardware: 'chrome', gloss: 0.85,
      topWood: 'spruce', backWood: 'maple', neckWood: 'mahogany', fretboardWood: 'ebony',
    },
  },
  {
    id: 'solid-electric', name: 'Elektro Gitar', label: 'Elektro',
    description: 'Masif gövde, iki manyetik, 22 perde. Ses deliği yok; ince sap, hafif teller.',
    kind: 'electric', inlay: 'dots', scaleLengthCm: 64.8, fretCount: 22, bodyJoinFret: 16, nutWidthCm: 4.25, endWidthCm: 5.6,
    stringSpacingNutCm: 3.5, stringSpacingSaddleCm: 5.25, body: { solid: true, lengthCm: 44.6 }, depthCm: 4.5, soundholeRadiusCm: 0,
    bridge: { widthCm: 8.6, lengthCm: 3.6, style: 'electric' }, pickguard: false,
    headstock: { lengthCm: 17.5, nutHalf: 2.1, fullHalf: 3.3, flareTo: 4.0, tipHalf: 3.0, tuners: [5.2, 9.0, 12.8], angleDeg: 10 },
    finish: {
      top: '#5e1a20', sides: '#5e1a20', back: '#5e1a20', neck: '#d8b07a', headstock: '#5e1a20', fretboard: '#2c1d16', binding: null,
      pickguard: null, bridge: '#c8c8cc', hardware: 'chrome', gloss: 0.9,
      topWood: 'solid', backWood: 'solid', neckWood: 'maple', fretboardWood: 'rosewood',
    },
    electric: { pickups: 2, pickupStyle: 'humbucker', knobs: 3 },
  },
];

/** Builds the complete profile of a template. */
export function buildTemplateProfile(t: TemplateSpec): GuitarProfile {
  const L = t.scaleLengthCm;
  const xTop = r2(fretX(L, t.bodyJoinFret) + 0.1);
  const outline = 'solid' in t.body ? solidBodyOutline(xTop, t.body.lengthCm) : acousticOutline(t.body, xTop);
  const fbEnd = fretX(L, t.fretCount) - 0.8;
  const bodyLen = t.body.lengthCm;
  const sh = t.soundholeRadiusCm > 0
    ? { x: r2(fbEnd - (t.soundholeGapCm ?? 0.7) - t.soundholeRadiusCm), y: 0, radiusCm: t.soundholeRadiusCm }
    : { x: r2(xTop - bodyLen * 0.45), y: 0, radiusCm: 0 };
  const bridgeX = r2(-L - (t.bridge.style === 'tieblock' ? 0.7 : t.bridge.style === 'electric' ? 0.9 : 0.45));
  let minX = Infinity;
  for (const [x] of outline) minX = Math.min(minX, x);
  const body: GuitarProfile['body'] = {
    outline,
    depthCm: t.depthCm,
    soundhole: sh,
    lengthCm: r2(xTop - minX),
    bridge: { x: bridgeX, widthCm: t.bridge.widthCm, lengthCm: t.bridge.lengthCm },
    bridgeStyle: t.bridge.style,
    cutaway: 'solid' in t.body ? 'double' : t.body.cutaway ? 'venetian' : 'none',
  };
  if (!('solid' in t.body)) {
    body.bouts = {
      upperCm: t.body.upperCm, waistCm: t.body.waistCm, lowerCm: t.body.lowerCm,
      upperX: r2(xTop - t.body.upperT * t.body.lengthCm), waistX: r2(xTop - t.body.waistT * t.body.lengthCm), lowerX: r2(xTop - t.body.lowerT * t.body.lengthCm),
    };
  }
  if (t.pickguard && sh.radiusCm > 0) {
    body.pickguard = keepInside(teardropPickguard(sh, !('solid' in t.body) && t.body.lowerCm < 36 ? 0.85 : 1), outline, [sh.x - 3.5, sh.y - sh.radiusCm - 2.5], 1.0);
  }
  const h = t.headstock;
  const p: GuitarProfile = {
    id: t.id,
    name: t.name,
    kind: t.kind,
    ...(t.strings ? { strings: t.strings } : {}),
    inlay: t.inlay,
    ...(t.electric ? { electric: t.electric } : {}),
    totalLengthCm: 0,
    scaleLengthCm: L,
    fretCount: t.fretCount,
    bodyJoinFret: t.bodyJoinFret,
    nutWidthCm: t.nutWidthCm,
    endWidthCm: t.endWidthCm,
    stringSpacingNutCm: t.stringSpacingNutCm,
    stringSpacingSaddleCm: t.stringSpacingSaddleCm,
    body,
    headstock: {
      lengthCm: h.lengthCm,
      profile: headstockProfile(h.lengthCm, h.nutHalf, h.fullHalf, h.flareTo, h.tipHalf),
      tunersLowE: h.tuners,
      tunersHighE: h.tuners,
      angleDeg: h.angleDeg,
      ...(h.slotted ? { slotted: true } : {}),
    },
    finish: t.finish,
    textures: {},
    source: 'Şablon: scripts/gen-guitar-templates.ts ile parametrik olarak üretildi.',
    builtIn: true,
  };
  p.totalLengthCm = Math.round(modelledLength(p) * 10) / 10;
  return p;
}

/** Row of /guitar/templates/index.json. */
export function templateIndexEntry(t: TemplateSpec) {
  return { id: t.id, name: t.name, description: t.description, kind: t.label, profileUrl: `/guitar/templates/${t.id}.profile.json` };
}

/** Sanity check of a profile's outline orientation (clockwise like the measured ones). */
export function isClockwise(pts: Point2[]) {
  return polygonArea(pts) < 0;
}
