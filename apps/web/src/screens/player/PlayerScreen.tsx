import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Box, FileMusic, GraduationCap } from 'lucide-react';
import type { CameraMode, GuitarView, TabMeta, TabProgress } from '@guitar3d/shared';
import { api as server } from '../../api';
import type { Mix } from '../../audio/sounds';
import { barDensity, normalize } from '../../player/beats';
import { computeSections, nextSectionIndex, sectionAt } from '../../player/sections';
import { getTuning, withCapo } from '../../music/tunings';
import { useSessionRecorder } from '../../player/useSessionRecorder';
import { useRun } from '../routines/routineStore';
import { useTabSetup } from '../../player/tabSetup';
import { ladderStep, passResult, startLadder, type LadderState } from '../../player/tempoLadder';
import { barRange, hasRepeats, useAlphaTab } from '../../player/useAlphaTab';
import { useListenMode, type PassSummary } from '../../player/useListenMode';
import { analyze } from '../../tips/analyze';
import { toSimpleBars } from '../../tips/model';
import { Coach } from '../../ui/Coach';
import { LadderPanel } from '../../ui/LadderPanel';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { Button, Dialog, Drawer, EmptyState, Spinner, useToast } from '../../ui/kit';
import { DEMO_LESSON_ID, navigate, playLesson, type PlaySource } from '../../ui/router';
import { markPlayed, useSettings } from '../../ui/settings';
import { useHotkeys, zoomDelta } from '../../ui/shortcuts';
import { ShortcutList } from '../../ui/ShortcutList';
import { fetchTabFile, listTabs } from '../data';
import { loadLesson } from '../library/lessons';
import { CAMERA_MODES, PlayerTopBar } from './PlayerTopBar';
import { CapoControl } from './CapoControl';
import { FeedbackSheet } from './FeedbackSheet';
import { CueStrip } from './CueStrip';
import { EasierPositionPanel, ghostNotes, useEasierPosition } from './EasierPosition';
import { StageGuitar } from './StageGuitar';
import { clampZoom, CountIn, StageTools, useFullscreen } from './StageTools';
import { Transport } from './Transport';

const clampSpeed = (v: number) => Math.min(1.5, Math.max(0.25, Math.round(v * 100) / 100));

