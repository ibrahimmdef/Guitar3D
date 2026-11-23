import { GraduationCap, Music2, Metronome, Mic, MicOff, Minus, PanelBottom, Pause, Play, Plus, Repeat, SkipBack, Timer, Volume2, VolumeX, X } from 'lucide-react';
import { GUITAR_SOUNDS, MIXES, mixOf, type Mix } from '../../audio/sounds';
import { Button, IconButton, Popover, SegmentedControl, Slider, Toggle, Tooltip } from '../../ui/kit';
import { formatPercent, formatTime } from '../../ui/format';
import { Scrubber } from './Scrubber';
import { usePosition, type PositionStore } from '../../player/position';
import type { PresetId } from '../../songs/mixer';

/** What to hear when the tab plays along with its song. */
export const SONG_MIXES: { value: PresetId; label: string }[] = [
  { value: 'all', label: 'Full song' },
  { value: 'playalong', label: 'Play along' },
  { value: 'guitar-only', label: 'Guitar only' },
];

export const SPEED_PRESETS = [0.5, 0.75, 0.9, 1] as const;

export type TabView = 'tab' | 'score' | 'both';
export const TAB_VIEWS: { value: TabView; label: string }[] = [
  { value: 'tab', label: 'Tab' },
  { value: 'score', label: 'Notation' },
  { value: 'both', label: 'Tab + notation' },
];

const fmtTime = formatTime;
const pct = formatPercent;

export interface TransportProps {
  ready: boolean;
  hasScore: boolean;
  playing: boolean;
  /** Playback time and tick: read here, so a position event re-renders only the clock and scrubber. */
  position: PositionStore;
  barTicks: number[] | null;
  loopTicks: [number, number] | null;
  density: number[] | null;
  currentBar: number;
  barCount: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (tick: number) => void;
  onStepBar: (delta: number) => void;

  speed: number;
  onSpeed: (v: number) => void;
  /** Song tempo at 100 %, for the BPM readout. */
  bpm: number | null;
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
  /** Tab strip view: tablature, notation or both. */
  tabView: TabView;
  onTabView: (v: TabView) => void;

  program: number;
  onProgram: (p: number) => void;
  onMix: (m: Mix) => void;
  /** Speed slider limits (default 25–150 %). */
  speedRange?: readonly [number, number];
  /**
   * The tab plays along with the song it was transcribed from: the sound menu picks the song mix
   * instead of the synthesized guitar.
   */
  song?: { preset: PresetId; onPreset: (p: PresetId) => void } | null;

  listening: boolean;
  listenDisabled?: boolean;
  onListen: (v: boolean) => void;

  practiceOpen: boolean;
  onPractice: () => void;
}

