import { useCallback, useEffect, useRef, useState } from 'react';
import { AlphaTabApi, importer, synth, type model } from '@coderline/alphatab';
import type { FretNote } from '@guitar3d/shared';
import { beatToNotes, upcomingFretNotes } from './beats';

export interface PlayerState {
  ready: boolean;
  loading: boolean;
  playing: boolean;
  score: model.Score | null;
  track: model.Track | null;
  notes: FretNote[];
  /** Up to three sounding beats after the current one, nearest first (Guitar3D `upcoming`). */
  upcoming: FretNote[][];
  /** Beat under the cursor (alphaTab model object). */
  beat: model.Beat | null;
  /** Bumped whenever alphaTab (re)loads MIDI; synth-side settings must be re-applied after it. */
  midiGen: number;
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
  /** Metronome position: beat within the bar (0-based), beats per bar, and a counter bumped on every beat. */
  beatInBar: number;
  beatsPerBar: number;
  pulse: number;
  error: string | null;
}

/** Tab colours tuned for the dark tab panel (see styles/player.css .tabpanel). */
const GLYPH = '#d9dbe0';
const MUTED = '#6f747d';

/** Tracks a guitarist can play here: stringed, not drums. */
export function playableTracks(score: model.Score): model.Track[] {
  const stringed = score.tracks.filter((t) => !t.isPercussion && t.staves[0]?.isStringed && t.staves[0].tuning.length > 0);
  return stringed.length ? stringed : score.tracks.filter((t) => !t.isPercussion);
}

/**
 * The track to show first: a 6-string track that is called / sounds like a guitar (GM programs
 * 24–31), else any 6-string track, else the first playable one. Piano, vocals and drums come last.
 */
export function pickGuitarTrack(score: model.Score): model.Track {
  const tracks = playableTracks(score);
  const six = tracks.filter((t) => t.staves[0]?.tuning.length === 6);
  const guitarish = (t: model.Track) => /gu?itar|gitar|guit/i.test(t.name) || (t.playbackInfo.program >= 24 && t.playbackInfo.program <= 31);
  return six.find(guitarish) ?? six[0] ?? tracks.find(guitarish) ?? tracks[0] ?? score.tracks[0];
}

