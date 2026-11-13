/**
 * Small Web Audio helpers for the practice tools: metronome clicks, a soft strum "swish", short
 * sine tones, and a look-ahead step scheduler (the classic "two clocks" pattern: a JS timer wakes
 * up often and schedules audio events slightly ahead on the sample-accurate audio clock).
 */

let shared: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (shared) return shared;
  const AC: typeof AudioContext | undefined = typeof window === 'undefined'
    ? undefined
    : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  shared = new AC();
  return shared;
}

/** Resumes the shared context (must be called from a user gesture on most browsers). */
export async function unlockAudio(): Promise<AudioContext | null> {
  const ctx = audioContext();
  if (ctx && ctx.state !== 'running') await ctx.resume().catch(() => {});
  return ctx;
}

/** Converts an audio-clock time to performance.now() seconds. */
export function audioToPerf(ctx: AudioContext, when: number): number {
  return performance.now() / 1000 + (when - ctx.currentTime);
}

/** Metronome click: 2 = bar start (higher), 1 = pulse, 0.5 = soft subdivision. */
export function click(ctx: AudioContext, when: number, level: number, volume = 0.7) {
  if (volume <= 0 || level <= 0) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = level >= 2 ? 1760 : level >= 1 ? 1320 : 990;
  const peak = volume * (level >= 2 ? 0.55 : level >= 1 ? 0.38 : 0.16);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  osc.connect(g).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.06);
}

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.3), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/** A soft guide sound for a strum: filtered noise, darker for down strokes, a short tick when muted. */
export function strumSound(ctx: AudioContext, when: number, stroke: { dir: 'down' | 'up'; accent: boolean; muted: boolean }, volume = 0.5) {
  if (volume <= 0) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = stroke.muted ? 2400 : stroke.dir === 'down' ? 900 : 1700;
  f.Q.value = 0.9;
  const g = ctx.createGain();
  const len = stroke.muted ? 0.05 : 0.16;
  const peak = volume * (stroke.accent ? 0.5 : 0.3);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + len);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(when);
  src.stop(when + len + 0.02);
}

/** A plain tone (ear training fallbacks, feedback blips). */
export function tone(ctx: AudioContext, when: number, freq: number, dur = 0.5, volume = 0.3, type: OscillatorType = 'triangle') {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(volume, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

export interface SchedulerOptions {
  /** Seconds per step. */
  stepSec: number;
  /** Called once per step, ahead of time, with the audio-clock time it sounds at. */
  onStep: (step: number, when: number) => void;
  /** Delay before step 0 (seconds). */
  leadIn?: number;
  lookahead?: number;
}

/** Look-ahead scheduler. `start` returns the audio time of step 0. */
export class StepScheduler {
  private timer = 0;
  private next = 0;
  private nextTime = 0;
  t0 = 0;

  constructor(private ctx: AudioContext, private opts: SchedulerOptions) {}

  start(): number {
    this.stop();
    this.next = 0;
    this.t0 = this.ctx.currentTime + (this.opts.leadIn ?? 0.15);
    this.nextTime = this.t0;
    const ahead = this.opts.lookahead ?? 0.12;
    const tick = () => {
      while (this.nextTime < this.ctx.currentTime + ahead) {
        this.opts.onStep(this.next, this.nextTime);
        this.next++;
        this.nextTime = this.t0 + this.next * this.opts.stepSec;
      }
    };
    tick();
    this.timer = window.setInterval(tick, 25);
    return this.t0;
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
  }
}
