import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, FileMusic, Pause, Play, Repeat, RotateCcw, SkipBack, Sparkles, X } from 'lucide-react';
import type { SeparatorStatus, Song, StemName, StrumAnalysis, TranscriberStatus } from '@guitar3d/shared';
import { STEM_NAMES } from '@guitar3d/shared';
import { Button, EmptyState, IconButton, Slider, Spinner, useToast } from '../../ui/kit';
import { navigate, playTab, routeHref } from '../../ui/router';
import { useHotkeys } from '../../ui/shortcuts';
import { getSong, listTranscriptions, retrySong, retryTranscription, separatorStatus, stemUrl, transcribeSong, transcriberStatus } from '../data';
import { isActiveJob, jobProgressLabel, useTranscriptionJob } from '../../songs/useTranscription';
import { StemEngine } from '../../songs/stemEngine';
import { RhythmPanel, type StrumPos } from '../player/RhythmPanel';
import {
  activePreset,
  applyPreset,
  effectiveGains,
  formatTime,
  initialMix,
  MAX_SPEED,
  MIN_SPEED,
  clampSpeed,
  PRESETS,
  setLoopPoint,
  setVolume,
  STEM_LABEL,
  toggleMute,
  toggleSolo,
  type Loop,
  type Mix,
} from '../../songs/mixer';

const SPEEDS = [0.5, 0.75, 0.9, 1];

/** Audio song: waits for separation, then a stem mixer with transport, speed and A–B loop. */
export function SongScreen({ id }: { id: string }) {
  const [song, setSong] = useState<Song | null>(null);
  const [missing, setMissing] = useState(false);
  const [sep, setSep] = useState<SeparatorStatus | null>(null);
  const [poll, setPoll] = useState(0);
  const [strum, setStrum] = useState<StrumAnalysis | null>(null);

  // Poll while the song is still being separated.
  useEffect(() => {
    let stop = false;
    let timer = 0;
    const load = () =>
      getSong(id)
        .then((s) => {
          if (stop) return;
          setSong(s);
          if (s.status === 'queued' || s.status === 'downloading' || s.status === 'separating') timer = window.setTimeout(load, 1500);
          if (s.status === 'error') separatorStatus().then(setSep).catch(() => {});
        })
        .catch(() => !stop && setMissing(true));
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, poll]);

  const back = (
    <a className="song-back" href={routeHref({ name: 'library' })}>
      <ArrowLeft size={16} aria-hidden /> Library
    </a>
  );

  if (missing) {
    return (
      <div className="screen">
        {back}
        <EmptyState tone="danger" icon={<AlertTriangle size={22} />} title="Song not found" description="It may have been deleted." />
      </div>
    );
  }
  if (!song) {
    return (
      <div className="screen">
        <div className="lib-loading" role="status"><Spinner label="Loading song" /> Loading song…</div>
      </div>
    );
  }

  return (
    <div className="screen song-screen">
      <header className="song-head">
        {back}
        <h1>{song.title}</h1>
        <p className="screen-desc">{[song.artist, song.duration ? formatTime(song.duration) : ''].filter(Boolean).join(' · ') || 'Audio file'}</p>
      </header>
      {song.status === 'ready' ? (
        <>
          {song.stems.includes('guitar') && <SongTabPanel song={song} onStrum={setStrum} />}
          <StemPlayer key={song.id} song={song} strum={strum} />
        </>
      ) : (
        <SeparationStatus song={song} sep={sep} onRetried={(s) => { setSong(s); setPoll((n) => n + 1); }} />
      )}
    </div>
  );
}

