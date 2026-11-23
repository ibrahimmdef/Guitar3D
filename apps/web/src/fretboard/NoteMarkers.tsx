/**
 * Note markers on the fretboard: filled accent discs for the current beat (with a short pop and a
 * fading ghost of the previous beat), hollow rings for the next beats that fade with their distance
 * in time (the nearest one carries an approach arc driven by beatProgress), faint lines joining the
 * notes of a chord and dashed guides along a string where the hand has to move. Also the fret
 * numbers along the bass-side edge. Everything lives in the guitar frame (see geometry.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { FretNote, GuitarProfile } from '@guitar3d/shared';
import { FB_TOP, fretboardWidth, fretX, noteX, stringY, stringZ } from './geometry';
import { ACCENT, labelTexture, NEXT_OUTLINE } from './materials';
import {
  currentNotes, ghostOpacity, GHOST_TIME, markerDiameter, markerLabel, moveArrows, hopHeight, hopPoint, hopT, arrowOpacity, noteKey, popRing, popScale,
  screenConstantSize, upcomingFade, upcomingMarkers, type UpcomingMarker,
} from './markers';

/** The marker quad spans ±QUAD in disc radii (room for the halo and the pop ring). */
const QUAD = 1.4;
const LIFT = 0.62;

const markerVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const markerFragment = /* glsl */ `
uniform sampler2D uLabel;
uniform int uKind;          // 0 now, 1 upcoming ring, 2 muted (×), 3 ghost, 4 technique chip
uniform float uProgress;    // approach arc 0..1 (< 0: none)
uniform float uPop;         // 0..1 phase of the start ring (1 = done)
uniform vec3 uColor;
uniform vec3 uArc;
uniform float uOpacity;
uniform float uLabelOn;
varying vec2 vUv;
float fill(float d) { return clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0); }
void main() {
  vec2 p = (vUv * 2.0 - 1.0) * ${QUAD.toFixed(2)};
  float r = length(p);
  vec4 lab = (abs(p.x) < 1.0 && abs(p.y) < 1.0) ? texture2D(uLabel, p * 0.5 + 0.5) * uLabelOn : vec4(0.0);
  float glyph = lab.r * lab.a;
  float outline = lab.a;
  // soft dark halo: keeps every marker legible over pearl inlays and bright strings
  vec4 c = vec4(0.015, 0.015, 0.02, (1.0 - smoothstep(0.8, 1.34, r)) * 0.55);
  vec3 cream = vec3(1.0, 0.95, 0.84);
  if (uKind == 0) {
    vec3 face = mix(uColor * 1.08, uColor * 0.82, smoothstep(-1.0, 1.0, -p.y));
    face += 0.07 * (1.0 - smoothstep(0.0, 0.9, length(p - vec2(-0.3, 0.4))));
    c = mix(c, vec4(face, 1.0), fill(r - 1.0));
    c.rgb = mix(c.rgb, cream, fill(abs(r - 0.95) - 0.03) * 0.5);
    c.rgb = mix(c.rgb, vec3(0.08, 0.06, 0.03), glyph);
    float pr = 1.0 + 0.32 * uPop;
    c = mix(c, vec4(uColor, 1.0), fill(abs(r - pr) - 0.045) * (1.0 - uPop) * 0.85);
  } else if (uKind == 1) {
    c.a = max(c.a, fill(r - 0.9) * 0.55);
    c = mix(c, vec4(uColor, 1.0), fill(abs(r - 0.86) - 0.075));
    if (uProgress >= 0.0) {
      float a = atan(p.x, p.y);
      float a01 = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;
      c = mix(c, vec4(uArc, 1.0), fill(abs(r - 1.1) - 0.07) * step(a01, uProgress));
    }
    c = mix(c, vec4(0.0, 0.0, 0.0, 1.0), outline * 0.75);
    c = mix(c, vec4(uColor, 1.0), glyph);
  } else if (uKind == 2) {
    c.a = max(c.a, fill(r - 0.92) * 0.6);
    c = mix(c, vec4(uColor, 1.0), fill(abs(r - 0.88) - 0.05));
    float d = min(abs(p.x - p.y), abs(p.x + p.y)) * 0.7071 - 0.09;
    c = mix(c, vec4(uColor, 1.0), fill(d) * fill(r - 0.55));
  } else if (uKind == 3) {
    c.a *= 0.4;
    c = mix(c, vec4(uColor, 1.0), fill(r - 1.0) * 0.35);
    c = mix(c, vec4(uColor, 1.0), fill(abs(r - 0.95) - 0.05) * 0.8);
  } else {
    c = vec4(0.08, 0.08, 0.09, fill(r - 1.0) * 0.94);
    c = mix(c, vec4(uColor, 1.0), fill(abs(r - 0.96) - 0.06) * 0.6);
    c = mix(c, vec4(1.0), glyph);
  }
  c.a *= uOpacity;
  if (c.a < 0.004) discard;
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;

const TECH_GLYPH: Record<NonNullable<FretNote['technique']>, string> = {
  hammer: 'h', pull: 'p', slide: '/', bend: '↑', harmonic: '◇',
};

const KIND = { now: 0, ring: 1, muted: 2, ghost: 3, chip: 4 } as const;

function markerMaterial(kind: number, label: string | null, color: string) {
  return new THREE.ShaderMaterial({
    vertexShader: markerVertex,
    fragmentShader: markerFragment,
    uniforms: {
      uLabel: { value: labelTexture(label ?? ' ') },
      uLabelOn: { value: label ? 1 : 0 },
      uKind: { value: kind },
      uProgress: { value: -1 },
      uPop: { value: 1 },
      uColor: { value: new THREE.Color(color) },
      uArc: { value: new THREE.Color(ACCENT) },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

function useMarkerMaterial(kind: number, label: string | null, color: string) {
  const mat = useMemo(() => markerMaterial(kind, label, color), [kind, label, color]);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

const planeGeo = new THREE.PlaneGeometry(1, 1);
const tmpV = new THREE.Vector3();

/** Where the marker of a note floats: above the string, between the frets (open: just behind the nut). */
export function markerPosition(p: GuitarProfile, string: number, fret: number): [number, number, number] {
  const f = Math.min(Math.max(0, fret), p.fretCount);
  const x = noteX(p.scaleLengthCm, f);
  return [x, stringY(p, string, Math.min(0, x)), stringZ(p, Math.min(0, x)) + LIFT];
}

/** Screen-constant disc diameter of an object, measured each frame (no allocations). */
function diameterAt(obj: THREE.Object3D, camera: THREE.Camera, heightPx: number) {
  const d = obj.getWorldPosition(tmpV).distanceTo(camera.position);
  return markerDiameter(d, heightPx, (camera as THREE.PerspectiveCamera).fov ?? 30);
}

/** Speed-trainer mistakes on the neck (same colours as the tab marks). */
const TONE_COLOR = { missed: '#f2666b', late: '#8fa3c7', early: '#f5b83d' } as const;
/** Okabe–Ito safe palette for color-blind mode. */
const TONE_COLOR_CB = { missed: '#e36b1f', late: '#56b4e9', early: '#f0e442' } as const;

// Marker animation state managed by a single frame loop
interface MarkerAnimState {
  currentMarkers: Map<string, { ref: THREE.Group; mat: THREE.ShaderMaterial; startTime: number; chipRef?: THREE.Group; chipMat?: THREE.ShaderMaterial }>;
  nextMarkers: Map<string, { ref: THREE.Group; mat: THREE.ShaderMaterial; scale: number }>;
  ghostMarkers: Map<string, { ref: THREE.Group; mat: THREE.ShaderMaterial; born: number }>;
  hopPaths: Map<string, { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial; rank: number; progress: number; a: V3; b: V3 }>;
  hopBubbles: Map<string, { groupRef: THREE.Group; shadowRef: THREE.Mesh; mat: THREE.ShaderMaterial; shadowMat: THREE.MeshBasicMaterial; sm: { current: number }; up: V3; h: number; a: V3; b: V3; label: string }>;
  fretJumpChips: Map<string, { ref: THREE.Group; mat: THREE.ShaderMaterial; up: V3; h: number; a: V3; b: V3 }>;
}

const markerAnimState: MarkerAnimState = {
  currentMarkers: new Map(),
  nextMarkers: new Map(),
  ghostMarkers: new Map(),
  hopPaths: new Map(),
  hopBubbles: new Map(),
  fretJumpChips: new Map(),
};

function updateCurrentMarkers(camera: THREE.Camera, size: { width: number; height: number }, clock: THREE.Clock) {
  for (const [, marker] of markerAnimState.currentMarkers) {
    if (!marker.ref) continue;
    if (marker.startTime < 0) marker.startTime = clock.elapsedTime;
    const t = clock.elapsedTime - marker.startTime;
    marker.ref.scale.setScalar(diameterAt(marker.ref, camera, size.height) * popScale(t));
    marker.mat.uniforms.uPop.value = popRing(t);
    if (marker.chipRef) {
      marker.chipRef.scale.setScalar(diameterAt(marker.chipRef, camera, size.height) * 0.5);
    }
  }
}

function updateNextMarkers(camera: THREE.Camera, size: { width: number; height: number }) {
  for (const [, marker] of markerAnimState.nextMarkers) {
    if (marker.ref) {
      marker.ref.scale.setScalar(diameterAt(marker.ref, camera, size.height) * 0.94 * marker.scale);
    }
  }
}

function updateGhostMarkers(camera: THREE.Camera, size: { width: number; height: number }, clock: THREE.Clock) {
  const toDelete: string[] = [];
  for (const [key, marker] of markerAnimState.ghostMarkers) {
    if (!marker.ref) { toDelete.push(key); continue; }
    const t = clock.elapsedTime - marker.born;
    marker.mat.uniforms.uOpacity.value = ghostOpacity(t);
    marker.ref.visible = t < GHOST_TIME;
    marker.ref.scale.setScalar(diameterAt(marker.ref, camera, size.height) * (1 + 0.15 * Math.min(1, t / GHOST_TIME)));
    if (t >= GHOST_TIME) toDelete.push(key);
  }
  for (const key of toDelete) markerAnimState.ghostMarkers.delete(key);
}

function updateHopPaths(camera: THREE.Camera, size: { width: number; height: number }, gl: THREE.WebGLRenderer) {
  for (const [, hp] of markerAnimState.hopPaths) {
    if (!hp.geo || !hp.mat) continue;
    const up: V3 = [0, 0, 1];
    hopUp(camera, null, up);
    const pos = hp.geo.getAttribute('position') as THREE.BufferAttribute;
    const ts = hp.geo.getAttribute('aT') as THREE.BufferAttribute;
    const n = pos.count;
    const t0 = 0.12;
    for (let i = 0; i < n; i++) {
      const t = t0 + ((1 - 2 * t0) * i) / (n - 1);
      const q = hopPoint(hp.a, hp.b, t, up, hopHeight(hp.a, hp.b));
      pos.setXYZ(i, q[0], q[1], q[2]);
      ts.setX(i, t);
    }
    pos.needsUpdate = true;
    ts.needsUpdate = true;
    hp.geo.computeBoundingSphere();
    const dpr = gl.getPixelRatio();
    hp.mat.uniforms.uPx.value = (hp.rank === 0 ? 10 : 6.5) * dpr;
    hp.mat.uniforms.uOpacity.value = arrowOpacity(hp.rank, hp.progress);
    hp.mat.uniforms.uBall.value = hp.rank === 0 && hp.progress > 0.42 ? hopT(hp.progress) : -1;
  }
}

function updateHopBubbles(camera: THREE.Camera, size: { width: number; height: number }) {
  for (const [, hb] of markerAnimState.hopBubbles) {
    if (!hb.groupRef || !hb.shadowRef) continue;
    const t = hopT(hb.sm.current);
    const flying = hb.sm.current > 0.42;
    const up: V3 = [0, 0, 1];
    hopUp(camera, hb.groupRef, up);
    const q = hopPoint(hb.a, hb.b, t, up, hb.h);
    hb.groupRef.position.set(q[0], q[1], q[2] + 0.05);
    hb.groupRef.visible = flying;
    hb.shadowRef.visible = flying;
    const lift = 4 * t * (1 - t);
    const d = diameterAt(hb.groupRef, camera, size.height);
    hb.groupRef.scale.set(d * (0.86 + 0.06 * lift), d * (0.8 + 0.14 * lift), 1);
    hb.mat.uniforms.uOpacity.value = Math.min(1, (hb.sm.current - 0.42) * 8) * 0.92;
    hb.shadowRef.position.set(hb.a[0] + (hb.b[0] - hb.a[0]) * t, hb.a[1] + (hb.b[1] - hb.a[1]) * t, Math.min(hb.a[2], hb.b[2]) - 0.35);
    hb.shadowRef.scale.setScalar(d * (0.75 - 0.3 * lift));
    if (hb.shadowRef.material && !Array.isArray(hb.shadowRef.material)) {
      hb.shadowRef.material.opacity = 0.38 * (1 - 0.6 * lift);
    }
  }
}

function updateFretJumpChips(camera: THREE.Camera, size: { width: number; height: number }) {
  for (const [, chip] of markerAnimState.fretJumpChips) {
    if (!chip.ref) continue;
    const up: V3 = [0, 0, 1];
    hopUp(camera, chip.ref, up);
    const q = hopPoint(chip.a, chip.b, 0.5, up, chip.h + 1.1);
    chip.ref.position.set(q[0], q[1], q[2]);
    chip.ref.scale.setScalar(diameterAt(chip.ref, camera, size.height) * 0.6);
  }
}

// Cleanup functions
function clearCurrentMarker(key: string) {
  markerAnimState.currentMarkers.delete(key);
}
function clearNextMarker(key: string) {
  markerAnimState.nextMarkers.delete(key);
}
function clearGhostMarker(key: string) {
  markerAnimState.ghostMarkers.delete(key);
}
function clearHopPath(key: string) {
  markerAnimState.hopPaths.delete(key);
}
function clearHopBubble(key: string) {
  markerAnimState.hopBubbles.delete(key);
}
function clearFretJumpChip(key: string) {
  markerAnimState.fretJumpChips.delete(key);
}

function CurrentMarker({ profile, note, beatId }: { profile: GuitarProfile; note: FretNote; beatId: number }) {
  const pos = markerPosition(profile, note.string, note.fret);
  const colorBlind = typeof document !== 'undefined' && document.documentElement.dataset.palette === 'cb';
  const toneColor = colorBlind ? TONE_COLOR_CB : TONE_COLOR;
  const mat = useMarkerMaterial(note.muted ? KIND.muted : KIND.now, note.muted ? null : markerLabel(note), note.tone ? toneColor[note.tone] : ACCENT);
  const chip = useMarkerMaterial(KIND.chip, note.technique ? TECH_GLYPH[note.technique] : null, NEXT_OUTLINE);
  const g = useRef<THREE.Group>(null);
  const chipRef = useRef<THREE.Group>(null);
  const key = `c${beatId}-${noteKey(note)}`;

  useEffect(() => {
    markerAnimState.currentMarkers.set(key, { ref: g.current!, mat, startTime: -1, chipRef: chipRef.current ?? undefined, chipMat: chip });
    return () => clearCurrentMarker(key);
  }, [key, mat, chip]);

  return (
    <Billboard position={pos}>
      <group ref={g}>
        <mesh geometry={planeGeo} material={mat} scale={QUAD} renderOrder={12} />
        {note.technique && <group ref={chipRef}><mesh geometry={planeGeo} material={chip} scale={0.5} position={[0.78, 0.78, 0.01]} renderOrder={13} /></group>}
      </group>
    </Billboard>
  );
}

function NextMarker({ profile, m, progress }: { profile: GuitarProfile; m: UpcomingMarker; progress: number }) {
  const pos = markerPosition(profile, m.note.string, m.note.fret);
  const label = m.note.muted ? null : markerLabel(m.note);
  const mat = useMarkerMaterial(m.note.muted ? KIND.muted : KIND.ring, label, NEXT_OUTLINE);
  const fade = upcomingFade(m.rank, progress);
  mat.uniforms.uOpacity.value = fade.opacity;
  mat.uniforms.uProgress.value = fade.arc ? Math.min(1, Math.max(0, progress)) : -1;
  const scale = useRef(fade.scale);
  scale.current = fade.scale;
  const g = useRef<THREE.Group>(null);
  const key = `n${m.rank}-${m.key}`;

  useEffect(() => {
    markerAnimState.nextMarkers.set(key, { ref: g.current!, mat, scale: fade.scale });
    return () => clearNextMarker(key);
  }, [key, mat]);

  // Update scale when fade changes
  useEffect(() => {
    const entry = markerAnimState.nextMarkers.get(key);
    if (entry) entry.scale = fade.scale;
  }, [key, fade.scale]);

  return (
    <Billboard position={pos}>
      <group ref={g}>
        <mesh geometry={planeGeo} material={mat} scale={QUAD} renderOrder={10 - m.rank} />
      </group>
    </Billboard>
  );
}

interface Ghost {
  key: string;
  pos: [number, number, number];
  born: number;
}

function GhostMarker({ ghost }: { ghost: Ghost }) {
  const mat = useMarkerMaterial(KIND.ghost, null, ACCENT);
  const g = useRef<THREE.Group>(null);

  useEffect(() => {
    markerAnimState.ghostMarkers.set(ghost.key, { ref: g.current!, mat, born: ghost.born });
    return () => clearGhostMarker(ghost.key);
  }, [ghost.key, mat]);

  return (
    <Billboard position={ghost.pos}>
      <group ref={g}>
        <mesh geometry={planeGeo} material={mat} scale={QUAD} renderOrder={9} />
      </group>
    </Billboard>
  );
}

/* ------------------------------------------------------------------ lines */

const lineVertex = /* glsl */ `
attribute float aS;
varying float vS;
void main() {
  vS = aS;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const lineFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uDash;
uniform float uLen;
varying float vS;
void main() {
  float a = uOpacity;
  if (uDash > 0.0) {
    float f = fract(vS / uDash);
    a *= smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.5, 0.58, f));
    a *= 0.45 + 0.55 * (vS / max(uLen, 1e-3));
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

/** Flat ribbon (in the xy plane) along a polyline, with `aS` = distance along it. */
function ribbonGeometry(pts: [number, number, number][], width: number) {
  const pos: number[] = [];
  const s: number[] = [];
  const idx: number[] = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (width / 2);
    const ny = (dx / l) * (width / 2);
    if (i > 0) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    pos.push(pts[i][0] + nx, pts[i][1] + ny, pts[i][2], pts[i][0] - nx, pts[i][1] - ny, pts[i][2]);
    s.push(acc, acc);
    if (i > 0) idx.push(2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i - 2, 2 * i + 1, 2 * i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1));
  g.setIndex(idx);
  return { geometry: g, length: acc };
}

