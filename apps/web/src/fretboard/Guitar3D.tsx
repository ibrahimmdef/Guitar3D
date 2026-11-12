import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { FretNote } from '@guitar3d/shared';
import {
  bodyHalfWidth, bodyStartX, FRETBOARD_TOP, fretboardEndX, fretX, noteX, stringY, stringZ, widthAt,
  type GuitarSpec, type HeadstockShape,
} from './guitarSpec';
import { imageTexture, rosetteTexture, woodTexture } from './textures';

export const STRING_COLORS = ['#ff5d73', '#ffa53b', '#ffe14d', '#41d69a', '#45b4ff', '#a97cff'];
export const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];
/** Calibrated uploads from the "Gitarım" dialog cover nut … 12th fret. */
const UPLOAD_PHOTO_FRET = 12;

export interface GuitarTextures {
  fretboard?: string;
  top?: string;
}

interface Props {
  spec: GuitarSpec;
  notes: FretNote[];
  beatId: number;
  /** true: player/tab view (neck left, high e on top); false: audience view. */
  flip: boolean;
  follow: boolean;
  textures: GuitarTextures;
}

function useTex(url: string | undefined) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    setTex(null);
    if (url) imageTexture(url).then((t) => alive && setTex(t)).catch(() => alive && setTex(null));
    return () => {
      alive = false;
    };
  }, [url]);
  return tex;
}

function setUV(geo: THREE.BufferGeometry, fn: (x: number, y: number) => [number, number]) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const [u, v] = fn(p.getX(i), p.getY(i));
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const rough = (spec: GuitarSpec, matte: number, gloss: number) => (spec.finish === 'matte' ? matte : gloss);

