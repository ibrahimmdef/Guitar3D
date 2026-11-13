/** Resizing and recolouring an existing profile (template → "my guitar"). Pure, no DOM. */
import type { GuitarFinish, GuitarProfile, Point2 } from '@guitar3d/shared';

/** Nominal overall lengths offered in the UI: 36"–42" (travel / 3⁄4 size up to jumbo). */
export const SIZE_PRESETS = [36, 37, 38, 39, 40, 41, 42].map((inches) => ({ label: `${inches}″`, inches, cm: Math.round(inches * 25.4) / 10 }));

export const MIN_TOTAL_CM = 80;
export const MAX_TOTAL_CM = 125;
export const MIN_SCALE_CM = 45;
export const MAX_SCALE_CM = 72;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Scale length that keeps a template's proportions at a new overall length. */
export const proportionalScale = (base: Pick<GuitarProfile, 'totalLengthCm' | 'scaleLengthCm'>, totalCm: number) =>
  Math.round(((base.scaleLengthCm * totalCm) / base.totalLengthCm) * 10) / 10;

/** Turkish validation message for a size request, or null when it is usable. */
export function sizeProblem(totalCm: number, scaleCm: number): string | null {
  if (!Number.isFinite(totalCm) || totalCm < MIN_TOTAL_CM || totalCm > MAX_TOTAL_CM) return `Toplam boy ${MIN_TOTAL_CM}–${MAX_TOTAL_CM} cm arasında olmalı.`;
  if (!Number.isFinite(scaleCm) || scaleCm < MIN_SCALE_CM || scaleCm > MAX_SCALE_CM) return `Tel boyu ${MIN_SCALE_CM}–${MAX_SCALE_CM} cm arasında olmalı.`;
  if (scaleCm > totalCm * 0.72) return 'Tel boyu toplam boya göre çok uzun.';
  if (scaleCm < totalCm * 0.5) return 'Tel boyu toplam boya göre çok kısa.';
  return null;
}

export interface Customization {
  name?: string;
  totalLengthCm?: number;
  scaleLengthCm?: number;
  finish?: Partial<GuitarFinish>;
}

/**
 * New profile from `base` with another size and finish. The body scales with the scale length
 * (so the neck still meets it at `bodyJoinFret` and the bridge sits on the saddle); the headstock
 * length absorbs the rest so the overall length matches. Without an explicit scale length the
 * template's proportions are kept. Returns a profile without server fields (id, timestamps, builtIn).
 */
export function customizeProfile(base: GuitarProfile, c: Customization): Omit<GuitarProfile, 'id'> {
  const total = c.totalLengthCm ?? base.totalLengthCm;
  const S0 = base.scaleLengthCm;
  const S = c.scaleLengthCm ?? (c.totalLengthCm ? proportionalScale(base, total) : S0);
  const k = S / S0;
  const bx = (x: number) => r2(-S + (x + S0) * k);
  const pt = ([x, y]: Point2): Point2 => [bx(x), r2(y * k)];
  const b = base.body;
  // where the body ends (tail) beyond the saddle, after scaling
  const minX = b.bounds?.minX ?? Math.min(...b.outline.map((p) => p[0]));
  const tail = (-S0 - minX) * k;
  const head0 = base.headstock.lengthCm;
  const kh = Math.min(1.5, Math.max(0.6, (total - S - tail) / head0));
  const body: GuitarProfile['body'] = {
    ...b,
    outline: b.outline.map(pt),
    depthCm: r2(b.depthCm * Math.sqrt(k)),
    soundhole: { x: bx(b.soundhole.x), y: r2(b.soundhole.y * k), radiusCm: r2(b.soundhole.radiusCm * k) },
    bridge: { ...b.bridge, x: bx(b.bridge.x), widthCm: r2(b.bridge.widthCm * k), lengthCm: r2(b.bridge.lengthCm * k) },
  };
  if (b.bounds) body.bounds = { minX: bx(b.bounds.minX), maxX: bx(b.bounds.maxX), minY: r2(b.bounds.minY * k), maxY: r2(b.bounds.maxY * k) };
  if (b.lengthCm) body.lengthCm = r2(b.lengthCm * k);
  if (b.bouts) {
    body.bouts = { upperCm: r2(b.bouts.upperCm * k), waistCm: r2(b.bouts.waistCm * k), lowerCm: r2(b.bouts.lowerCm * k) };
    for (const key of ['upperX', 'waistX', 'lowerX'] as const) if (b.bouts[key] != null) body.bouts[key] = bx(b.bouts[key]!);
  }
  if (b.pickguard) body.pickguard = b.pickguard.map(pt);
  const headstock: GuitarProfile['headstock'] = {
    ...base.headstock,
    lengthCm: r2(head0 * kh),
    profile: base.headstock.profile.map(([d, w]) => [r2(d * kh), w] as Point2),
    tunersLowE: base.headstock.tunersLowE.map((d) => r2(d * kh)),
    tunersHighE: base.headstock.tunersHighE.map((d) => r2(d * kh)),
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, builtIn: _b, createdAt: _c, updatedAt: _u, ...rest } = base;
  return {
    ...rest,
    name: (c.name ?? base.name).trim() || base.name,
    totalLengthCm: r2(S + tail + head0 * kh),
    scaleLengthCm: r2(S),
    stringSpacingSaddleCm: base.stringSpacingSaddleCm,
    body,
    headstock,
    finish: { ...base.finish, ...c.finish },
    textures: { ...base.textures },
    source: `${base.name} şablonundan uyarlandı.`,
  };
}
