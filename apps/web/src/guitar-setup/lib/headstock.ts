/** Headstock straightening, port of build_headstock() in scripts/build-veston-textures.py. */
import type { Point2 } from '@guitar3d/shared';
import { createImage, dot, lerp, lerpPt, norm, sampleBilinear, sub, type Pt, type RGBAImage } from './image';

export interface HeadstockInput {
  /** Outline points on the low E side, from the nut to the tip (≥ 2). */
  lowSide: Pt[];
  /** Outline points on the high e side, from the nut to the tip (≥ 2). */
  highSide: Pt[];
  /** Tuner post centres (any order). */
  tunersLowE?: Pt[];
  tunersHighE?: Pt[];
  /** Pixels per cm across the headstock (e.g. nut width in px / nut width in cm). */
  pxPerCmAcross: number;
  /** >1 when the headstock leans away from the camera (along distances look shorter). Default 1. */
  alongFactor?: number;
}

export interface HeadstockResult {
  texture: RGBAImage;
  lengthCm: number;
  /** [distance from nut, half width] pairs, 21 samples. */
  profile: Point2[];
  tunersLowE: number[];
  tunersHighE: number[];
}

/** Axis of the headstock: from the nut centre to the tip centre. */
function axisOf(inp: HeadstockInput) {
  const base = lerpPt(inp.lowSide[0], inp.highSide[0], 0.5);
  const tip = lerpPt(inp.lowSide[inp.lowSide.length - 1], inp.highSide[inp.highSide.length - 1], 0.5);
  return { base, dir: norm(sub(tip, base)) };
}

/** Point on a side polyline at parameter t (0 = first point, 1 = last), by projection on the axis. */
export function sideAt(pts: Pt[], t: number, dir: Pt): Pt {
  const proj = pts.map((p) => dot(p, dir));
  const target = lerp(proj[0], proj[proj.length - 1], t);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = proj[i], b = proj[i + 1];
    if ((target >= a && target <= b) || (target <= a && target >= b)) {
      const f = b === a ? 0 : (target - a) / (b - a);
      return lerpPt(pts[i], pts[i + 1], f);
    }
  }
  return t <= 0 ? pts[0] : pts[pts.length - 1];
}

export function buildHeadstock(img: RGBAImage, inp: HeadstockInput, outW = 512, outH = 1024): HeadstockResult {
  if (inp.lowSide.length < 2 || inp.highSide.length < 2) throw new Error('Her iki kenar için en az 2 nokta gerekli.');
  const { dir } = axisOf(inp);
  const across: Pt = [-dir[1], dir[0]];
  const texture = createImage(outW, outH);
  const px = [0, 0, 0, 0];
  for (let j = 0; j < outH; j++) {
    const t = 1 - (j + 0.5) / outH; // top row = tip
    const l = sideAt(inp.lowSide, t, dir);
    const h = sideAt(inp.highSide, t, dir);
    for (let i = 0; i < outW; i++) {
      const s = 0.02 + 0.96 * ((i + 0.5) / outW); // left column = low E side, 2 % inset avoids background bleed
      sampleBilinear(img, lerp(l[0], h[0], s), lerp(l[1], h[1], s), px);
      const o = (j * outW + i) * 4;
      texture.data[o] = px[0];
      texture.data[o + 1] = px[1];
      texture.data[o + 2] = px[2];
      texture.data[o + 3] = 255;
    }
  }
  const sAlong = inp.pxPerCmAcross / (inp.alongFactor ?? 1);
  const sideLen = (pts: Pt[]) => Math.abs(dot(sub(pts[pts.length - 1], pts[0]), dir));
  const length = (sideLen(inp.lowSide) + sideLen(inp.highSide)) / 2 / sAlong;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const profile: Point2[] = [];
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    const l = sideAt(inp.lowSide, t, dir);
    const h = sideAt(inp.highSide, t, dir);
    profile.push([r3(t * length), r3(Math.abs(dot(sub(h, l), across)) / 2 / inp.pxPerCmAcross)]);
  }
  const along = (pts: Pt[], p: Pt) => {
    const a = dot(pts[0], dir), b = dot(pts[pts.length - 1], dir);
    return r3(((dot(p, dir) - a) / (b - a)) * length);
  };
  const sortNum = (xs: number[]) => xs.sort((a, b) => a - b);
  return {
    texture,
    lengthCm: r3(length),
    profile,
    tunersLowE: sortNum((inp.tunersLowE ?? []).map((p) => along(inp.lowSide, p))),
    tunersHighE: sortNum((inp.tunersHighE ?? []).map((p) => along(inp.highSide, p))),
  };
}
