import { useCallback, useEffect, useState } from 'react';
import { Maximize, Minimize, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton, SegmentedControl } from '../../ui/kit';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

/** Fullscreen state of an element, with a toggle. */
export function useFullscreen(target: () => HTMLElement | null) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else target()?.requestFullscreen?.().catch(() => {});
  }, [target]);
  const supported = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  return { on, toggle, supported };
}

interface Props {
  zoom: number;
  onZoom: (z: number) => void;
  focus: 'neck' | 'tab';
  onFocus: (f: 'neck' | 'tab') => void;
  fullscreen: boolean;
  fullscreenSupported: boolean;
  onFullscreen: () => void;
}

/** Floating controls in the stage corner: neck/tab focus, zoom and fullscreen. */
export function StageTools(p: Props) {
  return (
    <div className="stage-tools" role="toolbar" aria-label="Sahne">
      <SegmentedControl<'neck' | 'tab'>
        aria-label="Odak"
        size="sm"
        value={p.focus}
        onChange={p.onFocus}
        options={[
          { value: 'neck', label: 'Sap', hint: 'Odak: gitar sapı büyük', shortcut: 'N' },
          { value: 'tab', label: 'Tab', hint: 'Odak: tab şeridi büyük', shortcut: 'N' },
        ]}
      />
      <span className="stage-tools-sep" aria-hidden />
      <IconButton label="Uzaklaştır" shortcut="Shift+-" size="sm" icon={<ZoomOut size={16} />} onClick={() => p.onZoom(clampZoom(p.zoom - 0.15))} disabled={p.zoom <= ZOOM_MIN} />
      <button type="button" className="stage-zoom num" onClick={() => p.onZoom(1)} title="Yakınlığı sıfırla" aria-label={`Yakınlık %${Math.round(p.zoom * 100)}, sıfırla`}>
        %{Math.round(p.zoom * 100)}
      </button>
      <IconButton label="Yakınlaştır" shortcut="Shift++" size="sm" icon={<ZoomIn size={16} />} onClick={() => p.onZoom(clampZoom(p.zoom + 0.15))} disabled={p.zoom >= ZOOM_MAX} />
      {p.fullscreenSupported && (
        <IconButton
          label={p.fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
          shortcut="F"
          size="sm"
          icon={p.fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          pressed={p.fullscreen}
          onClick={p.onFullscreen}
        />
      )}
    </div>
  );
}

/** Big 4-3-2-1 shown while alphaTab plays its count-in bar. */
export function CountIn({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <div className="count-in" role="status" aria-live="assertive">
      <span key={value} className="count-in-num num">{value}</span>
    </div>
  );
}
