/** Assembles a GuitarProfile from the wizard's measurements, filling gaps with typical acoustic values. */
import type { GuitarFinish, GuitarProfile, Point2 } from '@guitar3d/shared';
import { fretAt } from './geometry';
import type { BodyMeasurements } from './body';

export const DEFAULT_FINISH: GuitarFinish = {
  top: '#1a1a1a',
  sides: '#161616',
  back: '#161616',
  neck: '#1c1c1c',
  headstock: '#141414',
  fretboard: '#2b1d14',
  binding: '#e9e4d8',
  pickguard: null,
  bridge: '#1d1410',
  hardware: 'chrome',
  gloss: 0.35,
};

export interface ProfileParts {
  name: string;
  totalLengthCm: number;
  scaleLengthCm: number;
  body: Pick<BodyMeasurements, 'outline' | 'bounds' | 'lengthCm' | 'bouts'>;
  soundhole: { x: number; y: number; radiusCm: number };
  /** Saddle position in the guitar frame (≈ -scaleLength); the bridge plate sits just behind it. */
  saddleX?: number;
  fretCount?: number;
  bodyJoinFret?: number;
  nutWidthCm?: number;
  endWidthCm?: number;
  depthCm?: number;
  headstock?: { lengthCm: number; profile: Point2[]; tunersLowE: number[]; tunersHighE: number[]; angleDeg?: number };
  finish?: Partial<GuitarFinish>;
  source?: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Typical 3+3 headstock when none was measured: ~19 cm, widening from the nut. */
export function defaultHeadstock(nutWidthCm: number) {
  const len = 19;
  const profile: Point2[] = Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    return [r2(t * len), r2(nutWidthCm / 2 + Math.min(1, t * 2.5) * 1.6 - Math.max(0, t - 0.85) * 2)];
  });
  return { lengthCm: len, profile, tunersLowE: [5, 9, 13], tunersHighE: [5, 9, 13], angleDeg: 14 };
}

/** Profile without `id` (the server assigns it) and with empty textures (uploaded separately). */
export function assembleProfile(p: ProfileParts): Omit<GuitarProfile, 'id'> {
  const fretCount = p.fretCount ?? 20;
  // The neck joins the body where the body outline ends.
  const joinGuess = Math.round(fretAt(p.scaleLengthCm, -p.body.bounds.maxX));
  const bodyJoinFret = p.bodyJoinFret ?? Math.min(16, Math.max(12, joinGuess || 14));
  const nutWidthCm = p.nutWidthCm ?? 4.3;
  const endWidthCm = p.endWidthCm ?? r2(nutWidthCm + 1.3);
  const saddleX = p.saddleX ?? -p.scaleLengthCm;
  const head = p.headstock ?? defaultHeadstock(nutWidthCm);
  return {
    name: p.name.trim() || 'Gitarım',
    totalLengthCm: r2(p.totalLengthCm),
    scaleLengthCm: r2(p.scaleLengthCm),
    fretCount,
    bodyJoinFret,
    nutWidthCm: r2(nutWidthCm),
    endWidthCm: r2(endWidthCm),
    stringSpacingNutCm: r2(nutWidthCm * 0.83),
    stringSpacingSaddleCm: 5.4,
    body: {
      outline: p.body.outline,
      depthCm: p.depthCm ?? 11.5,
      soundhole: { x: r2(p.soundhole.x), y: r2(p.soundhole.y), radiusCm: r2(p.soundhole.radiusCm) },
      bridge: { x: r2(saddleX - 0.5), widthCm: 15.5, lengthCm: 3.2 },
      bounds: p.body.bounds,
      lengthCm: p.body.lengthCm,
      bouts: p.body.bouts,
    },
    headstock: { lengthCm: head.lengthCm, profile: head.profile, tunersLowE: head.tunersLowE, tunersHighE: head.tunersHighE, angleDeg: head.angleDeg ?? 14 },
    finish: { ...DEFAULT_FINISH, ...p.finish },
    textures: {},
    source: p.source ?? 'Fotoğraftan oluşturuldu (Guitar3D sihirbazı).',
  };
}
