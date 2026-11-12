/**
 * three.js geometry of the guitar, built from a GuitarProfile in the guitar frame
 * (cm; x along with the nut at 0 and the body at negative x, y across with +y = low E,
 * z out of the top). Static parts are merged per material so the whole instrument is a
 * few dozen draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GuitarProfile, Point2 } from '@guitar3d/shared';
import {
  bodyDepthAt, ccw, FB_THICK, FB_TOP, FRET_HEIGHT, fretboardEndX, fretboardWidth, fretX, interpTable,
  NUT_LENGTH, outlineXRange, outwardNormals, ROSETTE_INNER, SADDLE_TOP, saddleX, smoothstep, STRING_GAUGE,
  stringY, stringZ,
} from './geometry';

export type Part =
  | 'top' | 'sides' | 'back' | 'binding' | 'neck' | 'headstock' | 'pickguard' | 'bridge' | 'bone' | 'pin'
  | 'chrome' | 'fret' | 'interior' | 'hole' | 'dot';

export interface GuitarGeometry {
  parts: Partial<Record<Part, THREE.BufferGeometry>>;
  fretboard: THREE.BufferGeometry;
  headstockFace: THREE.BufferGeometry;
  rosette: { x: number; y: number; outer: number; inner: number };
  strings: StringPath[];
  /** Headstock frame: world = headstockMatrix * (d along, y, z from face). */
  headstockMatrix: THREE.Matrix4;
}

export interface StringPath {
  string: number;
  radius: number;
  wound: boolean;
  /** pin → saddle crest */
  back: THREE.Vector3[];
  /** saddle crest → nut (the speaking length) */
  speaking: [THREE.Vector3, THREE.Vector3];
  /** nut → tuner post, then windings */
  head: THREE.Vector3[];
  post: THREE.Vector3;
  postAxis: THREE.Vector3;
}

const BRIDGE_TOP = 0.86;
const HEAD_THICK = 1.35;
const EDGE_R = 0.42;
const BINDING_H = 0.55;

/* ------------------------------------------------------------------ helpers */

class Builder {
  pos: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  addVertex(p: THREE.Vector3 | [number, number, number], u = 0, v = 0) {
    const [x, y, z] = Array.isArray(p) ? p : [p.x, p.y, p.z];
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Lofts a closed outline through a list of (outward offset, z) profile samples. */
function loft(outline: Point2[], normals: Point2[], samples: (i: number) => [number, number][]) {
  const b = new Builder();
  const n = outline.length;
  const rows: number[][] = [];
  let len = 0;
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    if (i > 0) len += Math.hypot(outline[k][0] - outline[i - 1][0], outline[k][1] - outline[i - 1][1]);
    const s = samples(k);
    rows.push(s.map(([o, z], j) => b.addVertex([outline[k][0] + normals[k][0] * o, outline[k][1] + normals[k][1] * o, z], len / 10, j)));
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < rows[i].length - 1; j++) b.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
  }
  return b.build();
}

