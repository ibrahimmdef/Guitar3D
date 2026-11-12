import { useCallback, useEffect, useRef, useState } from 'react';
import { AlphaTabApi, synth, type model } from '@coderline/alphatab';
import type { FretNote } from '@guitar3d/shared';
import { toTabString } from '../tips/model';

export interface PlayerState {
  ready: boolean;
  loading: boolean;
  playing: boolean;
  score: model.Score | null;
  track: model.Track | null;
  notes: FretNote[];
  beatId: number;
  currentBar: number;
  timeMs: number;
  endMs: number;
  /** Playback position in MIDI ticks (repeats unrolled) and the song's end tick. */
  tick: number;
  endTick: number;
  /**
   * Fraction (0..1) of the current beat that has elapsed, i.e. how close the next beat is.
   * Updated on every player position event (~every 50 ms); for per-frame smoothness use
   * `getBeatProgress()` returned by the hook.
   */
  beatProgress: number;
  error: string | null;
}

/** Tab colours tuned for the dark tab panel (see styles/player.css .tabpanel). */
const GLYPH = '#d9dbe0';
const MUTED = '#6f747d';

function nextSoundingBeat(beat: model.Beat | null): model.Beat | null {
  let b = beat?.nextBeat ?? null;
  for (let i = 0; b && i < 64; i++) {
    if (!b.isRest && b.notes.some((n) => !n.isTieDestination)) return b;
    b = b.nextBeat;
  }
  return null;
}

export function beatToNotes(beat: model.Beat, stringCount: number): FretNote[] {
  const now: FretNote[] = beat.isRest
    ? []
    : beat.notes.filter((n) => !n.isPercussion).map((n) => ({ string: toTabString(n.string, stringCount), fret: n.fret, state: 'now' as const }));
  const nb = nextSoundingBeat(beat);
  const next: FretNote[] = nb
    ? nb.notes
        .filter((n) => !n.isPercussion && !n.isTieDestination)
        .map((n) => ({ string: toTabString(n.string, stringCount), fret: n.fret, state: 'next' as const }))
        .filter((n) => !now.some((m) => m.string === n.string && m.fret === n.fret))
    : [];
  return [...now, ...next];
}

function pickGuitarTrack(score: model.Score) {
  return (
    score.tracks.find((t) => !t.isPercussion && t.staves[0]?.isStringed && t.staves[0].tuning.length === 6) ??
    score.tracks.find((t) => !t.isPercussion) ??
    score.tracks[0]
  );
}

