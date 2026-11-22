import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Drum, Pause, Play, X } from 'lucide-react';
import {
  barAccents,
  barSteps,
  countLabels,
  patternBarOffset,
  patternForBar,
  stepSimilarity,
  type StrumAnalysis,
  type StrumPattern,
  type StrumToken,
} from '@guitar3d/shared';
import { useStrumPractice } from '../../audio/strumPractice';
import { Button, IconButton, Slider, Toggle } from '../../ui/kit';

/** Playback position: bar index and sixteenth (0–15) in the bar. */
export interface StrumPos {
  bar: number;
  slot: number;
}

interface Props {
  analysis: StrumAnalysis;
  pos: StrumPos | null;
  /** Main playback is running (the lane follows it). */
  playing: boolean;
  /** Called when the practice loop starts, to pause the main playback. */
  onPracticeStart?: () => void;
  /** Song screen: play the song's drums along at the practice tempo. */
  onPlayAlong?: (bpm: number) => void;
  onClose?: () => void;
  className?: string;
}

interface Lane {
  steps: StrumToken[];
  accents: boolean[];
  /** Chord per half bar, null where it continues. */
  chords: (string | null)[];
  bars: number;
}

/** Chords of bars [start, start + n) per half bar, shown only where they change. */
function laneChords(analysis: StrumAnalysis, start: number, n: number): (string | null)[] {
  const out: (string | null)[] = [];
  let prev: string | null = null;
  for (let b = start; b < start + n; b++) {
    for (const c of analysis.bars[b]?.c ?? [null, null]) {
      out.push(c && c !== prev ? c : null);
      if (c) prev = c;
    }
  }
  return out;
}

function barsLane(analysis: StrumAnalysis, start: number, n: number, resolution: StrumAnalysis['resolution']): Lane {
  const bars = analysis.bars.slice(start, start + n);
  return {
    steps: bars.flatMap((b) => barSteps(b, resolution)),
    accents: bars.flatMap((b) => barAccents(b, resolution)),
    chords: laneChords(analysis, start, n),
    bars: n,
  };
}

const TOKEN_LABEL: Record<StrumToken, string> = { D: 'down', U: 'up', X: 'chuck', '-': 'rest' };

/**
 * The rhythm part as a strum lane: chords above big down / up arrows (X = muted chuck, dot = no
 * strum) over the count, following playback, plus a practice loop of the pattern with a click.
 */
