import { useCallback, useEffect, useState } from 'react';
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
  className?: string;
}

function useLegacyGuitar() {
  const [spec, setSpec] = useState<GuitarSpec>(DEFAULT_SPEC);
  const [textures, setTextures] = useState<GuitarTextures>({});

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
    server.guitarSpec().then((p) => setSpec((s) => mergeSpec(s, p))).catch(() => {});
    fetch('/guitar/headstock.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => h && setSpec((s) => (s.headstock ? s : { ...s, headstock: { texture: '/guitar/headstock.jpg', ...h } })))
      .catch(() => {});
    refresh();
  }, [refresh]);

  return { spec, textures };
}

export function StageGuitar({ notes, beatId, view, cameraMode, className }: StageGuitarProps) {
  const { spec, textures } = useLegacyGuitar();
  // Legacy renderer only knows "follow on/off". Overview/neck reset the orbit camera by remounting.
  const follow = cameraMode === 'follow';
  const resetKey = cameraMode === 'overview' || cameraMode === 'neck' ? cameraMode : 'live';
  return (
    <div className={className} key={resetKey}>
      <Guitar3D spec={spec} notes={notes} beatId={beatId} flip={view === 'player'} follow={follow} textures={textures} />
    </div>
  );
}
