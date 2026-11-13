import { useCallback, useEffect, useRef, useState } from 'react';
import { barEvents, stepTime, type BackingChord, type BackingEvent, type BackingStyle } from '../music/backing';
import { audioContext, unlockAudio } from './clicks';

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.4), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function env(ctx: AudioContext, out: AudioNode, when: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  g.connect(out);
  return g;
}

function noiseHit(ctx: AudioContext, out: AudioNode, when: number, type: BiquadFilterType, f: number, peak: number, decay: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = f;
  src.connect(filter).connect(env(ctx, out, when, peak, 0.002, decay));
  src.start(when);
  src.stop(when + decay + 0.05);
}

/** Synthesised drum kit, bass and pad (no samples). */
function play(ctx: AudioContext, out: AudioNode, e: BackingEvent, when: number, stepSec: number) {
  switch (e.kind) {
    case 'kick': {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, when);
      o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
      o.connect(env(ctx, out, when, 0.9, 0.003, 0.28));
      o.start(when);
      o.stop(when + 0.35);
      break;
    }
    case 'snare':
      noiseHit(ctx, out, when, 'bandpass', 1800, 0.45, 0.16);
      break;
    case 'hat':
      noiseHit(ctx, out, when, 'highpass', 7000, 0.12, 0.04);
      break;
    case 'bass': {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq(e.midi);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const dur = Math.max(0.12, e.len * stepSec * 0.92);
      o.connect(lp).connect(env(ctx, out, when, 0.32, 0.01, dur));
      o.start(when);
      o.stop(when + dur + 0.05);
      break;
    }
    case 'pad': {
      const dur = e.len * stepSec;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.07, when + 0.25);
      g.gain.setValueAtTime(0.07, when + dur - 0.2);
      g.gain.linearRampToValueAtTime(0.0001, when + dur);
      g.connect(out);
      for (const m of e.midi) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq(m);
        o.connect(g);
        o.start(when);
        o.stop(when + dur + 0.05);
      }
      break;
    }
  }
}

export interface BackingOptions {
  chords: BackingChord[];
  style: BackingStyle;
  bpm: number;
  pad: boolean;
  volume: number;
}

/**
 * Loops the progression (one bar per chord). Options are read live, so tempo, style, pad and
 * chords change from the next step / bar without restarting.
 */
export function useBacking(opts: BackingOptions) {
  const [playing, setPlaying] = useState(false);
  const [bar, setBar] = useState(-1);
  const live = useRef(opts);
  live.current = opts;
  const timer = useRef(0);
  const gain = useRef<GainNode | null>(null);

  const stop = useCallback(() => {
    clearInterval(timer.current);
    timer.current = 0;
    const g = gain.current;
    if (g) {
      const ctx = g.context;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => g.disconnect(), 300);
    }
    gain.current = null;
    setPlaying(false);
    setBar(-1);
  }, []);

  const start = useCallback(async () => {
    const ctx = (await unlockAudio()) ?? audioContext();
    if (!ctx || !live.current.chords.length) return;
    stop();
    const g = ctx.createGain();
    g.gain.value = live.current.volume;
    g.connect(ctx.destination);
    gain.current = g;
    let barIdx = 0;
    let barStart = ctx.currentTime + 0.12;
    let step = 0;
    let events = barEvents(live.current.chords[0], live.current.style, live.current.pad);
    const tick = () => {
      const o = live.current;
      g.gain.setTargetAtTime(o.volume, ctx.currentTime, 0.05);
      const stepSec = 60 / o.bpm / 4;
      while (true) {
        const when = barStart + stepTime(step, o.bpm, o.style);
        if (when > ctx.currentTime + 0.15) break;
        if (step === 0) {
          const shown = barIdx;
          setTimeout(() => setBar(shown), Math.max(0, (when - ctx.currentTime) * 1000));
        }
        for (const e of events) if (e.step === step) play(ctx, g, e, when, stepSec);
        step++;
        if (step === 16) {
          barStart += 4 * (60 / o.bpm);
          step = 0;
          barIdx = (barIdx + 1) % Math.max(1, o.chords.length);
          events = barEvents(o.chords[barIdx] ?? o.chords[0], o.style, o.pad);
        }
      }
    };
    tick();
    timer.current = window.setInterval(tick, 25);
    setPlaying(true);
  }, [stop]);

  useEffect(() => stop, [stop]);
  return { playing, bar, start, stop, toggle: () => (playing ? stop() : void start()) };
}
