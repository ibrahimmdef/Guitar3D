/**
 * Tempo, beat grid and quantisation of transcribed notes.
 *
 * Positions are counted in sixteenths ("slots") from the first beat of the grid; a 4/4 bar is 16 slots.
 */

/** A note as the transcriber reports it (seconds, MIDI pitch, confidence 0..1). */
export interface RawNote {
  start: number;
  end: number;
  pitch: number;
  conf: number;
}

/** Output of the Python runner (scripts/transcribe.py). */
export interface RawTranscription {
  duration: number;
  notes: RawNote[];
  /** Beat tracker tempo (BPM) and beat times (s); missing when a fixed BPM was given. */
  tempo?: number;
  beats?: number[];
  /** Global tuning deviation from A440 in cents (-50..50). */
  cents?: number;
  /** Onsets with attack features for the strum analysis (see scripts/transcribe.py). */
  strums?: RawStrum[];
  /** [kick, snare] strength (0..1) at every entry of `beats`, from the song's drum track. */
  beatDrums?: [number, number][];
}

/** One onset of the guitar track and how its attack looks. */
export interface RawStrum {
  t: number;
  /** Onset strength, 0..1 of the loudest onset. */
  strength: number;
  /** High strings' arrival minus low strings' (s); > 0: low strings first (down stroke). Null when unknown. */
  spread?: number | null;
  /** Spectral flatness of the attack (0 = tonal … 1 = noise). */
  flatness?: number;
  /** Level 80–160 ms after the onset over the level of the attack; a muted chuck dies fast. */
  decay?: number;
  /** RMS level of the attack (accents). */
  level?: number;
}

/** A note on the 16th grid. `slot` counts sixteenths from the first bar line once `toBars` ran. */
export interface QNote {
  slot: number;
  /** Length in sixteenths (≥ 1). */
  len: number;
  pitch: number;
  conf: number;
  /** Muted (dead) note: a chuck in a strummed part. */
  dead?: boolean;
}

export const SLOTS_PER_BEAT = 4;
export const SLOTS_PER_BAR = 16;

export interface BeatGrid {
  /** Beat position (in beats, fractional) of a time in seconds. */
  toBeat(t: number): number;
  /** Time in seconds of a beat position (inverse of `toBeat`). */
  toTime(beat: number): number;
  /** Rounded tempo in BPM. */
  tempo: number;
  /** True when the first beat is a known downbeat (fixed BPM + count-in). */
  fixedDownbeat: boolean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Uniform grid: beat 0 at `offset` seconds. */
export function fixedGrid(bpm: number, offset = 0): BeatGrid {
  const spb = 60 / bpm;
  return { toBeat: (t) => (t - offset) / spb, toTime: (b) => offset + b * spb, tempo: Math.round(bpm), fixedDownbeat: true };
}

/**
 * Grid through tracked beat times: linear between beats, extrapolated with the median beat
 * interval before the first and after the last beat. Falls back to a uniform grid at `tempo`
 * (or 120) when fewer than two beats were found.
 */
export function trackedGrid(beats: number[] | undefined, tempo?: number): BeatGrid {
  const b = (beats ?? []).filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (b.length < 2) return { ...fixedGrid(tempo && tempo > 30 ? tempo : 120, b[0] ?? 0), fixedDownbeat: false };
  const ibi = median(b.slice(1).map((x, i) => x - b[i]));
  const toBeat = (t: number) => {
    if (t <= b[0]) return (t - b[0]) / ibi;
    const last = b.length - 1;
    if (t >= b[last]) return last + (t - b[last]) / ibi;
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (b[mid] <= t) lo = mid;
      else hi = mid;
    }
    return lo + (t - b[lo]) / (b[lo + 1] - b[lo]);
  };
  const toTime = (beat: number) => {
    const last = b.length - 1;
    if (beat <= 0) return b[0] + beat * ibi;
    if (beat >= last) return b[last] + (beat - last) * ibi;
    const i = Math.floor(beat);
    return b[i] + (beat - i) * (b[i + 1] - b[i]);
  };
  return { toBeat, toTime, tempo: Math.round(60 / ibi), fixedDownbeat: false };
}

/**
 * Moves a tracked grid onto the notes' onsets. Beat trackers place beats on the peak of the onset
 * envelope, a few tens of ms after the attack, so every quantised note (and every bar line the
 * player syncs to the song) came out late. The shift is the median distance of confident onsets
 * to their nearest sixteenth, applied when it is clear and smaller than a 32nd note.
 */
export function alignGrid(grid: BeatGrid, notes: readonly RawNote[], minConf = 0.3): BeatGrid {
  const res: number[] = [];
  for (const n of notes) {
    if (n.conf < minConf) continue;
    const slot = Math.round(grid.toBeat(n.start) * SLOTS_PER_BEAT);
    res.push(n.start - grid.toTime(slot / SLOTS_PER_BEAT));
  }
  if (res.length < 8) return grid;
  const d = median(res);
  const sixteenth = grid.toTime(1 / SLOTS_PER_BEAT) - grid.toTime(0);
  if (Math.abs(d) < 0.005 || Math.abs(d) > sixteenth / 2) return grid;
  return { ...grid, toBeat: (t) => grid.toBeat(t - d), toTime: (b) => grid.toTime(b) + d };
}

/**
 * Snaps notes to the 16th grid. Notes of the same pitch starting in the same slot merge (longest
 * length, highest confidence).
 */
