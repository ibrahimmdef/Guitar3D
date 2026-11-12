import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Billboard, CameraControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CameraMode, FretNote, GuitarProfile, GuitarView } from '@guitar3d/shared';
import { buildGuitar, buildStaticStrings, segmentPoints, tube, type GuitarGeometry } from './build';
import {
  bodyDepthAt, FB_TOP, fitDistance, followTarget, fretX, guitarXRange, hitToFret, noteX, speakingFraction, stringY, stringZ,
} from './geometry';
import { ACCENT, createMaterials, labelTexture, NEXT_OUTLINE, woundTexture } from './materials';

export interface Guitar3DProps {
  profile: GuitarProfile;
  notes: FretNote[];
  beatId: number;
  /** 0..1: how far we are towards the next note (drives the approach arc of 'next' markers). */
  beatProgress?: number;
  view: GuitarView;
  cameraMode: CameraMode;
  onCameraModeChange?: (m: CameraMode) => void;
  onFretClick?: (string: number, fret: number) => void;
  /** Called once, after the guitar with all its textures has been drawn for the first time. */
  onReady?: () => void;
  className?: string;
}

const FOV = 30;
const DEG = Math.PI / 180;

/** Guitar frame → world: the view rotates (never mirrors) the guitar about z and centres it. */
function useFrame3(profile: GuitarProfile, view: GuitarView) {
  return useMemo(() => {
    const [x0, x1] = guitarXRange(profile);
    const cx = (x0 + x1) / 2;
    const rot = view === 'player' ? Math.PI : 0;
    const m = new THREE.Matrix4().makeRotationZ(rot).multiply(new THREE.Matrix4().makeTranslation(-cx, 0, 0));
    return { cx, rot, matrix: m, length: x1 - x0, toWorld: (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m) };
  }, [profile, view]);
}

/* ------------------------------------------------------------------ scene setup */

