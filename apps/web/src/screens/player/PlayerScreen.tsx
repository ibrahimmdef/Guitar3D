import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Box, FileMusic, GraduationCap } from 'lucide-react';
import type { CameraMode, GuitarView, TabMeta, TabProgress } from '@guitar3d/shared';
import { api as server } from '../../api';
import { barRange, hasRepeats, useAlphaTab } from '../../player/useAlphaTab';
import { analyze } from '../../tips/analyze';
import { toSimpleBars } from '../../tips/model';
import { Coach, type Ladder } from '../../ui/Coach';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { Button, Dialog, Drawer, EmptyState, Spinner, useToast } from '../../ui/kit';
import { ladderAfter } from '../../ui/practiceFlow';
import { DEMO_LESSON_ID, navigate, playLesson, type PlaySource } from '../../ui/router';
import { markPlayed, useSettings } from '../../ui/settings';
import { useHotkeys } from '../../ui/shortcuts';
import { ShortcutList } from '../../ui/ShortcutList';
import { fetchTabFile, listTabs } from '../data';
import { loadLesson } from '../library/lessons';
import { CAMERA_MODES, PlayerTopBar } from './PlayerTopBar';
import { StageGuitar } from './StageGuitar';
import { Transport } from './Transport';

const clampSpeed = (v: number) => Math.min(1.5, Math.max(0.25, Math.round(v * 100) / 100));

export function PlayerScreen({ source }: { source: PlaySource }) {
  const tabId = source.kind === 'tab' ? source.id : null;
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { api, state, loadBuffer, loadTex, seekTick, seekBar } = useAlphaTab(host, scroller);
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
  const [ladder, setLadder] = useState<Ladder>({ speed: 1, clean: 0, target: 1 });

  const { view, cameraMode, showTabStrip: showTab, showPractice, metronomeVolume: metroVol } = settings;

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
    setLadder({ speed: report.suggestedStartSpeed, clean: 0, target: 1 });
    setSpeed(settings.defaultSpeed);
    // Only on a new score; settings changes should not reset the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  /* ---------- Push state into alphaTab ---------- */
  useEffect(() => {
    if (api.current) api.current.playbackSpeed = speed;
  }, [speed, api, state.ready]);
  useEffect(() => {
    if (api.current) api.current.metronomeVolume = metronome ? metroVol : 0;
  }, [metronome, metroVol, api, state.ready]);
  useEffect(() => {
    if (api.current) api.current.countInVolume = countIn ? 1 : 0;
  }, [countIn, api, state.ready]);
  useEffect(() => {
    const a = api.current;
    if (!a || !state.track) return;
    a.changeTrackMute([state.track], muted || guitarVol === 0);
    a.changeTrackVolume([state.track], guitarVol);
  }, [guitarVol, muted, api, state.track, state.ready]);
  useEffect(() => {
    const a = api.current;
    if (!a || !state.score) return;
    a.playbackRange = loop ? barRange(state.score, loop[0], loop[1]) : null;
    a.isLooping = !!loop;
  }, [loop, api, state.score]);

  /* ---------- Derived ---------- */
  const barCount = state.score?.masterBars.length ?? 0;
  const linearTicks = !!state.score && !hasRepeats(state.score);
  const barTicks = useMemo(() => (state.score && linearTicks ? state.score.masterBars.map((m) => m.start) : null), [state.score, linearTicks]);
  const loopTicks = useMemo<[number, number] | null>(() => {
    if (!loop || !state.score || !linearTicks) return null;
    const r = barRange(state.score, loop[0], loop[1]);
    return [r.startTick, r.endTick];
  }, [loop, state.score, linearTicks]);

  /* ---------- Actions ---------- */
  const playPause = useCallback(() => api.current?.playPause(), [api]);
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

  const onClean = useCallback(() => {
    const { leveledUp, ...next } = ladderAfter(ladder, 'clean');
    setLadder(next);
    if (next.clean !== 0) return;
    setSpeed(next.speed);
    saveProgress(ladder.speed);
    toast({
      tone: 'success',
      title: leveledUp ? `Üç temiz tur! Hız %${Math.round(next.speed * 100)} oldu.` : 'Hedef hıza ulaştın.',
      description: leveledUp ? 'Aynı bölümü yeni hızda dene.' : 'Bu bölüm tamam. Haritadan sıradaki zor ölçüyü seç.',
    });
  }, [ladder, saveProgress, toast]);

  const onStuck = useCallback(() => {
    const { leveledUp: _l, ...next } = ladderAfter(ladder, 'stuck');
    setSpeed(next.speed);
    setLadder(next);
  }, [ladder]);

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
    '-': () => setSpeed((s) => clampSpeed(s - 0.05)),
    '+': () => setSpeed((s) => clampSpeed(s + 0.05)),
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
    <div className={`player${showPractice ? ' practice-open' : ''}`}>
      <PlayerTopBar
        title={title}
        subtitle={subtitle}
        view={view}
        onView={setView}
        cameraMode={cameraMode}
        onCameraMode={setCamera}
        practiceOpen={showPractice}
        onTogglePractice={togglePractice}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onBack={() => navigate({ name: 'library' })}
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
              notes={state.notes}
              beatId={state.beatId}
              beatProgress={state.beatProgress}
              view={view}
              cameraMode={cameraMode}
              onCameraModeChange={setCamera}
              onReady={() => setGuitarReady(true)}
            />
          </ErrorBoundary>

          {hasScore && !loadingLabel && (
            <div className="stage-hud" aria-live="off">
              <span className="hud-chip num">Ölçü <b>{state.currentBar + 1}</b><span className="subtle"> / {barCount}</span></span>
              {loop && (
                <span className="hud-chip hud-accent num">
                  Döngü {loop[0] + 1}{loop[1] !== loop[0] ? `–${loop[1] + 1}` : ''}
                </span>
              )}
              {speed !== 1 && <span className="hud-chip num">%{Math.round(speed * 100)} hız</span>}
              {!state.playing && state.timeMs > 500 && <span className="hud-chip">Duraklatıldı</span>}
            </div>
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

        <Drawer open={showPractice} onClose={togglePractice} title="Pratik" shortcut="P" className="practice-drawer">
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
        currentBar={state.currentBar}
        barCount={barCount}
        onPlayPause={playPause}
        onStop={stop}
        onSeek={seekTick}
        onStepBar={stepBar}
        speed={speed}
        onSpeed={(v) => setSpeed(clampSpeed(v))}
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
      />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} title="Klavye kısayolları" description="Her şeyi klavyeden de yapabilirsin.">
        <ShortcutList />
      </Dialog>
    </div>
  );
}
