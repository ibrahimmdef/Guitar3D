import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileMusic, Play } from 'lucide-react';
import type { CameraMode, GuitarView, TabMeta, TabProgress } from '@guitar3d/shared';
import { api as server } from '../../api';
import { DEMO_TEX } from '../../demoTab';
import { barRange, hasRepeats, useAlphaTab } from '../../player/useAlphaTab';
import { analyze } from '../../tips/analyze';
import { toSimpleBars } from '../../tips/model';
import { Coach, type Ladder } from '../../ui/Coach';
import { Button, Dialog, Drawer, EmptyState, Spinner, useToast } from '../../ui/kit';
import { navigate } from '../../ui/router';
import { markPlayed, useSettings } from '../../ui/settings';
import { useHotkeys } from '../../ui/shortcuts';
import { ShortcutList } from '../../ui/ShortcutList';
import { fetchTabFile, listTabs } from '../data';
import { CAMERA_MODES, PlayerTopBar } from './PlayerTopBar';
import { StageGuitar } from './StageGuitar';
import { Transport } from './Transport';

const clampSpeed = (v: number) => Math.min(1.5, Math.max(0.25, Math.round(v * 100) / 100));

export function PlayerScreen({ tabId }: { tabId: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { api, state, loadBuffer, loadTex, seekTick, seekBar } = useAlphaTab(host, scroller);
  const [settings, setSettings] = useSettings();
  const toast = useToast();

  const [meta, setMeta] = useState<TabMeta | null>(null);
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
    if (!tabId) {
      const t = setTimeout(() => loadTex(DEMO_TEX), 0);
      return () => clearTimeout(t);
    }
    markPlayed(tabId);
    setFetching(true);
    fetchTabFile(tabId)
      .then((buf) => alive && loadBuffer(buf))
      .catch((e: Error) => alive && setLoadErr(e.message))
      .finally(() => alive && setFetching(false));
    listTabs().then((ts) => alive && setMeta(ts.find((t) => t.id === tabId) ?? null)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [tabId, loadTex, loadBuffer, api]);

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
    const clean = ladder.clean + 1;
    if (clean < 3) {
      setLadder({ ...ladder, clean });
      return;
    }
    const next = Math.min(ladder.target, clampSpeed(ladder.speed + 0.05));
    setSpeed(next);
    saveProgress(ladder.speed);
    setLadder({ ...ladder, speed: next, clean: 0 });
    toast({ tone: 'success', title: next > ladder.speed ? `Harika! Hız ${Math.round(next * 100)}% oldu.` : 'Hedef hıza ulaştın.', description: 'Üç temiz tur tamamlandı.' });
  }, [ladder, saveProgress, toast]);

  const onStuck = useCallback(() => {
    const next = Math.max(0.3, clampSpeed(ladder.speed - 0.05));
    setSpeed(next);
    setLadder({ ...ladder, speed: next, clean: 0 });
  }, [ladder]);

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
  const title = state.score?.title || meta?.title || (tabId ? 'Tab' : 'Isınma Etüdü');
  const subtitle = [
    state.score?.artist || meta?.artist || (tabId ? '' : 'Demo'),
    state.score ? `${Math.round(state.score.tempo)} BPM` : '',
  ].filter(Boolean).join(' · ');
  const busy = fetching || state.loading;
  const hasScore = !!state.score && !loadErr;

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
          <StageGuitar
            className="stage-canvas"
            notes={state.notes}
            beatId={state.beatId}
            beatProgress={state.beatProgress}
            view={view}
            cameraMode={cameraMode}
            onCameraModeChange={setCamera}
          />

          {hasScore && (
            <div className="stage-hud" aria-live="off">
              <span className="hud-chip num">Ölçü <b>{state.currentBar + 1}</b><span className="subtle"> / {barCount}</span></span>
              {loop && (
                <span className="hud-chip hud-accent num">
                  Döngü {loop[0] + 1}{loop[1] !== loop[0] ? `–${loop[1] + 1}` : ''}
                </span>
              )}
              {speed !== 1 && <span className="hud-chip num">%{Math.round(speed * 100)} hız</span>}
            </div>
          )}

          {!loadErr && busy && (
            <div className="stage-status" role="status">
              <Spinner label="Tab yükleniyor" /> Tab yükleniyor…
            </div>
          )}
          {!loadErr && !busy && hasScore && !state.ready && (
            <div className="stage-status stage-status-corner" role="status">
              <Spinner label="Ses hazırlanıyor" /> Ses hazırlanıyor…
            </div>
          )}
          {(loadErr || state.error) && (
            <div className="stage-center">
              <div className="stage-card">
                <EmptyState
                  tone="danger"
                  icon={<FileMusic size={22} />}
                  title="Tab açılamadı"
                  description={`${loadErr || state.error} Dosya bozuk olabilir ya da desteklenmeyen bir biçimde olabilir.`}
                  action={
                    <>
                      <Button icon={<ArrowLeft size={16} />} onClick={() => navigate({ name: 'library' })}>Kütüphane</Button>
                      {tabId && <Button variant="primary" icon={<Play size={16} />} onClick={() => navigate({ name: 'player', tabId: null })}>Demoyu aç</Button>}
                    </>
                  }
                />
              </div>
            </div>
          )}
        </main>

        <Drawer open={showPractice} onClose={togglePractice} title="Pratik" shortcut="P" className="practice-drawer">
          <Coach report={report} currentBar={state.currentBar} loop={loop} onBarClick={onBarClick} ladder={ladder} onClean={onClean} onStuck={onStuck} />
        </Drawer>
      </div>

      <section className={`tabpanel${showTab ? '' : ' collapsed'}`} aria-label="Tab şeridi" aria-hidden={!showTab}>
        <div className="tabpanel-scroll" ref={scroller}>
          <div ref={host} />
        </div>
      </section>

      <Transport
        ready={state.ready}
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
