import {
  buildStrumAnalysis,
  chooseResolution,
  chordName,
  EMPTY_BAR,
  gridDirection,
  type StrumAnalysis,
  type StrumBar,
  type StrumResolution,
  type StrumToken,
} from '@guitar3d/shared';
import { SLOTS_PER_BAR, SLOTS_PER_BEAT, type BeatGrid, type RawNote, type RawStrum } from './grid.js';
import type { TabEvent } from './tab.js';

/**
 * Strum analysis of the rhythm part: onsets of the guitar track on the bar grid, their direction
 * (beat position, refined by which strings sound first when that cue proves reliable), muted
 * "chucks", accents, chords per half bar and the repeating pattern.
 */

/** A strum on the bar grid. */
export interface Strum {
  slot: number;
  dir: 'D' | 'U';
  chuck: boolean;
  accent: boolean;
  strength: number;
  /** Loudness for accents: the attack level when known, else the onset strength. */
  level: number;
  spread: number | null;
}

/**
 * A chuck dies within ~80 ms and has little pitch (no sustained note starts with it, or it is
 * noise-like); one that is gone almost at once is a chuck whatever the note tracker heard.
 */
export const CHUCK_MAX_DECAY = 0.3;
export const CHUCK_SURE_DECAY = 0.12;
export const CHUCK_MIN_FLATNESS = 0.3;
/** Notes starting this close to an onset (s) make it pitched. */
export const PITCH_WINDOW = 0.05;
/** Onsets weaker than this share of the median strength are ignored (string noise, ringing). */
export const MIN_REL_STRENGTH = 0.2;
/** Above this share of note-less, ringing onsets the note tracker is missing strums: keep them all. */
export const MAX_SILENT_SHARE = 0.35;
/** Louder than the bar's median strum by this factor = accent. */
export const ACCENT_FACTOR = 1.35;

