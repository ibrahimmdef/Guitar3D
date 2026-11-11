/**
 * Physical description of the guitar, in centimetres.
 * The nut sits at x = 0 and the body extends towards negative x.
 * Overridable at runtime from /api/guitar/spec (data/guitar/guitar.json),
 * so measurements of the real instrument can be dropped in without code changes.
 */
export interface GuitarSpec {
  scaleLength: number;
  fretCount: number;
  bodyJoinFret: number;
  nutWidth: number;
  endWidth: number;
  stringSpacingNut: number;
  stringSpacingSaddle: number;
  bodyLength: number;
  upperBout: number;
  lowerBout: number;
  bodyDepth: number;
  soundholeRadius: number;
  inlays: number[];
  doubleInlays: number[];
  inlayShape: 'dot' | 'diamond' | 'block';
  colors: {
    top: string;
    sides: string;
    fretboard: string;
    neck: string;
    binding: string;
    inlay: string;
    rosette: string;
  };
  /** Optional .glb (e.g. generated with Meshy from photos) replacing the procedural body. */
  bodyModel?: { url: string; scale: number; position: [number, number, number]; rotation: [number, number, number] };
}

export const DEFAULT_SPEC: GuitarSpec = {
  scaleLength: 64.8,
  fretCount: 20,
  bodyJoinFret: 14,
  nutWidth: 4.3,
  endWidth: 5.7,
  stringSpacingNut: 3.6,
  stringSpacingSaddle: 5.4,
  bodyLength: 50,
  upperBout: 29,
  lowerBout: 39.5,
  bodyDepth: 11,
  soundholeRadius: 5,
  inlays: [3, 5, 7, 9, 15, 17, 19],
  doubleInlays: [12],
  inlayShape: 'dot',
  colors: {
    top: '#d9b07a',
    sides: '#6b3d22',
    fretboard: '#2a1a12',
    neck: '#7a4a2a',
    binding: '#efe6d2',
    inlay: '#f3ecdc',
    rosette: '#3a2a1e',
  },
};

export const FRETBOARD_TOP = 1.0;

export function fretX(spec: GuitarSpec, n: number) {
  return -spec.scaleLength * (1 - Math.pow(2, -n / 12));
}

/** Centre of the playing area for fret n (0 = open string, drawn just behind the nut). */
export function noteX(spec: GuitarSpec, fret: number) {
  if (fret === 0) return 1.2;
  return fretX(spec, fret - 1) * 0.42 + fretX(spec, fret) * 0.58;
}

export function fretboardEndX(spec: GuitarSpec) {
  return fretX(spec, spec.fretCount) - 0.8;
}

export function widthAt(spec: GuitarSpec, x: number) {
  const t = Math.min(1, Math.max(0, x / fretboardEndX(spec)));
  return spec.nutWidth + (spec.endWidth - spec.nutWidth) * t;
}

/** y offset of a tab string (1 = high e … 6 = low E). flip = true puts high e at the top like a tab. */
export function stringY(spec: GuitarSpec, string: number, x: number, flip: boolean) {
  const t = Math.min(1, Math.max(0, x / -spec.scaleLength));
  const spacing = spec.stringSpacingNut + (spec.stringSpacingSaddle - spec.stringSpacingNut) * t;
  const k = (3.5 - string) / 5;
  return (flip ? 1 : -1) * k * spacing;
}

export function stringZ(spec: GuitarSpec, x: number) {
  const t = Math.min(1, Math.max(0, x / -spec.scaleLength));
  return FRETBOARD_TOP + 0.18 + t * 0.55;
}

/** Half-width of the body outline at distance u (0 = neck joint) along the body. */
export function bodyHalfWidth(spec: GuitarSpec, u: number) {
  const L = spec.bodyLength;
  const sup = (t: number, p: number) => (Math.abs(t) >= 1 ? 0 : Math.pow(1 - Math.pow(Math.abs(t), p), 1 / p));
  const upperC = L * 0.24;
  const lowerC = L * 0.66;
  const upper = (spec.upperBout / 2) * sup((u - upperC) / (L * 0.25), 2.7);
  const lower = (spec.lowerBout / 2) * sup((u - lowerC) / (L * 0.34), 2.3);
  return Math.max(upper, lower);
}

export function bodyStartX(spec: GuitarSpec) {
  return fretX(spec, spec.bodyJoinFret) + 0.5;
}

export function mergeSpec(base: GuitarSpec, patch: Partial<GuitarSpec> | null | undefined): GuitarSpec {
  if (!patch) return base;
  return { ...base, ...patch, colors: { ...base.colors, ...(patch.colors ?? {}) } };
}
