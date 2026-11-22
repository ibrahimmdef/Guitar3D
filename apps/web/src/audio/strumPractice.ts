import { useCallback, useEffect, useRef, useState } from 'react';
import type { StrumResolution, StrumToken } from '@guitar3d/shared';
import { chordVoicing, strokeOrder } from '../music/strumVoicing';
import { audioContext, unlockAudio } from './clicks';

/** What the practice loop plays: the pattern steps and a chord per half bar. */
export interface StrumPracticeOptions {
  steps: readonly StrumToken[];
  accents: readonly boolean[];
  resolution: StrumResolution;
  /** Chord per half bar of the pattern (2 × bars entries; null keeps the previous chord). */
  chords: readonly (string | null)[];
  bpm: number;
  click: boolean;
  chord: boolean;
  /** Accented strums louder (else all strums the same). */
  accent: boolean;
}

/** Seconds per pattern step. */
export const stepSeconds = (bpm: number, resolution: StrumResolution) => (60 / bpm) * (4 / resolution);

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.2), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function click(ctx: AudioContext, out: AudioNode, when: number, downbeat: boolean) {
  const o = ctx.createOscillator();
  o.frequency.value = downbeat ? 1650 : 1100;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(downbeat ? 0.5 : 0.32, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  o.connect(g).connect(out);
  o.start(when);
  o.stop(when + 0.07);
}

/** A plucked string: bright saw through a closing low-pass, decaying; returns its gain to damp it. */
function string(ctx: AudioContext, out: AudioNode, when: number, midi: number, peak: number): GainNode {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq(midi);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, when);
  lp.frequency.exponentialRampToValueAtTime(700, when + 0.35);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
  o.connect(lp).connect(g).connect(out);
  o.start(when);
  o.stop(when + 1.7);
  return g;
}

function chuck(ctx: AudioContext, out: AudioNode, when: number, peak: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  src.connect(bp).connect(g).connect(out);
  src.start(when);
  src.stop(when + 0.08);
}

/**
 * Loops a strum pattern with a metronome click and the chord strummed in the pattern's directions
 * (down = low to high strings, up = top strings high to low), after a one-bar count-in. Options
 * are read live, so tempo and sounds change without restarting. `step` is the pattern step
 * sounding now (-1 during the count-in or when stopped).
 */
export function useStrumPractice(opts: StrumPracticeOptions) {
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const live = useRef(opts);
  live.current = opts;
  const timer = useRef(0);
  const gain = useRef<GainNode | null>(null);
  const timeouts = useRef<number[]>([]);

  const stop = useCallback(() => {
    clearInterval(timer.current);
    timer.current = 0;
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    const g = gain.current;
    if (g) {
      g.gain.setTargetAtTime(0, g.context.currentTime, 0.03);
      setTimeout(() => g.disconnect(), 300);
    }
    gain.current = null;
    setPlaying(false);
    setStep(-1);
  }, []);

  const start = useCallback(async () => {
    const ctx = (await unlockAudio()) ?? audioContext();
    if (!ctx || !live.current.steps.length) return;
    stop();
    const g = ctx.createGain();
    g.gain.value = 0.8;
    g.connect(ctx.destination);
    gain.current = g;
    let ringing: GainNode[] = [];
    let chordName: string | null = null;
    // the count-in bar is steps -resolution..-1
    let n = -live.current.resolution;
    let next = ctx.currentTime + 0.12;
    const tick = () => {
      const o = live.current;
      const len = o.steps.length;
      if (!len) return;
      const dt = stepSeconds(o.bpm, o.resolution);
      const perBeat = o.resolution / 4;
      while (next < ctx.currentTime + 0.15) {
        const when = next;
        const i = n < 0 ? -1 : n % len;
        const inBar = n < 0 ? n + o.resolution : i % o.resolution;
        if (inBar % perBeat === 0 && (o.click || n < 0)) click(ctx, g, when, inBar === 0);
        if (i >= 0) {
          const half = Math.floor(i / (o.resolution / 2));
          const name = o.chords[half] ?? null;
          if (name) chordName = name;
          const t = o.steps[i];
          const peak = (o.accent && o.accents[i] ? 1 : o.accent ? 0.55 : 0.75) * 0.11;
          if (t !== '-' && o.chord) {
            for (const r of ringing) r.gain.setTargetAtTime(0.0001, when, 0.015);
            ringing = [];
            if (t === 'X') chuck(ctx, g, when, peak * 4);
            else {
              const voicing = chordVoicing(chordName) ?? [48, 52, 55, 60, 64];
              strokeOrder(voicing, t).forEach((m, k) => ringing.push(string(ctx, g, when + k * (t === 'D' ? 0.011 : 0.009), m, peak * (t === 'U' ? 0.8 : 1))));
            }
          }
        }
        timeouts.current.push(window.setTimeout(() => setStep(i), Math.max(0, (when - ctx.currentTime) * 1000)));
        if (timeouts.current.length > 64) timeouts.current = timeouts.current.slice(-32);
        n++;
        next += dt;
      }
    };
    tick();
    timer.current = window.setInterval(tick, 25);
    setPlaying(true);
  }, [stop]);

  useEffect(() => stop, [stop]);
  return { playing, step, start, stop, toggle: () => (playing ? stop() : void start()) };
}
