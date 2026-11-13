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
  currentNotes, ghostOpacity, GHOST_TIME, markerDiameter, markerLabel, moveArrows, arcPoint, arrowOpacity, noteKey, popRing, popScale,
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

function CurrentMarker({ profile, note }: { profile: GuitarProfile; note: FretNote }) {
  const pos = markerPosition(profile, note.string, note.fret);
  const mat = useMarkerMaterial(note.muted ? KIND.muted : KIND.now, note.muted ? null : markerLabel(note), ACCENT);
  const chip = useMarkerMaterial(KIND.chip, note.technique ? TECH_GLYPH[note.technique] : null, NEXT_OUTLINE);
  const g = useRef<THREE.Group>(null);
  const start = useRef(-1);
  useFrame(({ camera, size, clock }) => {
    if (!g.current) return;
    if (start.current < 0) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    g.current.scale.setScalar(diameterAt(g.current, camera, size.height) * popScale(t));
    mat.uniforms.uPop.value = popRing(t);
  });
  return (
    <Billboard position={pos}>
      <group ref={g}>
        <mesh geometry={planeGeo} material={mat} scale={QUAD} renderOrder={12} />
        {note.technique && <mesh geometry={planeGeo} material={chip} scale={0.5} position={[0.78, 0.78, 0.01]} renderOrder={13} />}
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
  useFrame(({ camera, size }) => {
    if (g.current) g.current.scale.setScalar(diameterAt(g.current, camera, size.height) * 0.94 * scale.current);
  });
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
  useFrame(({ camera, size, clock }) => {
    if (!g.current) return;
    const t = clock.elapsedTime - ghost.born;
    mat.uniforms.uOpacity.value = ghostOpacity(t);
    g.current.visible = t < GHOST_TIME;
    g.current.scale.setScalar(diameterAt(g.current, camera, size.height) * (1 + 0.15 * Math.min(1, t / GHOST_TIME)));
  });
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

/* ------------------------------------------------------------------ move arrows */

type V3 = [number, number, number];

/** Curved shaft plus a flat arrowhead, trimmed so both ends stay clear of the bubbles. */
function arrowGeometry(a: V3, b: V3, bulge: number, width: number, clear: number) {
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const t0 = Math.min(0.4, clear / Math.max(chord, 1e-3));
  const t1 = 1 - Math.min(0.4, clear / Math.max(chord, 1e-3));
  const head = Math.min(1.0, chord * 0.3);
  const headT = Math.max(t0 + 0.02, t1 - head / Math.max(chord, 1e-3));
  const shaft: V3[] = [];
  for (let i = 0; i <= 16; i++) shaft.push(arcPoint(a, b, t0 + ((headT - t0) * i) / 16, bulge));
  const { geometry, length } = ribbonGeometry(shaft, width);
  // Arrowhead: a triangle from the shaft end to the tip, along the curve's direction.
  const base = shaft[shaft.length - 1];
  const tip = arcPoint(a, b, t1, bulge);
  const dx = tip[0] - base[0];
  const dy = tip[1] - base[1];
  const l = Math.hypot(dx, dy) || 1;
  const hw = Math.max(width * 2.6, 0.48);
  const nx = (-dy / l) * hw;
  const ny = (dx / l) * hw;
  const pos = Array.from(geometry.getAttribute('position').array as Float32Array);
  const sAttr = Array.from(geometry.getAttribute('aS').array as Float32Array);
  const idx = Array.from(geometry.getIndex()!.array as ArrayLike<number>);
  const k = pos.length / 3;
  pos.push(base[0] + nx, base[1] + ny, base[2], base[0] - nx, base[1] - ny, base[2], tip[0], tip[1], tip[2]);
  sAttr.push(length, length, length + l);
  idx.push(k, k + 1, k + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sAttr, 1));
  g.setIndex(idx);
  geometry.dispose();
  return g;
}

const arrowFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uLen;
uniform float uHead;
uniform float uTime;
uniform float uFlow;
varying float vS;
void main() {
  float a = uOpacity;
  // fade in from the note it leaves, so the arrow reads as "from here → to there"
  a *= 0.25 + 0.75 * smoothstep(0.0, max(0.6, uHead * 0.6), vS);
  if (uFlow > 0.0 && vS < uHead) {
    // dashes streaming towards the head
    float f = fract((vS - uTime * 2.4) / 0.85);
    a *= mix(0.45, 1.0, smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.5, 0.62, f)));
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

const arrowMat = (color: string, flow: boolean, head: number) => new THREE.ShaderMaterial({
  vertexShader: lineVertex,
  fragmentShader: arrowFragment,
  uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uLen: { value: 1 }, uHead: { value: head }, uTime: { value: 0 }, uFlow: { value: flow ? 1 : 0 } },
  transparent: true,
  depthWrite: false,
  depthTest: false,
  toneMapped: false,
  side: THREE.DoubleSide,
});

const bulgeFor = (a: V3, b: V3) => Math.min(0.9, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.14);
/** World-space gap kept between an arrow end and the bubble centre. */
const CLEAR = 0.95;

