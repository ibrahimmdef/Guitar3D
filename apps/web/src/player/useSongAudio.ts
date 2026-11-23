import { useEffect, useMemo, useRef, useState } from 'react';
import type { synth } from '@coderline/alphatab';
import type { StemName } from '@guitar3d/shared';
import { StemEngine } from '../songs/stemEngine';
import { applyPreset, effectiveGains, initialMix, type PresetId } from '../songs/mixer';
import { audioContext, unlockAudio } from '../audio/clicks';
import { getSong, stemUrl } from '../screens/data';
import { beatTimes, firstBeatFrom } from './songSync';

/**
 * alphaTab's external-media handler backed by the song's stems. alphaTab drives it (play, pause,
 * seek, speed) and follows its clock (`onTime` → updatePosition), so the tab cursor and the 3D neck
 * move with the real recording. Calls before the stems are ready are remembered.
 */
export class SongMedia implements synth.IExternalMediaHandler {
  private engine: StemEngine | null = null;
  private rate = 1;
  private volume = 1;
  private pendingSeek: number | null = null;
  /** Song time (s), every ~50 ms while playing and on seeks. */
  onTime?: (t: number) => void;

  attach(engine: StemEngine | null) {
    this.engine = engine;
    if (!engine) return;
    engine.setSpeed(this.rate);
    engine.onTime = (t) => this.onTime?.(t);
    if (this.pendingSeek != null) engine.seek(this.pendingSeek);
    this.pendingSeek = null;
  }

  get backingTrackDuration() {
    return (this.engine?.duration ?? 0) * 1000;
  }
  get playbackRate() {
    return this.rate;
  }
  set playbackRate(v: number) {
    this.rate = v;
    this.engine?.setSpeed(v);
  }
  get masterVolume() {
    return this.volume;
  }
  set masterVolume(v: number) {
    this.volume = v;
  }
  get currentTime() {
    return this.engine?.currentTime ?? 0;
  }
  get playing() {
    return !!this.engine?.playing;
  }
  seekTo(ms: number) {
    const t = Math.max(0, ms / 1000);
    if (this.engine) this.engine.seek(t);
    else this.pendingSeek = t;
  }
  play() {
    void unlockAudio();
    this.engine?.play();
  }
  pause() {
    this.engine?.pause();
  }
}

/** Metronome on the song's own beats (from the transcription), scheduled ahead on Web Audio. */
class SongClicks {
  private next = 0;
  private lastT = -1;
  enabled = false;
  volume = 0.6;

  constructor(private beats: { t: number; down: boolean }[]) {}

  /** Called with the song time on every engine tick; schedules the clicks due in the next 150 ms. */
  update(t: number, rate: number, playing: boolean) {
    const jumped = this.lastT < 0 || t < this.lastT - 0.01 || t > this.lastT + 0.5;
    this.lastT = t;
    if (jumped) this.next = firstBeatFrom(this.beats, t);
    if (!playing || !this.enabled) return;
    const ctx = audioContext();
    if (!ctx || ctx.state !== 'running') return;
    const horizon = t + 0.15 * rate;
    while (this.next < this.beats.length && this.beats[this.next].t <= horizon) {
      const b = this.beats[this.next++];
      const at = ctx.currentTime + Math.max(0, (b.t - t) / rate);
      click(ctx, at, b.down, this.volume);
    }
  }
}

function click(ctx: AudioContext, at: number, accent: boolean, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1600 : 1000;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume * (accent ? 1 : 0.7), at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.06);
}

export type SongAudioStatus = 'off' | 'loading' | 'ready' | 'error';

/**
 * The song behind an auto-transcribed tab, played instead of the synthesizer: stems with a mix
 * preset (full song, play along without the guitar, guitar only) and a metronome on its beats.
 * `songId` null = no song (ordinary tabs): status stays 'off'.
 */
export function useSongAudio(songId: string | null, barTimes: readonly number[] | null) {
  const media = useMemo(() => new SongMedia(), []);
  const [status, setStatus] = useState<SongAudioStatus>(songId ? 'loading' : 'off');
  const [stems, setStems] = useState<StemName[]>([]);
  const [preset, setPreset] = useState<PresetId>('all');
  const [metronome, setMetronome] = useState(false);
  const [metroVolume, setMetroVolume] = useState(0.6);
  const engine = useRef<StemEngine | null>(null);
  const clicks = useMemo(() => (barTimes ? new SongClicks(beatTimes(barTimes)) : null), [barTimes]);

  useEffect(() => {
    if (!songId) {
      setStatus('off');
      return;
    }
    let alive = true;
    setStatus('loading');
    let e: StemEngine | null = null;
    getSong(songId)
      .then((song) => {
        if (!alive) return;
        if (song.status !== 'ready' || !song.stems.length) throw new Error('The song is not ready.');
        e = new StemEngine(Object.fromEntries(song.stems.map((s) => [s, stemUrl(song.id, s)])));
        engine.current = e;
        setStems(song.stems);
        return e.ready();
      })
      .then(() => {
        if (!alive || !e) return;
        media.attach(e);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
      media.attach(null);
      e?.destroy();
      engine.current = null;
    };
  }, [songId, media]);

  // mix preset → stem volumes
  useEffect(() => {
    if (status === 'ready' && engine.current) engine.current.setGains(effectiveGains(applyPreset(initialMix(stems), preset)));
  }, [status, stems, preset]);

  useEffect(() => {
    if (!clicks) return;
    clicks.enabled = metronome;
    clicks.volume = metroVolume;
  }, [clicks, metronome, metroVolume]);

  /** Feed the metronome from the song clock (call from the media `onTime`). */
  const tickClicks = (t: number) => clicks?.update(t, media.playbackRate, media.playing);

  return { media, status, stems, preset, setPreset, metronome, setMetronome, metroVolume, setMetroVolume, tickClicks };
}