function Ribbon({ pts, width, color, opacity, dash = 0 }: { pts: [number, number, number][]; width: number; color: string; opacity: number; dash?: number }) {
  const sig = pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(';');
  const { geometry, length } = useMemo(() => ribbonGeometry(pts, width), [sig, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: lineVertex,
      fragmentShader: lineFragment,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uDash: { value: dash }, uLen: { value: length } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
    [color, dash, length], // eslint-disable-line react-hooks/exhaustive-deps
  );
  mat.uniforms.uOpacity.value = opacity;
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <mesh geometry={geometry} material={mat} renderOrder={8} />;
}

/* ------------------------------------------------------------------ hops between notes */

type V3 = [number, number, number];

const tmpUp = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
/**
 * "Up" for a hop, in the local frame of `obj`'s parent (the guitar is rotated in the scene): the
 * camera's screen-up, tilted a little off the fretboard.
 */
function hopUp(camera: THREE.Camera, obj: THREE.Object3D | null | undefined, out: V3): V3 {
  tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (obj?.parent) tmpUp.applyQuaternion(obj.parent.getWorldQuaternion(tmpQ).invert());
  tmpUp.z += 0.45;
  tmpUp.normalize();
  out[0] = tmpUp.x;
  out[1] = tmpUp.y;
  out[2] = tmpUp.z;
  return out;
}

const dotVertex = /* glsl */ `
attribute float aT;
uniform float uPx;
varying float vT;
void main() {
  vT = aT;
  gl_PointSize = uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const dotFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uBall;   // t of the hopping bubble, < 0 when it has not left yet
varying float vT;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float disc = 1.0 - smoothstep(0.36, 0.5, r);
  if (disc < 0.01) discard;
  // dark rim keeps the dots readable over pearl inlays
  vec3 col = mix(vec3(0.03), uColor, 1.0 - smoothstep(0.2, 0.32, r));
  float a = uOpacity * disc * (0.45 + 0.55 * vT);
  if (uBall >= 0.0) a *= vT < uBall ? 0.28 : 1.0;   // path already travelled fades
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

/** Dotted arc showing where the hand hops next (screen-up, so it always reads as a jump). */
function HopPath({ a, b, rank, progress }: { a: V3; b: V3; rank: number; progress: number }) {
  const n = Math.round(Math.min(34, Math.max(12, Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.6)));
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    return g;
  }, [n]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: dotVertex,
    fragmentShader: dotFragment,
    uniforms: { uColor: { value: new THREE.Color(rank === 0 ? ACCENT : NEXT_OUTLINE) }, uOpacity: { value: 1 }, uPx: { value: 8 }, uBall: { value: -1 } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  }), [rank]);
  const sm = useSmoothProgress(progress);
  const h = hopHeight(a, b);
  const key = `hp${rank}-${a[0].toFixed(2)}-${a[1].toFixed(2)}-${b[0].toFixed(2)}-${b[1].toFixed(2)}`;

  useEffect(() => {
    markerAnimState.hopPaths.set(key, { geo, mat, rank, progress: sm.current, a, b });
    return () => clearHopPath(key);
  }, [key, geo, mat, rank, a, b]);

  // Update progress
  useEffect(() => {
    const entry = markerAnimState.hopPaths.get(key);
    if (entry) entry.progress = sm.current;
  }, [key, sm.current]);

  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  return <points geometry={geo} material={mat} renderOrder={8 - rank} frustumCulled={false} />;
}

/** beatProgress arrives every ~50 ms; smooth it per frame and restart cleanly when a new beat begins. */
function useSmoothProgress(progress: number) {
  const shown = useRef(progress);
  const target = useRef(progress);
  target.current = progress;
  useFrame((_, dt) => {
    if (target.current < shown.current - 0.3) shown.current = target.current;
    else shown.current += (target.current - shown.current) * Math.min(1, dt * 14);
  });
  return shown;
}

const shadowGeo = new THREE.CircleGeometry(0.5, 32);

/**
 * The next bubble hopping over: it waits on the current note, jumps along the dotted arc and lands
 * on the next note just as it is due (the next marker then pops). A soft shadow on the fretboard
 * shows how high it is.
 */
function HopBubble({ a, b, label, progress, beatId }: { a: V3; b: V3; label: string; progress: number; beatId: number }) {
  const mat = useMarkerMaterial(KIND.now, label, ACCENT);
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => shadowMat.dispose(), [shadowMat]);
  const sm = useSmoothProgress(progress);
  const g = useRef<THREE.Group>(null);
  const sh = useRef<THREE.Mesh>(null);
  const h = hopHeight(a, b);
  const key = `hb${beatId}-${a[0].toFixed(2)}-${a[1].toFixed(2)}-${b[0].toFixed(2)}-${b[1].toFixed(2)}`;

  useEffect(() => {
    markerAnimState.hopBubbles.set(key, {
      groupRef: g.current!,
      shadowRef: sh.current!,
      mat,
      shadowMat,
      sm,
      up: [0, 0, 1],
      h,
      a,
      b,
      label
    });
    return () => clearHopBubble(key);
  }, [key, mat, shadowMat, sm, h, a, b, label]);

  return (
    <>
      <mesh ref={sh} geometry={shadowGeo} material={shadowMat} renderOrder={7} visible={false} />
      <group ref={g} visible={false}>
        <Billboard>
          <mesh geometry={planeGeo} material={mat} scale={QUAD} renderOrder={11} />
        </Billboard>
      </group>
    </>
  );
}

/** Small "+4" / "−3" chip floating above the top of the hop: how many frets the hand moves. */
function FretJumpChip({ a, b, delta }: { a: V3; b: V3; delta: number }) {
  const label = delta > 0 ? `+${delta}` : `−${-delta}`;
  const mat = useMarkerMaterial(KIND.chip, label, ACCENT);
  const g = useRef<THREE.Group>(null);
  const h = hopHeight(a, b);
  const key = `fjc-${a[0].toFixed(2)}-${a[1].toFixed(2)}-${b[0].toFixed(2)}-${b[1].toFixed(2)}`;

  useEffect(() => {
    markerAnimState.fretJumpChips.set(key, { ref: g.current!, mat, up: [0, 0, 1], h, a, b });
    return () => clearFretJumpChip(key);
  }, [key, mat, h, a, b]);

  return (
    <group ref={g}>
      <Billboard>
        <mesh geometry={planeGeo} material={mat} scale={QUAD} renderOrder={10} />
      </Billboard>
    </group>
  );
}

/* ------------------------------------------------------------------ all markers */

export function NoteMarkers({ profile, notes, upcoming, beatId, beatProgress }: {
  profile: GuitarProfile;
  notes: FretNote[];
  upcoming?: FretNote[][];
  beatId: number;
  beatProgress: number;
}) {
  const current = useMemo(() => currentNotes(notes), [notes]);
  const next = useMemo(() => upcomingMarkers(notes, upcoming), [notes, upcoming]);
  const arrows = useMemo(() => {
    const beats = upcoming && upcoming.length ? upcoming : [notes.filter((n) => n.state === 'next')];
    // trainer feedback markers (tone) are not part of the music: no arrows or chord ribbon from them
    return moveArrows(current.filter((n) => !n.tone), beats).map((m) => {
      const a = markerPosition(profile, m.from.string, m.from.fret);
      const b = markerPosition(profile, m.to.string, m.to.fret);
      const z = Math.max(a[2], b[2]);
      return { ...m, a: [a[0], a[1], z] as V3, b: [b[0], b[1], z] as V3, key: `${m.rank}:${m.from.string}.${m.from.fret}>${m.to.string}.${m.to.fret}` };
    });
  }, [current, upcoming, notes, profile]);

  // the previous beat's notes linger as fading ghosts
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const prev = useRef<{ beatId: number; notes: FretNote[] }>({ beatId, notes: current });
  const clock = useThree((st) => st.clock);
  useEffect(() => {
    if (prev.current.beatId === beatId) {
      prev.current.notes = current;
      return;
    }
    const born = clock.elapsedTime;
    const now = new Set(current.map(noteKey));
    setGhosts(prev.current.notes.filter((n) => !n.muted && !now.has(noteKey(n))).map((n) => ({
      key: `${beatId}-${noteKey(n)}`, pos: markerPosition(profile, n.string, n.fret), born,
    })));
    prev.current = { beatId, notes: current };
  }, [beatId, current, profile, clock]);

  const chord = useMemo(() => {
    const pts = current.filter((n) => !n.muted && !n.tone).sort((a, b) => a.string - b.string).map((n) => {
      const p = markerPosition(profile, n.string, n.fret);
      return [p[0], p[1], p[2] - 0.2] as [number, number, number];
    });
    return pts.length >= 2 ? pts : null;
  }, [current, profile]);

  // Unified frame callback to drive all marker animations
  const { camera, size, gl } = useThree();
  useFrame((_, dt) => {
    const clk = clock;
    updateCurrentMarkers(camera, size, clk);
    updateNextMarkers(camera, size);
    updateGhostMarkers(camera, size, clk);
    updateHopPaths(camera, size, gl);
    updateHopBubbles(camera, size);
    updateFretJumpChips(camera, size);
  });

  const p = Math.min(1, Math.max(0, beatProgress || 0));
  return (
    <>
      {ghosts.map((g) => <GhostMarker key={g.key} ghost={g} />)}
      {chord && <Ribbon pts={chord} width={0.1} color={ACCENT} opacity={0.32} />}
      {arrows.map((ar) => <HopPath key={ar.key} a={ar.a} b={ar.b} rank={ar.rank} progress={p} />)}
      {arrows.filter((ar) => ar.rank === 0 && ar.from.string === ar.to.string && Math.abs(ar.to.fret - ar.from.fret) >= 2).map((ar) => (
        <FretJumpChip key={`j${ar.key}`} a={ar.a} b={ar.b} delta={ar.to.fret - ar.from.fret} />
      ))}
      {arrows.filter((ar) => ar.rank === 0).map((ar) => (
        <HopBubble key={`h${beatId}-${ar.key}`} a={ar.a} b={ar.b} label={String(ar.to.fret)} progress={p} beatId={beatId} />
      ))}
      {next.map((m) => <NextMarker key={`n${m.rank}-${m.key}`} profile={profile} m={m} progress={p} />)}
      {current.map((n) => <CurrentMarker key={`c${beatId}-${noteKey(n)}`} profile={profile} note={n} beatId={beatId} />)}
    </>
  );
}

/* ------------------------------------------------------------------ fret numbers */

const INLAY_FRETS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21, 24]);

/** Small fret numbers outside the bass-side edge (facing the camera) and a subtle open-string mark at the nut. */
export function FretNumbers({ profile }: { profile: GuitarProfile }) {
  const L = profile.scaleLengthCm;
  const items = useMemo(() => {
    const out: { label: string; pos: [number, number, number]; mat: THREE.SpriteMaterial }[] = [];
    for (let n = 0; n <= profile.fretCount; n++) {
      const x = n === 0 ? 0.25 : (fretX(L, n - 1) + fretX(L, n)) / 2;
      const y = fretboardWidth(profile, Math.min(0, x)) / 2 + 0.75;
      const strong = INLAY_FRETS.has(n);
      const mat = new THREE.SpriteMaterial({
        map: labelTexture(n === 0 ? '○' : String(n)),
        color: n === 0 ? '#8d8c88' : strong ? '#e9e5dc' : '#8d8c88',
        opacity: n === 0 ? 0.6 : strong ? 0.95 : 0.7,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      out.push({ label: String(n), pos: [x, y, FB_TOP + 0.1], mat });
    }
    return out;
  }, [profile, L]);
  useEffect(() => () => items.forEach((i) => i.mat.dispose()), [items]);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(({ camera, size }) => {
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 30;
    for (const s of refs.current) {
      if (!s) continue;
      const d = s.getWorldPosition(tmpV).distanceTo(camera.position);
      s.scale.setScalar(screenConstantSize(d, size.height, fov, 20, 0.55, 2.2));
    }
  });
  return (
    <>
      {items.map((it, i) => (
        <sprite key={it.label} ref={(s: THREE.Sprite | null) => { refs.current[i] = s; }} position={it.pos} material={it.mat} renderOrder={7} />
      ))}
    </>
  );
}
