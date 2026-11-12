import { Metronome, PanelBottom, Pause, Play, Repeat, SkipBack, Timer, Volume2, VolumeX, X } from 'lucide-react';
import { Button, IconButton, Popover, SegmentedControl, Slider, Toggle, Tooltip } from '../../ui/kit';
import { Scrubber } from './Scrubber';

export const SPEED_PRESETS = [0.5, 0.75, 0.9, 1] as const;

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const pct = (v: number) => `%${Math.round(v * 100)}`;

export interface TransportProps {
  ready: boolean;
  hasScore: boolean;
  playing: boolean;
  timeMs: number;
  endMs: number;
  tick: number;
  endTick: number;
  barTicks: number[] | null;
  loopTicks: [number, number] | null;
  currentBar: number;
  barCount: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (tick: number) => void;
  onStepBar: (delta: number) => void;

  speed: number;
  onSpeed: (v: number) => void;
  metronome: boolean;
  onMetronome: (v: boolean) => void;
  metroVol: number;
  onMetroVol: (v: number) => void;
  countIn: boolean;
  onCountIn: (v: boolean) => void;
  guitarVol: number;
  onGuitarVol: (v: number) => void;
  muted: boolean;
  onMuted: (v: boolean) => void;

  loop: [number, number] | null;
  abPending: number | null;
  onLoopAB: () => void;
  onClearLoop: () => void;

  showTab: boolean;
  onToggleTab: () => void;
}

export function Transport(p: TransportProps) {
  const speedPreset = SPEED_PRESETS.find((v) => Math.abs(v - p.speed) < 0.001);
  const loopLabel = p.loop
    ? p.loop[0] === p.loop[1] ? `Ölçü ${p.loop[0] + 1}` : `${p.loop[0] + 1}–${p.loop[1] + 1}`
    : p.abPending != null ? `A: ${p.abPending + 1} · B?` : 'A–B';

  return (
    <div className="transport" role="toolbar" aria-label="Çalma kontrolleri">
      <div className="tp-group tp-play">
        <IconButton label="Başa dön" shortcut="Home" icon={<SkipBack size={18} />} onClick={p.onStop} disabled={!p.hasScore} />
        <Tooltip content={p.playing ? 'Duraklat' : 'Çal'} shortcut="Space">
          <button
            type="button"
            className="play-btn"
            aria-label={p.playing ? 'Duraklat' : 'Çal'}
            aria-keyshortcuts="Space"
            disabled={!p.ready || !p.hasScore}
            onClick={p.onPlayPause}
          >
            {p.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="play-ic" />}
          </button>
        </Tooltip>
      </div>

      <div className="tp-group tp-position">
        <span className="tp-time num" aria-hidden>{fmtTime(p.timeMs)}</span>
        <Scrubber
          tick={p.tick}
          endTick={p.endTick}
          barTicks={p.barTicks}
          loopTicks={p.loopTicks}
          currentBar={p.currentBar}
          barCount={p.barCount}
          disabled={!p.hasScore}
          onSeek={p.onSeek}
          onStepBar={p.onStepBar}
          valueText={`Ölçü ${p.currentBar + 1} / ${p.barCount}, ${fmtTime(p.timeMs)}`}
        />
        <span className="tp-time num subtle" aria-hidden>{fmtTime(p.endMs)}</span>
      </div>

      <div className="tp-group tp-tools">
        <Popover
          label="Hız"
          trigger={
            <Tooltip content="Hız" shortcut="- / +">
                <button type="button" className={`btn btn-ghost btn-md tp-speed${p.speed !== 1 ? ' is-changed' : ''}`} aria-label={`Hız ${pct(p.speed)}`}>
                  <span className="num">{pct(p.speed)}</span>
                </button>
            </Tooltip>
          }
        >
          <div className="pop-stack">
            <div className="pop-title">Çalma hızı</div>
            <SegmentedControl
              aria-label="Hız ön ayarları"
              size="sm"
              value={speedPreset ? String(speedPreset) : ''}
              onChange={(v) => p.onSpeed(Number(v))}
              options={SPEED_PRESETS.map((v) => ({ value: String(v), label: pct(v) }))}
            />
            <Slider label="Hız" min={0.25} max={1.5} step={0.05} value={p.speed} onChange={p.onSpeed} format={pct} />
          </div>
        </Popover>

        <span className="tp-sep" aria-hidden />

        <IconButton
          label={p.metronome ? 'Metronomu kapat' : 'Metronomu aç'}
          shortcut="M"
          icon={<Metronome size={18} />}
          pressed={p.metronome}
          onClick={() => p.onMetronome(!p.metronome)}
        />
        <IconButton
          label={p.countIn ? 'Sayarak başlama: açık' : 'Sayarak başlama: kapalı'}
          icon={<Timer size={18} />}
          pressed={p.countIn}
          onClick={() => p.onCountIn(!p.countIn)}
          className="tp-hide-sm"
        />
        <Popover
          label="Ses"
          trigger={
            <Tooltip content="Ses">
                <button type="button" className={`btn btn-ghost btn-md icon-btn${p.muted ? ' is-pressed' : ''}`} aria-label={p.muted ? 'Ses: gitar kapalı' : 'Ses'}>
                  {p.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
            </Tooltip>
          }
        >
          <div className="pop-stack">
            <div className="pop-title">Ses</div>
            <Slider label="Gitar" min={0} max={1} step={0.05} value={p.muted ? 0 : p.guitarVol} onChange={(v) => { p.onGuitarVol(v); p.onMuted(v === 0); }} format={(v) => (v === 0 ? 'Kapalı' : pct(v))} />
            <Toggle label="Gitarı sustur" description="Sadece metronomla kendin çal." checked={p.muted} onChange={p.onMuted} />
            <Slider label="Metronom" min={0} max={1} step={0.05} value={p.metroVol} onChange={(v) => { p.onMetroVol(v); if (v > 0) p.onMetronome(true); }} format={pct} />
            <Toggle label="Sayarak başla" description="Çalmadan önce bir ölçü sayar." checked={p.countIn} onChange={p.onCountIn} />
          </div>
        </Popover>

        <span className="tp-sep" aria-hidden />

        <div className={`tp-loop${p.loop ? ' is-on' : ''}`}>
          <Tooltip content={p.loop ? 'Döngüyü kapat' : p.abPending != null ? 'Bitiş ölçüsünü ayarla (B)' : 'Başlangıç ölçüsünü ayarla (A). Tek ölçü için L'} shortcut="L">
            <Button
              variant="ghost"
              icon={<Repeat size={16} />}
              pressed={!!p.loop || p.abPending != null}
              onClick={p.onLoopAB}
              disabled={!p.hasScore}
              aria-label={p.loop ? `Döngü: ${loopLabel}. Kapatmak için bas` : `Döngü ${loopLabel}`}
            >
              <span className="num">{loopLabel}</span>
            </Button>
          </Tooltip>
          {p.loop && <IconButton label="Döngüyü kapat" icon={<X size={14} />} size="sm" onClick={p.onClearLoop} tooltip={false} className="tp-loop-x" />}
        </div>

        <IconButton
          label={p.showTab ? 'Tab şeridini gizle' : 'Tab şeridini göster'}
          shortcut="T"
          icon={<PanelBottom size={18} />}
          pressed={p.showTab}
          onClick={p.onToggleTab}
        />
      </div>
    </div>
  );
}
