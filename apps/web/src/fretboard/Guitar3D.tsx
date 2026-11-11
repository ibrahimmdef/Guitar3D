import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { FretNote } from '@guitar3d/shared';
import {
  bodyHalfWidth, bodyStartX, FRETBOARD_TOP, fretboardEndX, fretX, noteX, stringY, stringZ, widthAt,
  type GuitarSpec,
} from './guitarSpec';
import { imageTexture, woodTexture } from './textures';

export const STRING_COLORS = ['#ff5d73', '#ffa53b', '#ffe14d', '#41d69a', '#45b4ff', '#a97cff'];
export const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];
const PHOTO_FRET = 12;

export interface GuitarTextures {
  fretboard?: string;
  top?: string;
}

interface Props {
  spec: GuitarSpec;
  notes: FretNote[];
  beatId: number;
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

function Body({ spec, flip, topUrl }: { spec: GuitarSpec; flip: boolean; topUrl?: string }) {
  const photo = useTex(topUrl);
  const { geo, outline, minX, maxX } = useMemo(() => {
    const x0 = bodyStartX(spec);
    const pts: THREE.Vector2[] = [];
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const u = (spec.bodyLength * i) / N;
      pts.push(new THREE.Vector2(x0 - u, Math.max(0.01, bodyHalfWidth(spec, u))));
    }
    for (let i = N; i >= 0; i--) {
      const u = (spec.bodyLength * i) / N;
      pts.push(new THREE.Vector2(x0 - u, -Math.max(0.01, bodyHalfWidth(spec, u))));
    }
    const shape = new THREE.Shape(pts);
    const g = new THREE.ExtrudeGeometry(shape, { depth: spec.bodyDepth, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -spec.bodyDepth);
    const minX = x0 - spec.bodyLength, maxX = x0;
    const half = spec.lowerBout / 2;
    setUV(g, (x, y) => {
      const v = (x - minX) / (maxX - minX);
      const u = flip ? (y + half) / (2 * half) : (half - y) / (2 * half);
      return [u, v];
    });
    return { geo: g, outline: pts.map((p) => new THREE.Vector3(p.x, p.y, 0.42)), minX, maxX };
  }, [spec, flip]);

  const spruce = useMemo(() => {
    const t = woodTexture(spec.colors.top, '#9c7448', 7, { w: 512, h: 1024, lines: 160, wobble: 2 });
    t.rotation = Math.PI / 2;
    return t;
  }, [spec.colors.top]);

  const holeX = bodyStartX(spec) - spec.bodyLength * 0.24 - spec.soundholeRadius * 0.35;
  const bridgeX = -spec.scaleLength;
  const lineGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints(outline), [outline]);
  void minX;
  void maxX;

  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial attach="material-0" map={photo ?? spruce} roughness={0.35} metalness={0.02} />
        <meshStandardMaterial attach="material-1" color={spec.colors.sides} roughness={0.4} />
      </mesh>
      <lineLoop geometry={lineGeo}>
        <lineBasicMaterial color={spec.colors.binding} />
      </lineLoop>
      {!photo && (
        <>
          <mesh position={[holeX, 0, 0.43]}>
            <ringGeometry args={[spec.soundholeRadius + 0.4, spec.soundholeRadius + 1.6, 64]} />
            <meshStandardMaterial color={spec.colors.rosette} roughness={0.6} />
          </mesh>
          <mesh position={[holeX, 0, 0.42]}>
            <circleGeometry args={[spec.soundholeRadius, 64]} />
            <meshBasicMaterial color="#0b0705" />
          </mesh>
        </>
      )}
      <mesh position={[bridgeX - 1.2, 0, 0.75]} castShadow>
        <boxGeometry args={[3.2, 16, 0.7]} />
        <meshStandardMaterial color="#1c120c" roughness={0.5} />
      </mesh>
      <mesh position={[bridgeX, 0, 1.25]}>
        <boxGeometry args={[0.3, 7.6, 0.5]} />
        <meshStandardMaterial color="#f3ecdc" />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[bridgeX - 2, stringY(spec, i + 1, -spec.scaleLength, flip), 1.15]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.2, 16]} />
          <meshStandardMaterial color="#f3ecdc" />
        </mesh>
      ))}
    </group>
  );
}

