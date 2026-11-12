import { ArrowLeft, Crosshair, GraduationCap, Hand, Keyboard, Maximize2, Ruler } from 'lucide-react';
import type { CameraMode, GuitarView } from '@guitar3d/shared';
import { Button, IconButton, SegmentedControl, type SegmentOption } from '../../ui/kit';

export const CAMERA_MODES: SegmentOption<CameraMode>[] = [
  { value: 'follow', label: 'Takip', hint: 'Takip: kamera çalınan pozisyonu izler', icon: <Crosshair size={16} />, shortcut: '1', iconOnly: true },
  { value: 'overview', label: 'Genel', hint: 'Genel: tüm gitar', icon: <Maximize2 size={16} />, shortcut: '2', iconOnly: true },
  { value: 'neck', label: 'Sap', hint: 'Sap: klavyeye yakın', icon: <Ruler size={16} />, shortcut: '3', iconOnly: true },
  { value: 'free', label: 'Serbest', hint: 'Serbest: fareyle döndür', icon: <Hand size={16} />, shortcut: '4', iconOnly: true },
];

const VIEWS: SegmentOption<GuitarView>[] = [
  { value: 'player', label: 'Oyuncu', hint: 'Oyuncu görünümü: tab yönünde', shortcut: 'V' },
  { value: 'audience', label: 'Seyirci', hint: 'Seyirci görünümü: karşıdan', shortcut: 'V' },
];

interface Props {
  title: string;
  subtitle: string;
  view: GuitarView;
  onView: (v: GuitarView) => void;
  cameraMode: CameraMode;
  onCameraMode: (m: CameraMode) => void;
  practiceOpen: boolean;
  onTogglePractice: () => void;
  onShowShortcuts: () => void;
  onBack: () => void;
}

export function PlayerTopBar(p: Props) {
  return (
    <header className="player-top">
      <div className="pt-left">
        <IconButton label="Kütüphaneye dön" icon={<ArrowLeft size={18} />} onClick={p.onBack} />
        <div className="pt-song">
          <h1 className="pt-title" title={p.title}>{p.title}</h1>
          {p.subtitle && <p className="pt-sub">{p.subtitle}</p>}
        </div>
      </div>
      <div className="pt-center">
        <SegmentedControl aria-label="Görünüm" value={p.view} onChange={p.onView} options={VIEWS} className="pt-view" />
        <SegmentedControl aria-label="Kamera" value={p.cameraMode} onChange={p.onCameraMode} options={CAMERA_MODES} />
      </div>
      <div className="pt-right">
        <IconButton label="Klavye kısayolları" shortcut="?" icon={<Keyboard size={18} />} onClick={p.onShowShortcuts} className="pt-hide-sm" />
        <Button
          variant="ghost"
          icon={<GraduationCap size={17} />}
          pressed={p.practiceOpen}
          onClick={p.onTogglePractice}
          aria-keyshortcuts="P"
          aria-label="Pratik paneli"
          title="Pratik paneli (P)"
        >
          <span className="pt-hide-sm">Pratik</span>
        </Button>
      </div>
    </header>
  );
}
