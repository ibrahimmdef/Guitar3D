import { useCallback, useEffect, useRef, useState } from 'react';
import type { BeatProgress, CameraMode, FretNote, GuitarProfile, GuitarView } from '@guitar3d/shared';
import { api as server } from '../../api';
import { Guitar3D, type GuitarTextures } from '../../fretboard/Guitar3D';
import { DEFAULT_SPEC, mergeSpec, type GuitarSpec } from '../../fretboard/guitarSpec';

/**
 * Adapter between the player screen and the 3D renderer.
 *
 * The screen always speaks the new renderer API (workstream A):
 *   <Guitar3D profile notes beatId beatProgress view cameraMode onCameraModeChange onFretClick className />
 * Until that lands, this maps it onto the legacy `Guitar3D` (spec/flip/follow/textures) and loads
 * the legacy spec + textures itself. When merging A, replace the body of `StageGuitar` with:
 *
 *   const [profile] = useState(() => props.profile ?? null) // or loadDefaultProfile()
 *   return <Guitar3D {...props} profile={profile} />
 *
 * and delete `useLegacyGuitar`.
 */
export interface StageGuitarProps {
  profile?: GuitarProfile | null;
  notes: FretNote[];
  beatId: number;
  beatProgress: BeatProgress;
  view: GuitarView;
  cameraMode: CameraMode;
  onCameraModeChange?: (m: CameraMode) => void;
  onFretClick?: (string: number, fret: number) => void;
  /**
   * Called once the guitar is fully drawn (geometry and textures). The player keeps a single
   * loading state over the stage until then. Proposed addition to A's Guitar3D API; until A
   * supports it the adapter approximates it by preloading the textures before mounting.
   */
  onReady?: () => void;
  className?: string;
}

const preload = (url: string) =>
  new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });

function useLegacyGuitar() {
  const [spec, setSpec] = useState<GuitarSpec>(DEFAULT_SPEC);
  const [textures, setTextures] = useState<GuitarTextures>({});
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    server
      .guitarAssets()
      .then((a) => {
        setTextures({ fretboard: a.textures.fretboard ?? undefined, top: a.textures.top ?? undefined });
        setSpec((s) => (a.bodyModel && !s.bodyModel ? { ...s, bodyModel: { url: a.bodyModel, scale: 1, position: [-60, 0, -5], rotation: [0, 0, 0] } } : s));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const specP = server.guitarSpec().then((p) => setSpec((s) => mergeSpec(s, p))).catch(() => {});
    const headP = fetch('/guitar/headstock.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => h && setSpec((s) => (s.headstock ? s : { ...s, headstock: { texture: '/guitar/headstock.jpg', ...h } })))
      .catch(() => {});
    const assetsP = server
      .guitarAssets()
      .then((a) => Promise.all([a.textures.fretboard, a.textures.top].filter((u): u is string => !!u).map(preload)))
      .catch(() => {});
    refresh();
    // Mount the canvas only once spec and textures are in the browser cache, so the guitar
    // appears complete instead of popping in piece by piece.
    Promise.all([specP, headP, assetsP, preload('/guitar/headstock.jpg')]).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [refresh]);

  return { spec, textures, ready };
}

export function StageGuitar({ notes, beatId, view, cameraMode, onReady, className }: StageGuitarProps) {
  const { spec, textures, ready } = useLegacyGuitar();
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    if (!ready) return;
    // Give three.js a couple of frames to upload textures before revealing the stage.
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => (id = window.setTimeout(() => readyRef.current?.(), 150)))));
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(id);
    };
  }, [ready]);
  if (!ready) return <div className={className} />;
  // Legacy renderer only knows "follow on/off". Overview/neck reset the orbit camera by remounting.
  const follow = cameraMode === 'follow';
  const resetKey = cameraMode === 'overview' || cameraMode === 'neck' ? cameraMode : 'live';
  return (
    <div className={className} key={resetKey}>
      <Guitar3D spec={spec} notes={notes} beatId={beatId} flip={view === 'player'} follow={follow} textures={textures} />
    </div>
  );
}