function Studio({ depth, rot }: { depth: number; rot: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    scene.background = null; // transparent canvas: the app's stage colour shows through
    return () => {
      env.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  // the room turns with the guitar as well, so reflections look the same in both views
  useEffect(() => {
    scene.environmentRotation.set(0, 0, rot + Math.PI);
  }, [scene, rot]);
  return (
    <>
      {/* invisible floor behind the guitar that only catches its soft shadow */}
      <mesh position={[0, 0, -depth - 0.4]} receiveShadow>
        <planeGeometry args={[700, 460]} />
        <shadowMaterial transparent opacity={0.5} />
      </mesh>
      {/* the light rig turns with the guitar so both views are lit the same: key light on the viewer's side */}
      <group rotation={[0, 0, rot]}>
      <directionalLight
        position={[-45, -70, 130]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.06}
        shadow-radius={6}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={20}
        shadow-camera-far={320}
      />
      <directionalLight position={[80, 40, 60]} intensity={0.15} color="#e6ebff" />
      </group>
      <hemisphereLight args={['#e8ecf5', '#1a1a1c', 0.25]} />
    </>
  );
}

/* ------------------------------------------------------------------ guitar */

interface Textures {
  fretboard?: THREE.Texture;
  headstock?: THREE.Texture;
  rosette?: THREE.Texture;
}

function useGuitarTextures(profile: GuitarProfile): Textures {
  const gl = useThree((s) => s.gl);
  const urls = useMemo(() => {
    const u: Record<string, string> = {};
    if (profile.textures.fretboard?.url) u.fretboard = profile.textures.fretboard.url;
    if (profile.textures.headstock) u.headstock = profile.textures.headstock;
    if (profile.textures.rosette) u.rosette = profile.textures.rosette;
    return u;
  }, [profile]);
  // useTexture suspends: the guitar appears only once every texture is decoded.
  const tex = useTexture(urls) as unknown as Textures;
  useLayoutEffect(() => {
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    for (const t of Object.values(tex) as THREE.Texture[]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
    }
  }, [tex, gl]);
  return tex;
}

function Guitar({
  profile, geo, notes, beatId, beatProgress, onFretboardClick, onFretboardDoubleClick,
}: {
  profile: GuitarProfile;
  geo: GuitarGeometry;
  notes: FretNote[];
  beatId: number;
  beatProgress: number;
  onFretboardClick: (e: ThreeEvent<MouseEvent>) => void;
  onFretboardDoubleClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const tex = useGuitarTextures(profile);
  const wound = useMemo(() => woundTexture(), []);
  const mats = useMemo(() => createMaterials(profile.finish, wound), [profile.finish, wound]);
  const fbMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ map: tex.fretboard ?? null, color: tex.fretboard ? '#ffffff' : profile.finish.fretboard, roughness: 0.62, clearcoat: 0.08 }),
    [tex.fretboard, profile.finish.fretboard],
  );
  const faceMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ map: tex.headstock ?? null, color: tex.headstock ? '#ffffff' : profile.finish.headstock, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5, specularIntensity: 0.7, envMapIntensity: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
    [tex.headstock, profile.finish.headstock],
  );
  const roseMat = useMemo(
    () => (tex.rosette ? new THREE.MeshPhysicalMaterial({ map: tex.rosette, transparent: true, roughness: 0.3, clearcoat: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }) : null),
    [tex.rosette],
  );
  const staticStrings = useMemo(() => buildStaticStrings(geo.strings), [geo]);
  useEffect(() => () => {
    staticStrings.plain.dispose();
    staticStrings.wound.dispose();
  }, [staticStrings]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const parts = geo.parts;
  const solid = (k: keyof typeof parts, mat: THREE.Material, cast = true) =>
    parts[k] ? <mesh key={k} geometry={parts[k]} material={mat} castShadow={cast} receiveShadow /> : null;

  return (
    <group>
      {solid('top', mats.top, false)}
      {solid('sides', mats.sides)}
      {solid('back', mats.back)}
      {solid('binding', mats.binding)}
      {solid('neck', mats.neck)}
      {solid('headstock', mats.headstock)}
      {solid('pickguard', mats.pickguard, false)}
      {solid('bridge', mats.bridge)}
      {solid('bone', mats.bone)}
      {solid('pin', mats.pin)}
      {solid('chrome', mats.chrome)}
      {solid('fret', mats.fret)}
      {solid('dot', mats.dot, false)}
      {parts.interior && <mesh geometry={parts.interior} material={mats.interior} material-side={THREE.DoubleSide} />}
      {parts.hole && <mesh geometry={parts.hole} material={mats.hole} />}
      <mesh geometry={geo.fretboard} material={fbMat} receiveShadow onClick={onFretboardClick} onDoubleClick={onFretboardDoubleClick} />
      <mesh geometry={geo.headstockFace} material={faceMat} receiveShadow />
      {roseMat && (
        <mesh position={[geo.rosette.x, geo.rosette.y, 0.004]} material={roseMat} receiveShadow>
          <ringGeometry args={[geo.rosette.inner, geo.rosette.outer, 128, 1]} />
        </mesh>
      )}
      <mesh geometry={staticStrings.plain} material={mats.plainString} castShadow />
      <mesh geometry={staticStrings.wound} material={mats.woundString} castShadow />
      <SpeakingStrings geo={geo} profile={profile} notes={notes} beatId={beatId} plain={mats.plainString} woundMat={mats.woundString} />
      <Markers profile={profile} notes={notes} beatProgress={beatProgress} />
    </group>
  );
}

/* ------------------------------------------------------------------ strings that vibrate */

interface Vib {
  amp: { value: number };
  node: { value: number };
  time: { value: number };
  glow: number;
}