export function RhythmPanel({ analysis, pos, playing, onPracticeStart, onPlayAlong, onClose, className }: Props) {
  const main = analysis.pattern;
  const [practiceOpen, setPracticeOpen] = useState(false);
  const songBpm = Math.max(30, Math.round(analysis.tempo || 90));
  const [bpm, setBpm] = useState(() => Math.round(songBpm * 0.6));
  const [click, setClick] = useState(true);
  const [chord, setChord] = useState(true);
  const [accent, setAccent] = useState(true);
  useEffect(() => setBpm(Math.round(songBpm * 0.6)), [songBpm]);

  // The pattern of the section being played (or the main one), and the bars on screen.
  const pattern: StrumPattern | null = pos ? patternForBar(analysis, pos.bar) : main;
  const resolution = pattern?.resolution ?? analysis.resolution;
  const firstStart = pattern?.starts[0] ?? Math.max(0, analysis.bars.findIndex((b) => /[DUX]/.test(b.s)));
  const winBars = pattern?.bars ?? 1;
  const winStart = useMemo(() => {
    if (!pos || pos.bar >= analysis.bars.length) return firstStart;
    const off = pattern ? patternBarOffset(pattern, pos.bar) : null;
    if (off != null) return pos.bar - off;
    return /[DUX]/.test(analysis.bars[pos.bar]?.s ?? '') ? pos.bar : firstStart;
  }, [pos, pattern, analysis.bars, firstStart]);

  const practiceChords = useMemo(() => (pattern ? pattern.starts.length ? laneChords(analysis, pattern.starts[0], pattern.bars).map((c, i, a) => c ?? a.slice(0, i).reverse().find(Boolean) ?? null) : [] : []), [analysis, pattern]);
  const practice = useStrumPractice({
    steps: pattern?.steps ?? [],
    accents: pattern?.accents ?? [],
    resolution,
    chords: practiceChords,
    bpm,
    click,
    chord,
    accent,
  });
  // the song started again: the loop gives way
  useEffect(() => {
    if (playing && practice.playing) practice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const lane: Lane = practice.playing && pattern
    ? { steps: pattern.steps, accents: pattern.accents, chords: practiceChords.map((c, i) => (c && c !== practiceChords[i - 1] ? c : null)), bars: pattern.bars }
    : barsLane(analysis, winStart, winBars, resolution);
  const perSlot = 16 / resolution;
  const current = practice.playing
    ? practice.step
    : pos && pos.bar >= winStart && pos.bar < winStart + winBars && (playing || pos.slot > 0)
      ? (pos.bar - winStart) * resolution + Math.floor(pos.slot / perSlot)
      : -1;
  const counts = countLabels(resolution, lane.bars);
  const isVariation = !practice.playing && pattern && stepSimilarity(lane.steps, pattern.steps) < 1;
  const sectionIdx = pattern && analysis.patterns ? analysis.patterns.indexOf(pattern) : 0;
  const togglePractice = () => {
    if (!practice.playing) onPracticeStart?.();
    practice.toggle();
  };

  return (
    <section className={`rhythm-panel${className ? ` ${className}` : ''}`} aria-label="Strum pattern">
      <header className="rhythm-head">
        <div className="rhythm-title">
          <strong>Strum pattern</strong>
          {pattern ? (
            <span className="rhythm-text" aria-label={`Pattern: ${pattern.steps.map((t) => TOKEN_LABEL[t]).join(', ')}`}>{pattern.text}</span>
          ) : (
            <span className="rhythm-meta">No repeating pattern found</span>
          )}
        </div>
        <span className="rhythm-meta">
          {pattern && (
            <>
              {analysis.patterns && analysis.patterns.length > 1 && <span className="rhythm-section">{String.fromCharCode(65 + Math.max(0, sectionIdx))}</span>}
              {pattern.bars === 2 ? '2 bars' : '1 bar'} · {pattern.resolution === 16 ? '16ths' : '8ths'} · repeats {pattern.starts.length}×
            </>
          )}
          {analysis.method === 'grid' && <span title="Directions follow the beat: down on the beat, up between (constant motion)."> · by beat</span>}
        </span>
        {onClose && <IconButton size="sm" label="Hide strum pattern" icon={<X size={14} />} onClick={onClose} />}
      </header>

      <div className="rhythm-lane-wrap">
        <div className="rhythm-lane" style={{ gridTemplateColumns: `repeat(${lane.steps.length}, minmax(26px, 1fr))` }} aria-hidden>
          {lane.steps.map((_, i) => {
            const half = Math.floor(i / (resolution / 2));
            const c = i % (resolution / 2) === 0 ? lane.chords[half] : null;
            return <span key={`c${i}`} className="rhythm-chord">{c}</span>;
          })}
          {lane.steps.map((t, i) => (
            <span
              key={`s${i}`}
              className={`rhythm-step is-${t === '-' ? 'rest' : t.toLowerCase()}${lane.accents[i] ? ' is-accent' : ''}${i === current ? ' is-now' : ''}${i % resolution === 0 && i > 0 ? ' is-bar' : ''}`}
            >
              {lane.accents[i] && t !== '-' && <span className="rhythm-acc">&gt;</span>}
              {t === 'D' ? <ArrowDown size={26} strokeWidth={3} /> : t === 'U' ? <ArrowUp size={26} strokeWidth={3} /> : t === 'X' ? <X size={22} strokeWidth={3.5} /> : <span className="rhythm-dot" />}
            </span>
          ))}
          {counts.map((c, i) => (
            <span key={`n${i}`} className={`rhythm-count${i % (resolution / 4) === 0 ? ' is-beat' : ''}${i === current ? ' is-now' : ''}`}>{c}</span>
          ))}
        </div>
      </div>
      {practice.playing && practice.step < 0 && <p className="rhythm-note">Count-in: one bar of clicks, then the pattern loops.</p>}
      {isVariation && <p className="rhythm-note">This bar differs from the pattern: play what the lane shows.</p>}

      {pattern && (
        <div className="rhythm-practice">
          {!practiceOpen ? (
            <Button size="sm" onClick={() => setPracticeOpen(true)}>Practice this pattern</Button>
          ) : (
            <>
              <div className="rhythm-practice-row">
                <Button size="sm" variant="primary" icon={practice.playing ? <Pause size={14} /> : <Play size={14} />} onClick={togglePractice}>
                  {practice.playing ? 'Stop' : 'Loop pattern'}
                </Button>
                <Slider compact className="rhythm-bpm" label="Practice tempo" value={bpm} min={30} max={Math.max(60, Math.round(songBpm * 1.2))} format={(v) => `${v} BPM`} onChange={setBpm} />
                <span className="rhythm-bpm-num num">{bpm} BPM</span>
                <div className="rhythm-chips">
                  {[0.6, 0.8, 1].map((r) => (
                    <button key={r} type="button" className={`chip${bpm === Math.round(songBpm * r) ? ' is-on' : ''}`} onClick={() => setBpm(Math.round(songBpm * r))}>{Math.round(r * 100)}%</button>
                  ))}
                </div>
              </div>
              <div className="rhythm-practice-row">
                <Toggle checked={click} onChange={setClick} label="Click" />
                <Toggle checked={chord} onChange={setChord} label="Chord" />
                <Toggle checked={accent} onChange={setAccent} label="Accents" />
                {onPlayAlong && (
                  <Button size="sm" icon={<Drum size={14} />} onClick={() => { practice.stop(); onPlayAlong(bpm); }}>
                    Play along with the drums
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