function fretboardSegment(spec: GuitarSpec, xa: number, xb: number, flip: boolean) {
  const shape = new THREE.Shape([
    new THREE.Vector2(xa, widthAt(spec, xa) / 2),
    new THREE.Vector2(xb, widthAt(spec, xb) / 2),
    new THREE.Vector2(xb, -widthAt(spec, xb) / 2),
    new THREE.Vector2(xa, -widthAt(spec, xa) / 2),
  ]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
  g.translate(0, 0, FRETBOARD_TOP - 0.6);
  setUV(g, (x, y) => {
    const u = (x - xa) / (xb - xa);
    const v = 0.5 + (y / widthAt(spec, x)) * (flip ? -1 : 1);
    return [u, v];
  });
  return g;
}

function Neck({ spec, flip, fretboardUrl }: { spec: GuitarSpec; flip: boolean; fretboardUrl?: string }) {
  const photo = useTex(fretboardUrl);
  const end = fretboardEndX(spec);
  const split = fretX(spec, PHOTO_FRET);
  const segA = useMemo(() => fretboardSegment(spec, 0, split, flip), [spec, split, flip]);
  const segB = useMemo(() => fretboardSegment(spec, split, end, flip), [spec, split, end, flip]);
  const rosewood = useMemo(() => woodTexture(spec.colors.fretboard, '#120a06', 3, { lines: 70, wobble: 3 }), [spec.colors.fretboard]);
  const neckWood = useMemo(() => woodTexture(spec.colors.neck, '#4a2a16', 11, { lines: 40 }), [spec.colors.neck]);
  const bodyX = bodyStartX(spec);

  const inlays: { x: number; y: number }[] = [];
  for (const n of spec.inlays) if (n <= spec.fretCount && !(photo && n <= PHOTO_FRET)) inlays.push({ x: (fretX(spec, n - 1) + fretX(spec, n)) / 2, y: 0 });
  for (const n of spec.doubleInlays) {
    if (photo && n <= PHOTO_FRET) continue;
    const x = (fretX(spec, n - 1) + fretX(spec, n)) / 2;
    const off = widthAt(spec, x) * 0.24;
    inlays.push({ x, y: off }, { x, y: -off });
  }

  const headX = 9.5;
  return (
    <group>
      <mesh position={[bodyX / 2 + 0.2, 0, FRETBOARD_TOP - 0.6]} rotation={[0, 0, Math.PI / 2]} scale={[1.65, 1, 1]} castShadow>
        <cylinderGeometry args={[1.35, 1.35, -bodyX + 0.4, 24, 1, false, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial map={neckWood} roughness={0.45} />
      </mesh>
      <mesh geometry={segA} castShadow>
        <meshStandardMaterial map={photo ?? rosewood} roughness={0.75} />
      </mesh>
      <mesh geometry={segB} castShadow>
        <meshStandardMaterial map={rosewood} roughness={0.75} />
      </mesh>
      <mesh position={[0.15, 0, FRETBOARD_TOP + 0.18]}>
        <boxGeometry args={[0.45, spec.nutWidth + 0.1, 0.4]} />
        <meshStandardMaterial color="#f5efe1" roughness={0.3} />
      </mesh>
      {Array.from({ length: spec.fretCount }, (_, i) => {
        const x = fretX(spec, i + 1);
        return (
          <mesh key={i} position={[x, 0, FRETBOARD_TOP + 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, widthAt(spec, x), 8]} />
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
      <group position={[0.4, 0, FRETBOARD_TOP - 0.5]} rotation={[0, 0.24, 0]}>
        <mesh position={[headX, 0, 0]} castShadow>
          <boxGeometry args={[19, 8.6, 1.4]} />
          <meshStandardMaterial color="#1a100a" roughness={0.3} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const side = i < 3 ? 1 : -1;
          const x = 4 + (i % 3) * 4.6;
          return (
            <group key={i}>
              <mesh position={[x, side * 2.6, 0.9]}>
                <cylinderGeometry args={[0.45, 0.45, 0.6, 16]} />
                <meshStandardMaterial color="#c9c9c9" metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh position={[x, side * 5.3, -0.2]} rotation={[0, 0, 0]}>
                <boxGeometry args={[1.1, 2.0, 0.5]} />
                <meshStandardMaterial color="#c9c9c9" metalness={0.9} roughness={0.25} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

const UP = new THREE.Vector3(0, 1, 0);

function Strings({ spec, flip, notes, beatId }: { spec: GuitarSpec; flip: boolean; notes: FretNote[]; beatId: number }) {
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
        const a = new THREE.Vector3(0.1, stringY(spec, s, 0, flip), stringZ(spec, 0));
        const b = new THREE.Vector3(-spec.scaleLength, stringY(spec, s, -spec.scaleLength, flip), stringZ(spec, -spec.scaleLength));
        const dir = b.clone().sub(a);
        return {
          mid: a.clone().add(b).multiplyScalar(0.5),
          len: dir.length(),
          quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
          radius: 0.018 + i * 0.012,
          wound: s >= 3,
        };
      }),
    [spec, flip],
  );

  useFrame(({ clock: c }) => {
    strings.forEach((st, i) => {
      const m = refs.current[i];
      if (!m) return;
      const age = c.elapsedTime - struck.current[i];
      const amp = age < 1.2 ? Math.exp(-age * 4) * 0.09 : 0;
      m.position.set(st.mid.x, st.mid.y + Math.sin(c.elapsedTime * 90) * amp, st.mid.z);
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = age < 1.2 ? Math.exp(-age * 3) * 1.6 : 0;
    });
  });

  return (
    <>
      {strings.map((st, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={st.mid} quaternion={st.quat}>
          <cylinderGeometry args={[st.radius, st.radius, st.len, 8]} />
          <meshStandardMaterial
            color={st.wound ? '#c9a46a' : '#e8e8e8'}
            metalness={0.95}
            roughness={0.25}
            emissive={STRING_COLORS[i]}
            emissiveIntensity={0}
          />
        </mesh>
      ))}
    </>
  );
}

function Bubble({ spec, flip, note, beatId }: { spec: GuitarSpec; flip: boolean; note: FretNote; beatId: number }) {
  const group = useRef<THREE.Group>(null);
  const born = useRef(0);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    born.current = clock.elapsedTime;
  }, [beatId, clock]);
  const x = noteX(spec, note.fret);
  const y = stringY(spec, note.string, x, flip);
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
          <meshBasicMaterial color={color} transparent opacity={0.75} toneMapped={false} />
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

function CameraRig({ spec, notes, follow }: { spec: GuitarSpec; notes: FretNote[]; follow: boolean }) {
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
    const dx = (focus.current - controls.target.x) * Math.min(1, dt * 2.2);
    if (Math.abs(dx) < 1e-4) return;
    controls.target.x += dx;
    camera.position.x += dx;
    controls.update();
  });
  return null;
}

export function Guitar3D({ spec, notes, beatId, flip, follow, textures }: Props) {
  const startX = fretX(spec, 5);
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [startX + 3, -17, 22], fov: 34, near: 0.5, far: 500 }} gl={{ antialias: true }}>
      <color attach="background" args={['#0d0f14']} />
      <fog attach="fog" args={['#0d0f14', 90, 220]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#dfe8ff', '#20140c', 0.6]} />
      <directionalLight position={[10, -20, 40]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
      <pointLight position={[startX, 8, 14]} intensity={60} distance={60} color="#ffe3c2" />
      <group>
        {spec.bodyModel ? (
          <Suspense fallback={null}>
            <GlbBody spec={spec} />
          </Suspense>
        ) : (
          <Body spec={spec} flip={flip} topUrl={textures.top} />
        )}
        <Neck spec={spec} flip={flip} fretboardUrl={textures.fretboard} />
        <Strings spec={spec} flip={flip} notes={notes} beatId={beatId} />
        {notes.map((n) => (
          <Bubble key={`${n.state}-${n.string}-${n.fret}`} spec={spec} flip={flip} note={n} beatId={beatId} />
        ))}
      </group>
      <ContactShadows position={[0, 0, -spec.bodyDepth - 0.6]} rotation={[Math.PI / 2, 0, 0]} opacity={0.5} scale={160} blur={2.5} far={20} />
      <OrbitControls makeDefault target={[startX, 0, 0]} enableDamping minDistance={12} maxDistance={140} />
      <CameraRig spec={spec} notes={notes} follow={follow} />
    </Canvas>
  );
}
