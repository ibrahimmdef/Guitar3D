import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowLeft, Box, FileMusic, GraduationCap } from 'lucide-react';
import type { CameraMode, FretNote, GuitarProfile, GuitarView, TabMeta, TabProgress } from '@guitar3d/shared';
import type { Mix } from '../../audio/sounds';
import { barDensity, normalize } from '../../player/beats';
import { computeSections, nextSectionIndex, sectionAt } from '../../player/sections';
import { getTuning, withCapo } from '../../music/tunings';
import { useSessionRecorder } from '../../player/useSessionRecorder';
import { useTabSetup } from '../../player/tabSetup';
import { ladderStep, passResult, startLadder, type LadderState } from '../../player/tempoLadder';
import { barRange, hasRepeats, useAlphaTab, playableTracks } from '../../player/useAlphaTab';
import { usePosition } from '../../player/position';
import { useListenMode, type PassSummary } from '../../player/useListenMode';
import { analyze } from '../../tips/analyze';
import { toSimpleBars } from '../../tips/model';
import { Coach } from '../../ui/Coach';
import { SpeedTrainerPanel } from '../../ui/SpeedTrainerPanel';
import { useSpeedTrainer, type TrainerPass } from '../../coach/useSpeedTrainer';
import { pickHardestSection } from '../../coach/hardest';
import { markPassNotes, problemMarkers } from '../../coach/marks';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { LoadingProgress, type LoadStep } from '../../ui/LoadingProgress';
import { useProgress } from '@react-three/drei';
import { Button, Dialog, Drawer, EmptyState, IconButton, useToast } from '../../ui/kit';
import { DEMO_LESSON_ID, navigate, playLesson, type PlaySource } from '../../ui/router';
import { buildShareHash, type ShareParams } from '../../ui/share';
import { getActiveGuitar } from '../../guitar-setup/activeGuitar';
import { guitarsApi } from '../../guitar-setup/api';
import { markPlayed, useSettings } from '../../ui/settings';
import { useHotkeys, zoomDelta } from '../../ui/shortcuts';
import { ShortcutList } from '../../ui/ShortcutList';
import { fetchTabFile, getProgress, listTabs, recordPass } from '../data';
import { loadLesson } from '../library/lessons';
import { CAMERA_MODES, PlayerTopBar } from './PlayerTopBar';
import { CapoControl } from './CapoControl';
import { FeedbackSheet } from './FeedbackSheet';
import { CalibrationDialog } from './CalibrationDialog';
import { TrainerFeedbackSheet } from './TrainerFeedbackSheet';
import { CueStrip } from './CueStrip';
import { EasierPositionPanel, ghostNotes, useEasierPosition } from './EasierPosition';
import { StageGuitar } from './StageGuitar';
import { clampZoom, CountIn, StageTools, useFullscreen } from './StageTools';
import { Transport } from './Transport';
import { RecordPanel } from './RecordPanel';
import { NotesPanel, useBarNotes } from './NotesPanel';
import { RhythmPanel, type StrumPos } from './RhythmPanel';
import { strumFromScore } from '../../player/strumScore';

const clampSpeed = (v: number) => Math.min(1.5, Math.max(0.25, Math.round(v * 100) / 100));