function SeparationStatus({ song, sep, onRetried }: { song: Song; sep: SeparatorStatus | null; onRetried: (s: Song) => void }) {
  const toast = useToast();
  if (song.status === 'error') {
    return (
      <section className="song-status is-error" role="alert">
        <AlertTriangle size={20} aria-hidden />
        <div>
          <p className="song-status-title">Could not separate the stems</p>
          <p className="muted small">{song.error}</p>
          {sep && !sep.available && sep.setupHint && <p className="song-hint small">{sep.setupHint}</p>}
        </div>
        <Button
          icon={<RotateCcw size={15} />}
          onClick={() =>
            retrySong(song.id)
              .then(onRetried)
              .catch((e) => toast({ tone: 'danger', title: 'Could not retry.', description: (e as Error).message }))
          }
        >
          Try again
        </Button>
      </section>
    );
  }
  const pct = Math.round(song.progress * 100);
  return (
    <section className="song-status" role="status" aria-live="polite">
      <Spinner label="Separating" />
      <div className="song-status-body">
        <p className="song-status-title">{song.status === 'queued' ? 'Waiting in the queue…' : song.status === 'downloading' ? `Downloading the audio… ${pct}%` : `Splitting the instruments… ${pct}%`}</p>
        <p className="muted small">Guitar, vocals, bass, drums, piano and other go to separate tracks. This can take a few minutes depending on the song length; you can leave this page.</p>
        <span className="song-progress"><span style={{ width: `${pct}%` }} /></span>
      </div>
    </section>
  );
}

/** Bar and sixteenth at a time of the song, from the transcription's bar times. */
export function strumPosAt(barTimes: readonly number[] | undefined, t: number): StrumPos | null {
  if (!barTimes || barTimes.length < 2 || t < barTimes[0] || t >= barTimes[barTimes.length - 1]) return null;
  let bar = 0;
  while (bar + 1 < barTimes.length - 1 && barTimes[bar + 1] <= t) bar++;
  const len = barTimes[bar + 1] - barTimes[bar];
  return { bar, slot: Math.min(15, Math.max(0, Math.floor(((t - barTimes[bar]) / len) * 16))) };
}