function Body({ spec, topUrl }: { spec: GuitarSpec; topUrl?: string }) {
  const photo = useTex(topUrl);
  const holeX = bodyStartX(spec) - spec.bodyLength * 0.25 - spec.soundholeRadius * 0.2;
  const R = spec.soundholeRadius;

  const { geo, top, back } = useMemo(() => {
    const x0 = bodyStartX(spec);
    const pts: THREE.Vector2[] = [];
    const N = 140;
    for (let i = 0; i <= N; i++) {
      const u = (spec.bodyLength * i) / N;
      pts.push(new THREE.Vector2(x0 - u, Math.max(0.01, bodyHalfWidth(spec, u))));
    }
    for (let i = N; i >= 0; i--) {
      const u = (spec.bodyLength * i) / N;
      pts.push(new THREE.Vector2(x0 - u, -Math.max(0.01, bodyHalfWidth(spec, u))));
    }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth: spec.bodyDepth, bevelEnabled: true, bevelSize: 0.35, bevelThickness: 0.35, bevelSegments: 3, curveSegments: 4,
    });
    g.translate(0, 0, -spec.bodyDepth);
    const minX = x0 - spec.bodyLength, half = spec.lowerBout / 2;
    // Front photo: neck pointing up, low E (+y) on the image's left.
    setUV(g, (x, y) => [(half - y) / (2 * half), (x - minX) / spec.bodyLength]);
    const ring = (z: number) => pts.map((p) => new THREE.Vector3(p.x, p.y, z));
    return {
      geo: g,
      top: new THREE.BufferGeometry().setFromPoints(ring(0.36)),
      back: new THREE.BufferGeometry().setFromPoints(ring(-spec.bodyDepth - 0.36)),
    };
  }, [spec]);

  const pickguard = useMemo(() => {
    const s = new THREE.Shape();
    // Teardrop hugging the soundhole on the treble (high e, −y) side.
    s.absellipse(0, 0, 8.2, 5.2, 0, Math.PI * 2, false, 0);
    const g = new THREE.ShapeGeometry(s, 48);
    g.rotateZ(-0.32);
    g.translate(holeX - 2.6, -(R + 3.6), 0);
    return g;
  }, [holeX, R]);

  const rosette = useMemo(() => rosetteTexture(R + 0.3, R + 2.0), [R]);
  const bridgeX = -spec.scaleLength;

  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial key={photo ? 'photo' : 'plain'} attach="material-0" color={photo ? '#ffffff' : spec.colors.top} map={photo ?? null} roughness={rough(spec, 0.62, 0.22)} />
        <meshStandardMaterial attach="material-1" color={spec.colors.sides} roughness={rough(spec, 0.6, 0.25)} />
      </mesh>
      <lineLoop geometry={top}>
        <lineBasicMaterial color={spec.colors.binding} />
      </lineLoop>
      <lineLoop geometry={back}>
        <lineBasicMaterial color={spec.colors.binding} />
      </lineLoop>
      {!photo && (
        <>
          {spec.pickguard && (
            <mesh geometry={pickguard} position={[0, 0, 0.37]}>
              <meshStandardMaterial color={spec.colors.pickguard} roughness={0.12} metalness={0.1} />
            </mesh>
          )}
          <mesh position={[holeX, 0, 0.38]}>
            <ringGeometry args={[R + 0.3, R + 2.0, 96]} />
            <meshStandardMaterial map={rosette} roughness={0.25} metalness={0.3} />
          </mesh>
          <mesh position={[holeX, 0, 0.39]}>
            <circleGeometry args={[R + 0.3, 64]} />
            <meshBasicMaterial color="#0a0604" />
          </mesh>
          <mesh position={[holeX, 0, -spec.bodyDepth * 0.8]}>
            <circleGeometry args={[R * 0.95, 48]} />
            <meshStandardMaterial color="#5a3d26" roughness={0.9} />
          </mesh>
        </>
      )}
      <mesh position={[bridgeX - 1.1, 0, 0.62]} castShadow>
        <boxGeometry args={[3.0, 15.5, 0.5]} />
        <meshStandardMaterial color={spec.colors.bridge} roughness={0.55} />
      </mesh>
      <mesh position={[bridgeX, 0, 1.0]}>
        <boxGeometry args={[0.28, 7.6, 0.45]} />
        <meshStandardMaterial color="#f3ecdc" roughness={0.3} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[bridgeX - 1.9, stringY(spec, i + 1, -spec.scaleLength, false), 0.92]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.26, 0.22, 0.18, 20]} />
          <meshStandardMaterial color="#f5f0e4" roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function fretboardSegment(spec: GuitarSpec, xa: number, xb: number) {
  const shape = new THREE.Shape([
    new THREE.Vector2(xa, widthAt(spec, xa) / 2),
    new THREE.Vector2(xb, widthAt(spec, xb) / 2),
    new THREE.Vector2(xb, -widthAt(spec, xb) / 2),
    new THREE.Vector2(xa, -widthAt(spec, xa) / 2),
  ]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
  g.translate(0, 0, FRETBOARD_TOP - 0.6);
  // Photo rows: top = low E edge (+y).
  setUV(g, (x, y) => [(x - xa) / (xb - xa), 0.5 + y / widthAt(spec, x)]);
  return g;
}

function Headstock({ spec, shape }: { spec: GuitarSpec; shape?: HeadstockShape }) {
  const photo = useTex(shape?.texture);
  const geo = useMemo(() => {
    const profile: [number, number][] = shape?.profile ?? [[0, 2.2], [2, 3.4], [18.5, 3.9]];
    const hw = (x: number) => {
      for (let i = 1; i < profile.length; i++) {
        const [x0, w0] = profile[i - 1], [x1, w1] = profile[i];
        if (x <= x1) return w0 + ((w1 - w0) * (x - x0)) / (x1 - x0 || 1);
      }
      return profile[profile.length - 1][1];
    };
    const outline = [...profile.map(([x, w]) => new THREE.Vector2(x, w)), ...[...profile].reverse().map(([x, w]) => new THREE.Vector2(x, -w))];
    const s = new THREE.Shape(outline);
    const body = new THREE.ExtrudeGeometry(s, { depth: 1.4, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
    body.translate(0, 0, -1.4);
    const face = new THREE.ShapeGeometry(s, 4);
    const len = profile[profile.length - 1][0];
    setUV(face, (x, y) => [0.5 - y / (2 * hw(x)), x / len]);
    return { body, face, hw, len };
  }, [shape]);

  const chrome = <meshStandardMaterial color="#d6d8dc" metalness={1} roughness={0.18} />;
  const tuners = [
    ...(shape?.tunersLowE ?? [13.5, 10, 6]).map((x) => ({ x, side: 1 })),
    ...(shape?.tunersHighE ?? [13.5, 10, 6]).map((x) => ({ x, side: -1 })),
  ];

  return (
    <group position={[0.3, 0, FRETBOARD_TOP - 0.25]} rotation={[0, 0.24, 0]}>
      <mesh geometry={geo.body} castShadow>
        <meshStandardMaterial color={spec.colors.headstock} roughness={rough(spec, 0.55, 0.2)} />
      </mesh>
      <mesh geometry={geo.face} position={[0, 0, 0.09]}>
        {/* keyed: three.js only recompiles a material for a newly added map when it is recreated */}
        <meshStandardMaterial key={photo ? 'photo' : 'plain'} color={photo ? '#ffffff' : spec.colors.headstock} map={photo} roughness={0.5} />
      </mesh>
      {tuners.map(({ x, side }, i) => {
        const w = geo.hw(x);
        return (
          <group key={i} position={[x, side * w, -0.75]}>
            <mesh position={[0, side * 1.0, 0]} rotation={[0, 0, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 2.0, 12]} />
              {chrome}
            </mesh>
            <mesh position={[0, side * 2.2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 1.7]}>
              <cylinderGeometry args={[0.85, 0.85, 0.45, 6]} />
              {chrome}
            </mesh>
            <mesh position={[0, -side * 1.0, -0.85]}>
              <boxGeometry args={[1.9, 1.4, 0.5]} />
              {chrome}
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Neck({ spec, fretboardUrl }: { spec: GuitarSpec; fretboardUrl?: string }) {
  const uploaded = useTex(fretboardUrl);
  const builtIn = useTex(fretboardUrl ? undefined : spec.fretboardPhoto?.url);
  const photo = uploaded ?? builtIn;
  const photoFret = uploaded ? UPLOAD_PHOTO_FRET : (spec.fretboardPhoto?.toFret ?? UPLOAD_PHOTO_FRET);
  const end = fretboardEndX(spec);
  const split = fretX(spec, Math.min(photoFret, spec.fretCount));
  const segA = useMemo(() => fretboardSegment(spec, 0, split), [spec, split]);
  const segB = useMemo(() => (split > end + 0.01 ? fretboardSegment(spec, split, end) : null), [spec, split, end]);
  const ebony = useMemo(() => woodTexture(spec.colors.fretboard, '#141110', 3, { lines: 70, wobble: 3 }), [spec.colors.fretboard]);
  const bodyX = bodyStartX(spec);

  const inlays: { x: number; y: number }[] = [];
  const covered = (n: number) => !!photo && n <= photoFret;
  for (const n of spec.inlays) if (n <= spec.fretCount && !covered(n)) inlays.push({ x: (fretX(spec, n - 1) + fretX(spec, n)) / 2, y: 0 });
  for (const n of spec.doubleInlays) {
    if (covered(n)) continue;
    const x = (fretX(spec, n - 1) + fretX(spec, n)) / 2;
    const off = widthAt(spec, x) * 0.24;
    inlays.push({ x, y: off }, { x, y: -off });
  }

  return (
    <group>
      <mesh position={[bodyX / 2 + 0.2, 0, FRETBOARD_TOP - 0.6]} rotation={[0, 0, Math.PI / 2]} scale={[1.65, 1, 1]} castShadow>
        <cylinderGeometry args={[1.35, 1.35, -bodyX + 0.4, 24, 1, false, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color={spec.colors.neck} roughness={rough(spec, 0.55, 0.2)} />
      </mesh>
      <mesh geometry={segA} castShadow>
        <meshStandardMaterial map={photo ?? ebony} roughness={0.7} />
      </mesh>
      {segB && (
        <mesh geometry={segB} castShadow>
          <meshStandardMaterial map={ebony} roughness={0.7} />
        </mesh>
      )}
      <mesh position={[0.15, 0, FRETBOARD_TOP + 0.18]}>
        <boxGeometry args={[0.45, spec.nutWidth + 0.1, 0.4]} />
        <meshStandardMaterial color="#f5efe1" roughness={0.3} />
      </mesh>
      {Array.from({ length: spec.fretCount }, (_, i) => {
        const x = fretX(spec, i + 1);
        return (
          <mesh key={i} position={[x, 0, FRETBOARD_TOP + 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.065, 0.065, widthAt(spec, x) - 0.15, 8]} />
            <meshStandardMaterial color="#d8d8d8" metalness={0.9} roughness={0.25} />
          </mesh>
        );
      })}
      {inlays.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, FRETBOARD_TOP + 0.003]}>
          {spec.inlayShape === 'diamond' ? <circleGeometry args={[0.42, 4]} /> : spec.inlayShape === 'block' ? <planeGeometry args={[1.4, 3.2]} /> : <circleGeometry args={[0.3, 32]} />}
          <meshStandardMaterial color={spec.colors.inlay} roughness={0.2} metalness={0.1} />
        </mesh>
      ))}
      <Headstock spec={spec} shape={spec.headstock} />
    </group>
  );
}

const UP = new THREE.Vector3(0, 1, 0);

function Strings({ spec, notes, beatId }: { spec: GuitarSpec; notes: FretNote[]; beatId: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const struck = useRef<number[]>(Array(6).fill(-10));
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    for (const n of notes) if (n.state === 'now') struck.current[n.string - 1] = clock.elapsedTime;
  }, [beatId, notes, clock]);

  const strings = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const s = i + 1;
        const a = new THREE.Vector3(0.1, stringY(spec, s, 0, false), stringZ(spec, 0));
        const b = new THREE.Vector3(-spec.scaleLength, stringY(spec, s, -spec.scaleLength, false), stringZ(spec, -spec.scaleLength));
        const dir = b.clone().sub(a);
        return {
          mid: a.clone().add(b).multiplyScalar(0.5),
          len: dir.length(),
          quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
          radius: 0.018 + i * 0.012,
          wound: s >= 3,
        };
      }),
    [spec],
  );

  useFrame(({ clock: c }) => {
    strings.forEach((st, i) => {
      const m = refs.current[i];
      if (!m) return;
      const age = c.elapsedTime - struck.current[i];
      const amp = age < 1.2 ? Math.exp(-age * 4) * 0.09 : 0;
      m.position.set(st.mid.x, st.mid.y + Math.sin(c.elapsedTime * 90) * amp, st.mid.z);
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity = age < 1.2 ? Math.exp(-age * 3) * 1.6 : 0;
    });
  });

  return (
    <>
      {strings.map((st, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={st.mid} quaternion={st.quat}>
          <cylinderGeometry args={[st.radius, st.radius, st.len, 8]} />
          <meshStandardMaterial color={st.wound ? '#c9a46a' : '#e8e8e8'} metalness={0.95} roughness={0.25} emissive={STRING_COLORS[i]} emissiveIntensity={0} />
        </mesh>
      ))}
    </>
  );
}

function Bubble({ spec, note, beatId }: { spec: GuitarSpec; note: FretNote; beatId: number }) {
  const group = useRef<THREE.Group>(null);
  const born = useRef(0);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    born.current = clock.elapsedTime;
  }, [beatId, clock]);
  const x = noteX(spec, note.fret);
  const y = stringY(spec, note.string, x, false);
  const z = stringZ(spec, x) + 0.25;
  const color = STRING_COLORS[note.string - 1];
  const now = note.state === 'now';

  useFrame(({ clock: c }) => {
    if (!group.current) return;
    const age = c.elapsedTime - born.current;
    const pop = now ? Math.min(1, age * 8) : 1;
    const pulse = now ? 1 + Math.sin(c.elapsedTime * 8) * 0.05 : 1;
    group.current.scale.setScalar((0.6 + 0.4 * pop) * pulse);
  });

  return (
    <group ref={group} position={[x, y, z]}>
      {now ? (
        <>
          <mesh>
            <circleGeometry args={[0.95, 48]} />
            <meshBasicMaterial color={color} transparent opacity={0.95} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
            <ringGeometry args={[1.0, 1.35, 48]} />
            <meshBasicMaterial color={color} transparent opacity={0.35} toneMapped={false} />
          </mesh>
        </>
      ) : (
        <mesh>
          <ringGeometry args={[0.78, 0.95, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      )}
      <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className={now ? 'bubble-label now' : 'bubble-label next'}>{note.fret}</div>
      </Html>
    </group>
  );
}

function GlbBody({ spec }: { spec: GuitarSpec }) {
  const m = spec.bodyModel!;
  const gltf = useGLTF(m.url);
  return <primitive object={gltf.scene} scale={m.scale} position={m.position} rotation={m.rotation} />;
}

function CameraRig({ spec, notes, follow, sign }: { spec: GuitarSpec; notes: FretNote[]; follow: boolean; sign: number }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const focus = useRef(fretX(spec, 5));
  useEffect(() => {
    const now = notes.filter((n) => n.state === 'now');
    if (now.length) {
      const xs = now.map((n) => noteX(spec, n.fret));
      focus.current = Math.min(fretX(spec, 4), Math.max(fretX(spec, 15), (Math.min(...xs) + Math.max(...xs)) / 2));
    }
  }, [notes, spec]);
  useFrame((_, dt) => {
    if (!follow || !controls) return;
    const dx = (sign * focus.current - controls.target.x) * Math.min(1, dt * 2.2);
    if (Math.abs(dx) < 1e-4) return;
    controls.target.x += dx;
    camera.position.x += dx;
    controls.update();
  });
  return null;
}

export function Guitar3D({ spec, notes, beatId, flip, follow, textures }: Props) {
  // The tab view is the audience view turned 180° in-plane (not mirrored), so logos and photos stay readable.
  const sign = flip ? -1 : 1;
  const startX = sign * fretX(spec, 5);
  return (
    <Canvas key={flip ? 'tab' : 'audience'} shadows dpr={[1, 2]} camera={{ position: [startX - sign * 3, -17, 22], fov: 34, near: 0.5, far: 500 }} gl={{ antialias: true }}>
      <color attach="background" args={['#12151c']} />
      <fog attach="fog" args={['#12151c', 90, 220]} />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#e6ecff', '#2a1d12', 0.8]} />
      <directionalLight position={[10, -20, 40]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-30, 25, 12]} intensity={0.9} color="#cfe0ff" />
      <pointLight position={[startX, 8, 14]} intensity={70} distance={60} color="#ffe3c2" />
      <group rotation={[0, 0, flip ? Math.PI : 0]}>
        {spec.bodyModel ? (
          <Suspense fallback={null}>
            <GlbBody spec={spec} />
          </Suspense>
        ) : (
          <Body spec={spec} topUrl={textures.top} />
        )}
        <Neck spec={spec} fretboardUrl={textures.fretboard} />
        <Strings spec={spec} notes={notes} beatId={beatId} />
        {notes.map((n) => (
          <Bubble key={`${n.state}-${n.string}-${n.fret}`} spec={spec} note={n} beatId={beatId} />
        ))}
      </group>
      <ContactShadows position={[0, 0, -spec.bodyDepth - 0.6]} rotation={[Math.PI / 2, 0, 0]} opacity={0.5} scale={160} blur={2.5} far={20} />
      <OrbitControls makeDefault target={[startX, 0, 0]} enableDamping minDistance={12} maxDistance={140} />
      <CameraRig spec={spec} notes={notes} follow={follow} sign={sign} />
    </Canvas>
  );
}
