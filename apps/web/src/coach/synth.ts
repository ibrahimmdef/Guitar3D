/**
 * Renders plucked notes into a mono buffer (Karplus–Strong). Used by tests and the end-to-end check
 * to stand in for a guitarist: the same onset detection and scoring then run on it.
 */
export interface SynthNote {
  ms: number;
  /** MIDI pitches struck together (a strum spreads them by `spreadMs`). */
  midi: number[];
  gain?: number;
  /** Seconds the note rings before being damped (default: until the next note on the same pitch). */
  durMs?: number;
}

export function renderPlucks(notes: SynthNote[], sr: number, totalMs: number, opts: { spreadMs?: number; noise?: number; seed?: number } = {}): Float32Array {
  const { spreadMs = 8, noise = 0.002 } = opts;
  let seed = opts.seed ?? 1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const out = new Float32Array(Math.ceil((sr * totalMs) / 1000));
  for (const n of notes) {
    n.midi.forEach((m, k) => {
      const start = Math.round(((n.ms + k * (n.midi.length > 1 ? spreadMs : 0)) * sr) / 1000);
      const freq = 440 * 2 ** ((m - 69) / 12);
      const period = Math.max(2, Math.round(sr / freq));
      const line = new Float32Array(period);
      for (let i = 0; i < period; i++) line[i] = rnd() * 2 - 1;
      const len = Math.min(out.length - start, Math.round(((n.durMs ?? 1500) * sr) / 1000));
      const g = (n.gain ?? 0.5) / Math.sqrt(n.midi.length);
      let prev = 0;
      for (let i = 0; i < len; i++) {
        const j = i % period;
        const v = line[j];
        // averaging filter with slight loss: a decaying string
        line[j] = 0.996 * 0.5 * (v + prev);
        prev = v;
        // short fade at the end so a damped note does not click
        const tail = len - i < 200 ? (len - i) / 200 : 1;
        if (start + i >= 0) out[start + i] += v * g * tail;
      }
    });
  }
  if (noise > 0) for (let i = 0; i < out.length; i++) out[i] += (rnd() * 2 - 1) * noise;
  return out;
}
