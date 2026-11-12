/**
 * Shared contract between the 3D renderer (apps/web/src/fretboard), the photo → guitar
 * pipeline (apps/web/src/guitar-setup) and the UI. All lengths are centimetres.
 *
 * Coordinate frame used by every field below:
 *  - x runs along the guitar, 0 at the nut, negative towards the body (bridge saddle at -scaleLengthCm),
 *    positive towards the headstock.
 *  - y runs across, +y is the low E (6th string) side, -y the high e side.
 *  - z points out of the top of the guitar, 0 at the body top surface.
 *
 * Ownership: the pipeline workstream owns this file. Other workstreams may read it and
 * propose additive changes only (new optional fields), never rename or remove fields.
 */

export type Point2 = [number, number];

export interface GuitarTextures {
  /** Front photo of the body, masked to the outline, rectified so u/v map to body.bounds. */
  bodyTop?: string;
  /** Rectified fretboard photo: left edge = nut, right edge = toFret, top row = low E edge. */
  fretboard?: { url: string; toFret: number };
  /** Straightened headstock face photo: top row = tip, bottom row = nut, left column = low E side. */
  headstock?: string;
  /** Back photo of the body (optional), same mapping as bodyTop but mirrored across y. */
  bodyBack?: string;
}

export interface GuitarFinish {
  top: string;
  sides: string;
  back: string;
  neck: string;
  headstock: string;
  fretboard: string;
  binding: string | null;
  pickguard: string | null;
  bridge: string;
  hardware: 'chrome' | 'gold' | 'black';
  /** 0 = satin/matte, 1 = high gloss. */
  gloss: number;
}

export interface GuitarProfile {
  id: string;
  name: string;
  /** Overall length tip of headstock → end of body, e.g. 106.7 for a 42" guitar. */
  totalLengthCm: number;
  scaleLengthCm: number;
  fretCount: number;
  /** Fret at which the neck meets the body (14 for most dreadnoughts). */
  bodyJoinFret: number;
  nutWidthCm: number;
  /** Fretboard width at the last fret. */
  endWidthCm: number;
  stringSpacingNutCm: number;
  stringSpacingSaddleCm: number;
  body: {
    /** Closed outline in the guitar frame (x, y), clockwise, ~150–300 points. */
    outline: Point2[];
    depthCm: number;
    soundhole: { x: number; y: number; radiusCm: number };
    /** Optional pickguard outline in the guitar frame. */
    pickguard?: Point2[];
    bridge: { x: number; widthCm: number; lengthCm: number };
  };
  headstock: {
    lengthCm: number;
    /** [distance from nut, half width] pairs from the nut to the tip. */
    profile: Point2[];
    /** Distance from the nut of each tuner post, low E side and high e side. */
    tunersLowE: number[];
    tunersHighE: number[];
    /** Back-angle in degrees (typical acoustic ~14). */
    angleDeg: number;
  };
  finish: GuitarFinish;
  textures: GuitarTextures;
  /** Free-form note about where measurements came from. */
  source?: string;
}

/** Camera behaviour requested by the UI. */
export type CameraMode = 'follow' | 'overview' | 'neck' | 'free';

/** Which way the guitar faces the viewer. */
export type GuitarView = 'player' | 'audience';
