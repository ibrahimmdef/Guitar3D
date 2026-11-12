import { useEffect, useState } from 'react';
import type { BeatProgress, CameraMode, FretNote, GuitarProfile, GuitarView } from '@guitar3d/shared';
import { Guitar3D } from '../../fretboard/Guitar3D';
import { loadDefaultProfile } from '../../fretboard/profile';

/** Thin adapter between the player screen and the 3D renderer: resolves the profile to show. */
export interface StageGuitarProps {
  /** Guitar to show; the built-in Veston is loaded when omitted. */
  profile?: GuitarProfile | null;
  notes: FretNote[];
  beatId: number;
  beatProgress: BeatProgress;
  view: GuitarView;
  cameraMode: CameraMode;
  onCameraModeChange?: (m: CameraMode) => void;
  onFretClick?: (string: number, fret: number) => void;
  /** Called once the guitar is fully drawn (geometry and textures). */
  onReady?: () => void;
  className?: string;
}

export function StageGuitar({ profile, ...rest }: StageGuitarProps) {
  const [fallback, setFallback] = useState<GuitarProfile | null>(null);
  useEffect(() => {
    if (profile) return;
    let alive = true;
    loadDefaultProfile().then((p) => alive && setFallback(p));
    return () => {
      alive = false;
    };
  }, [profile]);
  const active = profile ?? fallback;
  if (!active) return <div className={rest.className} />;
  return <Guitar3D {...rest} profile={active} />;
}
