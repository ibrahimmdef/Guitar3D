import { ArrowLeft, Crosshair, Hand, Keyboard, Maximize2, Ruler, Share2 } from 'lucide-react';
import type { CameraMode, GuitarView } from '@guitar3d/shared';
import { IconButton, SegmentedControl, type SegmentOption } from '../../ui/kit';

export const CAMERA_MODES: SegmentOption<CameraMode>[] = [
  { value: 'follow', label: 'Follow', hint: 'Follow: the camera tracks the playing position', icon: <Crosshair size={16} />, shortcut: '1', iconOnly: true },
  { value: 'overview', label: 'Overview', hint: 'Overview: the whole guitar', icon: <Maximize2 size={16} />, shortcut: '2', iconOnly: true },
  { value: 'neck', label: 'Neck', hint: 'Neck: close to the fretboard', icon: <Ruler size={16} />, shortcut: '3', iconOnly: true },
  { value: 'free', label: 'Free', hint: 'Free: rotate with the mouse', icon: <Hand size={16} />, shortcut: '4', iconOnly: true },
];

const VIEWS: SegmentOption<GuitarView>[] = [
  { value: 'player', label: 'Player', hint: 'Player view: same direction as the tab', shortcut: 'V' },
  { value: 'audience', label: 'Audience', hint: 'Audience view: from the front', shortcut: 'V' },
];

interface Props {
  title: string;
  subtitle: string;
  view: GuitarView;
  onView: (v: GuitarView) => void;
  cameraMode: CameraMode;
  onCameraMode: (m: CameraMode) => void;
  onShowShortcuts: () => void;
  onBack: () => void;
  onShare?: () => void;
  /** Playable tracks of a multi-track file; a picker shows when there is more than one. */
  tracks?: { index: number; name: string }[];
  trackIndex?: number;
  onTrack?: (index: number) => void;
}

export function PlayerTopBar(p: Props) {
  return (
    <header className="player-top">
      <div className="pt-left">
        <IconButton label="Back to library" icon={<ArrowLeft size={18} />} onClick={p.onBack} />
        <div className="pt-song">
          <h1 className="pt-title" title={p.title}>{p.title}</h1>
          {p.subtitle && <p className="pt-sub">{p.subtitle}</p>}
        </div>
        {p.tracks && p.tracks.length > 1 && p.onTrack && (
          <select className="select pt-track" aria-label="Track" value={p.trackIndex} onChange={(e) => p.onTrack?.(Number(e.target.value))}>
            {p.tracks.map((t) => <option key={t.index} value={t.index}>{t.name || `Track ${t.index + 1}`}</option>)}
          </select>
        )}
      </div>
      <div className="pt-center">
        <SegmentedControl aria-label="View" value={p.view} onChange={p.onView} options={VIEWS} className="pt-view" />
        <SegmentedControl aria-label="Camera" value={p.cameraMode} onChange={p.onCameraMode} options={CAMERA_MODES} />
      </div>
      <div className="pt-right">
        {p.onShare && <IconButton label="Copy share link" icon={<Share2 size={18} />} onClick={p.onShare} />}
        <IconButton label="Keyboard shortcuts" shortcut="?" icon={<Keyboard size={18} />} onClick={p.onShowShortcuts} />
      </div>
    </header>
  );
}
