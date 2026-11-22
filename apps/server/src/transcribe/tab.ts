import { AUTO_TEX_TAG, fingerPitches, type AutoTabInfo } from '@guitar3d/shared';
import { SLOTS_PER_BAR, type QNote } from './grid.js';

/** Notes starting together. */
export interface TabEvent {
  slot: number;
  notes: QNote[];
}

/** A note with its place on the neck (`fret` relative to the capo). */
export interface PlacedNote extends QNote {
  string: number;
  fret: number;
}

export interface PlacedEvent {
  slot: number;
  notes: PlacedNote[];
}

export interface TrackPart {
  name: string;
  events: PlacedEvent[];
}

/** Notes below this confidence are flagged "may be wrong". */
export const LOW_CONFIDENCE = 0.4;
/** Simultaneous notes from which an event counts as a chord (rhythm part). */
export const CHORD_MIN_NOTES = 3;
export const LEAD_NAME = 'Lead / riff';
export const RHYTHM_NAME = 'Rhythm';

/** Groups notes by start slot. */
export function groupEvents(notes: QNote[]): TabEvent[] {
  const by = new Map<number, QNote[]>();
  for (const n of notes) {
    const list = by.get(n.slot) ?? [];
    if (!list.some((x) => x.pitch === n.pitch)) list.push(n);
    by.set(n.slot, list);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([slot, ns]) => ({ slot, notes: ns.sort((a, b) => a.pitch - b.pitch) }));
}

/** Single notes and double stops → lead / riff; 3+ simultaneous notes → rhythm. */
export function splitLeadRhythm(events: TabEvent[]): { lead: TabEvent[]; rhythm: TabEvent[] } {
  return {
    lead: events.filter((e) => e.notes.length < CHORD_MIN_NOTES),
    rhythm: events.filter((e) => e.notes.length >= CHORD_MIN_NOTES),
  };
}

/**
 * Strings and frets for a part (DP over positions, see `fingerPitches`). Notes that can't be
 * placed on this tuning/capo are dropped; events left empty disappear.
 */
export function placeEvents(events: TabEvent[], tuning: readonly number[], capo = 0): { events: PlacedEvent[]; dropped: number } {
  const shifted = tuning.map((m) => m + capo);
  const r = fingerPitches(events.map((e) => e.notes.map((n) => n.pitch)), shifted, { maxFret: 17 - capo });
  let dropped = 0;
  const out: PlacedEvent[] = [];
  events.forEach((e, i) => {
    const notes: PlacedNote[] = [];
    e.notes.forEach((n, j) => {
      const p = r.beats[i][j];
      if (p) notes.push({ ...n, string: p.string, fret: p.fret });
      else dropped++;
    });
    if (notes.length) out.push({ slot: e.slot, notes });
  });
  return { events: out, dropped };
}

/** Largest note value (in sixteenths, a power of two ≤ 16) that fits `len` and starts on its own grid at `pos`. */
export function alignedValue(pos: number, len: number): number {
  for (const v of [16, 8, 4, 2, 1]) if (v <= len && pos % v === 0) return v;
  return 1;
}

/** alphaTex duration of a value in sixteenths: 16 → 1 (whole) … 1 → 16. */
const texDur = (v: number) => 16 / v;

/** Rests covering [pos, pos + len) within a bar, each on its own grid. */
export function restTokens(pos: number, len: number): string[] {
  const out: string[] = [];
  while (len > 0) {
    const v = alignedValue(pos, len);
    out.push(`r.${texDur(v)}`);
    pos += v;
    len -= v;
  }
  return out;
}

export interface RenderedTrack {
  bars: string[];
  /** Low-confidence notes: [bar, beat index in the bar, tab string]. */
  low: [number, number, number][];
  notes: number;
}

/**
 * alphaTex bars for a part. Each event lasts until the next one (or its own length, or the bar
 * line, whichever comes first) and is written with the largest plain note value that fits; the
 * gaps become rests. No ties or dots, so the light tab editor can open the result.
 */
export function renderTrack(events: PlacedEvent[], barCount: number, lowConf = LOW_CONFIDENCE): RenderedTrack {
  const bars: string[] = [];
  const low: RenderedTrack['low'] = [];
  let notes = 0;
  let ei = 0;
  for (let bar = 0; bar < barCount; bar++) {
    const start = bar * SLOTS_PER_BAR;
    const end = start + SLOTS_PER_BAR;
    const tokens: string[] = [];
    let pos = 0;
    while (ei < events.length && events[ei].slot < end) {
      const e = events[ei];
      const at = e.slot - start;
      if (at > pos) tokens.push(...restTokens(pos, at - pos));
      const next = ei + 1 < events.length ? Math.min(events[ei + 1].slot, end) : end;
      const len = Math.max(1, Math.min(Math.max(...e.notes.map((n) => n.len)), next - e.slot));
      const v = alignedValue(at, len);
      const sorted = [...e.notes].sort((a, b) => a.string - b.string);
      const body = sorted.map((n) => `${n.fret}.${n.string}`);
      sorted.forEach((n) => {
        if (n.conf < lowConf) low.push([bar, tokens.length, n.string]);
      });
      notes += sorted.length;
      tokens.push(body.length === 1 ? `${body[0]}.${texDur(v)}` : `(${body.join(' ')}).${texDur(v)}`);
      pos = at + v;
      ei++;
    }
    if (pos < SLOTS_PER_BAR) tokens.push(...restTokens(pos, SLOTS_PER_BAR - pos));
    bars.push(tokens.join(' '));
  }
  return { bars, low, notes };
}

const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
/** alphaTex pitch: 64 → "e4". */
export const texPitch = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export interface TexInput {
  title: string;
  artist?: string;
  tempo: number;
  tuning: readonly number[];
  capo: number;
  parts: TrackPart[];
  detected: string;
  /** General MIDI program (25 = steel-string acoustic; guitar programs also set the notation octave). */
  program?: number;
}

/** The whole auto-transcribed tab, starting with the `AUTO_TEX_TAG` info line. */
export function buildAlphaTex(input: TexInput): { tex: string; info: AutoTabInfo } {
  const last = Math.max(0, ...input.parts.flatMap((p) => p.events.map((e) => e.slot)));
  const barCount = Math.floor(last / SLOTS_PER_BAR) + 1;
  const tracks = input.parts.map((p) => ({ part: p, r: renderTrack(p.events, barCount) }));
  const info: AutoTabInfo = {
    v: 1,
    detected: input.detected,
    notes: tracks.reduce((s, t) => s + t.r.notes, 0),
    low: tracks.flatMap((t, ti) => t.r.low.map(([bar, beat, string]) => [ti, bar, beat, string] as [number, number, number, number])),
  };
  const head = [
    `${AUTO_TEX_TAG}${JSON.stringify(info)}`,
    `\\title "${esc(input.title)}"`,
    input.artist ? `\\artist "${esc(input.artist)}"` : '',
    `\\tempo ${Math.round(input.tempo)}`,
    '.',
  ].filter(Boolean);
  const body = tracks.map(({ part, r }) =>
    [
      `\\track "${esc(part.name)}"`,
      '\\staff {score tabs}',
      `\\instrument ${input.program ?? 25}`,
      `\\tuning ${input.tuning.map(texPitch).join(' ')}`,
      input.capo ? `\\capo ${input.capo}` : '',
      `${r.bars.join(' |\n')} |`,
    ].filter(Boolean).join('\n'),
  );
  return { tex: `${head.join('\n')}\n${body.join('\n')}\n`, info };
}