function StemPlayer({ song, strum }: { song: Song; strum: StrumAnalysis | null }) {
  const toast = useToast();
  const stems = useMemo(() => STEM_NAMES.filter((s) => song.stems.includes(s)), [song.stems]);
  const engine = useRef<StemEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [duration, setDuration] = useState(song.duration ?? 0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState<Loop>({ a: null, b: null });
  const [mix, setMix] = useState<Mix>(() => applyPreset(initialMix(stems), 'playalong'));

  useEffect(() => {
    const e = new StemEngine(Object.fromEntries(stems.map((s) => [s, stemUrl(song.id, s)])));
    engine.current = e;
    e.onTime = setTime;
    e.onPlayingChange = setPlaying;
    e.onError = (m) => toast({ tone: 'danger', title: m });
    e.ready()
      .then((d) => {
        if (d) setDuration(d);
        setReady(true);
      })
      .catch((err) => toast({ tone: 'danger', title: (err as Error).message }));
    return () => {
      e.destroy();
      engine.current = null;
    };
  }, [song.id, stems, toast]);

  useEffect(() => engine.current?.setGains(effectiveGains(mix)), [mix, ready]);
  useEffect(() => engine.current?.setSpeed(speed), [speed, ready]);
  useEffect(() => engine.current?.setLoop(loop), [loop]);

  const toggle = () => ready && engine.current?.toggle();
  const seek = (t: number) => engine.current?.seek(t);
  const markLoop = (which: 'a' | 'b') => setLoop((l) => setLoopPoint(l, which, engine.current?.currentTime ?? 0));

  useHotkeys({
    Space: toggle,
    ArrowLeft: () => seek((engine.current?.currentTime ?? 0) - 5),
    ArrowRight: () => seek((engine.current?.currentTime ?? 0) + 5),
    a: () => markLoop('a'),
    b: () => markLoop('b'),
  });

  const strumPos = useMemo(() => strumPosAt(strum?.barTimes, time), [strum, time]);
  /** Drums (and bass) only at the practice tempo, from a bar before the pattern starts. */
  const playAlong = (bpm: number) => {
    if (!strum) return;
    setMix((m) => Object.fromEntries(Object.entries(m).map(([k, ch]) => [k, { ...ch!, solo: false, muted: k !== 'drums' && k !== 'bass' }])) as Mix);
    setSpeed(clampSpeed(bpm / Math.max(1, strum.tempo)));
    const bt = strum.barTimes ?? [];
    const first = strum.pattern?.starts[0] ?? 0;
    seek(Math.max(0, bt[Math.max(0, first - 1)] ?? 0));
    if (!playing) engine.current?.play();
  };

  const preset = activePreset(mix);
  const gains = effectiveGains(mix);
  const shownTime = scrub ?? time;
  const hasLoop = loop.a != null && loop.b != null;

  return (
    <>
      {strum && (
        <RhythmPanel analysis={strum} pos={strumPos} playing={playing} onPracticeStart={() => engine.current?.pause()} onPlayAlong={stems.includes('drums') ? playAlong : undefined} />
      )}
      <section className="song-presets" aria-label="Mix presets">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={`song-preset${preset === p.id ? ' is-on' : ''}`} aria-pressed={preset === p.id} onClick={() => setMix((m) => applyPreset(m, p.id))}>
            <span className="song-preset-label">{p.label}</span>
            <span className="song-preset-hint">{p.hint}</span>
          </button>
        ))}
      </section>

      <section className="song-mixer" aria-label="Mixer">
        {stems.map((s: StemName) => {
          const ch = mix[s]!;
          const audible = (gains[s] ?? 0) > 0;
          return (
            <div key={s} className={`song-ch${audible ? '' : ' is-silent'}${s === 'guitar' ? ' is-guitar' : ''}`}>
              <span className="song-ch-name">{STEM_LABEL[s]}</span>
              <button type="button" className={`song-ms${ch.muted ? ' is-mute' : ''}`} aria-pressed={ch.muted} aria-label={`Mute ${STEM_LABEL[s]}`} title="Mute" onClick={() => setMix((m) => toggleMute(m, s))}>M</button>
              <button type="button" className={`song-ms${ch.solo ? ' is-solo' : ''}`} aria-pressed={ch.solo} aria-label={`Solo ${STEM_LABEL[s]}`} title="Solo" onClick={() => setMix((m) => toggleSolo(m, s))}>S</button>
              <Slider compact className="song-ch-vol" label={`${STEM_LABEL[s]} volume`} value={Math.round(ch.volume * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => setMix((m) => setVolume(m, s, v / 100))} />
              <span className="song-ch-num num">{Math.round(ch.volume * 100)}%</span>
            </div>
          );
        })}
      </section>

      <section className="song-transport" aria-label="Playback controls">
        <div className="song-seek">
          <span className="num">{formatTime(shownTime)}</span>
          <div className="song-seek-bar">
            {hasLoop && duration > 0 && <span className="song-loop-band" style={{ left: `${(loop.a! / duration) * 100}%`, width: `${((loop.b! - loop.a!) / duration) * 100}%` }} aria-hidden />}
            <Slider compact label="Position" value={shownTime} min={0} max={Math.max(1, duration)} step={0.1} format={formatTime} disabled={!ready} onChange={setScrub} onCommit={(v) => { seek(v); setScrub(null); }} />
          </div>
          <span className="num subtle">{formatTime(duration)}</span>
        </div>
        <div className="song-controls">
          <IconButton label="Back to start" icon={<SkipBack size={18} />} onClick={() => seek(hasLoop ? loop.a! : 0)} disabled={!ready} />
          <IconButton className="song-play" variant="primary" round size="lg" label={playing ? 'Pause' : 'Play'} shortcut="Space" icon={ready ? playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" /> : <Spinner label="Loading" />} onClick={toggle} disabled={!ready} />

          <div className="song-loop" role="group" aria-label="A–B loop">
            <Repeat size={16} aria-hidden className={hasLoop ? 'song-loop-ic is-on' : 'song-loop-ic'} />
            <Button size="sm" pressed={loop.a != null} onClick={() => markLoop('a')} title="Loop start (A)">A{loop.a != null ? ` ${formatTime(loop.a)}` : ''}</Button>
            <Button size="sm" pressed={loop.b != null} onClick={() => markLoop('b')} title="Loop end (B)">B{loop.b != null ? ` ${formatTime(loop.b)}` : ''}</Button>
            {(loop.a != null || loop.b != null) && <IconButton size="sm" label="Clear loop" icon={<X size={14} />} onClick={() => setLoop({ a: null, b: null })} />}
          </div>

          <div className="song-speed">
            <Slider label="Speed" value={Math.round(speed * 100)} min={MIN_SPEED * 100} max={MAX_SPEED * 100} step={5} format={(v) => `${v}%`} onChange={(v) => setSpeed(v / 100)} />
            <div className="song-speed-chips">
              {SPEEDS.map((v) => (
                <button key={v} type="button" className={`chip${speed === v ? ' is-on' : ''}`} onClick={() => setSpeed(v)}>{v * 100}%</button>
              ))}
            </div>
          </div>
        </div>
        <p className="subtle small">Space: play/pause · ←/→: 5 s · A/B: set loop points. Slowing down keeps the pitch.</p>
      </section>
    </>
  );
}

