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
 *
 * Changelog (additive only):
 *  - v2.1 (feat/guitar-pipeline): `body.bounds`, `body.lengthCm`, `body.bouts`, `builtIn`,
 *    `createdAt`/`updatedAt`, `GuitarSummary`, `AppSettings`, `GUITAR_SIZE_PRESETS`,
 *    `GuitarTextureName`, `BUILTIN_GUITAR_ID`. The `bodyTop` mapping is now pinned to `body.bounds`.
 *  - v2.2 (feat/guitar-templates): `kind`, `strings`, `inlay`, `electric`, `body.cutaway`,
 *    `body.bridgeStyle`, `headstock.slotted`, finish wood types and `finish.sunburstEdge`.
 *    A soundhole with `radiusCm: 0` means no soundhole (solid bodies).
 */

export type GuitarKind = 'acoustic' | 'classical' | 'electric';
export type WoodType = 'spruce' | 'cedar' | 'mahogany' | 'rosewood' | 'maple' | 'ebony' | 'walnut' | 'alder' | 'solid';

export type Point2 = [number, number];

export interface GuitarTextures {
  /**
   * Front photo of the body, masked to the outline (alpha = 0 outside), rectified so u/v map to
   * `body.bounds` (or to the outline's bounding box when `bounds` is missing):
   *   u = (x - minX) / (maxX - minX)  → left column = tail end of the body, right column = neck side;
   *   v = (y - minY) / (maxY - minY)  → bottom row = high e side (-y), top row = low E side (+y).
   * This is the plain planar mapping a three.js ShapeGeometry in the xy plane gets after normalising
   * its UVs by the bounds (three.js v = 0 is the bottom row of the image).
   */
  bodyTop?: string;
  /** Rectified fretboard photo: left edge = nut, right edge = toFret, top row = low E edge. */
  fretboard?: { url: string; toFret: number };
  /** Straightened headstock face photo: top row = tip, bottom row = nut, left column = low E side. */
  headstock?: string;
  /** Back photo of the body (optional), same mapping as bodyTop but mirrored across y. */
  bodyBack?: string;
  /**
   * Square RGBA ring texture of the rosette (optional), centred on body.soundhole: the texture's
   * inscribed circle is the rosette's outer edge and the soundhole edge sits at 78 % of that
   * radius (transparent inside).
   */
  rosette?: string;
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
  /** Wood grain drawn procedurally over the colours above ('solid' or missing = plain paint). */
  topWood?: WoodType;
  backWood?: WoodType;
  neckWood?: WoodType;
  fretboardWood?: WoodType;
  /** Edge colour of a sunburst top (the centre is `top`). */
  sunburstEdge?: string;
}

/** Solid-body electric parts (all optional, sensible defaults). */
export interface ElectricSpec {
  /** Number of pickups (1–3), spread between the neck end and the bridge. */
  pickups: number;
  pickupStyle?: 'single' | 'humbucker';
  /** Control knobs on the treble side of the lower bout. */
  knobs?: number;
}

export interface GuitarProfile {
  id: string;
  name: string;
  /** Instrument family (missing = 'acoustic'). */
  kind?: GuitarKind;
  /** String set (missing = 'steel'; classical guitars use 'nylon'). */
  strings?: 'steel' | 'nylon';
  /** Fretboard position markers when there is no fretboard photo (missing = 'dots'). */
  inlay?: 'dots' | 'none' | 'blocks';
  electric?: ElectricSpec;
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
    /** Rectangle covered by `textures.bodyTop`; defaults to the outline's bounding box. */
    bounds?: { minX: number; maxX: number; minY: number; maxY: number };
    /** Length of the body along x (neck joint → tail), measured from the outline. */
    lengthCm?: number;
    /** Widths of the upper bout, waist and lower bout (full widths across y). */
    bouts?: { upperCm: number; waistCm: number; lowerCm: number; upperX?: number; waistX?: number; lowerX?: number };
    /** Cutaway on the treble (-y) side, already part of `outline`; informative for the UI. */
    cutaway?: 'none' | 'venetian' | 'double';
    /** 'pin' (steel acoustic, default), 'tieblock' (classical) or 'electric' (metal bridge, no pins). */
    bridgeStyle?: 'pin' | 'tieblock' | 'electric';
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
    /** Classical slotted headstock with rollers instead of posts. */
    slotted?: boolean;
  };
  finish: GuitarFinish;
  textures: GuitarTextures;
  /** Free-form note about where measurements came from. */
  source?: string;
  /** True for profiles shipped with the app (read-only on the server, e.g. 'veston'). */
  builtIn?: boolean;
  /** ISO timestamps maintained by the server. */
  createdAt?: string;
  updatedAt?: string;
}

/** Id of the built-in profile served by the web app at /guitar/veston.profile.json. */
export const BUILTIN_GUITAR_ID = 'veston';
export const BUILTIN_GUITAR_PROFILE_URL = '/guitar/veston.profile.json';

/** Texture slots accepted by `PUT /api/guitars/:id/textures/:name`. */
export type GuitarTextureName = 'bodyTop' | 'fretboard' | 'headstock' | 'bodyBack';
export const GUITAR_TEXTURE_NAMES: GuitarTextureName[] = ['bodyTop', 'fretboard', 'headstock', 'bodyBack'];

/** Row of `GET /api/guitars`. Built-in entries carry `builtIn: true` and no measurements. */
export interface GuitarSummary {
  id: string;
  name: string;
  builtIn?: boolean;
  totalLengthCm?: number;
  scaleLengthCm?: number;
  updatedAt?: string;
  /** URL of the body-top texture, handy as a thumbnail. */
  thumbnail?: string;
}

/** `GET/PUT /api/settings`. */
export interface AppSettings {
  activeGuitarId: string;
}

/** Common acoustic sizes: nominal overall length in inches → centimetres. */
export const GUITAR_SIZE_PRESETS: { label: string; inches: number; cm: number }[] = [
  { label: '39"', inches: 39, cm: 99.1 },
  { label: '40"', inches: 40, cm: 101.6 },
  { label: '41"', inches: 41, cm: 104.1 },
  { label: '42"', inches: 42, cm: 106.7 },
];

/** Camera behaviour requested by the UI. */
export type CameraMode = 'follow' | 'overview' | 'neck' | 'free';

/** Which way the guitar faces the viewer. */
export type GuitarView = 'player' | 'audience';