function shapeFrom(pts: Point2[]) {
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

function circlePath(cx: number, cy: number, r: number, n = 72) {
  const p = new THREE.Path();
  for (let i = 0; i <= n; i++) {
    const a = (-i / n) * Math.PI * 2; // clockwise for holes
    if (i === 0) p.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    else p.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return p;
}

function at(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(m);
}

function merge(list: THREE.BufferGeometry[]) {
  const clean = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  return mergeGeometries(clean, false)!;
}

/* ------------------------------------------------------------------ body */

function buildBody(p: GuitarProfile, parts: GuitarGeometry['parts']) {
  const outline = ccw(p.body.outline);
  const normals = outwardNormals(outline);
  const depth = (i: number) => bodyDepthAt(p, outline[i][0]);
  const arc = (from: number, to: number, steps: number, zc: number, sign: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let s = 0; s <= steps; s++) {
      const a = from + ((to - from) * s) / steps;
      out.push([-EDGE_R + EDGE_R * Math.sin(a), zc + sign * EDGE_R * Math.cos(a)]);
    }
    return out;
  };
  // top round-over + top binding band (cream)
  parts.binding = merge([
    loft(outline, normals, () => [...arc(0, Math.PI / 2, 5, -EDGE_R, 1), [0, -BINDING_H]]),
    loft(outline, normals, (i) => [[0, -depth(i) + BINDING_H * 0.8], ...arc(Math.PI / 2, 0, 5, -depth(i) + EDGE_R, -1)]),
  ]);
  // purfling-free black sides between the two bindings
  parts.sides = loft(outline, normals, (i) => [[0, -BINDING_H], [0, -depth(i) + BINDING_H * 0.8]]);

  // flat top with the soundhole, inset by the edge radius
  const inset = outline.map(([x, y], i) => [x - normals[i][0] * EDGE_R, y - normals[i][1] * EDGE_R] as Point2);
  const sh = p.body.soundhole;
  const topShape = shapeFrom(inset);
  topShape.holes.push(circlePath(sh.x, sh.y, sh.radiusCm));
  parts.top = new THREE.ShapeGeometry(topShape, 1);

  const back = new THREE.ShapeGeometry(shapeFrom(inset), 1);
  // tilt the back plane with the depth taper, facing -z
  const bp = back.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setZ(i, -bodyDepthAt(p, bp.getX(i)));
  if (back.index) back.setIndex(Array.from(back.index.array).reverse()); // face -z
  back.computeVertexNormals();
  parts.back = back;

  // what is seen through the soundhole: the soundhole wall and a dark interior floor
  const [, xTop] = outlineXRange(outline);
  const wall = new THREE.CylinderGeometry(sh.radiusCm, sh.radiusCm, 0.35, 72, 1, true);
  at(wall, sh.x, sh.y, -0.175, Math.PI / 2, 0, 0);
  parts.hole = wall;
  const floorPts = inset.map(([x, y]) => [x, y] as Point2);
  const floor = new THREE.ShapeGeometry(shapeFrom(floorPts), 1);
  const fp = floor.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, -bodyDepthAt(p, fp.getX(i)) + 0.35);
  const innerSides = loft(outline, normals, (i) => [[-0.3, -depth(i) + 0.35], [-0.3, -0.35]]);
  parts.interior = merge([floor, innerSides]);

  // pickguard (thin, glossy)
  if (p.body.pickguard?.length) {
    // the measured outline is coarse: round it with a closed spline
    const curve = new THREE.CatmullRomCurve3(p.body.pickguard.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
    const smooth = curve.getPoints(160).slice(0, -1).map((v) => [v.x, v.y] as Point2);
    const pg = new THREE.ExtrudeGeometry(shapeFrom(ccw(smooth)), { depth: 0.05, bevelEnabled: false, curveSegments: 4 });
    pg.translate(0, 0, 0.002);
    parts.pickguard = pg;
  }

  // bridge: rounded, slightly tapered wings + raised saddle ridge
  const br = p.body.bridge;
  const bridgeShape = (halfLen: number, halfW: number, taper: number) => {
    const pts: Point2[] = [];
    const N = 64;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const e = 2 / 7; // superellipse exponent for soft corners
      const y = halfW * Math.sign(s) * Math.pow(Math.abs(s), e);
      const t = 1 - taper * smoothstep(0.35, 1, Math.abs(y) / halfW);
      const x = halfLen * t * Math.sign(c) * Math.pow(Math.abs(c), e);
      pts.push([br.x + x, y]);
    }
    return shapeFrom(pts);
  };
  const bridge = new THREE.ExtrudeGeometry(bridgeShape(br.lengthCm / 2 - 0.12, br.widthCm / 2 - 0.12, 0.1), {
    depth: BRIDGE_TOP - 0.36, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3, curveSegments: 8,
  });
  bridge.translate(0, 0, 0.12);
  parts.bridge = bridge;

  // saddle (bone), slanted for compensation
  const sx1 = saddleX(p, 1);
  const sx6 = saddleX(p, 6);
  const span = p.stringSpacingSaddleCm + 1.6;
  const saddle = new RoundedBoxGeometry(0.3, span, 0.9, 2, 0.12);
  const slant = Math.atan2(sx6 - sx1, stringY(p, 6, -p.scaleLengthCm) - stringY(p, 1, -p.scaleLengthCm));
  at(saddle, (sx1 + sx6) / 2, 0, SADDLE_TOP - 0.45, 0, 0, -slant);

  // bridge pins: domed white heads with a dark centre dot
  const pins: THREE.BufferGeometry[] = [];
  const pinX = Math.min(sx1, sx6) - 1.2;
  const pinHead = new THREE.LatheGeometry(
    [[0, 0.3], [0.2, 0.29], [0.27, 0.22], [0.29, 0.1], [0.27, 0], [0.22, -0.1]].map(([r, h]) => new THREE.Vector2(r, h)),
    20,
  );
  for (let s = 1; s <= 6; s++) {
    const y = stringY(p, s, -p.scaleLengthCm) * 1.02;
    pins.push(at(pinHead.clone(), pinX, y, BRIDGE_TOP, Math.PI / 2, 0, 0));
  }
  parts.pin = merge(pins);

  // tail strap pin
  const strap = new THREE.LatheGeometry([[0, 0], [0.45, 0], [0.45, 0.15], [0.25, 0.25], [0.28, 0.6], [0.2, 0.75], [0, 0.78]].map(([r, h]) => new THREE.Vector2(r, h)), 20);
  const [xBottom] = outlineXRange(outline);
  at(strap, xBottom, 0, -bodyDepthAt(p, xBottom) / 2, 0, 0, Math.PI / 2);

  // heel cap: small cream teardrop on the back at the neck joint
  const capPts: Point2[] = [];
  for (let k = 0; k <= 24; k++) {
    const a = Math.PI * (k / 24);
    capPts.push([xTop - 0.2 - 2.6 * Math.sin(a) ** 0.6 * (1 - 0.3 * Math.cos(a)), 1.6 * Math.cos(a) * Math.max(0.08, 1 - Math.sin(a) * 0.2)]);
  }
  const cap = new THREE.ShapeGeometry(shapeFrom(ccw(capPts)));
  const cp = cap.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, -bodyDepthAt(p, cp.getX(i)) - 0.01);
  cap.setIndex(Array.from(cap.index!.array).reverse());
  cap.computeVertexNormals();
  parts.binding = merge([parts.binding, cap]);

  return { saddle, strap, pinX };
}