export function Transport(p: TransportProps) {
  const speedPreset = SPEED_PRESETS.find((v) => Math.abs(v - p.speed) < 0.001);
  const bpm = p.bpm ? Math.round(p.bpm * p.speed) : null;
  const mix = mixOf(!p.muted && p.guitarVol > 0, p.metronome);
  const loopLabel = p.loop
    ? p.loop[0] === p.loop[1] ? `Bar ${p.loop[0] + 1}` : `${p.loop[0] + 1}–${p.loop[1] + 1}`
    : p.abPending != null ? `A: ${p.abPending + 1} · B?` : 'A–B';

  return (
    <div className="transport" role="toolbar" aria-label="Playback controls">
      <div className="tp-group tp-play">
        <IconButton label="Back to start" shortcut="Home" icon={<SkipBack size={18} />} onClick={p.onStop} disabled={!p.hasScore} />
        <Tooltip content={p.playing ? 'Pause' : 'Play'} shortcut="Space">
          <button
            type="button"
            className="play-btn"
            aria-label={p.playing ? 'Pause' : 'Play'}
            aria-keyshortcuts="Space"
            disabled={!p.ready || !p.hasScore}
            onClick={p.onPlayPause}
          >
            {p.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="play-ic" />}
          </button>
        </Tooltip>
      </div>

      <div className="tp-group tp-position">
        <TransportPosition p={p} />
      </div>

      <div className="tp-group tp-tools">
        <div className="tp-tempo" role="group" aria-label="Tempo">
          <IconButton label="Slow down" shortcut="-" size="sm" icon={<Minus size={15} />} onClick={() => p.onSpeed(p.speed - 0.05)} disabled={p.speed <= 0.25} />
          <Slider label="Speed" compact min={p.speedRange?.[0] ?? 0.25} max={p.speedRange?.[1] ?? 1.5} step={0.05} value={p.speed} onChange={p.onSpeed} format={pct} className="tp-tempo-slider tp-hide-md" />
          <IconButton label="Speed up" shortcut="+" size="sm" icon={<Plus size={15} />} onClick={() => p.onSpeed(p.speed + 0.05)} disabled={p.speed >= 1.5} />
          <Popover
            label="Speed"
            trigger={
              <button type="button" className={`btn btn-ghost btn-sm tp-speed${p.speed !== 1 ? ' is-changed' : ''}`} aria-label={`Speed ${pct(p.speed)}${bpm ? `, ${bpm} BPM` : ''}`}>
                <span className="num">{pct(p.speed)}</span>
                {bpm != null && <span className="tp-bpm num">{bpm} BPM</span>}
              </button>
            }
          >
            <div className="pop-stack">
              <div className="pop-title">Playback speed</div>
              <SegmentedControl
                aria-label="Speed presets"
                size="sm"
                value={speedPreset ? String(speedPreset) : ''}
                onChange={(v) => p.onSpeed(Number(v))}
                options={SPEED_PRESETS.map((v) => ({ value: String(v), label: pct(v) }))}
              />
              <Slider label="Speed" min={p.speedRange?.[0] ?? 0.25} max={p.speedRange?.[1] ?? 1.5} step={0.05} value={p.speed} onChange={p.onSpeed} format={(v) => `${pct(v)}${p.bpm ? ` · ${Math.round(p.bpm * v)} BPM` : ''}`} />
            </div>
          </Popover>
        </div>

        <span className="tp-sep" aria-hidden />

        <IconButton
          label={p.metronome ? 'Turn metronome off' : 'Turn metronome on'}
          shortcut="M"
          icon={<Metronome size={18} />}
          pressed={p.metronome}
          onClick={() => p.onMetronome(!p.metronome)}
        />
        {/* the recording has its own intro: no count-in with a song */}
        {!p.song && (
          <IconButton
            label={p.countIn ? 'Count-in: on' : 'Count-in: off'}
            icon={<Timer size={18} />}
            pressed={p.countIn}
            onClick={() => p.onCountIn(!p.countIn)}
            className="tp-hide-sm"
          />
        )}
        <Popover
          label="Sound"
          trigger={
            <Tooltip content="Sound">
                {p.song ? (
                  <button type="button" className="btn btn-ghost btn-md tp-song-btn" aria-label={`Sound: ${SONG_MIXES.find((m) => m.value === p.song!.preset)?.label}`}>
                    <Volume2 size={18} />
                    <span>{SONG_MIXES.find((m) => m.value === p.song!.preset)?.label}</span>
                  </button>
                ) : (
                  <button type="button" className={`btn btn-ghost btn-md icon-btn${p.muted ? ' is-pressed' : ''}`} aria-label={p.muted ? 'Sound: guitar muted' : 'Sound and instrument'}>
                    {p.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                )}
            </Tooltip>
          }
        >
          {p.song ? (
            <div className="pop-stack">
              <div className="pop-title">Sound</div>
              <p className="muted small">The tab follows the original recording.</p>
              <SegmentedControl<PresetId>
                aria-label="What to hear"
                size="sm"
                value={p.song.preset}
                onChange={(v) => v && p.song!.onPreset(v)}
                options={SONG_MIXES}
                className="tp-mix"
              />
              <Slider label="Metronome" min={0} max={1} step={0.05} value={p.metroVol} onChange={(v) => { p.onMetroVol(v); if (v > 0) p.onMetronome(true); }} format={pct} />
            </div>
          ) : (
          <div className="pop-stack">
            <div className="pop-title">Sound</div>
            <SegmentedControl<Mix | ''>
              aria-label="What to hear"
              size="sm"
              value={mix}
              onChange={(v) => v && p.onMix(v)}
              options={MIXES.map((m) => ({ value: m.value, label: m.label }))}
              className="tp-mix"
            />
            <div className="sound-list" role="radiogroup" aria-label="Guitar sound">
              {GUITAR_SOUNDS.map((snd) => (
                <button
                  key={snd.program}
                  type="button"
                  role="radio"
                  aria-checked={p.program === snd.program}
                  className={`sound-opt${p.program === snd.program ? ' is-on' : ''}`}
                  onClick={() => p.onProgram(snd.program)}
                >
                  {snd.label}
                </button>
              ))}
            </div>
            <Slider label="Guitar" min={0} max={1} step={0.05} value={p.muted ? 0 : p.guitarVol} onChange={(v) => { p.onGuitarVol(v); p.onMuted(v === 0); }} format={(v) => (v === 0 ? 'Off' : pct(v))} />
            <Toggle label="Mute guitar" description="Play on your own with just the metronome." checked={p.muted} onChange={p.onMuted} />
            <Slider label="Metronome" min={0} max={1} step={0.05} value={p.metroVol} onChange={(v) => { p.onMetroVol(v); if (v > 0) p.onMetronome(true); }} format={pct} />
            <Toggle label="Count-in" description="Counts one bar before playing." checked={p.countIn} onChange={p.onCountIn} />
          </div>
          )}
        </Popover>

        <span className="tp-sep" aria-hidden />

        <div className={`tp-loop${p.loop ? ' is-on' : ''}`}>
          <Tooltip content={p.loop ? 'Clear loop' : p.abPending != null ? 'Set end bar (B)' : 'Set start bar (A). L for a single bar'} shortcut="L">
            <Button
              variant="ghost"
              icon={<Repeat size={16} />}
              pressed={!!p.loop || p.abPending != null}
              onClick={p.onLoopAB}
              disabled={!p.hasScore}
              aria-label={p.loop ? `Loop: ${loopLabel}. Press to clear` : `Loop ${loopLabel}`}
            >
              <span className="num">{loopLabel}</span>
            </Button>
          </Tooltip>
          {p.loop && <IconButton label="Clear loop" icon={<X size={14} />} size="sm" onClick={p.onClearLoop} tooltip={false} className="tp-loop-x" />}
        </div>

        <Popover
          label="View"
          trigger={
            <Tooltip content="View: tab / notation">
              <button type="button" className="btn btn-ghost btn-md icon-btn tp-hide-sm" aria-label={`View: ${TAB_VIEWS.find((v) => v.value === p.tabView)?.label ?? 'Tab'}`}>
                <Music2 size={18} />
              </button>
            </Tooltip>
          }
        >
          <div className="pop-stack">
            <div className="pop-title">View</div>
            <SegmentedControl<TabView>
              aria-label="Tab strip view"
              size="sm"
              value={p.tabView}
              onChange={(v) => {
                p.onTabView(v);
                if (!p.showTab) p.onToggleTab();
              }}
              options={TAB_VIEWS}
            />
          </div>
        </Popover>
        <IconButton
          label={p.showTab ? 'Hide tab strip' : 'Show tab strip'}
          shortcut="T"
          icon={<PanelBottom size={18} />}
          pressed={p.showTab}
          onClick={p.onToggleTab}
          className="tp-hide-sm"
        />
        <IconButton
          label={p.listening ? 'Listen mode: on' : 'Listen mode (microphone)'}
          icon={p.listening ? <Mic size={18} /> : <MicOff size={18} />}
          pressed={p.listening}
          disabled={p.listenDisabled}
          onClick={() => p.onListen(!p.listening)}
        />
        <Button variant="primary" icon={<GraduationCap size={16} />} pressed={p.practiceOpen} onClick={p.onPractice} aria-keyshortcuts="P" className="tp-practice">
          Practice
        </Button>
      </div>
    </div>
  );
}

/** Clock and scrubber: the only part of the transport that follows the playback position. */
function TransportPosition({ p }: { p: TransportProps }) {
  // whole seconds for the clock, a fine tick for the scrubber (it moves smoothly)
  const sec = usePosition(p.position, (x) => Math.floor(x.timeMs / 1000));
  const endSec = usePosition(p.position, (x) => Math.floor(x.endMs / 1000));
  const tick = usePosition(p.position, (x) => x.tick);
  const endTick = usePosition(p.position, (x) => x.endTick);
  return (
    <>
      <span className="tp-time num" aria-hidden>{fmtTime(sec * 1000)}</span>
      <Scrubber
        tick={tick}
        endTick={endTick}
        barTicks={p.barTicks}
        loopTicks={p.loopTicks}
        density={p.density}
        currentBar={p.currentBar}
        barCount={p.barCount}
        disabled={!p.hasScore}
        onSeek={p.onSeek}
        onStepBar={p.onStepBar}
        valueText={`Bar ${p.currentBar + 1} / ${p.barCount}, ${fmtTime(sec * 1000)}`}
      />
      <span className="tp-time num subtle" aria-hidden>{fmtTime(endSec * 1000)}</span>
    </>
  );
}