export function useAlphaTab(host: React.RefObject<HTMLDivElement | null>, scroller: React.RefObject<HTMLDivElement | null>) {
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [s, setS] = useState<PlayerState>({
    ready: false, loading: false, playing: false, score: null, track: null, notes: [], beatId: 0, currentBar: 0,
    timeMs: 0, endMs: 0, tick: 0, endTick: 0, beatProgress: 0, error: null,
  });
  // Last known beat window, used to interpolate beatProgress between position events.
  const clock = useRef({ progress: 0, durationMs: 0, at: 0, playing: false });
  const patch = useCallback((p: Partial<PlayerState>) => setS((o) => ({ ...o, ...p })), []);

  useEffect(() => {
    if (!host.current || !scroller.current) return;
    const api = new AlphaTabApi(host.current, {
      core: { fontDirectory: '/font/' },
      display: {
        layoutMode: 'horizontal',
        staveProfile: 'tab',
        scale: 0.95,
        padding: [16, 4, 16, 4],
        resources: {
          mainGlyphColor: GLYPH,
          secondaryGlyphColor: MUTED,
          staffLineColor: '#33363d',
          barSeparatorColor: '#43464e',
          barNumberColor: '#80858e',
          scoreInfoColor: GLYPH,
        },
      },
      notation: { elements: { effectDynamics: false, scoreTitle: false, scoreSubTitle: false, scoreArtist: false, scoreAlbum: false, scoreWords: false, scoreMusic: false, scoreWordsAndMusic: false, scoreCopyright: false, guitarTuning: false, trackNames: false } },
      player: {
        playerMode: 'EnabledSynthesizer',
        soundFont: '/soundfont/sonivox.sf2',
        scrollElement: scroller.current,
        scrollMode: 'continuous',
        enableCursor: true,
        enableElementHighlighting: true,
      },
    } as never);
    apiRef.current = api;
    if (import.meta.env.DEV) (window as unknown as { __alphaTab: AlphaTabApi }).__alphaTab = api;

    let stringCount = 6;
    api.scoreLoaded.on((score) => {
      const track = pickGuitarTrack(score);
      stringCount = track.staves[0]?.tuning.length || 6;
      patch({ score, track, loading: false, notes: [], currentBar: 0, error: null });
      if (api.tracks.length !== 1 || api.tracks[0] !== track) api.renderTracks([track]);
    });
    api.playerReady.on(() => patch({ ready: true }));
    api.playerStateChanged.on((e) => {
      const playing = e.state === synth.PlayerState.Playing;
      clock.current = { ...clock.current, playing, at: performance.now() };
      patch({ playing });
    });
    let beatId = 0;
    let lastBeat: model.Beat | null = null;
    const showBeat = (beat: model.Beat) => {
      if (beat === lastBeat) return;
      lastBeat = beat;
      beatId += 1;
      patch({ notes: beatToNotes(beat, stringCount), beatId, currentBar: beat.voice.bar.index });
    };
    api.playedBeatChanged.on(showBeat);
    // Seeking while paused does not emit playedBeatChanged, so resolve the beat from the tick cache.
    api.playerPositionChanged.on((e) => {
      const track = api.tracks[0];
      const hit = track && api.tickCache ? api.tickCache.findBeat(new Set([track.index]), e.currentTick) : null;
      let beatProgress = 0;
      if (hit) {
        const span = hit.end - hit.start;
        beatProgress = span > 0 ? Math.min(1, Math.max(0, (e.currentTick - hit.start) / span)) : 0;
        clock.current = { ...clock.current, progress: beatProgress, durationMs: hit.duration, at: performance.now() };
      }
      patch({ timeMs: e.currentTime, endMs: e.endTime, tick: e.currentTick, endTick: e.endTick, beatProgress });
      if (hit) showBeat(hit.beat);
    });
    api.error.on((e) => patch({ error: String((e as Error)?.message ?? e), loading: false }));

    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, [host, scroller, patch]);

  const loadBuffer = useCallback((buf: ArrayBuffer) => {
    patch({ loading: true, error: null });
    apiRef.current?.load(new Uint8Array(buf));
  }, [patch]);

  const loadTex = useCallback((tex: string) => {
    patch({ loading: true, error: null });
    apiRef.current?.tex(tex);
  }, [patch]);

  /** Interpolated beat progress for render loops (e.g. inside useFrame). */
  const getBeatProgress = useCallback(() => {
    const c = clock.current;
    if (!c.playing || c.durationMs <= 0) return c.progress;
    const speed = apiRef.current?.playbackSpeed ?? 1;
    return Math.min(1, c.progress + ((performance.now() - c.at) * speed) / c.durationMs);
  }, []);

  const seekTick = useCallback((tick: number) => {
    const a = apiRef.current;
    if (a) a.tickPosition = Math.max(0, tick);
  }, []);

  /** Jump to the start of a bar (0-based). Uses score ticks, so repeats are not unrolled. */
  const seekBar = useCallback((bar: number) => {
    const a = apiRef.current;
    const mbs = a?.score?.masterBars;
    if (!a || !mbs?.length) return;
    a.tickPosition = mbs[Math.max(0, Math.min(mbs.length - 1, bar))].start;
  }, []);

  return { api: apiRef, state: s, loadBuffer, loadTex, getBeatProgress, seekTick, seekBar };
}

/** True when the score has repeats, so score ticks differ from playback ticks. */
export function hasRepeats(score: model.Score) {
  return score.masterBars.some((m) => m.isRepeatStart || m.repeatCount > 0 || m.alternateEndings !== 0);
}

/** Tick range covering bars [from, to] (inclusive, 0-based). */
export function barRange(score: model.Score, from: number, to: number) {
  const mbs = score.masterBars;
  const a = mbs[Math.max(0, Math.min(from, to))];
  const bIdx = Math.min(mbs.length - 1, Math.max(from, to));
  const b = mbs[bIdx];
  const endTick = bIdx + 1 < mbs.length ? mbs[bIdx + 1].start : b.start + (b.timeSignatureNumerator * 960 * 4) / b.timeSignatureDenominator;
  return { startTick: a.start, endTick };
}