export function useAlphaTab(host: React.RefObject<HTMLDivElement | null>, scroller: React.RefObject<HTMLDivElement | null>) {
  const apiRef = useRef<AlphaTabApi | null>(null);
  /** Index of the track to render for the loaded score. */
  const wantTrack = useRef(0);
  const [s, setS] = useState<PlayerState>({
    ready: false, loading: false, playing: false, score: null, track: null, notes: [], upcoming: [], beat: null, midiGen: 0, beatId: 0, currentBar: 0,
    timeMs: 0, endMs: 0, tick: 0, endTick: 0, beatProgress: 0, beatInBar: 0, beatsPerBar: 4, pulse: 0, error: null,
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
    // The track is chosen before alphaTab renders (see `show` below): switching tracks while the
    // first render is running crashes alphaTab's layout ("reading 'staves'") and leaves track 1 on screen.
    api.scoreLoaded.on((score) => {
      const track = score.tracks[wantTrack.current] ?? api.tracks[0] ?? pickGuitarTrack(score);
      stringCount = track.staves[0]?.tuning.length || 6;
      patch({ score, track, loading: false, notes: [], upcoming: [], beat: null, currentBar: 0, error: null });
    });
    api.playerReady.on(() => patch({ ready: true }));
    api.midiLoaded.on(() => setS((o) => ({ ...o, midiGen: o.midiGen + 1 })));
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
      const upcoming = upcomingFretNotes(beat, stringCount, 3);
      patch({ notes: beatToNotes(beat, stringCount, upcoming), upcoming, beat, beatId, currentBar: beat.voice.bar.index });
    };
    api.playedBeatChanged.on(showBeat);
    // Seeking while paused does not emit playedBeatChanged, so resolve the beat from the tick cache.
    api.playerPositionChanged.on((e) => {
      const track = api.tracks[0];
      const hit = track && api.tickCache ? api.tickCache.findBeat(new Set([track.index]), e.currentTick) : null;
      let beatProgress = 0;
      let metro: Pick<PlayerState, 'beatInBar' | 'beatsPerBar'> | null = null;
      if (hit) {
        const mb = hit.masterBar.masterBar;
        const unit = 3840 / (mb.timeSignatureDenominator || 4);
        metro = { beatInBar: Math.max(0, Math.floor((e.currentTick - hit.masterBar.start) / unit)), beatsPerBar: mb.timeSignatureNumerator || 4 };
        const span = hit.end - hit.start;
        beatProgress = span > 0 ? Math.min(1, Math.max(0, (e.currentTick - hit.start) / span)) : 0;
        clock.current = { ...clock.current, progress: beatProgress, durationMs: hit.duration, at: performance.now() };
      }
      setS((o) => {
        const next = { ...o, timeMs: e.currentTime, endMs: e.endTime, tick: e.currentTick, endTick: e.endTick, beatProgress };
        if (metro && (metro.beatInBar !== o.beatInBar || hit!.masterBar.masterBar.index !== o.currentBar)) Object.assign(next, metro, { pulse: o.pulse + 1 });
        return next;
      });
      if (hit) showBeat(hit.beat);
    });
    api.error.on((e) => patch({ error: String((e as Error)?.message ?? e), loading: false }));

    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, [host, scroller, patch]);

  /** Parses the file here, picks the guitar track and hands alphaTab only that track. */
  const show = useCallback((parse: (settings: AlphaTabApi['settings']) => model.Score, fallback: (a: AlphaTabApi) => void) => {
    const a = apiRef.current;
    if (!a) return;
    patch({ loading: true, error: null });
    let score: model.Score;
    try {
      score = parse(a.settings);
    } catch {
      wantTrack.current = 0;
      fallback(a); // alphaTab reports the error through its error event
      return;
    }
    wantTrack.current = pickGuitarTrack(score).index;
    a.renderScore(score, [wantTrack.current]);
  }, [patch]);

  const loadBuffer = useCallback((buf: ArrayBuffer) => {
    show((st) => importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buf), st), (a) => a.load(new Uint8Array(buf)));
  }, [show]);

  const loadTex = useCallback((tex: string) => {
    show((st) => {
      const imp = new importer.AlphaTexImporter();
      imp.initFromString(tex, st);
      return imp.readScore();
    }, (a) => a.tex(tex));
  }, [show]);

  /** Shows another track of the loaded score (multi-track files). */
  const selectTrack = useCallback((index: number) => {
    const a = apiRef.current;
    const score = a?.score;
    if (!a || !score || !score.tracks[index] || index === wantTrack.current) return;
    a.stop();
    wantTrack.current = index;
    a.renderScore(score, [index]);
  }, []);

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

  /** Move the cursor to a beat (used by wait mode). */
  const seekBeat = useCallback((beat: model.Beat) => {
    const a = apiRef.current;
    if (a?.tickCache) a.tickPosition = a.tickCache.getBeatStart(beat);
  }, []);

  /**
   * Sets the General MIDI program (sound) of the guitar track and regenerates the MIDI when it
   * changed. Regenerating stops playback.
   */
  const setProgram = useCallback((program: number) => {
    const a = apiRef.current;
    const track = a?.tracks[0];
    if (!a || !track || track.isPercussion || track.playbackInfo.program === program) return;
    track.playbackInfo.program = program;
    a.loadMidiForScore();
  }, []);

  /** Rendering scale of the tab strip (bigger in tab focus). */
  const setTabScale = useCallback((scale: number) => {
    const a = apiRef.current;
    if (!a || Math.abs(a.settings.display.scale - scale) < 0.001) return;
    a.settings.display.scale = scale;
    a.updateSettings();
    if (a.score) a.render();
  }, []);

  return { api: apiRef, state: s, loadBuffer, loadTex, selectTrack, getBeatProgress, seekTick, seekBar, seekBeat, setProgram, setTabScale };
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
