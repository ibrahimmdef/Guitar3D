import { memo, useMemo, useRef } from 'react';

interface Props {
  /** Current playback tick and end tick. */
  tick: number;
  endTick: number;
  /** Bar start ticks (only when they map 1:1 onto playback ticks, i.e. no repeats). */
  barTicks: number[] | null;
  /** Loop range as [startTick, endTick]. */
  loopTicks: [number, number] | null;
  /** Note density per bar, 0..1 (drawn as a mini timeline when bar ticks are known). */
  density?: number[] | null;
  currentBar: number;
  barCount: number;
  disabled?: boolean;
  onSeek: (tick: number) => void;
  onStepBar: (delta: number) => void;
  valueText: string;
}

/** Position scrubber with bar ticks and loop region. Tick-based so bar marks line up exactly. */
export const Scrubber = memo(function Scrubber({ tick, endTick, barTicks, loopTicks, density, currentBar, barCount, disabled, onSeek, onStepBar, valueText }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const frac = endTick > 0 ? Math.min(1, tick / endTick) : 0;

  const seekAt = (clientX: number) => {
    const el = ref.current;
    if (!el || endTick <= 0) return;
    const r = el.getBoundingClientRect();
    onSeek(Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * endTick));
  };

  // Show at most ~48 tick marks so long songs stay quiet.
  const every = barTicks ? Math.max(1, Math.ceil(barTicks.length / 48)) : 1;
  const showDensity = !!(density && barTicks && endTick > 0 && density.length === barTicks.length);

  // Density bars only change with the bar, the loop or the song, not on every tick.
  const bars = useMemo(() => {
    if (!showDensity) return null;
    return barTicks!.map((t, i) => {
      const end = barTicks![i + 1] ?? endTick;
      const inLoop = !!loopTicks && t >= loopTicks[0] && end <= loopTicks[1];
      return (
        <i
          key={i}
          className={`${i < currentBar ? 'played' : i === currentBar ? 'now' : ''}${inLoop ? ' in-loop' : ''}`}
          style={{ left: `${(t / endTick) * 100}%`, width: `${((end - t) / endTick) * 100}%`, height: `${12 + density![i] * 88}%` }}
        />
      );
    });
  }, [showDensity, barTicks, endTick, loopTicks, density, currentBar]);

  return (
    <div
      ref={ref}
      className={`scrubber${disabled ? ' is-disabled' : ''}${showDensity ? ' has-density' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Konum"
      aria-valuemin={1}
      aria-valuemax={Math.max(1, barCount)}
      aria-valuenow={currentBar + 1}
      aria-valuetext={valueText}
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekAt(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && seekAt(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onStepBar(-1);
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onStepBar(1);
        else if (e.key === 'Home') onSeek(0);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {bars && <div className="scrubber-density" aria-hidden>{bars}</div>}
      <div className="scrubber-track">
        {loopTicks && endTick > 0 && (
          <div className="scrubber-loop" style={{ left: `${(loopTicks[0] / endTick) * 100}%`, width: `${((loopTicks[1] - loopTicks[0]) / endTick) * 100}%` }} />
        )}
        <div className="scrubber-fill" style={{ transform: `scaleX(${frac})` }} />
        {barTicks && endTick > 0 &&
          barTicks.map((t, i) => (i > 0 && i % every === 0 ? <span key={i} className="scrubber-tick" style={{ left: `${(t / endTick) * 100}%` }} /> : null))}
      </div>
      <div className="scrubber-thumb" style={{ left: `${frac * 100}%` }} />
    </div>
  );
});