/* ------------------------------------------------------------------ neck */

function headstockFrame(p: GuitarProfile) {
  const a = (p.headstock.angleDeg * Math.PI) / 180;
  const z0 = FB_TOP - 0.28;
  return new THREE.Matrix4().compose(new THREE.Vector3(NUT_LENGTH * 0.4, 0, z0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(1, 1, 1));
}

function headHalfWidth(p: GuitarProfile, d: number) {
  return interpTable(p.headstock.profile, d);
}

function buildNeck(p: GuitarProfile, hsm: THREE.Matrix4) {
  const L = p.scaleLengthCm;
  const [, xJoin] = outlineXRange(p.body.outline);
  const joinDepth = bodyDepthAt(p, xJoin);
  const zTop = FB_TOP - FB_THICK;
  const a = (p.headstock.angleDeg * Math.PI) / 180;
  const hsOrigin = new THREE.Vector3().setFromMatrixPosition(hsm);
  // headstock back surface z at x (in the guitar frame)
  const hsBack = (x: number) => hsOrigin.z - (x - hsOrigin.x) * Math.tan(a) - HEAD_THICK / Math.cos(a);
  const hsFace = (x: number) => hsOrigin.z - (x - hsOrigin.x) * Math.tan(a);

  const xs: number[] = [];
  for (let k = 0; k <= 90; k++) {
    const t = k / 90;
    xs.push(3.6 - (3.6 - (xJoin - 1.2)) * (t * 0.85 + 0.15 * t * t));
  }
  const ring = 28;
  const b = new Builder();
  const rows: number[][] = [];
  for (const x of xs) {
    const fw = fretboardWidth(p, Math.min(0, x)) / 2 - 0.02;
    const hw = x > 0 ? fw + (headHalfWidth(p, x) * 0.92 - fw) * smoothstep(0.3, 3.6, x) : fw;
    // neck depth below the fretboard: thin at the nut, fuller at the 10th fret
    let depth = 1.62 + 0.38 * smoothstep(0, fretX(L, 12), x);
    const heel = smoothstep(xJoin + 7.5, xJoin, x);
    depth = depth + (joinDepth + zTop - depth) * Math.pow(heel, 1.6);
    let top = zTop;
    let bottom = top - depth;
    if (x > 0) {
      const t = smoothstep(0, 3.2, x);
      top = Math.min(zTop, hsFace(x) - 0.05);
      const volute = 0.32 * Math.exp(-(((x - 1.4) / 1.3) ** 2));
      bottom = bottom + (hsBack(x) - volute - bottom) * t;
      depth = top - bottom;
    }
    const n = 2.3 + 2.2 * heel; // C-shape → U-shaped heel
    const row: number[] = [];
    for (let j = 0; j <= ring; j++) {
      const t = (j / ring) * Math.PI;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const narrow = 1 - 0.28 * heel * s;
      const y = hw * narrow * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const z = top - depth * Math.pow(s, 2 / n);
      row.push(b.addVertex([x, y, z], j / ring, x / 10));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < ring; j++) b.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
  }
  const neck = b.build();
  // heel cap: the flat end of the heel on the back of the body is hidden by the body itself
  return neck;
}

function buildFretboard(p: GuitarProfile) {
  const L = p.scaleLengthCm;
  const xEnd = fretboardEndX(p);
  const tex = p.textures.fretboard;
  const d20 = -fretX(L, tex?.toFret ?? p.fretCount);
  const bind = 0.11;
  const b = new Builder();
  const N = 48;
  const top: number[][] = [];
  for (let k = 0; k <= N; k++) {
    const x = (xEnd * k) / N;
    const w = fretboardWidth(p, x) / 2;
    const u = Math.min(1, -x / d20);
    const row: number[] = [];
    for (const y of [-w + bind, w - bind]) row.push(b.addVertex([x, y, FB_TOP], u, (y + w) / (2 * w)));
    top.push(row);
  }
  for (let k = 0; k < N; k++) b.quad(top[k][0], top[k][1], top[k + 1][1], top[k + 1][0]);
  const surface = b.build();

  // binding: thin cream band on the top edges + the sides and the end
  const bb = new Builder();
  for (const side of [-1, 1]) {
    const rows: number[][] = [];
    for (let k = 0; k <= N; k++) {
      const x = (xEnd * k) / N;
      const w = fretboardWidth(p, x) / 2;
      rows.push([
        bb.addVertex([x, side * (w - bind), FB_TOP]),
        bb.addVertex([x, side * (w - 0.02), FB_TOP - 0.01]),
        bb.addVertex([x, side * w, FB_TOP - 0.06]),
        bb.addVertex([x, side * w, FB_TOP - FB_THICK]),
      ]);
    }
    for (let k = 0; k < N; k++) {
      for (let j = 0; j < 3; j++) {
        if (side < 0) bb.quad(rows[k][j], rows[k + 1][j], rows[k + 1][j + 1], rows[k][j + 1]);
        else bb.quad(rows[k][j], rows[k][j + 1], rows[k + 1][j + 1], rows[k + 1][j]);
      }
    }
  }
  const we = fretboardWidth(p, xEnd) / 2;
  const e = [bb.addVertex([xEnd, -we, FB_TOP]), bb.addVertex([xEnd, we, FB_TOP]), bb.addVertex([xEnd, we, FB_TOP - FB_THICK]), bb.addVertex([xEnd, -we, FB_TOP - FB_THICK])];
  bb.quad(e[0], e[1], e[2], e[3]);
  const binding = bb.build();

  // frets: crowned nickel wire with rounded ends
  const frets: THREE.BufferGeometry[] = [];
  for (let n = 1; n <= p.fretCount; n++) {
    const x = fretX(L, n);
    const w = fretboardWidth(p, x) - 0.08;
    const g = new THREE.CapsuleGeometry(0.1, w - 0.2, 3, 10);
    g.scale(1, 1, FRET_HEIGHT / 0.1);
    frets.push(at(g, x, 0, FB_TOP - 0.01, 0, 0, 0));
  }
  // side dots on the low-E edge (faces the player)
  const dots: THREE.BufferGeometry[] = [];
  const marks: [number, number][] = [[3, 0], [5, 0], [7, 0], [9, 0], [12, 0.45], [12, -0.45], [15, 0], [17, 0], [19, 0]];
  for (const [n, off] of marks) {
    if (n > p.fretCount) continue;
    const xm = (fretX(L, n - 1) + fretX(L, n)) / 2 + off;
    const w = fretboardWidth(p, xm) / 2;
    dots.push(at(new THREE.CircleGeometry(0.09, 14), xm, w + 0.003, FB_TOP - 0.24, -Math.PI / 2, 0, 0));
  }
  // nut
  const nut = new RoundedBoxGeometry(NUT_LENGTH, p.nutWidthCm + 0.05, 0.78, 2, 0.1);
  at(nut, NUT_LENGTH / 2, 0, FB_TOP - FB_THICK + 0.39 + 0.02);
  return { surface, binding, frets: merge(frets), dots, nut };
}

/* ------------------------------------------------------------------ headstock */

function buildHeadstock(p: GuitarProfile, hsm: THREE.Matrix4) {
  const prof = p.headstock.profile;
  const Lh = p.headstock.lengthCm;
  const d0 = NUT_LENGTH * 0.6;
  const side: Point2[] = [];
  const steps = 40;
  for (let k = 0; k <= steps; k++) {
    const d = d0 + ((Lh - d0) * k) / steps;
    side.push([d, headHalfWidth(p, d)]);
  }
  // outline in headstock local (d, y): up the low-E side, rounded tip corners, down the high-e side
  const pts: Point2[] = [];
  const tipR = 0.6;
  for (const [d, h] of side) if (d < Lh - tipR) pts.push([d, h]);
  const hTip = headHalfWidth(p, Lh);
  for (let k = 0; k <= 6; k++) {
    const a = (Math.PI / 2) * (k / 6);
    pts.push([Lh - tipR + tipR * Math.sin(a), hTip - tipR + tipR * Math.cos(a)]);
  }
  for (let k = 0; k <= 6; k++) {
    const a = (Math.PI / 2) * (k / 6);
    pts.push([Lh - tipR + tipR * Math.cos(a), -(hTip - tipR) - tipR * Math.sin(a)]);
  }
  for (const [d, h] of [...side].reverse()) if (d < Lh - tipR) pts.push([d, -h]);
  const shape = shapeFrom(ccw(pts));

  const face = new THREE.ShapeGeometry(shape, 2);
  const fpos = face.attributes.position;
  const uv = new Float32Array(fpos.count * 2);
  for (let i = 0; i < fpos.count; i++) {
    const d = fpos.getX(i);
    const y = fpos.getY(i);
    const h = headHalfWidth(p, d);
    uv[i * 2] = (((h - y) / (2 * h)) - 0.02) / 0.96;
    uv[i * 2 + 1] = d / Lh;
    fpos.setZ(i, 0.003);
  }
  face.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  face.applyMatrix4(hsm);

  const bt = 0.1;
  const plank = new THREE.ExtrudeGeometry(shape, { depth: HEAD_THICK - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.08, bevelSegments: 3, curveSegments: 6 });
  plank.translate(0, 0, -(HEAD_THICK - bt));
  plank.applyMatrix4(hsm);

  // tuners: open-gear strip tuners, 3 per side
  const chrome: THREE.BufferGeometry[] = [];
  const posts: { string: number; d: number; y: number }[] = [];
  const low = [...p.headstock.tunersLowE].sort((x, y) => x - y);
  const high = [...p.headstock.tunersHighE].sort((x, y) => x - y);
  low.forEach((d, i) => posts.push({ string: 6 - i, d, y: headHalfWidth(p, d) - 0.95 }));
  high.forEach((d, i) => posts.push({ string: 1 + i, d, y: -(headHalfWidth(p, d) - 0.95) }));

  const bushing = new THREE.LatheGeometry(
    [[0, 0.3], [0.2, 0.3], [0.33, 0.24], [0.36, 0.1], [0.47, 0.08], [0.48, 0], [0, 0]].map(([r, h]) => new THREE.Vector2(r, h)), 24,
  ).rotateX(Math.PI / 2);
  const post = new THREE.CylinderGeometry(0.26, 0.28, 1.3, 18).rotateX(Math.PI / 2).translate(0, 0, 0.65);
  const postTop = new THREE.SphereGeometry(0.26, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.35).translate(0, 0, 1.3);
  const gear = new THREE.CylinderGeometry(0.55, 0.55, 0.16, 20).rotateX(Math.PI / 2);
  // oval paddle button with a small collar where the shaft enters it (shaft runs along y)
  const button = mergeGeometries([
    new THREE.SphereGeometry(1, 24, 16).scale(0.82, 0.6, 0.34).toNonIndexed(),
    new THREE.CylinderGeometry(0.2, 0.15, 0.3, 14).translate(0, -0.62, 0).toNonIndexed(),
  ], false)!;
  const shaft = new THREE.CylinderGeometry(0.11, 0.11, 1.5, 10);
  const worm = new THREE.CylinderGeometry(0.2, 0.2, 0.7, 12);

  for (const side of [1, -1]) {
    const ds = posts.filter((q) => Math.sign(q.y) === side).map((q) => q.d);
    const yStrip = side * (headHalfWidth(p, (Math.min(...ds) + Math.max(...ds)) / 2) - 0.95);
    const len = Math.max(...ds) - Math.min(...ds) + 2.4;
    const strip = new RoundedBoxGeometry(len, 1.5, 0.08, 2, 0.035);
    chrome.push(at(strip, (Math.min(...ds) + Math.max(...ds)) / 2, yStrip, -HEAD_THICK - 0.04));
  }
  for (const q of posts) {
    const side = Math.sign(q.y);
    const h = headHalfWidth(p, q.d);
    chrome.push(at(bushing.clone(), q.d, q.y, 0));
    chrome.push(at(post.clone(), q.d, q.y, 0));
    chrome.push(at(postTop.clone(), q.d, q.y, 0));
    chrome.push(at(gear.clone(), q.d, q.y, -HEAD_THICK - 0.25));
    // worm shaft from under the gear out past the edge, then the button
    const zs = -HEAD_THICK - 0.33;
    chrome.push(at(worm.clone(), q.d - 0.6, q.y, zs));
    chrome.push(at(shaft.clone(), q.d - 0.6, side * (h - 0.25), zs));
    chrome.push(at(button.clone(), q.d - 0.6, side * (h + 1.0), zs, 0, 0, side > 0 ? 0 : Math.PI));
  }
  const hw = merge(chrome);
  hw.applyMatrix4(hsm);
  return { face, plank, chrome: hw, posts };
}

/* ------------------------------------------------------------------ strings */

function buildStrings(p: GuitarProfile, hsm: THREE.Matrix4, pinX: number, posts: { string: number; d: number; y: number }[]) {
  const out: StringPath[] = [];
  const postAxis = new THREE.Vector3(0, 0, 1).transformDirection(hsm);
  for (let s = 1; s <= 6; s++) {
    const r = STRING_GAUGE[s - 1] / 2;
    const ySad = stringY(p, s, -p.scaleLengthCm);
    const pin = new THREE.Vector3(pinX, ySad * 1.02, BRIDGE_TOP + 0.16);
    const crest = new THREE.Vector3(saddleX(p, s), ySad, SADDLE_TOP + r);
    const nut = new THREE.Vector3(0.05, stringY(p, s, 0), stringZ(p, 0));
    const q = posts.find((t) => t.string === s)!;
    // the string meets the post on the side facing the centre line, ~0.5 cm above the face
    const inward = -Math.sign(q.y) * 0.28;
    const postC = new THREE.Vector3(q.d, q.y, 0).applyMatrix4(hsm);
    const touch = new THREE.Vector3(q.d, q.y + inward, 0.5 + (6 - s) * 0.03).applyMatrix4(hsm);
    out.push({
      string: s,
      radius: r,
      wound: s >= 3,
      back: [pin, new THREE.Vector3(pin.x + 0.35, pin.y, BRIDGE_TOP + 0.26), crest],
      speaking: [crest, nut],
      head: [nut, touch],
      post: postC,
      postAxis,
    });
  }
  return out;
}

/** Tube along a polyline; attribute `along` = 0..1 by length, uv.y = length / pitch (wound texture). */
export function tube(points: THREE.Vector3[], radius: number, radial = 7, pitch = 0.12) {
  const b = new Builder();
  const along: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i].distanceTo(points[i - 1]);
  let acc = 0;
  const up = new THREE.Vector3(0, 0, 1);
  const rows: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dir = next.clone().sub(prev).normalize();
    const n1 = Math.abs(dir.dot(up)) > 0.9 ? new THREE.Vector3(1, 0, 0) : up.clone();
    const side = new THREE.Vector3().crossVectors(dir, n1).normalize();
    const n2 = new THREE.Vector3().crossVectors(side, dir).normalize();
    if (i > 0) acc += points[i].distanceTo(points[i - 1]);
    const row: number[] = [];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const v = points[i].clone().addScaledVector(side, Math.cos(a) * radius).addScaledVector(n2, Math.sin(a) * radius);
      row.push(b.addVertex(v, j / radial, acc / pitch));
      along.push(total ? acc / total : 0);
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < radial; j++) b.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  const g = b.build();
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  return g;
}

