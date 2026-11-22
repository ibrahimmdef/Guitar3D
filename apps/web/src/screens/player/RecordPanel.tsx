import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Headphones, Play, Square, Trash2 } from 'lucide-react';
import { addTake, deleteTake, getTake, listTakes, pickMime, type TakeMeta } from '../../player/recordings';
import { relativeTime } from '../../ui/format';
import { Button, IconButton, useToast } from '../../ui/kit';

interface Props {
  tabKey: string;
  playing: boolean;
  tick: number;
  speed: number;
  /** Set speed, seek to tick and start the tab. */
  onPlayFrom: (tick: number, speed: number) => void;
  onPause: () => void;
}

const secs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

/**
 * Record yourself while the tab plays, then hear the take on top of the original at the same
 * position and speed. Takes stay in this browser (IndexedDB).
 */
export function RecordPanel({ tabKey, playing, tick, speed, onPlayFrom, onPause }: Props) {
  const toast = useToast();
  const [takes, setTakes] = useState<TakeMeta[]>([]);
  const [recording, setRecording] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number; startTick: number; speed: number } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const refresh = useCallback(() => listTakes(tabKey).then(setTakes).catch(() => setTakes([])), [tabKey]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stopAudio = useCallback(() => {
    const a = audio.current;
    if (a) {
      a.pause();
      URL.revokeObjectURL(a.src);
    }
    audio.current = null;
    setPlayingId(null);
  }, []);

  const stopRecording = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setRecording(false);
    if (r.mr.state !== 'inactive') r.mr.stop();
    onPause();
  }, [onPause]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast({ tone: 'danger', title: 'This browser can\'t record.' });
      return;
    }
    stopAudio();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    } catch {
      toast({ tone: 'danger', title: 'Couldn\'t access the microphone', description: 'Allow microphone access in your browser settings.' });
      return;
    }
    const mime = pickMime((m) => MediaRecorder.isTypeSupported(m));
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const r = { mr, stream, chunks: [] as Blob[], started: performance.now(), startTick: tick, speed };
    mr.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const durationMs = performance.now() - r.started;
      if (durationMs < 800 || !r.chunks.length) return;
      const blob = new Blob(r.chunks, { type: mr.mimeType || mime || 'audio/webm' });
      addTake({ id: crypto.randomUUID(), tabKey, createdAt: new Date().toISOString(), startTick: r.startTick, speed: r.speed, durationMs, mime: blob.type, blob })
        .then(refresh)
        .then(() => toast({ tone: 'success', title: 'Recording saved.', description: 'You can listen to it along with the original.' }))
        .catch((e: Error) => toast({ tone: 'danger', title: 'Couldn\'t save the recording.', description: e.message }));
    };
    rec.current = r;
    mr.start(1000);
    setRecording(true);
    onPlayFrom(tick, speed);
  };

  // The tab stopping ends the recording / the overlay.
  const wasPlaying = useRef(playing);
  useEffect(() => {
    if (wasPlaying.current && !playing) {
      if (rec.current) stopRecording();
      if (audio.current) stopAudio();
    }
    wasPlaying.current = playing;
  }, [playing, stopRecording, stopAudio]);

  useEffect(() => () => {
    const r = rec.current;
    if (r) {
      rec.current = null;
      r.mr.ondataavailable = null;
      r.mr.onstop = null;
      if (r.mr.state !== 'inactive') r.mr.stop();
      r.stream.getTracks().forEach((t) => t.stop());
    }
    audio.current?.pause();
  }, []);

  const playTake = async (t: TakeMeta) => {
    if (playingId === t.id) {
      stopAudio();
      onPause();
      return;
    }
    stopAudio();
    const full = await getTake(t.id).catch(() => undefined);
    if (!full) return;
    const a = new Audio(URL.createObjectURL(full.blob));
    a.onended = () => {
      stopAudio();
      onPause();
    };
    audio.current = a;
    setPlayingId(t.id);
    // Same start position and speed as when it was recorded, both started together.
    onPlayFrom(t.startTick, t.speed);
    a.play().catch(() => stopAudio());
  };

  const remove = async (t: TakeMeta) => {
    if (playingId === t.id) stopAudio();
    await deleteTake(t.id).catch(() => {});
    void refresh();
  };

  return (
    <section className="drawer-sec" aria-labelledby="rec-sec">
      <h3 id="rec-sec" className="eyebrow">Record and compare</h3>
      <div className="ti-row">
        {recording ? (
          <Button size="sm" variant="danger" icon={<Square size={14} fill="currentColor" />} onClick={stopRecording}>Stop recording</Button>
        ) : (
          <Button size="sm" icon={<Circle size={14} fill="currentColor" className="rec-dot" />} onClick={startRecording} disabled={playing}>Record</Button>
        )}
        <span className="subtle small"><Headphones size={13} aria-hidden /> Record with headphones; the tab plays from the current position.</span>
      </div>
      {takes.length > 0 && (
        <ul className="rec-list">
          {takes.map((t) => (
            <li key={t.id} className={playingId === t.id ? 'is-now' : undefined}>
              <IconButton
                size="sm"
                label={playingId === t.id ? 'Stop' : 'Listen with the original'}
                icon={playingId === t.id ? <Square size={14} /> : <Play size={14} />}
                onClick={() => void playTake(t)}
                disabled={recording}
              />
              <span className="rec-text">
                <span>{relativeTime(t.createdAt) ?? ''}</span>
                <span className="subtle small num">{secs(t.durationMs)} · {Math.round(t.speed * 100)}% speed</span>
              </span>
              <IconButton size="sm" label="Delete recording" icon={<Trash2 size={14} />} onClick={() => void remove(t)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
