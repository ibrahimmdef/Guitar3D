/**
 * Continuous microphone recording for the speed trainer and latency calibration: raw samples in a
 * ring buffer, each mapped to the performance clock so they can be lined up with the player's
 * position events. The mapping takes the least-delayed audio callback seen so far (callbacks only
 * ever arrive late), so it settles within a few callbacks; a constant remainder is what latency
 * calibration measures.
 */
export interface MicCapture {
  sampleRate: number;
  /** Samples between two performance times (clipped to what is buffered) and the time of the first one. */
  slice(fromPerf: number, toPerf: number): { samples: Float32Array; startPerf: number };
  /** Performance time of the newest sample. */
  latestPerf(): number;
  /** Input level 0..1 for a meter. */
  level(): number;
  /** The capture's audio context (calibration clicks are scheduled on it). */
  context: AudioContext;
  /** Performance time at which `context` renders something scheduled at `ctxTime`. */
  ctxToPerf(ctxTime: number): number;
  stop(): void;
}

const SECONDS = 60;
const BLOCK = 2048;

export async function startMicCapture(): Promise<MicCapture> {
  const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!navigator.mediaDevices?.getUserMedia || !AC) throw Object.assign(new Error('Microphone not supported'), { name: 'NotSupportedError' });
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AC({ latencyHint: 'interactive' });
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  const sr = ctx.sampleRate;
  const size = Math.round(sr * SECONDS);
  const ring = new Float32Array(size);
  let written = 0;
  /** Performance time of sample 0 (min over callbacks). */
  let base = Infinity;
  let rms = 0;
  const src = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but runs everywhere without a worklet module; the work per block is a copy.
  const proc = ctx.createScriptProcessor(BLOCK, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  proc.onaudioprocess = (e) => {
    const now = performance.now();
    const x = e.inputBuffer.getChannelData(0);
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      ring[(written + i) % size] = x[i];
      s += x[i] * x[i];
    }
    written += x.length;
    rms = Math.sqrt(s / x.length);
    base = Math.min(base, now - (written / sr) * 1000);
  };
  src.connect(proc);
  proc.connect(mute).connect(ctx.destination);

  const perfOf = (i: number) => base + (i / sr) * 1000;
  return {
    sampleRate: sr,
    context: ctx,
    slice(fromPerf, toPerf) {
      if (!Number.isFinite(base)) return { samples: new Float32Array(0), startPerf: fromPerf };
      const first = Math.max(written - size, Math.max(0, Math.floor(((fromPerf - base) * sr) / 1000)));
      const last = Math.min(written, Math.ceil(((toPerf - base) * sr) / 1000));
      const n = Math.max(0, last - first);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = ring[(first + i) % size];
      return { samples: out, startPerf: perfOf(first) };
    },
    latestPerf: () => perfOf(written),
    level: () => Math.min(1, rms * 4),
    // when the context renders it, like alphaTab's position events: the speaker's delay stays in
    // the measured latency, where it belongs
    ctxToPerf: (ctxTime) => performance.now() + (ctxTime - ctx.currentTime) * 1000,
    stop() {
      proc.onaudioprocess = null;
      src.disconnect();
      proc.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}

/** Halves the sample rate of high-rate recordings (detection is ~4× cheaper; guitar fits in 11 kHz). */
export function decimate(x: Float32Array, sr: number): { samples: Float32Array; sampleRate: number } {
  if (sr < 32000) return { samples: x, sampleRate: sr };
  const out = new Float32Array(x.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const a = x[2 * i];
    const b = x[2 * i + 1];
    const c = x[2 * i + 2] ?? b;
    out[i] = 0.25 * a + 0.5 * b + 0.25 * c;
  }
  return { samples: out, sampleRate: sr / 2 };
}
