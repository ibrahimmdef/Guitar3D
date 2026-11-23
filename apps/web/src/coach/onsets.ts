import { detectPitch, freqToMidi } from '../audio/pitch';

/**
 * Offline note-onset detection for scoring a speed-trainer pass. Pure (no Web Audio), so the same
 * code runs on the microphone recording in the browser and on synthetic audio in tests.
 *
 * Picked notes and strums are found from jumps of a high-passed energy envelope (the pick attack);
 * legato notes (hammer-ons, pull-offs, slides) have no attack, so a pitch track adds an onset where
 * a new stable pitch starts without one. Each onset gets the pitch the listen mode's YIN detector
 * hears right after it.
 */
export interface Onset {
  /** Time from the start of the buffer in ms. */
  ms: number;
  /** Detected (fractional) MIDI pitch, or null when unpitched (chucks, noisy strums). */
  midi: number | null;
  /** Energy rise in dB (pitch-change onsets: 0). */
  strength: number;
  /** Found from a pitch change instead of an attack. */
  legato?: boolean;
}

export interface OnsetOptions {
  /** Envelope rise that counts as an attack. */
  riseDb?: number;
  /** Ignore anything quieter than this (dBFS of the high-passed envelope). */
  floorDb?: number;
  /** Minimum time between two attacks. */
  refractoryMs?: number;
  /** Also report onsets from pitch changes (legato). */
  legato?: boolean;
}

const HOP_MS = 5;
const WIN_MS = 10;
/** The rise is measured against the quietest point this far back. */
const LOOKBACK_MS = 45;

function envelopeDb(x: Float32Array, sr: number): { env: Float32Array; hop: number } {
  const hop = Math.max(1, Math.round((sr * HOP_MS) / 1000));
  const win = Math.max(2, Math.round((sr * WIN_MS) / 1000));
  const frames = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    let s = 0;
    // first difference = simple high-pass: pick and strum attacks are bright, sustain is not
    for (let i = o + 1; i < o + win; i++) {
      const d = x[i] - x[i - 1];
      s += d * d;
    }
    env[f] = 10 * Math.log10(s / win + 1e-12);
  }
  return { env, hop };
}

/** Pitch right after an onset (skips the noisy attack); null when nothing periodic is heard. */
export function pitchAfter(x: Float32Array, sr: number, ms: number): number | null {
  const size = 2048;
  for (const delay of [30, 60, 100]) {
    const start = Math.round(((ms + delay) * sr) / 1000);
    if (start + size > x.length) break;
    const p = detectPitch(x.subarray(start, start + size), sr, { threshold: 0.2, minRms: 0.003 });
    if (p && p.clarity >= 0.7) return freqToMidi(p.freq);
  }
  return null;
}

export function detectOnsets(x: Float32Array, sr: number, opts: OnsetOptions = {}): Onset[] {
  const { riseDb = 9, floorDb = -62, refractoryMs = 45, legato = true } = opts;
  const { env, hop } = envelopeDb(x, sr);
  const hopMs = (hop * 1000) / sr;
  const back = Math.max(2, Math.round(LOOKBACK_MS / hopMs));
  const refr = Math.max(1, Math.round(refractoryMs / hopMs));
  const peak = env.reduce((m, v) => Math.max(m, v), -Infinity);
  const floor = Math.max(floorDb, peak - 45);
  const out: Onset[] = [];
  let last = -Infinity;
  for (let f = 1; f < env.length; f++) {
    if (f - last < refr || env[f] < floor) continue;
    let lo = Infinity;
    for (let k = Math.max(0, f - back); k < f; k++) lo = Math.min(lo, env[k]);
    if (env[f] - lo < riseDb) continue;
    // climb to the local peak, then place the onset where the rise crosses its middle
    let p = f;
    while (p + 1 < env.length && env[p + 1] > env[p] && p - f < 8) p++;
    const mid = lo + (env[p] - lo) / 2;
    let on = f;
    while (on > 0 && env[on - 1] >= mid) on--;
    const ms = on * hopMs + WIN_MS / 2;
    out.push({ ms, midi: pitchAfter(x, sr, ms), strength: env[p] - lo });
    last = p;
    f = p;
  }
  return legato ? mergeLegato(out, pitchTrack(x, sr)) : out;
}

/** Stable pitch per 20 ms frame (null when none), for legato onsets. */
export function pitchTrack(x: Float32Array, sr: number, hopMs = 20): { ms: number; midi: number | null }[] {
  const size = 1536;
  const hop = Math.round((sr * hopMs) / 1000);
  const out: { ms: number; midi: number | null }[] = [];
  for (let o = 0; o + size <= x.length; o += hop) {
    const p = detectPitch(x.subarray(o, o + size), sr, { threshold: 0.15, minRms: 0.004 });
    out.push({ ms: (o * 1000) / sr, midi: p && p.clarity >= 0.8 ? freqToMidi(p.freq) : null });
  }
  return out;
}

/** Adds an onset where a new pitch holds for 3 frames and no attack is near. */
function mergeLegato(onsets: Onset[], track: { ms: number; midi: number | null }[]): Onset[] {
  const extra: Onset[] = [];
  let stable: number | null = null;
  for (let i = 0; i + 2 < track.length; i++) {
    const a = track[i].midi;
    const b = track[i + 1].midi;
    const c = track[i + 2].midi;
    if (a == null || b == null || c == null || Math.abs(a - b) > 0.4 || Math.abs(a - c) > 0.4) continue;
    if (stable != null && Math.abs(a - stable) <= 0.6) continue;
    const prev = stable;
    stable = a;
    if (prev == null) continue; // the first pitch after silence comes with an attack
    const ms = track[i].ms;
    // the analysis window starts before the new pitch fills it
    const near = onsets.some((o) => Math.abs(o.ms - ms) < 80);
    if (!near) extra.push({ ms: ms + 10, midi: a, strength: 0, legato: true });
  }
  return [...onsets, ...extra].sort((p, q) => p.ms - q.ms);
}