/** Curved arrow from one note to the next; the nearest one streams towards its target. */
function MoveArrow({ a, b, rank, progress }: { a: V3; b: V3; rank: number; progress: number }) {
  const sig = [...a, ...b].map((v) => v.toFixed(2)).join(',');
  const width = rank === 0 ? 0.2 : 0.13;
  const built = useMemo(() => {
    const bulge = bulgeFor(a, b);
    const main = arrowGeometry(a, b, bulge, width, CLEAR);
    const shadow = arrowGeometry(a, b, bulge, width * 2.3, CLEAR - 0.06);
    const head = (main.getAttribute('aS').array as Float32Array).at(-3) ?? 0;
    return { main, shadow, head };
  }, [sig, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useMemo(() => arrowMat(rank === 0 ? ACCENT : NEXT_OUTLINE, rank === 0, built.head), [rank, built.head]);
  const shadowMat = useMemo(() => arrowMat('#050506', false, built.head), [built.head]);
  const op = arrowOpacity(rank, progress);
  mat.uniforms.uOpacity.value = op;
  shadowMat.uniforms.uOpacity.value = op * 0.45;
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  useEffect(() => () => {
    built.main.dispose();
    built.shadow.dispose();
  }, [built]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => shadowMat.dispose(), [shadowMat]);
  return (
    <>
      <mesh geometry={built.shadow} material={shadowMat} renderOrder={7 - rank} />
      <mesh geometry={built.main} material={mat} renderOrder={8 - rank} />
    </>
  );
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

const ease = (x: number) => x * x * (3 - 2 * x);

/**
 * The hand's path: in the second half of the beat a ghost of the next bubble glides from the current
 * note along the arrow and lands on the next note exactly when it is due, so the bubble never just jumps.
 */
function GlideMarker({ a, b, label, progress }: { a: V3; b: V3; label: string; progress: number }) {
  const mat = useMarkerMaterial(KIND.ring, label, ACCENT);
  const p = useSmoothProgress(progress);
  const g = useRef<THREE.Group>(null);
  const bulge = bulgeFor(a, b);
  useFrame(({ camera, size }) => {
    if (!g.current) return;
    const k = Math.min(1, Math.max(0, (p.current - 0.4) / 0.6));
    const t = ease(k);
    const pos = arcPoint(a, b, t, bulge);
    g.current.position.set(pos[0], pos[1], pos[2] + 0.05);
    g.current.visible = k > 0;
    mat.uniforms.uOpacity.value = Math.min(1, k * 3) * (0.55 + 0.35 * t);
    g.current.scale.setScalar(diameterAt(g.current, camera, size.height) * (0.72 + 0.22 * t));
  });
  return (
    <group ref={g} visible={false}>
      <Billboard>
        <mesh geometry={planeGeo} material={mat} scale={QUAD} renderOrder={11} />
      </Billboard>
    </group>
  );
}

/** Small "+4" / "−3" chip on the arrow: how many frets the hand moves. */
function FretJumpChip({ a, b, delta }: { a: V3; b: V3; delta: number }) {
  const label = delta > 0 ? `+${delta}` : `−${-delta}`;
  const mat = useMarkerMaterial(KIND.chip, label, ACCENT);
  const g = useRef<THREE.Group>(null);
  const pos = arcPoint(a, b, 0.5, bulgeFor(a, b));
  useFrame(({ camera, size }) => {
    if (g.current) g.current.scale.setScalar(diameterAt(g.current, camera, size.height) * 0.62);
  });
  return (
    <Billboard position={[pos[0], pos[1], pos[2] + 0.1]}>
      <group ref={g}>
        <mesh geometry={planeGeo} material={mat} scale={QUAD} renderOrder={10} />
      </group>
    </Billboard>
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
    return moveArrows(current, beats).map((m) => {
      const a = markerPosition(profile, m.from.string, m.from.fret);
      const b = markerPosition(profile, m.to.string, m.to.fret);
      const z = Math.max(a[2], b[2]) - 0.25;
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
    const pts = current.filter((n) => !n.muted).sort((a, b) => a.string - b.string).map((n) => {
      const p = markerPosition(profile, n.string, n.fret);
      return [p[0], p[1], p[2] - 0.2] as [number, number, number];
    });
    return pts.length >= 2 ? pts : null;
  }, [current, profile]);

  const p = Math.min(1, Math.max(0, beatProgress || 0));
  return (
    <>
      {ghosts.map((g) => <GhostMarker key={g.key} ghost={g} />)}
      {chord && <Ribbon pts={chord} width={0.1} color={ACCENT} opacity={0.32} />}
      {arrows.map((ar) => <MoveArrow key={ar.key} a={ar.a} b={ar.b} rank={ar.rank} progress={p} />)}
      {arrows.filter((ar) => ar.rank === 0 && ar.from.string === ar.to.string && Math.abs(ar.to.fret - ar.from.fret) >= 2).map((ar) => (
        <FretJumpChip key={`j${ar.key}`} a={ar.a} b={ar.b} delta={ar.to.fret - ar.from.fret} />
      ))}
      {arrows.filter((ar) => ar.rank === 0).map((ar) => (
        <GlideMarker key={`gl${beatId}-${ar.key}`} a={ar.a} b={ar.b} label={String(ar.to.fret)} progress={p} />
      ))}
      {next.map((m) => <NextMarker key={`n${m.rank}-${m.key}`} profile={profile} m={m} progress={p} />)}
      {current.map((n) => <CurrentMarker key={`c${beatId}-${noteKey(n)}`} profile={profile} note={n} />)}
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