export function PlayerScreen({ source, share }: { source: PlaySource; share?: ShareParams }) {
  const tabId = source.kind === 'tab' ? source.id : null;
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const { api, state, position, getBeatProgress, loadBuffer, loadTex, selectTrack, seekTick, seekBar, seekBeat, setProgram, setTabScale, setTabView } = useAlphaTab(host, scroller);
  const [settings, setSettings] = useSettings();
  const toast = useToast();

  const [meta, setMeta] = useState<Pick<TabMeta, 'title' | 'artist'> | null>(null);
  const [guitarReady, setGuitarReady] = useState(false);
  // guitar photos (textures) downloaded so far, from three.js' loading manager
  const textureProgress = useProgress((p) => (p.total ? p.loaded / p.total : 0));
  const [fetching, setFetching] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [rhythmHidden, setRhythmHidden] = useState(false);

  const [speed, setSpeed] = useState(settings.defaultSpeed);
  const [metronome, setMetronome] = useState(settings.metronome);
  const [countIn, setCountIn] = useState(settings.countIn);
  const [guitarVol, setGuitarVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState<[number, number] | null>(null);
  const [abPending, setAbPending] = useState<number | null>(null);
  const [ladder, setLadder] = useState<LadderState>(() => startLadder({ start: 1, target: 1, passes: 3 }));
  const ladderRef = useRef(ladder);
  ladderRef.current = ladder;
  /* Speed trainer */
  const [trainerOn, setTrainerOn] = useState(false);
  const trainerOnRef = useRef(trainerOn);
  trainerOnRef.current = trainerOn;
  const [trainerPass, setTrainerPass] = useState<TrainerPass | null>(null);
  const [trainerSheet, setTrainerSheet] = useState(false);
  const [awaitingVerdict, setAwaitingVerdict] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [flash, setFlash] = useState<FretNote[]>([]);
  const [tabProgress, setTabProgress] = useState<TabProgress | null>(null);
  const [listening, setListening] = useState(false);
  const [lastPass, setLastPass] = useState<PassSummary | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [countValue, setCountValue] = useState<number | null>(null);

  const [setup, setSetup] = useTabSetup(source.kind === 'lesson' ? `lesson:${source.id}` : source.id);
  const tabKey = source.kind === 'lesson' ? `lesson:${source.id}` : source.id;
  const barNotes = useBarNotes(tabKey);
  // Shared view: show the sender's guitar when this browser has it (built-in templates always), else ours.
  const [sharedGuitar, setSharedGuitar] = useState<GuitarProfile | null>(null);
  useEffect(() => {
    if (!share?.guitarId || share.guitarId === getActiveGuitar().id) return;
    let alive = true;
    guitarsApi.loadProfile(share.guitarId).then((p) => alive && setSharedGuitar(p)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [share?.guitarId]);

  const { view, cameraMode, showTabStrip: showTab, showPractice, metronomeVolume: metroVol, program, showFretNumbers, stageZoom, focus, tabView } = settings;
  const fs = useFullscreen(useCallback(() => root.current, []));

  /* ---------- Loading ---------- */
  useEffect(() => {
    let alive = true;
    setLoadErr(null);
    setMeta(null);
    setRhythmHidden(false);
    api.current?.stop();
    setFetching(true);
    markPlayed(source.kind === 'lesson' ? `lesson:${source.id}` : source.id);
    const done = () => alive && setFetching(false);
    // Defer one tick so the alphaTab instance created by useAlphaTab exists (StrictMode remounts).
    const t = setTimeout(() => {
      if (source.kind === 'lesson') {
        loadLesson(source.id)
          .then(({ meta: m, content }) => {
            if (!alive) return;
            setMeta(m ? { title: m.title, artist: '' } : null);
            if (content.kind === 'tex') loadTex(content.tex);
            else loadBuffer(content.data);
          })
          .catch((e: Error) => alive && setLoadErr(e.message))
          .finally(done);
      } else {
        fetchTabFile(source.id)
          .then((buf) => alive && loadBuffer(buf))
          .catch((e: Error) => alive && setLoadErr(e.message))
          .finally(done);
        listTabs().then((ts) => alive && setMeta(ts.find((x) => x.id === source.id) ?? null)).catch(() => {});
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [source.kind, source.id, loadTex, loadBuffer, api]);


  const report = useMemo(() => (state.score && state.track ? analyze(toSimpleBars(state.track, state.score.tempo)) : null), [state.score, state.track]);

  useEffect(() => {
    if (!report) return;
    setLoop(null);
    setAbPending(null);
    setLadder(startLadder({ start: report.suggestedStartSpeed, target: settings.ladderTarget, passes: settings.ladderPasses }));
    setTrainerOn(false);
    setSpeed(settings.defaultSpeed);
    if (share && state.score) {
      const last = state.score.masterBars.length - 1;
      if (share.loop && share.loop[0] <= last) {
        setLoop([share.loop[0], Math.min(share.loop[1], last)]);
        setTimeout(() => seekBar(share.loop![0]), 0);
      }
      if (share.speed) setSpeed(share.speed);
    }
    // Only on a new score; settings changes should not reset the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);


  /* ---------- Push state into alphaTab ---------- */
  useEffect(() => {
    if (api.current) api.current.playbackSpeed = speed;
  }, [speed, api, state.ready, state.midiGen]);
  useEffect(() => {
    if (api.current) api.current.metronomeVolume = metronome ? metroVol : 0;
  }, [metronome, metroVol, api, state.ready, state.midiGen]);
  useEffect(() => {
    if (api.current) api.current.countInVolume = countIn ? 1 : 0;
  }, [countIn, api, state.ready, state.midiGen]);
  useEffect(() => {
    const a = api.current;
    if (!a || !state.track) return;
    a.changeTrackMute([state.track], muted || guitarVol === 0);
    a.changeTrackVolume([state.track], guitarVol);
  }, [guitarVol, muted, api, state.track, state.ready, state.midiGen]);
  useEffect(() => {
    if (state.ready && state.track) setProgram(program);
  }, [program, state.ready, state.track, setProgram]);
  /* ---------- Capo and tuning ---------- */
  // What the file says, captured before we change the staves.
  const origin = useMemo(() => {
    const st = state.track?.staves[0];
    return st ? { capo: st.capo ?? 0, tuning: [...st.stringTuning.tunings] } : null;
  }, [state.track]);
  const capo = setup.capo ?? origin?.capo ?? 0;
  const tuningOverride = setup.tuningId && origin && getTuning(setup.tuningId).midi.length === origin.tuning.length ? setup.tuningId : '';
  useEffect(() => {
    const a = api.current;
    const t = state.track;
    if (!a || !t || !origin) return;
    const tuning = tuningOverride ? getTuning(tuningOverride).midi : origin.tuning;
    let changed = false;
    for (const st of t.staves) {
      if (st.capo !== capo) {
        st.capo = capo;
        changed = true;
      }
      const cur = st.stringTuning.tunings;
      if (cur.length === tuning.length && tuning.some((m, i) => m !== cur[i])) {
        st.stringTuning.tunings = [...tuning];
        changed = true;
      }
    }
    // Regenerating the MIDI applies the new pitches (and stops playback).
    if (changed) a.loadMidiForScore();
  }, [capo, tuningOverride, origin, api, state.track]);
  const [easierOn, setEasierOn] = useState(false);
  const playTuning = useMemo(() => (origin ? (tuningOverride ? getTuning(tuningOverride).midi : origin.tuning) : null), [origin, tuningOverride]);
  const easier = useEasierPosition(state.track, state.currentBar, playTuning, capo, easierOn);
  const ghosts = useMemo(() => ghostNotes(easier, state.beat), [easier, state.beat]);
  // trainer feedback markers go first so they win over a current note on the same fret
  const stageNotes = useMemo(() => withCapo([...flash, ...state.notes, ...ghosts], capo), [flash, state.notes, ghosts, capo]);
  // ghost markers ride along with the nearest upcoming beat (the renderer draws 'next' notes from there)
  const stageUpcoming = useMemo(() => {
    const up = ghosts.length ? [[...ghosts, ...(state.upcoming[0] ?? [])], ...state.upcoming.slice(1)] : state.upcoming;
    return capo ? up.map((b) => withCapo(b, capo)) : up;
  }, [state.upcoming, ghosts, capo]);

  useEffect(() => {
    setTabView(tabView);
  }, [tabView, setTabView]);
  useEffect(() => {
    setTabScale(focus === 'tab' ? 1.6 : 0.95);
  }, [focus, setTabScale, state.score]);
  useEffect(() => {
    const a = api.current;
    if (!a || !state.score) return;
    a.playbackRange = loop ? barRange(state.score, loop[0], loop[1]) : null;
    a.isLooping = !!loop;
  }, [loop, api, state.score, state.midiGen]);

  /* ---------- Derived ---------- */
  const barCount = state.score?.masterBars.length ?? 0;
  const linearTicks = !!state.score && !hasRepeats(state.score);
  const barTicks = useMemo(() => (state.score && linearTicks ? state.score.masterBars.map((m) => m.start) : null), [state.score, linearTicks]);
  const loopTicks = useMemo<[number, number] | null>(() => {
    if (!loop || !state.score || !linearTicks) return null;
    const r = barRange(state.score, loop[0], loop[1]);
    return [r.startTick, r.endTick];
  }, [loop, state.score, linearTicks]);

  const sections = useMemo(() => (state.score ? computeSections(state.score.masterBars) : []), [state.score]);
  const activeSection = sectionAt(sections, state.currentBar);
  /* ---------- Strum pattern ---------- */
  // Guitar Pro files with pick strokes (down/up) get a strum pattern from the score.
  const strum = useMemo(() => (state.score ? strumFromScore(state.score)?.analysis ?? null : null), [state.score]);
  // Bar and 16th slot as one number (bar * 16 + slot), so the player re-renders 16 times a bar
  // while a strum pattern is shown, not on every position event.
  const strumSlot = usePosition(position, (pos) => {
    const score = state.score;
    if (!strum || !score) return -1;
    let bar = state.currentBar;
    let rel: number;
    if (barTicks) {
      // bar from the tick itself (the beat-driven bar index lags a little at bar lines)
      let lo = 0;
      let hi = barTicks.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (barTicks[mid] <= pos.tick) lo = mid;
        else hi = mid - 1;
      }
      bar = lo;
      rel = pos.tick - barTicks[bar];
    } else rel = state.beat?.playbackStart ?? 0;
    const mb = score.masterBars[bar];
    if (!mb) return -1;
    return bar * 16 + Math.min(15, Math.max(0, Math.floor(rel / (mb.calculateDuration() / 16))));
  });
  const strumPos = useMemo<StrumPos | null>(() => (strumSlot < 0 ? null : { bar: Math.floor(strumSlot / 16), slot: strumSlot % 16 }), [strumSlot]);
  const density = useMemo(() => {
    const bars = state.track?.staves[0]?.bars;
    return bars && barTicks && bars.length === barTicks.length ? normalize(barDensity(bars)) : null;
  }, [state.track, barTicks]);

  /* ---------- Count-in (visual) ---------- */
  const wasPlaying = useRef(false);
  const countStart = useRef(0);
  useEffect(() => {
    const was = wasPlaying.current;
    wasPlaying.current = state.playing;
    if (!state.playing) {
      setCountValue(null);
      return;
    }
    if (was || !countIn || listening || !state.score) return;
    const mb = state.score.masterBars[state.currentBar] ?? state.score.masterBars[0];
    const beats = mb?.timeSignatureNumerator || 4;
    const unitMs = (60000 / ((state.score.tempo || 120) * speed)) * (4 / (mb?.timeSignatureDenominator || 4));
    countStart.current = position.get().tick;
    let left = beats;
    setCountValue(left);
    const id = window.setInterval(() => {
      left -= 1;
      setCountValue(left > 0 ? left : null);
      if (left <= 0) clearInterval(id);
    }, unitMs);
    return () => clearInterval(id);
    // Rising edge of `playing` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.playing]);
  // Hide as soon as the song itself moves.
  const counting = countValue != null;
  useEffect(() => {
    if (!counting) return;
    return position.subscribe(() => {
      if (position.get().tick > countStart.current + 30) setCountValue(null);
    });
  }, [counting, position]);
  const pausedMidSong = usePosition(position, (p) => p.timeMs > 500);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /* ---------- Session recording ---------- */
  const sessionTitle = meta?.title || state.score?.title || (tabId ? 'Tab' : 'Lesson');
  const recorder = useSessionRecorder({ active: state.playing || listening, kind: source.kind, refId: source.id, title: sessionTitle });

  /* ---------- Listen and wait ---------- */
  const onPass = useCallback((p: PassSummary) => {
    if (p.hits === 0) return;
    recorder.noteAccuracy(p.accuracy);
    setLastPass(p);
    setFeedbackOpen(true);
  }, [recorder]);
  const pause = useCallback(() => api.current?.pause(), [api]);
  const listen = useListenMode({ enabled: listening, beat: state.beat, track: state.track, loop, seekBeat, pause, onPass });
  useEffect(() => {
    if (listen.status === 'denied' || listen.status === 'unsupported' || listen.status === 'error') {
      setListening(false);
      toast({
        tone: 'danger',
        title: listen.status === 'unsupported' ? 'Microphone not supported' : 'Couldn\'t access the microphone',
        description: listen.status === 'denied' ? 'Allow microphone access in your browser settings and try again.' : 'Listen mode isn\'t available in this browser.',
      });
    }
  }, [listen.status, toast]);

  /* ---------- Actions ---------- */
  const playPause = useCallback(() => {
    if (listening) setListening(false);
    if (trainerOn && state.playing) setTrainerOn(false);
    api.current?.playPause();
  }, [api, listening, trainerOn, state.playing]);
  const stop = useCallback(() => {
    setTrainerOn(false);
    api.current?.stop();
  }, [api]);
  /** Recording / take overlay: same position and speed, start now. */
  const playFrom = useCallback((tick: number, spd: number) => {
    const a = api.current;
    if (!a) return;
    setListening(false);
    setSpeed(spd);
    a.playbackSpeed = spd;
    seekTick(tick);
    a.play();
  }, [api, seekTick]);
  const stepBar = useCallback((d: number) => seekBar(state.currentBar + d), [seekBar, state.currentBar]);

  const toggleLoopCurrent = useCallback(() => {
    setAbPending(null);
    setLoop((l) => (l ? null : [state.currentBar, state.currentBar]));
  }, [state.currentBar]);

  const loopAB = useCallback(() => {
    if (loop) {
      setLoop(null);
      return;
    }
    if (abPending == null) {
      setAbPending(state.currentBar);
      return;
    }
    setLoop([Math.min(abPending, state.currentBar), Math.max(abPending, state.currentBar)]);
    setAbPending(null);
  }, [loop, abPending, state.currentBar]);

  const onBarClick = useCallback((bar: number, extend: boolean) => {
    setAbPending(null);
    setLoop((l) => {
      if (extend && l) return [Math.min(l[0], bar), Math.max(l[1], bar)];
      if (l && l[0] === bar && l[1] === bar) return null;
      return [bar, bar];
    });
    if (report) setSpeed(ladder.speed);
  }, [report, ladder.speed]);

  useEffect(() => {
    let alive = true;
    setTabProgress(null);
    getProgress(tabKey).then((p) => alive && setTabProgress(p)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [tabKey]);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const songBpm = state.score ? Math.round(state.score.tempo) : null;

  /* ---------- Speed trainer ---------- */
  const section = useMemo(() => (loop && tabProgress ? tabProgress.sections.find((x) => x.startBar === loop[0] && x.endBar === loop[1]) ?? null : null), [loop, tabProgress]);

  /** One pass through the loop, judged clean or not (microphone score or the player's own verdict). */
  const applyPass = useCallback((result: 'clean' | 'miss', info: { score?: number; mode: 'mic' | 'manual' } = { mode: 'manual' }) => {
    const cur = ladderRef.current;
    const st = settingsRef.current;
    const { state: next, event } = ladderStep(cur, result, { step: st.ladderStep, failPasses: st.ladderFailPasses });
    setLadder(next);
    const played = api.current?.playbackSpeed ?? cur.speed;
    if (result === 'clean') recorder.noteClean(played);
    const l = loopRef.current;
    // Prefer section-level BPM (from progress) over song-level BPM, as songs may have tempo changes
    const passBpm = section?.bpm ?? songBpm;
    if (l) {
      recordPass(tabKey, { startBar: l[0], endBar: l[1], speed: played, clean: result === 'clean', mode: info.mode, ...(info.score != null ? { score: info.score } : {}), ...(passBpm ? { bpm: passBpm } : {}) })
        .then(setTabProgress)
        .catch(() => {});
    }
    if (event === 'up' || event === 'down') {
      setSpeed(next.speed);
      if (api.current) api.current.playbackSpeed = next.speed;
    }
    const pct = `${Math.round(next.speed * 100)}%`;
    const toastBpm = passBpm;
    if (event === 'up') {
      toast({ tone: 'success', title: `${cur.passes} clean ${cur.passes === 1 ? 'pass' : 'passes'}! Speed is now ${pct}.`, description: toastBpm ? `${Math.round(toastBpm * next.speed)} BPM. Same section, a little faster.` : 'Same section, a little faster.' });
    } else if (event === 'target') {
      if (trainerOnRef.current) {
        api.current?.pause();
        setTrainerOn(false);
      }
      toast({ tone: 'success', title: `Clean at ${pct}: section done.`, description: 'Pick the next hard section, or turn on “Keep going to 110%”.' });
    } else if (event === 'down') {
      toast({ tone: 'info', title: `Two passes in a row weren't clean. Speed back to ${pct}.`, description: 'Slower for a moment, then climb again.' });
    }
  }, [recorder, toast, api, tabKey, songBpm, section]);
  const onClean = useCallback(() => applyPass('clean'), [applyPass]);
  const onStuck = useCallback(() => applyPass('miss'), [applyPass]);
  const hardest = useMemo(() => {
    const bars = state.track?.staves[0]?.bars;
    if (!report || !bars) return null;
    const dens = barDensity(bars);
    return pickHardestSection(report.bars.map((b) => ({ bar: b.bar, score: b.score, playable: (dens[b.bar] ?? 0) > 0 })));
  }, [report, state.track]);

  const restoreMarks = useRef<(() => void) | null>(null);
  const clearMarks = useCallback(() => {
    if (!restoreMarks.current) return;
    restoreMarks.current();
    restoreMarks.current = null;
    api.current?.render();
  }, [api]);
  const flashTimer = useRef(0);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const trackRef = useRef(state.track);
  trackRef.current = state.track;

  const onTrainerPass = useCallback((p: TrainerPass) => {
    if (!p.score) {
      setAwaitingVerdict(true);
      return;
    }
    const threshold = settingsRef.current.ladderCleanAccuracy;
    setTrainerPass(p);
    recorder.noteAccuracy(p.score.score);
    applyPass(passResult(p.score.score, threshold), { score: p.score.score, mode: 'mic' });
    const t = trackRef.current;
    if (t) {
      restoreMarks.current?.();
      restoreMarks.current = markPassNotes(t, p.score.notes);
      api.current?.render();
    }
    setFlash(problemMarkers(p.score.notes));
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash([]), 2500);
  }, [applyPass, recorder, api]);

  const trainer = useSpeedTrainer({
    api,
    track: state.track,
    loop,
    active: trainerOn,
    mic: settings.trainerMic,
    latencyMs: settings.latencyMs ?? 0,
    toleranceMs: settings.timingToleranceMs,
    onPass: onTrainerPass,
  });
  useEffect(() => {
    const st = trainer.micStatus;
    if (trainerOn && (st === 'denied' || st === 'unsupported' || st === 'error')) {
      setSettings({ trainerMic: false });
      toast({ tone: 'info', title: 'No microphone: switched to manual mode.', description: st === 'denied' ? 'Allow microphone access to have each pass scored. Until then, press Clean or Not clean after each pass.' : 'Press Clean or Not clean after each pass.' });
    }
  }, [trainer.micStatus, trainerOn, setSettings, toast]);

  const restartClimb = useCallback(() => {
    const st = settingsRef.current;
    const l = startLadder({ start: st.ladderStart, target: st.ladderTarget, passes: st.ladderPasses });
    setLadder(l);
    setSpeed(l.speed);
    if (api.current) api.current.playbackSpeed = l.speed;
    setAwaitingVerdict(false);
    setTrainerPass(null);
  }, [api]);

  const startTrainer = useCallback(() => {
    const range = loop ?? hardest;
    if (!range) return;
    if (!loop) setLoop(range);
    setAbPending(null);
    setListening(false);
    restartClimb();
    clearMarks();
    setTrainerOn(true);
    seekBar(range[0]);
    // after the loop range reached alphaTab
    window.setTimeout(() => api.current?.play(), 60);
  }, [loop, hardest, restartClimb, clearMarks, seekBar, api]);
  const stopTrainer = useCallback(() => {
    api.current?.pause();
    setTrainerOn(false);
    setAwaitingVerdict(false);
    setFlash([]);
  }, [api]);
  // a new section restarts the climb
  const loopKey = loop ? `${loop[0]}-${loop[1]}` : '';
  useEffect(() => {
    if (trainerOnRef.current) restartClimb();
    clearMarks();
  }, [loopKey, restartClimb, clearMarks]);
  const practiceHardest = useCallback(() => {
    if (!hardest) return;
    setAbPending(null);
    setLoop(hardest);
    seekBar(hardest[0]);
  }, [hardest, seekBar]);
  const onManualVerdict = useCallback((clean: boolean) => {
    setAwaitingVerdict(false);
    applyPass(clean ? 'clean' : 'miss', { mode: 'manual' });
  }, [applyPass]);

  const pickBar = useCallback((bar: number) => {
    setAbPending(null);
    setLoop([bar, bar]);
    setSpeed(ladder.speed);
    seekBar(bar);
  }, [ladder.speed, seekBar]);

  const playLoop = useCallback(() => {
    if (loop) seekBar(loop[0]);
    if (!state.playing) api.current?.play();
  }, [loop, seekBar, state.playing, api]);

  const goSection = useCallback((i: number, loopIt: boolean) => {
    const sec = sections[i];
    if (!sec) return;
    setAbPending(null);
    if (loopIt) setLoop([sec.startBar, sec.endBar]);
    else if (loop && (sec.startBar < loop[0] || sec.startBar > loop[1])) setLoop(null);
    seekBar(sec.startBar);
  }, [sections, loop, seekBar]);
  const nextSection = () => goSection(nextSectionIndex(sections, state.currentBar), false);

  const onMix = (m: Mix) => {
    setMuted(m === 'metronome');
    if (m !== 'metronome' && guitarVol === 0) setGuitarVol(1);
    setMetronome(m !== 'guitar');
  };
  const zoomBy = (d: number) => setSettings({ stageZoom: clampZoom(stageZoom + d * 0.15) });
  const setFocus = (f: 'neck' | 'tab') => setSettings(f === 'tab' ? { focus: f, showTabStrip: true } : { focus: f });
  const speedKey = (d: number) => (e: KeyboardEvent) => {
    const z = zoomDelta(e);
    if (z) zoomBy(z);
    else setSpeed((s) => clampSpeed(s + d * 0.05));
  };

  const setView = (v: GuitarView) => setSettings({ view: v });
  const setCamera = (m: CameraMode) => setSettings({ cameraMode: m });
  const toggleTab = () => setSettings({ showTabStrip: !showTab });
  const togglePractice = () => setSettings({ showPractice: !showPractice });

  useHotkeys({
    Space: playPause,
    ArrowLeft: () => stepBar(-1),
    ArrowRight: () => stepBar(1),
    Home: stop,
    l: toggleLoopCurrent,
    m: () => setMetronome((v) => !v),
    '-': speedKey(-1),
    '+': speedKey(1),
    _: () => zoomBy(-1),
    s: nextSection,
    f: fs.toggle,
    n: () => setFocus(focus === 'tab' ? 'neck' : 'tab'),
    '=': () => setSpeed((s) => clampSpeed(s + 0.05)),
    '1': () => setCamera(CAMERA_MODES[0].value),
    '2': () => setCamera(CAMERA_MODES[1].value),
    '3': () => setCamera(CAMERA_MODES[2].value),
    '4': () => setCamera(CAMERA_MODES[3].value),
    v: () => setView(view === 'player' ? 'audience' : 'player'),
    t: toggleTab,
    p: togglePractice,
    '?': () => setShortcutsOpen(true),
    Escape: () => showPractice && window.innerWidth < 1100 && togglePractice(),
  });

  const copyShareLink = useCallback(() => {
    const hash = buildShareHash({ source, guitarId: sharedGuitar?.id ?? getActiveGuitar().id, loop: loop ?? undefined, speed });
    const url = `${location.origin}${location.pathname}${hash}`;
    const local = source.kind === 'tab';
    const note = local ? 'Tabs you uploaded are stored in this browser: the link opens them only here.' : 'Built-in lessons open in any Guitar3D.';
    (navigator.clipboard?.writeText(url) ?? Promise.reject())
      .then(() => toast({ tone: 'success', title: 'Share link copied.', description: note }))
      .catch(() => toast({ tone: 'info', title: 'Link', description: url, durationMs: 12000 }));
  }, [source, sharedGuitar, loop, speed, toast]);

  /* ---------- View ---------- */
  const title = meta?.title || state.score?.title || (tabId ? 'Tab' : 'Lesson');
  const subtitle = [
    source.kind === 'lesson' ? 'Lesson' : state.score?.artist || meta?.artist || '',
    state.score ? `${Math.round(state.score.tempo)} BPM` : '',
  ].filter(Boolean).join(' · ');
  const busy = fetching || state.loading;
  const hasScore = !!state.score && !loadErr;
  const failed = !!(loadErr || state.error);
  // One loading state for the whole stage: tab, guitar (incl. textures) and sound.
  const loadingLabel = failed ? null : busy || !state.score ? 'Loading tab…' : !guitarReady ? 'Preparing guitar…' : !state.ready ? 'Preparing sound…' : null;
  // The loading screen's steps run in parallel; the bar is their weighted sum.
  const loadSteps: LoadStep[] = [
    { label: 'Loading tab', progress: hasScore ? 1 : busy ? 0.4 : 0.1, weight: 1 },
    { label: 'Building your guitar', progress: guitarReady ? 1 : 0.1 + 0.75 * textureProgress, weight: 2 },
    { label: 'Loading sounds', progress: state.ready ? 1 : 0.95 * state.soundProgress, weight: 2 },
  ];

  return (
    <div ref={root} className={`player${showPractice ? ' practice-open' : ''}${focus === 'tab' && showTab ? ' focus-tab' : ''}${loadingLabel ? ' is-loading' : ''}`}>
      {/* One loading screen over the whole player until tab, guitar and sound are ready (no half-built UI). */}
      <div className={`load-screen${loadingLabel ? '' : ' is-done'}`} aria-hidden={!loadingLabel}>
        <IconButton className="load-screen-back" label="Back to library" icon={<ArrowLeft size={18} />} onClick={() => navigate({ name: 'library' })} />
        <LoadingProgress title={title} steps={loadSteps} />
      </div>
      <PlayerTopBar
        title={title}
        subtitle={subtitle}
        view={view}
        onView={setView}
        cameraMode={cameraMode}
        onCameraMode={setCamera}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onShare={copyShareLink}
        onBack={() => navigate({ name: 'library' })}
        tracks={state.score ? playableTracks(state.score).map((t) => ({ index: t.index, name: t.name })) : undefined}
        trackIndex={state.track?.index}
        onTrack={selectTrack}
      />

      <CueStrip
        beat={hasScore ? state.beat : null}
        track={state.track}
        currentBar={state.currentBar}
        barCount={barCount}
        sections={sections}
        activeSection={activeSection}
        loop={loop}
        onSection={goSection}
        pulse={state.playing && countValue == null ? { n: state.pulse, beat: state.beatInBar } : null}
        listen={listening ? { feedback: listen.feedback, hits: listen.pass.hits, firstTry: listen.pass.firstTry, status: listen.status === 'asking' ? 'Microphone permission…' : '' } : null}
      />

      <div className="player-body">
        <main className="stage" aria-label="3D guitar">
          <ErrorBoundary
            onError={() => setGuitarReady(true)}
            fallback={(retry) => (
              <div className="stage-center">
                <div className="stage-card">
                  <EmptyState
                    tone="danger"
                    icon={<Box size={22} />}
                    title="Couldn't show the 3D stage"
                    description="Your browser may not support WebGL. The tab and sound keep working."
                    action={<Button onClick={retry}>Try again</Button>}
                  />
                </div>
              </div>
            )}
          >
            <StageGuitar
              className="stage-canvas"
              profile={sharedGuitar}
              notes={stageNotes}
              beatId={state.beatId}
              getBeatProgress={getBeatProgress}
              playing={state.playing}
              upcoming={stageUpcoming}
              capoFret={capo}
              zoom={stageZoom}
              showFretNumbers={showFretNumbers}
              view={view}
              cameraMode={cameraMode}
              onCameraModeChange={setCamera}
              onReady={() => setGuitarReady(true)}
            />
          </ErrorBoundary>

          {hasScore && !loadingLabel && (
            <div className="stage-hud" aria-live="off">
              {share && <span className="hud-chip">Shared view</span>}
              {barNotes.notes.filter((n) => n.bar === state.currentBar).slice(0, 1).map((n) => (
                <span key={n.id} className="hud-chip hud-note" title={n.text}>Note: {n.text}</span>
              ))}
              {listening && <span className="hud-chip hud-accent">Listening: play the note</span>}
              {trainerOn && <span className="hud-chip hud-accent num">Speed trainer · {Math.round(ladder.speed * 100)}%{trainerPass?.score ? ` · last pass ${trainerPass.score.score}%` : ''}</span>}
              {loop && (
                <span className="hud-chip hud-accent num">
                  Loop {loop[0] + 1}{loop[1] !== loop[0] ? `–${loop[1] + 1}` : ''}
                </span>
              )}
              {speed !== 1 && <span className="hud-chip num">{Math.round(speed * 100)}% speed</span>}
              {capo > 0 && <span className="hud-chip hud-capo num">Capo fret {capo}</span>}
              {tuningOverride && tuningOverride !== 'standard' && <span className="hud-chip">{getTuning(tuningOverride).label}</span>}
              {!state.playing && pausedMidSong && <span className="hud-chip">Paused</span>}
            </div>
          )}

          {hasScore && strum && (rhythmHidden ? (
            <Button size="sm" className="rhythm-reopen" icon={<ArrowDownUp size={14} />} onClick={() => setRhythmHidden(false)}>Strum pattern</Button>
          ) : (
            <RhythmPanel
              className="rhythm-dock"
              analysis={strum}
              pos={strumPos}
              playing={state.playing}
              onPracticeStart={() => api.current?.pause()}
              onClose={() => setRhythmHidden(true)}
            />
          ))}
          {hasScore && !loadingLabel && <CountIn value={countValue} />}
          {hasScore && (
            <StageTools
              zoom={stageZoom}
              onZoom={(z) => setSettings({ stageZoom: clampZoom(z) })}
              focus={focus}
              onFocus={setFocus}
              fullscreen={fs.on}
              fullscreenSupported={fs.supported}
              onFullscreen={fs.toggle}
              extra={origin ? (
                <CapoControl
                  capo={capo}
                  onCapo={(c) => setSetup({ capo: c })}
                  tuningId={tuningOverride}
                  onTuning={(id) => setSetup({ tuningId: id })}
                  tabTuning={origin.tuning}
                />
              ) : null}
            />
          )}

          {failed && (
            <div className="stage-center">
              <div className="stage-card">
                <EmptyState
                  tone="danger"
                  icon={<FileMusic size={22} />}
                  title="Couldn't open the tab"
                  description={loadErr ?? `${state.error} The file may be corrupt or in an unsupported format.`}
                  action={
                    <>
                      <Button icon={<ArrowLeft size={16} />} onClick={() => navigate({ name: 'library' })}>Library</Button>
                      {source.id !== DEMO_LESSON_ID && <Button variant="primary" icon={<GraduationCap size={16} />} onClick={() => navigate(playLesson(DEMO_LESSON_ID))}>Start with a lesson</Button>}
                    </>
                  }
                />
              </div>
            </div>
          )}
        </main>

        <Drawer open={showPractice} onClose={togglePractice} title="Practice" shortcut="P" className="practice-drawer">
          {lastPass && (
            <Button size="sm" variant="ghost" className="fb-open" onClick={() => setFeedbackOpen(true)}>
              Last pass summary · {lastPass.accuracy}%
            </Button>
          )}
          {report && (
            <SpeedTrainerPanel
              active={trainerOn}
              onStart={startTrainer}
              onStop={stopTrainer}
              ladder={ladder}
              loop={loop}
              onHardest={practiceHardest}
              hardest={hardest}
              micStatus={trainer.micStatus}
              lastPass={trainerPass}
              onDetails={() => setTrainerSheet(true)}
              awaiting={awaitingVerdict}
              onManual={onManualVerdict}
              bpm={section?.bpm ?? songBpm}
              section={section}
              onCalibrate={() => setCalOpen(true)}
            />
          )}
          <Coach
            report={report}
            currentBar={state.currentBar}
            loop={loop}
            onBarClick={onBarClick}
            ladder={ladder}
            onClean={onClean}
            onStuck={onStuck}
            playing={state.playing}
            speed={speed}
            onPickBar={pickBar}
            onSlowDown={() => setSpeed(ladder.speed)}
            onPlay={playLoop}
          />
          {report && <EasierPositionPanel on={easierOn} onToggle={setEasierOn} bar={state.currentBar} data={easier} />}
          {hasScore && <NotesPanel tabKey={tabKey} notes={barNotes.notes} refresh={barNotes.refresh} currentBar={state.currentBar} onSeekBar={seekBar} />}
          {hasScore && <RecordPanel tabKey={tabKey} playing={state.playing} getTick={() => position.get().tick} speed={speed} onPlayFrom={playFrom} onPause={pause} />}
        </Drawer>
      </div>

      <section className={`tabpanel view-${tabView}${showTab && !failed ? '' : ' collapsed'}`} aria-label="Tab strip" aria-hidden={!showTab || failed}>
        <div className="tabpanel-scroll" ref={scroller}>
          <div ref={host} />
        </div>
      </section>

      <Transport
        ready={state.ready && !loadingLabel}
        hasScore={hasScore}
        playing={state.playing}
        position={position}
        barTicks={barTicks}
        loopTicks={loopTicks}
        density={density}
        currentBar={state.currentBar}
        barCount={barCount}
        onPlayPause={playPause}
        onStop={stop}
        onSeek={seekTick}
        onStepBar={stepBar}
        speed={speed}
        onSpeed={(v) => setSpeed(clampSpeed(v))}
        bpm={state.score ? state.score.tempo : null}
        metronome={metronome}
        onMetronome={setMetronome}
        metroVol={metroVol}
        onMetroVol={(v) => setSettings({ metronomeVolume: v })}
        countIn={countIn}
        onCountIn={setCountIn}
        guitarVol={guitarVol}
        onGuitarVol={setGuitarVol}
        muted={muted}
        onMuted={setMuted}
        loop={loop}
        abPending={abPending}
        onLoopAB={loopAB}
        onClearLoop={() => setLoop(null)}
        showTab={showTab}
        onToggleTab={toggleTab}
        tabView={tabView}
        onTabView={(v) => setSettings({ tabView: v })}
        program={program}
        onProgram={(v) => setSettings({ program: v })}
        onMix={onMix}
        listening={listening}
        listenDisabled={!hasScore}
        onListen={(on) => {
          if (on) setTrainerOn(false);
          setListening(on);
        }}
        practiceOpen={showPractice}
        onPractice={togglePractice}
      />

      <FeedbackSheet
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        pass={lastPass}
        onRetry={() => setFeedbackOpen(false)}
        onLoop={(r) => {
          setFeedbackOpen(false);
          setAbPending(null);
          setLoop(r);
          setSpeed(ladderRef.current.speed);
          seekBar(r[0]);
        }}
      />

      <TrainerFeedbackSheet
        open={trainerSheet}
        onOpenChange={setTrainerSheet}
        pass={trainerPass}
        threshold={settings.ladderCleanAccuracy}
        onLoop={(r) => {
          setTrainerSheet(false);
          setAbPending(null);
          setLoop(r);
          seekBar(r[0]);
        }}
      />
      <CalibrationDialog open={calOpen} onOpenChange={setCalOpen} />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} title="Keyboard shortcuts" description="You can do everything from the keyboard too.">
        <ShortcutList />
      </Dialog>
    </div>
  );
}