function vibratingMaterial(base: THREE.MeshPhysicalMaterial, vib: Vib) {
  const m = base.clone();
  m.emissive = new THREE.Color(ACCENT);
  m.emissiveIntensity = 0;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uAmp = vib.amp;
    shader.uniforms.uNode = vib.node;
    shader.uniforms.uTime = vib.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float along;\nuniform float uAmp;\nuniform float uNode;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float sNorm = clamp(along / max(uNode, 0.001), 0.0, 1.0);
        float env = along < uNode ? sin(3.14159265 * sNorm) : 0.0;
        transformed.y += uAmp * env * sin(uTime * 97.0);
        transformed.z += uAmp * 0.35 * env * cos(uTime * 97.0);`,
      );
  };
  m.customProgramCacheKey = () => 'vibrating-string';
  return m;
}

function SpeakingStrings({ geo, profile, notes, beatId, plain, woundMat }: {
  geo: GuitarGeometry; profile: GuitarProfile; notes: FretNote[]; beatId: number;
  plain: THREE.MeshPhysicalMaterial; woundMat: THREE.MeshPhysicalMaterial;
}) {
  const items = useMemo(() => geo.strings.map((s) => {
    const vib: Vib = { amp: { value: 0 }, node: { value: 1 }, time: { value: 0 }, glow: 0 };
    const geometry = tube(segmentPoints(s.speaking[0], s.speaking[1], 48), s.radius);
    const material = vibratingMaterial(s.wound ? woundMat : plain, vib);
    return { s, vib, geometry, material };
  }), [geo, plain, woundMat]);
  useEffect(() => () => items.forEach((i) => {
    i.geometry.dispose();
    i.material.dispose();
  }), [items]);

  // pluck the strings of the current beat
  useEffect(() => {
    for (const n of notes) {
      if (n.state !== 'now' || n.muted) continue;
      const it = items.find((i) => i.s.string === n.string);
      if (!it) continue;
      it.vib.amp.value = Math.min(0.06, 0.02 + it.s.radius * 0.5);
      it.vib.node.value = speakingFraction(n.fret);
      it.vib.glow = 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatId, items]);
  void profile;

  useFrame((state, dt) => {
    for (const it of items) {
      it.vib.time.value = state.clock.elapsedTime;
      it.vib.amp.value *= Math.exp(-dt * 3.2);
      it.vib.glow *= Math.exp(-dt * 2.4);
      it.material.emissiveIntensity = it.vib.glow * 0.9;
    }
  });
  return (
    <>
      {items.map((i) => <mesh key={i.s.string} geometry={i.geometry} material={i.material} castShadow />)}
    </>
  );
}

/* ------------------------------------------------------------------ note markers */

const markerVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const markerFragment = /* glsl */ `
uniform sampler2D uLabel;
uniform int uKind;          // 0 now, 1 next, 2 muted-now, 3 muted-next, 4 technique chip
uniform float uProgress;
uniform vec3 uAccent;
uniform vec3 uLine;
uniform float uOpacity;
varying vec2 vUv;
float fill(float d) { return clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float glyph = texture2D(uLabel, vUv).a;
  vec4 c = vec4(0.0);
  if (uKind == 0) {
    float shadow = (1.0 - smoothstep(0.78, 1.0, r)) * 0.45;
    c = vec4(0.0, 0.0, 0.0, shadow);
    vec3 face = mix(uAccent * 1.08, uAccent * 0.82, smoothstep(-0.9, 0.9, -p.y));
    c = mix(c, vec4(face, 1.0), fill(r - 0.84));
    c.rgb = mix(c.rgb, vec3(1.0, 0.96, 0.86), fill(abs(r - 0.81) - 0.035) * 0.75);
    c.rgb = mix(c.rgb, vec3(0.07, 0.055, 0.03), glyph);
  } else if (uKind == 1) {
    c = vec4(0.04, 0.04, 0.05, fill(r - 0.74) * 0.62);
    c = mix(c, vec4(uLine, 1.0), fill(abs(r - 0.72) - 0.06));
    float a = atan(p.x, p.y);
    float a01 = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;
    float arc = fill(abs(r - 0.9) - 0.065) * step(a01, uProgress);
    c = mix(c, vec4(uAccent, 1.0), arc);
    c = mix(c, vec4(uLine, 1.0), glyph);
  } else if (uKind == 2 || uKind == 3) {
    vec3 col = uKind == 2 ? uAccent : uLine;
    c = vec4(0.04, 0.04, 0.05, fill(r - 0.8) * 0.7);
    c = mix(c, vec4(col, 1.0), fill(abs(r - 0.78) - 0.045));
    float d = min(abs(p.x - p.y), abs(p.x + p.y)) * 0.7071 - 0.075;
    c = mix(c, vec4(col, 1.0), fill(d) * fill(r - 0.5));
  } else {
    c = vec4(0.09, 0.09, 0.1, fill(r - 0.92) * 0.92);
    c = mix(c, vec4(uLine, 1.0), fill(abs(r - 0.9) - 0.05) * 0.6);
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

function markerMaterial(kind: number, label: string, progress: number) {
  return new THREE.ShaderMaterial({
    vertexShader: markerVertex,
    fragmentShader: markerFragment,
    uniforms: {
      uLabel: { value: labelTexture(label) },
      uKind: { value: kind },
      uProgress: { value: progress },
      uAccent: { value: new THREE.Color(ACCENT) },
      uLine: { value: new THREE.Color(NEXT_OUTLINE) },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

const planeGeo = new THREE.PlaneGeometry(1, 1);
const tmpV = new THREE.Vector3();
const footGeo = new THREE.CircleGeometry(0.5, 32);
const footMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });

function Marker({ profile, note, progress }: { profile: GuitarProfile; note: FretNote; progress: number }) {
  const L = profile.scaleLengthCm;
  const fret = Math.min(Math.max(0, note.fret), profile.fretCount);
  const x = noteX(L, fret);
  const y = stringY(profile, note.string, Math.min(0, x));
  const z = stringZ(profile, Math.min(0, x)) + 0.62;
  const now = note.state === 'now';
  const label = note.finger !== undefined && note.finger !== null ? String(note.finger === 0 ? 'T' : note.finger) : String(fret);
  const kind = note.muted ? (now ? 2 : 3) : now ? 0 : 1;
  const mat = useMemo(() => markerMaterial(kind, label, progress), [kind, label]); // eslint-disable-line react-hooks/exhaustive-deps
  const chip = useMemo(() => (note.technique ? markerMaterial(4, TECH_GLYPH[note.technique], 0) : null), [note.technique]);
  useEffect(() => () => {
    mat.dispose();
    chip?.dispose();
  }, [mat, chip]);
  mat.uniforms.uProgress.value = progress;
  const size = now ? 1.0 : 0.92;
  // keep the bubble legible when the camera pulls back (bounded so chords do not smear together)
  const scaler = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const g = scaler.current;
    if (!g) return;
    const d = g.getWorldPosition(tmpV).distanceTo(camera.position);
    g.scale.setScalar(Math.min(1.5, Math.max(1.15, d * 0.04)));
  });
  return (
    <>
      {now && fret > 0 && !note.muted && (
        <mesh geometry={footGeo} material={footMat} position={[x, y, FB_TOP + 0.02]} scale={0.9} renderOrder={2} />
      )}
      <Billboard position={[x, y, z]}>
        <group ref={scaler}>
          <mesh geometry={planeGeo} material={mat} scale={size} renderOrder={now ? 11 : 10} />
          {chip && <mesh geometry={planeGeo} material={chip} scale={0.46} position={[0.42, 0.42, 0.01]} renderOrder={12} />}
        </group>
      </Billboard>
    </>
  );
}

function Markers({ profile, notes, beatProgress }: { profile: GuitarProfile; notes: FretNote[]; beatProgress: number }) {
  const shown = useMemo(() => {
    const nowKeys = new Set(notes.filter((n) => n.state === 'now').map((n) => `${n.string}:${n.fret}`));
    return notes.filter((n) => n.string >= 1 && n.string <= 6 && (n.state === 'now' || !nowKeys.has(`${n.string}:${n.fret}`)));
  }, [notes]);
  return (
    <>
      {shown.map((n) => (
        <Marker key={`${n.state}-${n.string}-${n.fret}-${n.muted ? 'x' : ''}`} profile={profile} note={n} progress={beatProgress} />
      ))}
    </>
  );
}

/** Mounted inside the Suspense boundary: fires after the first frame that contains the textured guitar. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 2) onReady();
  });
  return null;
}

/* ------------------------------------------------------------------ camera */

function CameraRig({
  profile, view, mode, notes, onUserMove, focusRef,
}: {
  profile: GuitarProfile;
  view: GuitarView;
  mode: CameraMode;
  notes: FretNote[];
  onUserMove: () => void;
  focusRef: React.MutableRefObject<((p: THREE.Vector3) => void) | null>;
}) {
  const ref = useRef<CameraControls>(null);
  const size = useThree((s) => s.size);
  const frame = useFrame3(profile, view);
  const followX = useRef<number | null>(null);
  const L = profile.scaleLengthCm;
  const aspect = size.width / Math.max(1, size.height);
  const userMoved = useRef(false);

  // camera direction expressed in the guitar frame so both views look the same
  const look = (target: THREE.Vector3, dirGuitar: THREE.Vector3, dist: number, smooth: boolean) => {
    const c = ref.current;
    if (!c) return;
    const dir = dirGuitar.clone().normalize().applyAxisAngle(new THREE.Vector3(0, 0, 1), frame.rot);
    const pos = target.clone().addScaledVector(dir, dist);
    void c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, smooth);
  };

  const apply = (m: CameraMode, smooth: boolean) => {
    if (m === 'free') return;
    if (m === 'overview') {
      const d = fitDistance(frame.length * 1.08, 52, FOV, aspect);
      look(new THREE.Vector3(0, 0, -3), new THREE.Vector3(0.05, -0.32, 1), d, smooth);
    } else if (m === 'neck') {
      const x20 = fretX(L, profile.fretCount);
      const d = fitDistance(-x20 + 8, 14, FOV, aspect);
      look(frame.toWorld(x20 / 2 + 1, 0, FB_TOP), new THREE.Vector3(-0.04, -0.4, 1), d, smooth);
    } else {
      const x = followX.current ?? fretX(L, 5);
      const d = Math.max(24, fitDistance(22, 10, FOV, aspect));
      look(frame.toWorld(x, 0, FB_TOP), new THREE.Vector3(-0.14, -0.5, 1), d, smooth);
    }
  };

  // dev hook for headless screenshots: window.__g3dCamera.apply('neck')
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __g3dCamera?: unknown }).__g3dCamera = { apply: (m: CameraMode) => apply(m, false), controls: ref.current };
  });

  // mode or view changes: re-apply (smoothly); a new mode clears the user override
  useEffect(() => {
    userMoved.current = false;
    apply(mode, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, view, profile]);

  // aspect changes re-fit framed modes without animation
  useEffect(() => {
    if (!userMoved.current && (mode === 'overview' || mode === 'neck')) apply(mode, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);

  // follow the played position
  useEffect(() => {
    const frets = notes.filter((n) => n.state === 'now').map((n) => n.fret);
    const next = followTarget(L, frets.length ? frets : notes.map((n) => n.fret), followX.current);
    if (next === followX.current) return;
    followX.current = next;
    if (mode === 'follow' && !userMoved.current) apply('follow', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const onStart = () => {
      if (!userMoved.current) {
        userMoved.current = true;
        onUserMove();
      }
    };
    c.addEventListener('controlstart', onStart);
    return () => c.removeEventListener('controlstart', onStart);
  }, [onUserMove]);

  useEffect(() => {
    focusRef.current = (p: THREE.Vector3) => {
      const c = ref.current;
      if (!c) return;
      const pos = new THREE.Vector3();
      const tgt = new THREE.Vector3();
      c.getPosition(pos);
      c.getTarget(tgt);
      const dir = pos.sub(tgt).normalize();
      const eye = p.clone().addScaledVector(dir, 26);
      userMoved.current = true;
      onUserMove();
      void c.setLookAt(eye.x, eye.y, eye.z, p.x, p.y, p.z, true);
    };
  }, [focusRef, onUserMove]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      smoothTime={0.45}
      draggingSmoothTime={0.12}
      minDistance={10}
      maxDistance={320}
      minPolarAngle={18 * DEG}
      maxPolarAngle={162 * DEG}
      minAzimuthAngle={-80 * DEG}
      maxAzimuthAngle={80 * DEG}
      dollyToCursor
    />
  );
}

/* ------------------------------------------------------------------ public component */

export function Guitar3D({ profile, notes, beatId, beatProgress = 0, view, cameraMode, onCameraModeChange, onFretClick, onReady, className }: Guitar3DProps) {
  const readyCb = useRef(onReady);
  readyCb.current = onReady;
  const readySent = useRef(false);
  const signalReady = useMemo(() => () => {
    if (readySent.current) return;
    readySent.current = true;
    readyCb.current?.();
  }, []);
  const geo = useMemo(() => buildGuitar(profile), [profile]);
  useEffect(() => () => {
    Object.values(geo.parts).forEach((g) => g?.dispose());
    geo.fretboard.dispose();
    geo.headstockFace.dispose();
  }, [geo]);
  const frame = useFrame3(profile, view);
  const focusRef = useRef<((p: THREE.Vector3) => void) | null>(null);
  const guitarRef = useRef<THREE.Group>(null);
  const modeCb = useRef(onCameraModeChange);
  modeCb.current = onCameraModeChange;
  const onUserMove = useMemo(() => () => modeCb.current?.('free'), []);
  const maxDepth = useMemo(() => bodyDepthAt(profile, guitarXRange(profile)[0]), [profile]);

  const onFretboardClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onFretClick || e.delta > 4 || !guitarRef.current) return;
    e.stopPropagation();
    const local = guitarRef.current.worldToLocal(e.point.clone());
    const hit = hitToFret(profile, local.x, local.y);
    onFretClick(hit.string, hit.fret);
  };
  const onFretboardDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    focusRef.current?.(e.point.clone());
  };

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 1, far: 2000, position: [0, -60, 260] }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <Studio depth={maxDepth} rot={frame.rot} />
        <Suspense fallback={null}>
          <group rotation={[0, 0, frame.rot]}>
            <group ref={guitarRef} position={[-frame.cx, 0, 0]}>
              <Guitar
                profile={profile}
                geo={geo}
                notes={notes}
                beatId={beatId}
                beatProgress={beatProgress}
                onFretboardClick={onFretboardClick}
                onFretboardDoubleClick={onFretboardDoubleClick}
              />
            </group>
          </group>
          <ReadySignal onReady={signalReady} />
        </Suspense>
        <CameraRig profile={profile} view={view} mode={cameraMode} notes={notes} onUserMove={onUserMove} focusRef={focusRef} />
      </Canvas>
    </div>
  );
}