export function isChuck(s: Pick<RawStrum, 'decay' | 'flatness'>, pitched: boolean): boolean {
  const decay = s.decay ?? 1;
  if (decay > CHUCK_MAX_DECAY) return false;
  return decay <= CHUCK_SURE_DECAY || !pitched || (s.flatness ?? 0) >= CHUCK_MIN_FLATNESS;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Directions by the constant-motion rule, then the attack cue: when on-beat strums (nearly always
 * down) show "low strings first" consistently, the cue is trusted, and a beat position (slot in the
 * bar) whose strums mostly show the opposite of the rule is flipped as a whole, e.g. all-down
 * eighths. Single strums are never flipped on their own: per-strum timing is too noisy.
 */
export function assignDirections(strums: Omit<Strum, 'dir'>[], resolution: StrumResolution): { strums: Strum[]; method: 'grid' | 'grid+spectral' } {
  const out: Strum[] = strums.map((s) => ({ ...s, dir: gridDirection(s.slot, resolution) }));
  const cued = out.filter((s) => !s.chuck && s.spread != null && s.spread !== 0);
  const onBeat = cued.filter((s) => s.slot % SLOTS_PER_BEAT === 0);
  const reliable = onBeat.length >= 6 && onBeat.filter((s) => s.spread! > 0).length / onBeat.length >= 0.8;
  if (!reliable) return { strums: out, method: 'grid' };
  const byPos = new Map<number, Strum[]>();
  for (const s of cued) {
    const p = s.slot % SLOTS_PER_BAR;
    byPos.set(p, [...(byPos.get(p) ?? []), s]);
  }
  for (const [pos, list] of byPos) {
    const rule = gridDirection(pos, resolution);
    const against = list.filter((s) => (s.spread! > 0 ? 'D' : 'U') !== rule).length;
    const need = pos % SLOTS_PER_BEAT === 0 ? { n: 4, share: 0.9 } : { n: 3, share: 0.75 };
    if (list.length >= need.n && against / list.length >= need.share) {
      const flip = rule === 'D' ? 'U' : 'D';
      for (const s of out) if (s.slot % SLOTS_PER_BAR === pos) s.dir = flip;
    }
  }
  return { strums: out, method: 'grid+spectral' };
}

/** "G/D" → "G". */
const stripBass = (name: string) => name.split('/')[0];

/**
 * Most common chord over the events (weighted by notes), or null. Votes ignore the bass note so a
 * partial up-strum (G/D) counts for its chord (G); the slash name wins only when no event has the
 * plain chord.
 */
export function nameChord(events: readonly TabEvent[]): string | null {
  const votes = new Map<string, number>();
  const full = new Map<string, Set<string>>();
  for (const e of events) {
    const n = chordName(e.notes.map((x) => x.pitch));
    if (!n) continue;
    const k = stripBass(n);
    votes.set(k, (votes.get(k) ?? 0) + e.notes.length);
    full.set(k, (full.get(k) ?? new Set()).add(n));
  }
  let best: string | null = null;
  for (const [n, v] of votes) if (!best || v > votes.get(best)!) best = n;
  if (!best) return null;
  const names = full.get(best)!;
  return names.has(best) || names.size > 1 ? best : [...names][0];
}

export interface StrumInput {
  strums: RawStrum[];
  grid: BeatGrid;
  /** Grid slot of the first bar line (see `barOrigin`). */
  origin: number;
  barCount: number;
  /** Transcribed notes (seconds), to tell pitched strums from chucks. */
  notes: readonly RawNote[];
  /** Rhythm-part events (3+ notes) on the bar grid. */
  rhythm: readonly TabEvent[];
}

export interface StrumResult {
  analysis: StrumAnalysis;
  strums: Strum[];
}

/** Null when the part isn't strummed (fewer than four strums in bars with chords). */
export function analyzeStrums(input: StrumInput): StrumResult | null {
  const { grid, origin, barCount, rhythm } = input;
  const chordBars = new Set(rhythm.map((e) => Math.floor(e.slot / SLOTS_PER_BAR)));
  // strummed bars: bars with chords plus single-bar gaps between them
  const strummedBar = (b: number) => chordBars.has(b) || (chordBars.has(b - 1) && chordBars.has(b + 1));

  const bySlot = new Map<number, RawStrum>();
  for (const s of input.strums) {
    if (!Number.isFinite(s.t)) continue;
    const slot = Math.round(grid.toBeat(s.t) * SLOTS_PER_BEAT) - origin;
    if (slot < 0 || slot >= barCount * SLOTS_PER_BAR || !strummedBar(Math.floor(slot / SLOTS_PER_BAR))) continue;
    const had = bySlot.get(slot);
    if (!had || s.strength > had.strength) bySlot.set(slot, s);
  }
  const floor = Math.max(0.03, MIN_REL_STRENGTH * median([...bySlot.values()].map((s) => s.strength)));
  const kept = [...bySlot.entries()].filter(([, s]) => s.strength >= floor).sort((a, b) => a[0] - b[0]);
  if (kept.length < 4) return null;

  const pitched = (t: number) => input.notes.some((n) => Math.abs(n.start - t) <= PITCH_WINDOW && n.end - n.start >= 0.1);
  let base = kept.map(([slot, s]) => {
    const p = pitched(s.t);
    return { slot, pitched: p, chuck: isChuck(s, p), accent: false, strength: s.strength, level: s.level ?? s.strength, spread: s.spread ?? null };
  });
  // Onsets with no note and no chuck are other instruments bleeding into the stem (kick, hi-hat)
  // unless the note tracker missed most strums (re-strummed ringing chords), then keep them all.
  const silent = base.filter((s) => !s.pitched && !s.chuck);
  if (silent.length <= MAX_SILENT_SHARE * base.length) base = base.filter((s) => s.pitched || s.chuck);
  const resolution = chooseResolution(base.map((s) => s.slot));
  // with an eighths feel, odd sixteenths that don't recur are timing noise
  if (resolution === 8) base = base.filter((s) => s.slot % 2 === 0);
  if (base.length < 4) return null;
  const { strums, method } = assignDirections(base.map(({ pitched: _p, ...rest }) => rest), resolution);

  // accents: clearly louder than the bar's typical strum
  const byBar = new Map<number, Strum[]>();
  for (const s of strums) byBar.set(Math.floor(s.slot / SLOTS_PER_BAR), [...(byBar.get(Math.floor(s.slot / SLOTS_PER_BAR)) ?? []), s]);
  for (const list of byBar.values()) {
    const ring = list.filter((s) => !s.chuck);
    if (ring.length < 3) continue;
    const m = median(ring.map((s) => s.level));
    for (const s of ring) s.accent = s.level >= m * ACCENT_FACTOR;
  }

  // chords per half bar, carried forward through strummed halves without chord events
  const bars: StrumBar[] = [];
  let carry: string | null = null;
  for (let b = 0; b < barCount; b++) {
    const list = byBar.get(b) ?? [];
    const chords: [string | null, string | null] = [null, null];
    for (const h of [0, 1] as const) {
      const lo = b * SLOTS_PER_BAR + h * (SLOTS_PER_BAR / 2);
      const found = nameChord(rhythm.filter((e) => e.slot >= lo && e.slot < lo + SLOTS_PER_BAR / 2));
      // the same chord with another bass note (partial strum) keeps the ringing chord's name
      const name: string | null = found && carry && stripBass(found) === stripBass(carry) ? carry : found;
      const strummedHalf = list.some((s) => s.slot >= lo && s.slot < lo + SLOTS_PER_BAR / 2);
      if (name) carry = name;
      chords[h] = name ?? (strummedHalf ? carry : null);
    }
    const tokens = EMPTY_BAR.split('') as StrumToken[];
    for (const s of list) tokens[s.slot % SLOTS_PER_BAR] = s.chuck ? 'X' : s.dir;
    const accents = list.filter((s) => s.accent).map((s) => s.slot % SLOTS_PER_BAR);
    bars.push({ s: tokens.join(''), ...(accents.length ? { a: accents } : {}), c: chords });
  }
  const barTimes = Array.from({ length: barCount + 1 }, (_, b) => Math.round(grid.toTime((origin + b * SLOTS_PER_BAR) / SLOTS_PER_BEAT) * 1000) / 1000);
  const analysis = buildStrumAnalysis({ bars, tempo: grid.tempo, method, barTimes, resolution });
  return { analysis, strums };
}

const pcs = (e: TabEvent) => new Set(e.notes.map((n) => ((n.pitch % 12) + 12) % 12));

/**
 * Puts the strums into the parts: every strum becomes a rhythm event (the chord transcribed there,
 * or the voicing that is ringing: the last chord before it, else the next one) with its stroke,
 * accent and, for chucks, dead notes. An onset transcribed as a single note outside the ringing
 * chord is a riff note, not a strum the transcriber half missed: it gets no copied chord (in riff
 * songs copying once turned every picked note into a full chord). Chord events within a sixteenth of a strum merge into it and
 * lead notes that only repeat the strummed chord's notes move out of the lead part.
 */
export function applyStrums(rhythm: readonly TabEvent[], lead: readonly TabEvent[], strums: readonly Strum[], bars?: readonly StrumBar[]): { rhythm: TabEvent[]; lead: TabEvent[] } {
  if (!strums.length) return { rhythm: [...rhythm], lead: [...lead] };
  const strumSlots = new Set(strums.map((s) => s.slot));
  const near = (slot: number) => rhythm.filter((e) => Math.abs(e.slot - slot) <= 1).sort((a, b) => Math.abs(a.slot - slot) - Math.abs(b.slot - slot) || b.notes.length - a.notes.length)[0];
  const voicing = (slot: number) => {
    const before = [...rhythm].reverse().find((e) => e.slot <= slot && e.slot >= slot - 2 * SLOTS_PER_BAR);
    return before ?? rhythm.find((e) => e.slot > slot && e.slot <= slot + SLOTS_PER_BAR / 2);
  };
  // chord symbols: the analysis' half-bar chords when given, else the strummed voicing's name
  const half = (slot: number) => {
    const b = bars?.[Math.floor(slot / SLOTS_PER_BAR)];
    return b ? b.c[(slot % SLOTS_PER_BAR) < SLOTS_PER_BAR / 2 ? 0 : 1] : undefined;
  };
  const out: TabEvent[] = [];
  const used = new Set<TabEvent>();
  // the picked note(s) closest to a strum, within a sixteenth
  const pickedAt = (slot: number) => {
    const by = lead.filter((e) => Math.abs(e.slot - slot) <= 1);
    const d = Math.min(...by.map((e) => Math.abs(e.slot - slot)));
    return by.filter((e) => Math.abs(e.slot - slot) === d);
  };
  let lastChord: string | null = null;
  for (const s of strums) {
    const own = near(s.slot);
    const src = own ?? voicing(s.slot);
    if (!src) continue;
    if (!own) {
      const cp = pcs(src);
      if (pickedAt(s.slot).some((e) => [...pcs(e)].some((p) => !cp.has(p)))) continue;
    }
    if (own) used.add(own);
    const name = s.chuck ? null : bars ? (half(s.slot) ?? null) : chordName(src.notes.map((n) => n.pitch));
    const ev: TabEvent = {
      slot: s.slot,
      // a copied voicing rings until the next strum (the renderer cuts it there)
      notes: src.notes.map((n) => ({ ...n, slot: s.slot, len: own ? n.len : SLOTS_PER_BAR, ...(s.chuck ? { dead: true } : {}) })),
      stroke: s.dir,
      ...(s.accent ? { accent: true } : {}),
      ...(name && name !== lastChord ? { chord: name } : {}),
    };
    if (name) lastChord = name;
    out.push(ev);
  }
  // chord events away from any strum stay as they were
  for (const e of rhythm) if (!used.has(e) && !strumSlots.has(e.slot) && ![-1, 1].some((d) => strumSlots.has(e.slot + d))) out.push(e);
  out.sort((a, b) => a.slot - b.slot);

  const chordAt = (slot: number) => [...out].reverse().find((e) => e.slot <= slot + 1);
  const keptLead = lead.filter((e) => {
    if (![0, -1, 1].some((d) => strumSlots.has(e.slot + d))) return true;
    const c = chordAt(e.slot);
    if (!c) return true;
    const cp = pcs(c);
    return ![...pcs(e)].every((p) => cp.has(p));
  });
  return { rhythm: out, lead: keptLead };
}
