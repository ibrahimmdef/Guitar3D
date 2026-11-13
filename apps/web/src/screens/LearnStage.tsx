import type { ReactNode } from 'react';
import { Box } from 'lucide-react';
import type { CameraMode, FretNote } from '@guitar3d/shared';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Button, EmptyState } from '../ui/kit';
import { useSettings } from '../ui/settings';
import { StageGuitar } from './player/StageGuitar';

/**
 * The user's 3D guitar as a card on the learning screens (chords, scales, tuner, routines). View,
 * zoom and fret numbers follow the player settings.
 */
export function LearnStage({ notes, beatId, cameraMode = 'follow', label, children, onFretClick }: {
  notes: FretNote[];
  beatId: number;
  cameraMode?: CameraMode;
  label: string;
  children?: ReactNode;
  onFretClick?: (string: number, fret: number) => void;
}) {
  const [settings] = useSettings();
  return (
    <figure className="learn-stage" aria-label={label}>
      <ErrorBoundary
        fallback={(retry) => (
          <div className="learn-stage-fallback">
            <EmptyState compact tone="danger" icon={<Box size={20} />} title="3D gitar gösterilemedi" description="Tarayıcın WebGL'i desteklemiyor olabilir." action={<Button size="sm" onClick={retry}>Tekrar dene</Button>} />
          </div>
        )}
      >
        <StageGuitar
          className="learn-canvas"
          notes={notes}
          beatId={beatId}
          beatProgress={0}
          upcoming={undefined}
          zoom={settings.stageZoom}
          showFretNumbers={settings.showFretNumbers}
          view={settings.view}
          cameraMode={cameraMode}
          onFretClick={onFretClick}
        />
      </ErrorBoundary>
      {children && <div className="learn-stage-hud">{children}</div>}
    </figure>
  );
}