export function quantize(notes: RawNote[], grid: BeatGrid): QNote[] {
  const byKey = new Map<string, QNote>();
  for (const n of notes) {
    const slot = Math.round(grid.toBeat(n.start) * SLOTS_PER_BEAT);
    const end = Math.round(grid.toBeat(n.end) * SLOTS_PER_BEAT);
    const q: QNote = { slot, len: Math.max(1, end - slot), pitch: Math.round(n.pitch), conf: n.conf };
    const key = `${slot}|${q.pitch}`;
    const had = byKey.get(key);
    if (had) {
      had.len = Math.max(had.len, q.len);
      had.conf = Math.max(had.conf, q.conf);
    } else byKey.set(key, q);
  }
  return [...byKey.values()].sort((a, b) => a.slot - b.slot || a.pitch - b.pitch);
}

/**
 * Which beat (0–3) of the grid is the bar's first beat. Every onset on a beat votes for its beat:
 * low notes (bass) and chords vote more, chord changes more still (they mostly fall on the bar
 * line), and the very first note gets a bonus (pieces usually start on a downbeat). Notes starting
 * together count once.
 */
export function chooseDownbeat(notes: QNote[], drums?: readonly [number, number][]): number {
  const fromDrums = drums ? drumPhase(drums) : null;
  if (fromDrums?.phase != null) return fromDrums.phase;
  const score = [0, 0, 0, 0];
  const slots = new Map<number, QNote[]>();
  for (const n of notes) slots.set(n.slot, [...(slots.get(n.slot) ?? []), n]);
  const first = notes.length ? Math.min(...notes.map((n) => n.slot)) : 0;
  let prevChord = '';
  for (const [slot, ns] of [...slots].sort((a, b) => a[0] - b[0])) {
    // chord changes (harmonic rhythm) mostly land on the bar line
    const chord = ns.length >= 3 ? [...new Set(ns.map((n) => ((n.pitch % 12) + 12) % 12))].sort((a, b) => a - b).join(',') : '';
    const changed = !!chord && !!prevChord && chord !== prevChord;
    if (chord) prevChord = chord;
    if (slot % SLOTS_PER_BEAT !== 0) continue;
    const beat = (((slot / SLOTS_PER_BEAT) % 4) + 4) % 4;
    const low = Math.min(...ns.map((n) => n.pitch));
    score[beat] += 1 + Math.max(0, 52 - low) / 12 + (ns.length >= 3 ? 0.5 : 0) + (slot === first ? 1.5 : 0) + (changed ? 2 : 0);
  }
  // the drums' backbeat leaves two candidates: the notes pick between them
  const allowed = fromDrums ? [fromDrums.pair, fromDrums.pair + 2] : [0, 1, 2, 3];
  let best = allowed[0];
  for (const i of allowed) if (score[i] > score[best] + 1e-9) best = i;
  return best;
}

/**
 * Moves slots so 0 is a bar line: the bar starts on beat `downbeat` of the grid and leading bars
 * without notes are dropped. With a fixed downbeat (count-in) bar 0 starts at beat 0 and notes before
 * it (played during the count-in) are dropped, allowing one sixteenth of early playing.
 */
export function toBars(notes: QNote[], downbeat: number, fixedDownbeat = false): QNote[] {
  if (!notes.length) return [];
  const origin = barOrigin(notes, downbeat, fixedDownbeat);
  const kept = fixedDownbeat ? notes.filter((n) => n.slot >= -1).map((n) => ({ ...n, slot: Math.max(0, n.slot) })) : notes;
  return kept.map((n) => ({ ...n, slot: n.slot - origin }));
}

/** The grid slot that becomes slot 0 (the first bar line) in `toBars`. */
export function barOrigin(notes: QNote[], downbeat: number, fixedDownbeat = false): number {
  if (fixedDownbeat) {
    const kept = notes.filter((n) => n.slot >= -1).map((n) => Math.max(0, n.slot));
    const first = kept.length ? Math.min(...kept) : 0;
    return Math.floor(first / SLOTS_PER_BAR) * SLOTS_PER_BAR;
  }
  if (!notes.length) return 0;
  const phase = downbeat * SLOTS_PER_BEAT;
  const first = Math.min(...notes.map((n) => n.slot));
  return phase + Math.floor((first - phase) / SLOTS_PER_BAR) * SLOTS_PER_BAR;
}

/**
 * The bar line from the drums. Rock and pop put the snare on the backbeat (2 and 4) and the kick
 * on 1 and 3, so each beat scores kick minus snare (z-scored over the song) and every 4th beat is
 * summed per phase. The backbeat separates the pairs {1,3} and {2,4} clearly; 1 vs 3 is subtler
 * (the kick is usually a little stronger on 1). Returns the phase, or only the pair when 1 vs 3 is
 * unclear, or null without a steady drum pattern.
 */
export function drumPhase(drums: readonly [number, number][], minBeats = 32): { pair: number; phase: number | null } | null {
  if (drums.length < minBeats) return null;
  const z = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
    return xs.map((x) => (x - m) / sd);
  };
  const k = z(drums.map((d) => d[0]));
  const sn = z(drums.map((d) => d[1]));
  const sum = [0, 0, 0, 0];
  const n = [0, 0, 0, 0];
  for (let i = 0; i < drums.length; i++) {
    sum[i % 4] += k[i] - sn[i];
    n[i % 4]++;
  }
  const sc = sum.map((x, p) => x / (n[p] || 1));
  const pairs = [sc[0] + sc[2], sc[1] + sc[3]];
  if (Math.abs(pairs[0] - pairs[1]) < 0.5) return null;
  const pair = pairs[0] > pairs[1] ? 0 : 1;
  const d = sc[pair] - sc[pair + 2];
  return { pair, phase: Math.abs(d) >= 0.1 ? (d > 0 ? pair : pair + 2) : null };
}

/** The bar's first beat (0–3) from the drums alone, or null when they do not tell. */
export function drumDownbeat(drums: readonly [number, number][]): number | null {
  return drumPhase(drums)?.phase ?? null;
}
