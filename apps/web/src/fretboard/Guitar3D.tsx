import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { CameraControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CameraMode, FretNote, GuitarProfile, GuitarView } from '@guitar3d/shared';
import { buildGuitar, buildStaticStrings, segmentPoints, tube, type GuitarGeometry } from './build';
import {
  bodyDepthAt, followTarget, guitarXRange, hitToFret, speakingFraction,
} from './geometry';
import { ACCENT, createMaterials, decorateMaterials, fretboardWoodMap, rosetteTexture, woundTexture } from './materials';
import { FretNumbers, NoteMarkers } from './NoteMarkers';
import { CAMERA_FOV, cameraFraming, clampZoom } from './camera';

export interface Guitar3DProps {
  profile: GuitarProfile;
  notes: FretNote[];
  beatId: number;
  /** 0..1: how far we are towards the next note (drives the approach arc of 'next' markers). */
  beatProgress?: number;
  /**
   * Beats after the current one, nearest first (up to 3 are drawn, fading with distance in time).
   * Without it the notes with state 'next' form the only upcoming beat.
   */
  upcoming?: FretNote[][];
  /** Camera zoom factor for the framed modes (1 = default framing, clamped 0.5–2.5). */
  zoom?: number;
  /** Fret numbers along the bass-side edge and an open-string mark at the nut (default true). */
  showFretNumbers?: boolean;
  view: GuitarView;
  cameraMode: CameraMode;
  onCameraModeChange?: (m: CameraMode) => void;
  onFretClick?: (string: number, fret: number) => void;
  /** Called once, after the guitar with all its textures has been drawn for the first time. */
  onReady?: () => void;
  className?: string;
}

const FOV = CAMERA_FOV;
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
  bodyTop?: THREE.Texture;
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
    if (profile.textures.bodyTop) u.bodyTop = profile.textures.bodyTop;
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
  profile, geo, notes, upcoming, showFretNumbers, beatId, beatProgress, onFretboardClick, onFretboardDoubleClick,
}: {
  profile: GuitarProfile;
  geo: GuitarGeometry;
  notes: FretNote[];
  upcoming?: FretNote[][];
  showFretNumbers: boolean;
  beatId: number;
  beatProgress: number;
  onFretboardClick: (e: ThreeEvent<MouseEvent>) => void;
  onFretboardDoubleClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const tex = useGuitarTextures(profile);
  const wound = useMemo(() => woundTexture(), []);
  const { mats, made } = useMemo(() => {
    const m = createMaterials(profile.finish, wound);
    return { mats: m, made: decorateMaterials(m, profile, tex.bodyTop) };
  }, [profile, wound, tex.bodyTop]);
  useEffect(() => () => made.forEach((t) => t.dispose()), [made]);
  const fbMat = useMemo(() => {
    const map = tex.fretboard ?? fretboardWoodMap(profile);
    return new THREE.MeshPhysicalMaterial({ map, color: '#ffffff', roughness: 0.62, clearcoat: 0.08 });
  }, [tex.fretboard, profile]);
  useEffect(() => () => {
    if (fbMat.map !== tex.fretboard) fbMat.map?.dispose();
    fbMat.dispose();
  }, [fbMat, tex.fretboard]);
  const faceMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ map: tex.headstock ?? null, color: tex.headstock ? '#ffffff' : profile.finish.headstock, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5, specularIntensity: 0.7, envMapIntensity: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
    [tex.headstock, profile.finish.headstock],
  );
  const roseMat = useMemo(() => {
    if (profile.body.soundhole.radiusCm <= 0.5) return null;
    const map = tex.rosette ?? rosetteTexture(profile.finish.topWood);
    return new THREE.MeshPhysicalMaterial({ map, transparent: true, roughness: 0.3, clearcoat: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }, [tex.rosette, profile]);
  useEffect(() => () => {
    if (roseMat && roseMat.map !== tex.rosette) roseMat.map?.dispose();
    roseMat?.dispose();
  }, [roseMat, tex.rosette]);
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
      {solid('inlay', mats.inlay, false)}
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
      <NoteMarkers profile={profile} notes={notes} upcoming={upcoming} beatId={beatId} beatProgress={beatProgress} />
      {showFretNumbers && <FretNumbers profile={profile} />}
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
  profile, view, mode, notes, zoom, onUserMove, focusRef,
}: {
  profile: GuitarProfile;
  zoom: number;
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
    const f = cameraFraming(profile, m, aspect, followX.current, zoom);
    look(frame.toWorld(...f.target), new THREE.Vector3(...f.dir), f.distance, smooth);
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

  // aspect changes re-fit framed modes without animation, zoom changes ease
  useEffect(() => {
    if (!userMoved.current) apply(mode, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);
  useEffect(() => {
    if (!userMoved.current) apply(mode, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

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
      maxDistance={900}
      minPolarAngle={18 * DEG}
      maxPolarAngle={162 * DEG}
      minAzimuthAngle={-80 * DEG}
      maxAzimuthAngle={80 * DEG}
      dollyToCursor
    />
  );
}

/* ------------------------------------------------------------------ public component */

export function Guitar3D({
  profile, notes, upcoming, beatId, beatProgress = 0, zoom = 1, showFretNumbers = true, view, cameraMode, onCameraModeChange, onFretClick, onReady, className }: Guitar3DProps) {
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
        camera={{ fov: FOV, near: 1, far: 3000, position: [0, -60, 260] }}
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
                upcoming={upcoming}
                showFretNumbers={showFretNumbers}
                beatId={beatId}
                beatProgress={beatProgress}
                onFretboardClick={onFretboardClick}
                onFretboardDoubleClick={onFretboardDoubleClick}
              />
            </group>
          </group>
          <ReadySignal onReady={signalReady} />
        </Suspense>
        <CameraRig profile={profile} view={view} mode={cameraMode} notes={notes} zoom={clampZoom(zoom)} onUserMove={onUserMove} focusRef={focusRef} />
      </Canvas>
    </div>
  );
}
