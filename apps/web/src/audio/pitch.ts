/** Pure pitch-detection helpers (no Web Audio here, so they are testable in Node). */

export interface Pitch {
  /** Fundamental frequency in Hz. */
  freq: number;
  /** 0..1, 1 = perfectly periodic. */
  clarity: number;
}

export interface YinOptions {
  /** CMND threshold for accepting a period (lower = stricter). */
  threshold?: number;
  minFreq?: number;
  maxFreq?: number;
  /** RMS below this is treated as silence. */
  minRms?: number;
}

export function rms(buf: ArrayLike<number>) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return buf.length ? Math.sqrt(s / buf.length) : 0;
}

/**
 * YIN fundamental-frequency estimate (de Cheveigné & Kawahara 2002): difference function,
 * cumulative mean normalisation, absolute threshold and parabolic interpolation.
 * Returns null for silence or unpitched input.
 */
export function detectPitch(buf: ArrayLike<number>, sampleRate: number, opts: YinOptions = {}): Pitch | null {
  const { threshold = 0.15, minFreq = 65, maxFreq = 1400, minRms = 0.01 } = opts;
  if (rms(buf) < minRms) return null;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  if (tauMax <= tauMin + 2) return null;
  const w = buf.length - tauMax;

  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const x = buf[i] - buf[i + tau];
      sum += x * x;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference.
  const c = new Float32Array(tauMax + 1);
  c[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    c[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (c[tau] < threshold) {
      while (tau + 1 <= tauMax && c[tau + 1] < c[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) return null;

  // Parabolic interpolation around the minimum.
  let period = best;
  if (best > 1 && best < tauMax) {
    const a = c[best - 1], b = c[best], cc = c[best + 1];
    const den = a - 2 * b + cc;
    if (den !== 0) period = best + (a - cc) / (2 * den);
  }
  const freq = sampleRate / period;
  if (freq < minFreq * 0.97 || freq > maxFreq * 1.03) return null;
  return { freq, clarity: Math.max(0, Math.min(1, 1 - c[best])) };
}

export const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const freqToMidi = (freq: number) => 69 + 12 * Math.log2(freq / 440);
/** Signed distance in cents from `freq` to the MIDI note. */
export const centsOff = (freq: number, midi: number) => 1200 * Math.log2(freq / midiToFreq(midi));

/**
 * Index of the target pitch (MIDI) that `freq` matches within `tolerance` cents, preferring the
 * closest; -1 when none. With chords the detector reports the strongest note, so matching any
 * chord tone counts.
 */
export function matchPitch(freq: number, targets: number[], tolerance = 50): number {
  let best = -1;
  let bestAbs = Infinity;
  targets.forEach((m, i) => {
    const off = Math.abs(centsOff(freq, m));
    if (off <= tolerance && off < bestAbs) {
      best = i;
      bestAbs = off;
    }
  });
  return best;
}

/* ---------- Wait-mode judge ---------- */

export interface JudgeState {
  /** Consecutive frames matching a target. */
  hitFrames: number;
  /** MIDI (fractional) of the last wrong stable pitch candidate and how long it has held. */
  wrongMidi: number | null;
  wrongFrames: number;
  /** A miss was already reported for this target. */
  missed: boolean;
}

export const initialJudge = (): JudgeState => ({ hitFrames: 0, wrongMidi: null, wrongFrames: 0, missed: false });

export interface JudgeOptions {
  tolerance?: number;
  /** Frames a matching pitch must hold before it counts. */
  hitFrames?: number;
  /** Frames a stable wrong pitch must hold before it is a miss. */
  missFrames?: number;
}

/**
 * Advances the judge by one detector frame. Emits 'hit' once a target holds for `hitFrames`, and
 * 'miss' (once per target) when a different, stable pitch holds for `missFrames`.
 */
export function judgeStep(
  s: JudgeState,
  pitch: Pitch | null,
  targets: number[],
  opts: JudgeOptions = {},
): { state: JudgeState; event: 'hit' | 'miss' | null } {
  const { tolerance = 50, hitFrames = 2, missFrames = 6 } = opts;
  if (!pitch || targets.length === 0) return { state: { ...s, hitFrames: 0, wrongMidi: null, wrongFrames: 0 }, event: null };
  if (matchPitch(pitch.freq, targets, tolerance) >= 0) {
    const n = s.hitFrames + 1;
    if (n >= hitFrames) return { state: initialJudge(), event: 'hit' };
    return { state: { ...s, hitFrames: n, wrongMidi: null, wrongFrames: 0 }, event: null };
  }
  const midi = freqToMidi(pitch.freq);
  const same = s.wrongMidi != null && Math.abs(midi - s.wrongMidi) * 100 <= tolerance;
  const wrongFrames = same ? s.wrongFrames + 1 : 1;
  const next: JudgeState = { hitFrames: 0, wrongMidi: midi, wrongFrames, missed: s.missed };
  if (!s.missed && wrongFrames >= missFrames) return { state: { ...next, missed: true }, event: 'miss' };
  return { state: next, event: null };
}

/** Accuracy of one pass: notes hit first time over notes played. */
export function accuracy(hits: number, firstTry: number) {
  return hits > 0 ? Math.round((firstTry / hits) * 100) : 0;
}
