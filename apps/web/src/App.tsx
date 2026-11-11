import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabMeta, TabProgress } from '@guitar3d/shared';
import { api as server } from './api';
import { DEMO_TEX } from './demoTab';
import { DEFAULT_SPEC, mergeSpec, type GuitarSpec } from './fretboard/guitarSpec';
import { Guitar3D, STRING_COLORS, STRING_NAMES, type GuitarTextures } from './fretboard/Guitar3D';
import { barRange, useAlphaTab } from './player/useAlphaTab';
import { analyze } from './tips/analyze';
import { toSimpleBars } from './tips/model';
import { Coach } from './ui/Coach';
import { GuitarPhotos } from './ui/GuitarPhotos';

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { api, state, loadBuffer, loadTex } = useAlphaTab(host, scroller);

  const [spec, setSpec] = useState<GuitarSpec>(DEFAULT_SPEC);
  const [textures, setTextures] = useState<Record<string, string | null>>({});
  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [tabId, setTabId] = useState<string | null>(null);
  const [showLib, setShowLib] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [flip, setFlip] = useState(true);
  const [follow, setFollow] = useState(true);

  const [speed, setSpeed] = useState(1);
  const [metronome, setMetronome] = useState(false);
  const [metroVol, setMetroVol] = useState(0.8);
  const [countIn, setCountIn] = useState(true);
  const [guitarVol, setGuitarVol] = useState(1);
  const [loop, setLoop] = useState<[number, number] | null>(null);
  const [ladder, setLadder] = useState({ speed: 1, clean: 0, target: 1 });
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const refreshAssets = useCallback(() => {
    server.guitarAssets().then((a) => {
      setTextures(a.textures);
      setSpec((s) => (a.bodyModel && !s.bodyModel ? { ...s, bodyModel: { url: a.bodyModel, scale: 1, position: [-60, 0, -5], rotation: [0, 0, 0] } } : s));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    server.guitarSpec().then((p) => setSpec((s) => mergeSpec(s, p))).catch(() => {});
    refreshAssets();
    server.listTabs().then(setTabs).catch(() => {});
  }, [refreshAssets]);

  useEffect(() => {
    const t = setTimeout(() => loadTex(DEMO_TEX), 0);
    return () => clearTimeout(t);
  }, [loadTex]);

  const report = useMemo(() => (state.score && state.track ? analyze(toSimpleBars(state.track, state.score.tempo)) : null), [state.score, state.track]);

  useEffect(() => {
    if (!report) return;
    setLoop(null);
    setLadder({ speed: report.suggestedStartSpeed, clean: 0, target: 1 });
    setSpeed(1);
  }, [report]);

  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.playbackSpeed = speed;
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
    a.changeTrackMute([state.track], guitarVol === 0);
    a.changeTrackVolume([state.track], guitarVol);
  }, [guitarVol, api, state.track, state.ready]);
  useEffect(() => {
    const a = api.current;
    if (!a || !state.score) return;
    a.playbackRange = loop ? barRange(state.score, loop[0], loop[1]) : null;
    a.isLooping = !!loop;
  }, [loop, api, state.score]);

  const openTab = async (t: TabMeta | null) => {
    setShowLib(false);
    api.current?.stop();
    setTabId(t?.id ?? null);
    if (!t) loadTex(DEMO_TEX);
    else loadBuffer(await server.tabFile(t.id));
  };

  const upload = async (file: File) => {
    setUploadErr(null);
    try {
      const meta = await server.uploadTab(file);
      setTabs((x) => [meta, ...x]);
      await openTab(meta);
    } catch (e) {
      setUploadErr((e as Error).message);
    }
  };

  const onBarClick = (bar: number, extend: boolean) => {
    setLoop((l) => {
      if (extend && l) return [Math.min(l[0], bar), Math.max(l[1], bar)];
      if (l && l[0] === bar && l[1] === bar) return null;
      return [bar, bar];
    });
    if (report) setSpeed(ladder.speed);
  };

  const saveProgress = (best: number) => {
    if (!tabId || !loop) return;
    server.getProgress(tabId).then((p: TabProgress) => {
      const others = p.sections.filter((s) => !(s.startBar === loop[0] && s.endBar === loop[1]));
      const prev = p.sections.find((s) => s.startBar === loop[0] && s.endBar === loop[1]);
      server.putProgress({ tabId, sections: [...others, { startBar: loop[0], endBar: loop[1], bestCleanSpeed: Math.max(best, prev?.bestCleanSpeed ?? 0), updatedAt: new Date().toISOString() }] });
    }).catch(() => {});
  };

  const onClean = () => {
    setLadder((l) => {
      const clean = l.clean + 1;
      if (clean < 3) return { ...l, clean };
      const next = Math.min(l.target, Math.round((l.speed + 0.05) * 100) / 100);
      setSpeed(next);
      saveProgress(l.speed);
      return { ...l, speed: next, clean: 0 };
    });
  };
  const onStuck = () => {
    setLadder((l) => {
      const next = Math.max(0.3, Math.round((l.speed - 0.05) * 100) / 100);
      setSpeed(next);
      return { ...l, speed: next, clean: 0 };
    });
  };

  const title = state.score?.title || 'Tab';
  const guitarTextures: GuitarTextures = { fretboard: textures.fretboard ?? undefined, top: textures.top ?? undefined };
  const progress = state.endMs ? state.timeMs / state.endMs : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">◉</span><span className="brand-name">Guitar3D</span></div>
        <div className="song">
          <div className="song-title">{title}</div>
          <div className="song-sub">{state.score?.artist || (tabId ? '' : 'Demo')} {state.score ? `· ${Math.round(state.score.tempo)} BPM` : ''}</div>
        </div>
        <div className="top-actions">
          <button className="btn" onClick={() => setShowLib((v) => !v)}>Kütüphane</button>
          <button className="btn" onClick={() => setShowPhotos(true)}>Gitarım</button>
          <label className="btn primary">
            Tab yükle
            <input type="file" hidden accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.xml,.musicxml" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        {showLib && (
          <div className="library">
            <button className={`lib-item${tabId === null ? ' active' : ''}`} onClick={() => openTab(null)}>
              <b>Isınma Etüdü</b><span>Demo</span>
            </button>
            {tabs.map((t) => (
              <div key={t.id} className={`lib-item${tabId === t.id ? ' active' : ''}`}>
                <button onClick={() => openTab(t)}><b>{t.title}</b><span>{t.artist || new Date(t.uploadedAt).toLocaleDateString('tr-TR')}</span></button>
                <button className="icon-btn" aria-label="Sil" onClick={async () => { await server.deleteTab(t.id); setTabs((x) => x.filter((y) => y.id !== t.id)); }}>✕</button>
              </div>
            ))}
            {tabs.length === 0 && <p className="muted small">Henüz yüklenmiş tab yok. Guitar Pro (.gp, .gp5, .gpx) dosyası yükle.</p>}
          </div>
        )}
      </header>

      <main className="stage">
        <div className="viewport">
          <Guitar3D spec={spec} notes={state.notes} beatId={state.beatId} flip={flip} follow={follow} textures={guitarTextures} />
          <div className="overlay-tl">
            <div className="chip">Ölçü <b>{state.currentBar + 1}</b>{state.score ? ` / ${state.score.masterBars.length}` : ''}</div>
            {loop && <div className="chip accent">Döngü {loop[0] + 1}{loop[1] !== loop[0] ? `–${loop[1] + 1}` : ''} <button className="chip-x" onClick={() => setLoop(null)} aria-label="Döngüyü kapat">✕</button></div>}
            {state.loading && <div className="chip">Yükleniyor…</div>}
            {!state.ready && !state.loading && <div className="chip">Ses yükleniyor…</div>}
            {(state.error || uploadErr) && <div className="chip danger">{state.error || uploadErr}</div>}
          </div>
          <div className="overlay-tr">
            <button className={`chip toggle${follow ? ' on' : ''}`} onClick={() => setFollow((v) => !v)}>Kamera takibi</button>
            <button className="chip toggle" onClick={() => setFlip((v) => !v)}>{flip ? 'Tab yönü' : 'Ayna yönü'}</button>
          </div>
          <div className="legend">
            {STRING_NAMES.map((n, i) => (
              <span key={n + i}><i style={{ background: STRING_COLORS[i] }} />{n}</span>
            ))}
            <span className="legend-next"><i className="ring" />sıradaki</span>
          </div>
        </div>
        <Coach report={report} currentBar={state.currentBar} loop={loop} onBarClick={onBarClick} ladder={ladder} onClean={onClean} onStuck={onStuck} />
      </main>

      <section className="tabstrip" ref={scroller}>
        <div ref={host} />
      </section>

      <footer className="controls">
        <div className="transport">
          <button className="round" aria-label="Başa sar" onClick={() => api.current?.stop()}>■</button>
          <button className="round big" aria-label={state.playing ? 'Duraklat' : 'Çal'} disabled={!state.ready} onClick={() => api.current?.playPause()}>
            {state.playing ? '❚❚' : '▶'}
          </button>
          <div className="time">{fmt(state.timeMs)} <span>/ {fmt(state.endMs)}</span></div>
          <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
        </div>
        <div className="knobs">
          <label className="knob">
            <span>Hız <b>%{Math.round(speed * 100)}</b></span>
            <input type="range" min={0.25} max={1.5} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          </label>
          <label className="knob">
            <span>Gitar sesi <b>{guitarVol === 0 ? 'Kapalı' : `%${Math.round(guitarVol * 100)}`}</b></span>
            <input type="range" min={0} max={1} step={0.05} value={guitarVol} onChange={(e) => setGuitarVol(Number(e.target.value))} />
          </label>
          <label className="knob">
            <span>
              <button className={`mini-toggle${metronome ? ' on' : ''}`} onClick={(e) => { e.preventDefault(); setMetronome((v) => !v); }}>Metronom</button>
              <b>%{Math.round(metroVol * 100)}</b>
            </span>
            <input type="range" min={0} max={1} step={0.05} value={metroVol} onChange={(e) => { setMetroVol(Number(e.target.value)); setMetronome(true); }} />
          </label>
          <button className={`chip toggle${countIn ? ' on' : ''}`} onClick={() => setCountIn((v) => !v)}>Sayarak başla</button>
        </div>
      </footer>

      {showPhotos && <GuitarPhotos textures={textures} onChanged={refreshAssets} onClose={() => setShowPhotos(false)} />}
    </div>
  );
}