/** Guitar stem → tab: start a transcription, follow it, open the result. */
function SongTabPanel({ song, onStrum }: { song: Song; onStrum: (s: StrumAnalysis | null) => void }) {
  const toast = useToast();
  const [job, setJob] = useTranscriptionJob(null);
  const strum = job?.status === 'ready' ? job.summary?.strum ?? null : null;
  useEffect(() => onStrum(strum), [strum, onStrum]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<TranscriberStatus | null>(null);
  useEffect(() => {
    let alive = true;
    listTranscriptions(song.id)
      .then((js) => alive && setJob(js[0] ?? null))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    transcriberStatus().then((st) => alive && setStatus(st)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [song.id, setJob]);

  const start = () =>
    transcribeSong(song.id)
      .then(setJob)
      .catch((e) => toast({ tone: 'danger', title: 'Could not start the transcription.', description: (e as Error).message }));
  if (!loaded) return null;
  const s = job?.summary;
  const unavailable = status && !status.available;

  return (
    <section className="song-tab" aria-label="Tab from the guitar track" aria-live="polite">
      {isActiveJob(job) ? <Spinner label="Transcribing" /> : <FileMusic size={20} aria-hidden />}
      <div className="song-tab-body">
        {!job && (
          <>
            <p className="song-tab-title">Get the tab of this song</p>
            <p className="muted small">Turns the separated guitar into tab and notation, with the riff and the chords on separate tracks and unsure notes marked.</p>
            {unavailable && <p className="song-hint small">{status?.reason} {status?.setupHint}</p>}
          </>
        )}
        {job && isActiveJob(job) && (
          <>
            <p className="song-tab-title">{jobProgressLabel(job)}</p>
            <p className="muted small">Usually under a minute; you can leave this page.</p>
            <span className="song-progress"><span style={{ width: `${Math.round(job.progress * 100)}%` }} /></span>
          </>
        )}
        {job?.status === 'ready' && s && (
          <>
            <p className="song-tab-title"><Sparkles size={14} aria-hidden className="tab-card-auto" /> Tab ready · Detected: {s.detected}</p>
            <p className="muted small">
              {s.tempo} BPM · {s.bars} bars · {s.tracks.join(' + ')} · {s.lowConfidence ? `${s.lowConfidence} of ${s.notes} notes may need checking` : `${s.notes} notes`}
              {s.strum?.pattern ? ` · strum: ${s.strum.pattern.text}` : ''}
            </p>
          </>
        )}
        {job?.status === 'error' && (
          <>
            <p className="song-tab-title">Could not transcribe the guitar</p>
            <p className="muted small">{job.error}</p>
          </>
        )}
      </div>
      <div className="song-tab-actions">
        {!job && <Button variant="primary" onClick={start} disabled={!!unavailable}>Transcribe guitar</Button>}
        {job?.status === 'ready' && job.tabId && (
          <>
            <Button variant="primary" icon={<Play size={15} fill="currentColor" />} onClick={() => navigate(playTab(job.tabId!))}>Open tab</Button>
            <Button variant="ghost" onClick={start}>Transcribe again</Button>
          </>
        )}
        {job?.status === 'error' && (
          <Button icon={<RotateCcw size={15} />} onClick={() => retryTranscription(job.id).then(setJob).catch((e) => toast({ tone: 'danger', title: (e as Error).message }))}>Try again</Button>
        )}
      </div>
    </section>
  );
}
