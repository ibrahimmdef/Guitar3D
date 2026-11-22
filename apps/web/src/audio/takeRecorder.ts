import { audioContext } from './clicks';

/**
 * Microphone take for "Transcribe my playing": MediaRecorder plus an optional metronome on the
 * Web Audio clock. With a metronome the take starts with a one-bar count-in and the server gets the
 * tempo and the offset of the first downbeat, so no beat tracking is needed.
 */

/** Click pitches sit above the transcriber's range (max ~1.4 kHz), so a click bleeding into the mic is not a note. */
export const CLICK_HZ = { accent: 2400, beat: 1900 };
/** Silence before the first click, so the recorder is surely running. */
export const LEAD_IN = 0.25;
export const MAX_TAKE_SECONDS = 300;

export interface ClickPlan {
  /** Click times relative to the start of the recording (s), with accents on bar starts. */
  clicks: { at: number; accent: boolean }[];
  /** Start of bar 1 (after the count-in), relative to the start of the recording (s). */
  downbeat: number;
}

/**
 * Count-in bar plus (optionally) a running metronome up to `seconds`. `latency` is the audio
 * output latency: the player hears every click that much later and plays along with what they hear.
 */
export function clickPlan(bpm: number, opts: { beatsPerBar?: number; metronome?: boolean; seconds?: number; latency?: number } = {}): ClickPlan {
  const { beatsPerBar = 4, metronome = true, seconds = MAX_TAKE_SECONDS, latency = 0 } = opts;
  const spb = 60 / bpm;
  const clicks: ClickPlan['clicks'] = [];
  const total = metronome ? Math.floor((seconds - LEAD_IN) / spb) : beatsPerBar;
  for (let i = 0; i < total; i++) clicks.push({ at: LEAD_IN + i * spb, accent: i % beatsPerBar === 0 });
  return { clicks, downbeat: LEAD_IN + beatsPerBar * spb + latency };
}

/** Best container the browser can record (Opus in WebM / Ogg, else AAC in MP4). */
export function pickMimeType(isSupported: (t: string) => boolean = (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)): string {
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'].find(isSupported) ?? '';
}

export interface Take {
  blob: Blob;
  seconds: number;
  /** Set when recorded with the metronome. */
  bpm?: number;
  offset?: number;
}

export interface TakeRecorder {
  /** Resolves with the take when `stop()` is called (or the time limit is hit). */
  done: Promise<Take>;
  stop(): void;
  /** Input level 0..1 for a meter. */
  level(): number;
}

function click(ctx: AudioContext, out: AudioNode, at: number, accent: boolean) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? CLICK_HZ.accent : CLICK_HZ.beat;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(accent ? 0.5 : 0.32, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + 0.06);
}

/**
 * Starts recording now. With `bpm` it plays a count-in (and the metronome when `metronome`),
 * scheduled on the audio clock from the moment the recorder reports it started.
 */
export async function startTake(opts: { bpm?: number; metronome?: boolean }): Promise<TakeRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // a guitar is not a voice call: keep the raw signal
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = audioContext();
  if (ctx && ctx.state !== 'running') await ctx.resume().catch(() => {});
  const analyser = ctx?.createAnalyser();
  const source = ctx?.createMediaStreamSource(stream);
  if (analyser && source) {
    analyser.fftSize = 1024;
    source.connect(analyser);
  }
  const buf = new Float32Array(1024);
  const mimeType = pickMimeType();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  // all clicks go through one gain node, so stopping silences the ones still scheduled
  const clicks = ctx?.createGain();
  clicks?.connect(ctx!.destination);
  let startedAt = 0;
  let plan: ClickPlan | null = null;
  let limit = 0;

  const done = new Promise<Take>((resolve, reject) => {
    rec.onstart = () => {
      startedAt = performance.now();
      if (opts.bpm && ctx) {
        const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
        plan = clickPlan(opts.bpm, { metronome: opts.metronome, latency });
        const t0 = ctx.currentTime;
        for (const c of plan.clicks) click(ctx, clicks!, t0 + c.at, c.accent);
      }
      limit = window.setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_TAKE_SECONDS * 1000);
    };
    rec.onstop = () => {
      clearTimeout(limit);
      stream.getTracks().forEach((t) => t.stop());
      source?.disconnect();
      clicks?.disconnect();
      const seconds = (performance.now() - startedAt) / 1000;
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
      resolve(plan && opts.bpm ? { blob, seconds, bpm: opts.bpm, offset: plan.downbeat } : { blob, seconds });
    };
    rec.onerror = () => reject(new Error('Recording failed.'));
  });
  rec.start(1000);

  return {
    done,
    stop: () => {
      if (rec.state !== 'inactive') rec.stop();
      clicks?.disconnect();
    },
    level: () => {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      return Math.min(1, Math.sqrt(s / buf.length) * 4);
    },
  };
}
