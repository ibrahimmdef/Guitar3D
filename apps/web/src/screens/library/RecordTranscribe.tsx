import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Mic, Play, RotateCcw, Square } from 'lucide-react';
import type { TranscriberStatus, TranscriptionJob } from '@guitar3d/shared';
import { Button, Dialog, Slider, Toggle } from '../../ui/kit';
import { navigate, playTab } from '../../ui/router';
import { startTake, MAX_TAKE_SECONDS, type TakeRecorder } from '../../audio/takeRecorder';
import { LoadingProgress } from '../../ui/LoadingProgress';
import { transcriptionSteps } from '../../songs/loadSteps';
import { isActiveJob, useTranscriptionJob } from '../../songs/useTranscription';
import { retryTranscription, transcribeRecording, transcriberStatus } from '../data';

type Phase = 'setup' | 'countdown' | 'recording' | 'uploading' | 'job' | 'error';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * "Transcribe my playing": record a take from the microphone (optionally to a metronome with a
 * one-bar count-in), upload it and open the transcribed tab. The recording stays in the app data.
 */
export function RecordTranscribeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [title, setTitle] = useState('');
  const [useBpm, setUseBpm] = useState(true);
  const [bpm, setBpm] = useState(90);
  const [metronome, setMetronome] = useState(true);
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<TranscriberStatus | null>(null);
  const [job, setJob] = useTranscriptionJob(null);
  const rec = useRef<TakeRecorder | null>(null);

  useEffect(() => {
    if (open) transcriberStatus().then(setStatus).catch(() => setStatus(null));
  }, [open]);

  // Meter + timer while recording.
  useEffect(() => {
    if (phase !== 'recording') return;
    const t0 = performance.now();
    let raf = 0;
    const loop = () => {
      setElapsed((performance.now() - t0) / 1000);
      setLevel(rec.current?.level() ?? 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Done: open the tab.
  useEffect(() => {
    if (job?.status === 'ready' && job.tabId) {
      onOpenChange(false);
      navigate(playTab(job.tabId));
    }
  }, [job, onOpenChange]);

  // Closing stops a running take.
  useEffect(() => {
    if (!open) rec.current?.stop();
  }, [open]);

  const begin = async () => {
    setError(null);
    try {
      if (!useBpm) {
        // no tempo: a short visual countdown, the server finds the beat itself
        setPhase('countdown');
        for (let i = 3; i > 0; i--) {
          setCount(i);
          await new Promise((r) => setTimeout(r, 700));
        }
      }
      const take = await startTake(useBpm ? { bpm, metronome } : {});
      rec.current = take;
      setPhase('recording');
      const result = await take.done;
      rec.current = null;
      if (result.seconds < 1.5 || result.blob.size < 1000) throw new Error('The take is too short. Record at least a few seconds.');
      setPhase('uploading');
      const j = await transcribeRecording(result.blob, { title: title.trim() || undefined, bpm: result.bpm, offset: result.offset });
      setJob(j);
      setPhase('job');
    } catch (e) {
      rec.current = null;
      const err = e as Error & { name?: string };
      setError(err.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser settings and try again.' : err.message);
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('setup');
    setJob(null);
    setError(null);
    setElapsed(0);
  };

  const recording = phase === 'recording';
  const countIn = recording && useBpm ? Math.max(0, 4 - Math.floor((elapsed - 0.25) / (60 / bpm))) : 0;
  const unavailable = status && !status.available;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) rec.current?.stop();
        onOpenChange(o);
      }}
      title="Transcribe my playing"
      description="Record a riff or a song section; you get it back as tab and notation, with the notes that may be wrong marked."
      footer={
        phase === 'setup' ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" icon={<Mic size={15} />} onClick={begin} disabled={!!unavailable}>Start recording</Button>
          </>
        ) : recording ? (
          <Button variant="danger" icon={<Square size={14} fill="currentColor" />} onClick={() => rec.current?.stop()}>Stop and transcribe</Button>
        ) : phase === 'error' || job?.status === 'error' ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            {job?.status === 'error' ? (
              <Button icon={<RotateCcw size={15} />} onClick={() => retryTranscription(job.id).then(setJob).catch((e) => setError((e as Error).message))}>Try again</Button>
            ) : (
              <Button icon={<RotateCcw size={15} />} onClick={reset}>Record again</Button>
            )}
          </>
        ) : undefined
      }
    >
      {phase === 'setup' && (
        <div className="rec-setup">
          {unavailable && (
            <p className="rec-warn" role="alert">
              <AlertTriangle size={15} aria-hidden /> {status?.reason} {status?.setupHint}
            </p>
          )}
          <label className="field">
            Title
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My riff" maxLength={120} />
          </label>
          <Toggle
            label="Play to a metronome"
            description="Recommended: one bar of count-in, then the click keeps time. The tab uses this tempo exactly. Wear headphones if you can."
            checked={useBpm}
            onChange={setUseBpm}
          />
          {useBpm && (
            <>
              <Slider label="Tempo" min={40} max={200} step={1} value={bpm} onChange={setBpm} format={(v) => `${v} BPM`} />
              <Toggle label="Click while recording" description="Off: count-in only, then play on your own at that tempo." checked={metronome} onChange={setMetronome} />
            </>
          )}
          <p className="subtle small">Up to {MAX_TAKE_SECONDS / 60} minutes. The recording stays private in this app's data.</p>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="rec-live" role="status">
          <span className="rec-count num">{count}</span>
          <span className="muted">Get ready…</span>
        </div>
      )}

      {recording && (
        <div className="rec-live" role="status" aria-live="polite">
          {countIn > 0 ? <span className="rec-count num">{countIn}</span> : <span className="rec-dot" aria-hidden />}
          <span className="num rec-time">{fmt(elapsed)}</span>
          <span className="muted">{countIn > 0 ? 'Count-in…' : 'Recording — play now'}</span>
          <span className="rec-meter" aria-label="Input level"><span style={{ width: `${Math.round(level * 100)}%` }} /></span>
        </div>
      )}

      {(phase === 'uploading' || (phase === 'job' && isActiveJob(job))) && (
        <div className="rec-live">
          <LoadingProgress steps={transcriptionSteps(phase === 'job' ? (job as TranscriptionJob) : null, phase === 'uploading' ? 'running' : 'done')} />
        </div>
      )}

      {phase === 'job' && job?.status === 'ready' && (
        <div className="rec-live" role="status">
          <Button variant="primary" icon={<Play size={15} fill="currentColor" />} onClick={() => job.tabId && navigate(playTab(job.tabId))}>Open tab</Button>
        </div>
      )}

      {(phase === 'error' || job?.status === 'error') && (
        <p className="rec-warn" role="alert">
          <AlertTriangle size={15} aria-hidden /> {error ?? job?.error}
        </p>
      )}
    </Dialog>
  );
}