/** Subdivides a straight segment so it can bend when vibrating. */
export function segmentPoints(a: THREE.Vector3, b: THREE.Vector3, n: number) {
  return Array.from({ length: n + 1 }, (_, i) => a.clone().lerp(b, i / n));
}

/** The static (non-vibrating) string parts merged per material: [plain, wound]. */
export function buildStaticStrings(strings: StringPath[]) {
  const plain: THREE.BufferGeometry[] = [];
  const wound: THREE.BufferGeometry[] = [];
  for (const s of strings) {
    const list = s.wound ? wound : plain;
    list.push(tube(s.back, s.radius));
    list.push(tube(s.head, s.radius));
    // windings around the post
    for (let k = 0; k < 3; k++) {
      const t = new THREE.TorusGeometry(0.27 + s.radius, s.radius, 6, 20);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), s.postAxis, new THREE.Vector3(1, 0, 0));
      t.applyMatrix4(m);
      const c = s.post.clone().addScaledVector(s.postAxis, 0.3 + k * (s.radius * 2.2) + (6 - s.string) * 0.03);
      t.translate(c.x, c.y, c.z);
      list.push(t);
    }
  }
  return { plain: merge(plain), wound: merge(wound) };
}

/* ------------------------------------------------------------------ all */

export function buildGuitar(p: GuitarProfile): GuitarGeometry {
  const parts: GuitarGeometry['parts'] = {};
  const hsm = headstockFrame(p);
  const body = buildBody(p, parts);
  const fb = buildFretboard(p);
  const head = buildHeadstock(p, hsm);
  parts.neck = buildNeck(p, hsm);
  parts.headstock = head.plank;
  parts.binding = merge([parts.binding!, fb.binding]);
  parts.bone = merge([body.saddle, fb.nut]);
  parts.chrome = head.chrome;
  parts.fret = fb.frets;
  parts.dot = merge(fb.dots);
  parts.sides = merge([parts.sides!, body.strap]);
  const sh = p.body.soundhole;
  return {
    parts,
    fretboard: fb.surface,
    headstockFace: head.face,
    rosette: { x: sh.x, y: sh.y, outer: sh.radiusCm / ROSETTE_INNER, inner: sh.radiusCm },
    strings: buildStrings(p, hsm, body.pinX, head.posts),
    headstockMatrix: hsm,
  };
}