export function PlayerScreen({ source }: { source: PlaySource }) {
  const tabId = source.kind === 'tab' ? source.id : null;
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const { api, state, loadBuffer, loadTex, seekTick, seekBar, seekBeat, setProgram, setTabScale } = useAlphaTab(host, scroller);
  const [settings, setSettings] = useSettings();
  const toast = useToast();

  const [meta, setMeta] = useState<Pick<TabMeta, 'title' | 'artist'> | null>(null);
  const [guitarReady, setGuitarReady] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [speed, setSpeed] = useState(settings.defaultSpeed);
  const [metronome, setMetronome] = useState(settings.metronome);
  const [countIn, setCountIn] = useState(settings.countIn);
  const [guitarVol, setGuitarVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState<[number, number] | null>(null);
  const [abPending, setAbPending] = useState<number | null>(null);
  const [ladder, setLadder] = useState<LadderState>(() => startLadder({ start: 1, target: 1, passes: 3 }));
  const [autoLadder, setAutoLadder] = useState(false);
  const ladderRef = useRef(ladder);
  ladderRef.current = ladder;
  const applyPassRef = useRef<(r: 'clean' | 'miss') => void>(() => {});
  const [listening, setListening] = useState(false);
  const [lastPass, setLastPass] = useState<PassSummary | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [countValue, setCountValue] = useState<number | null>(null);

  const [setup, setSetup] = useTabSetup(source.kind === 'lesson' ? `lesson:${source.id}` : source.id);

  const { view, cameraMode, showTabStrip: showTab, showPractice, metronomeVolume: metroVol, program, showFretNumbers, stageZoom, focus } = settings;
  const fs = useFullscreen(useCallback(() => root.current, []));

  /* ---------- Loading ---------- */
  useEffect(() => {
    let alive = true;
    setLoadErr(null);
    setMeta(null);
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
    setAutoLadder(false);
    setSpeed(settings.defaultSpeed);
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
  const stageNotes = useMemo(() => withCapo(ghosts.length ? [...state.notes, ...ghosts] : state.notes, capo), [state.notes, ghosts, capo]);
  // ghost markers ride along with the nearest upcoming beat (the renderer draws 'next' notes from there)
  const stageUpcoming = useMemo(() => {
    const up = ghosts.length ? [[...ghosts, ...(state.upcoming[0] ?? [])], ...state.upcoming.slice(1)] : state.upcoming;
    return capo ? up.map((b) => withCapo(b, capo)) : up;
  }, [state.upcoming, ghosts, capo]);

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
    countStart.current = state.tick;
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
  useEffect(() => {
    if (countValue != null && state.tick > countStart.current + 30) setCountValue(null);
  }, [state.tick, countValue]);

  const autoRef = useRef(autoLadder);
  autoRef.current = autoLadder;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /* ---------- Session recording ---------- */
  const sessionTitle = meta?.title || state.score?.title || (tabId ? 'Tab' : 'Ders');
  // A running routine records its own time, so the player does not count it twice.
  const routineRunning = !!useRun();
  const recorder = useSessionRecorder({ active: state.playing || listening, kind: source.kind, refId: source.id, title: sessionTitle, disabled: routineRunning });

  /* ---------- Listen and wait ---------- */
  const onPass = useCallback((p: PassSummary) => {
    if (p.hits === 0) return;
    recorder.noteAccuracy(p.accuracy);
    setLastPass(p);
    if (autoRef.current) {
      // The ladder drives the loop; the summary stays one click away in the practice drawer.
      applyPassRef.current(passResult(p.accuracy, settingsRef.current.ladderCleanAccuracy));
      return;
    }
    setFeedbackOpen(true);
  }, [recorder]);
  const pause = useCallback(() => api.current?.pause(), [api]);
  const listen = useListenMode({ enabled: listening, beat: state.beat, track: state.track, loop, seekBeat, pause, onPass });
  useEffect(() => {
    if (listen.status === 'denied' || listen.status === 'unsupported' || listen.status === 'error') {
      setListening(false);
      toast({
        tone: 'danger',
        title: listen.status === 'unsupported' ? 'Mikrofon desteklenmiyor' : 'Mikrofona erişilemedi',
        description: listen.status === 'denied' ? 'Tarayıcı ayarlarından mikrofon izni verip tekrar dene.' : 'Bu tarayıcıda dinleme modu kullanılamıyor.',
      });
    }
  }, [listen.status, toast]);

  /* ---------- Actions ---------- */
  const playPause = useCallback(() => {
    if (listening) setListening(false);
    api.current?.playPause();
  }, [api, listening]);
  const stop = useCallback(() => api.current?.stop(), [api]);
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

  const saveProgress = useCallback((best: number) => {
    if (!tabId || !loop) return;
    server.getProgress(tabId).then((p: TabProgress) => {
      const others = p.sections.filter((s) => !(s.startBar === loop[0] && s.endBar === loop[1]));
      const prev = p.sections.find((s) => s.startBar === loop[0] && s.endBar === loop[1]);
      return server.putProgress({ tabId, sections: [...others, { startBar: loop[0], endBar: loop[1], bestCleanSpeed: Math.max(best, prev?.bestCleanSpeed ?? 0), updatedAt: new Date().toISOString() }] });
    }).catch(() => {});
  }, [tabId, loop]);

  /** One pass through the loop, judged clean or missed (buttons or listen-mode accuracy). */
  const applyPass = useCallback((result: 'clean' | 'miss') => {
    const cur = ladderRef.current;
    const { state: next, event } = ladderStep(cur, result);
    setLadder(next);
    if (result === 'clean') recorder.noteClean(cur.speed);
    if (event === 'up' || event === 'down') setSpeed(next.speed);
    const pct = `%${Math.round(next.speed * 100)}`;
    if (event === 'up') {
      saveProgress(cur.speed);
      toast({ tone: 'success', title: `${cur.passes} temiz tur! Hız ${pct} oldu.`, description: 'Aynı bölümü yeni hızda dene.' });
    } else if (event === 'target') {
      saveProgress(cur.speed);
      toast({ tone: 'success', title: 'Hedef hıza ulaştın.', description: 'Bu bölüm tamam. Haritadan sıradaki zor ölçüyü seç.' });
    } else if (event === 'down' && autoRef.current) {
      toast({ tone: 'info', title: `Hız ${pct} oldu`, description: 'Bir tur takıldı; biraz yavaşlayıp tekrar dene.' });
    }
  }, [recorder, saveProgress, toast]);
  applyPassRef.current = applyPass;
  const onClean = useCallback(() => applyPass('clean'), [applyPass]);
  const onStuck = useCallback(() => applyPass('miss'), [applyPass]);

  const restartLadder = useCallback((cfg: { start: number; target: number; passes: number }) => {
    const l = startLadder(cfg);
    setLadder(l);
    setSpeed(l.speed);
  }, []);
  const toggleAutoLadder = useCallback((on: boolean) => {
    setAutoLadder(on);
    if (on) restartLadder({ start: settings.ladderStart, target: settings.ladderTarget, passes: settings.ladderPasses });
  }, [restartLadder, settings.ladderStart, settings.ladderTarget, settings.ladderPasses]);

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

  /* ---------- View ---------- */
  const title = meta?.title || state.score?.title || (tabId ? 'Tab' : 'Ders');
  const subtitle = [
    source.kind === 'lesson' ? 'Ders' : state.score?.artist || meta?.artist || '',
    state.score ? `${Math.round(state.score.tempo)} BPM` : '',
  ].filter(Boolean).join(' · ');
  const busy = fetching || state.loading;
  const hasScore = !!state.score && !loadErr;
  const failed = !!(loadErr || state.error);
  // One loading state for the whole stage: tab, guitar (incl. textures) and sound.
  const loadingLabel = failed ? null : busy || !state.score ? 'Tab yükleniyor…' : !guitarReady ? 'Gitar hazırlanıyor…' : !state.ready ? 'Ses hazırlanıyor…' : null;

  return (
    <div ref={root} className={`player${showPractice ? ' practice-open' : ''}${focus === 'tab' && showTab ? ' focus-tab' : ''}`}>
      <PlayerTopBar
        title={title}
        subtitle={subtitle}
        view={view}
        onView={setView}
        cameraMode={cameraMode}
        onCameraMode={setCamera}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onBack={() => navigate({ name: 'library' })}
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
        listen={listening ? { feedback: listen.feedback, hits: listen.pass.hits, firstTry: listen.pass.firstTry, status: listen.status === 'asking' ? 'Mikrofon izni…' : '' } : null}
      />

      <div className="player-body">
        <main className="stage" aria-label="3D gitar">
          <ErrorBoundary
            onError={() => setGuitarReady(true)}
            fallback={(retry) => (
              <div className="stage-center">
                <div className="stage-card">
                  <EmptyState
                    tone="danger"
                    icon={<Box size={22} />}
                    title="3D sahne gösterilemedi"
                    description="Tarayıcın WebGL'i desteklemiyor olabilir. Tab ve ses çalışmaya devam eder."
                    action={<Button onClick={retry}>Tekrar dene</Button>}
                  />
                </div>
              </div>
            )}
          >
            <StageGuitar
              className="stage-canvas"
              notes={stageNotes}
              beatId={state.beatId}
              beatProgress={state.beatProgress}
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
              {listening && <span className="hud-chip hud-accent">Dinliyorum: notayı çal</span>}
              {loop && (
                <span className="hud-chip hud-accent num">
                  Döngü {loop[0] + 1}{loop[1] !== loop[0] ? `–${loop[1] + 1}` : ''}
                </span>
              )}
              {speed !== 1 && <span className="hud-chip num">%{Math.round(speed * 100)} hız</span>}
              {capo > 0 && <span className="hud-chip hud-capo num">Kapo {capo}. perde</span>}
              {tuningOverride && tuningOverride !== 'standard' && <span className="hud-chip">{getTuning(tuningOverride).label}</span>}
              {!state.playing && state.timeMs > 500 && <span className="hud-chip">Duraklatıldı</span>}
            </div>
          )}

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

          {loadingLabel && (
            <div className="stage-loading" role="status" aria-live="polite">
              <Spinner label={loadingLabel} />
              <span>{loadingLabel}</span>
            </div>
          )}
          {failed && (
            <div className="stage-center">
              <div className="stage-card">
                <EmptyState
                  tone="danger"
                  icon={<FileMusic size={22} />}
                  title="Tab açılamadı"
                  description={loadErr ?? `${state.error} Dosya bozuk ya da desteklenmeyen bir biçimde olabilir.`}
                  action={
                    <>
                      <Button icon={<ArrowLeft size={16} />} onClick={() => navigate({ name: 'library' })}>Kütüphane</Button>
                      {source.id !== DEMO_LESSON_ID && <Button variant="primary" icon={<GraduationCap size={16} />} onClick={() => navigate(playLesson(DEMO_LESSON_ID))}>Bir dersle başla</Button>}
                    </>
                  }
                />
              </div>
            </div>
          )}
        </main>

        <Drawer open={showPractice} onClose={togglePractice} title="Çalış" shortcut="P" className="practice-drawer">
          {lastPass && (
            <Button size="sm" variant="ghost" className="fb-open" onClick={() => setFeedbackOpen(true)}>
              Son tur özeti · %{lastPass.accuracy}
            </Button>
          )}
          {report && (
            <LadderPanel
              auto={autoLadder}
              onAuto={toggleAutoLadder}
              onRestart={restartLadder}
              ladder={ladder}
              listening={listening}
              hasLoop={!!loop}
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
        </Drawer>
      </div>

      <section className={`tabpanel${showTab && !failed ? '' : ' collapsed'}`} aria-label="Tab şeridi" aria-hidden={!showTab || failed}>
        <div className="tabpanel-scroll" ref={scroller}>
          <div ref={host} />
        </div>
      </section>

      <Transport
        ready={state.ready && !loadingLabel}
        hasScore={hasScore}
        playing={state.playing}
        timeMs={state.timeMs}
        endMs={state.endMs}
        tick={state.tick}
        endTick={state.endTick}
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
        program={program}
        onProgram={(v) => setSettings({ program: v })}
        onMix={onMix}
        listening={listening}
        listenDisabled={!hasScore}
        onListen={setListening}
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

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} title="Klavye kısayolları" description="Her şeyi klavyeden de yapabilirsin.">
        <ShortcutList />
      </Dialog>
    </div>
  );
}
