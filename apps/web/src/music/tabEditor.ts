import { texPitch } from './tex';
import { STANDARD } from './tunings';

/**
 * Model of the light tab editor and its alphaTex round trip. Pure and immutable: every edit returns
 * a new document, so undo is a stack of documents.
 */

export type Duration = 1 | 2 | 4 | 8 | 16;
export const DURATIONS: Duration[] = [1, 2, 4, 8, 16];
export const DURATION_LABEL: Record<Duration, string> = { 1: 'Birlik', 2: 'İkilik', 4: 'Dörtlük', 8: 'Sekizlik', 16: 'Onaltılık' };

export interface EdNote {
  /** Tab string, 1 = high e. */
  string: number;
  fret: number;
}

export interface EdBeat {
  duration: Duration;
  /** Empty = rest. */
  notes: EdNote[];
}

export interface EdBar {
  beats: EdBeat[];
}

export interface EdDoc {
  title: string;
  tempo: number;
  /** Beats per bar (quarter-note beats). */
  beatsPerBar: number;
  /** MIDI per string, tab order. */
  tuning: number[];
  bars: EdBar[];
}

export const restBeat = (duration: Duration = 4): EdBeat => ({ duration, notes: [] });
export const emptyBar = (): EdBar => ({ beats: [restBeat(4)] });

export function newDoc(title = 'Yeni riff'): EdDoc {
  return { title, tempo: 90, beatsPerBar: 4, tuning: [...STANDARD.midi], bars: [emptyBar()] };
}

/* ---------- timing ---------- */

/** Length of a beat in sixteenths. */
export const sixteenths = (d: Duration) => 16 / d;
export const barCapacity = (doc: Pick<EdDoc, 'beatsPerBar'>) => doc.beatsPerBar * 4;
export const barUsed = (bar: EdBar) => bar.beats.reduce((s, b) => s + sixteenths(b.duration), 0);

export type BarFill = 'short' | 'full' | 'over';
export function barFill(doc: EdDoc, bar: EdBar): BarFill {
  const u = barUsed(bar);
  const c = barCapacity(doc);
  return u === c ? 'full' : u < c ? 'short' : 'over';
}

/* ---------- edits ---------- */

export interface Cursor {
  bar: number;
  beat: number;
  /** Tab string 1..6. */
  string: number;
}

const mapBar = (doc: EdDoc, i: number, f: (b: EdBar) => EdBar): EdDoc => ({ ...doc, bars: doc.bars.map((b, k) => (k === i ? f(b) : b)) });
const mapBeat = (doc: EdDoc, c: Cursor, f: (b: EdBeat) => EdBeat): EdDoc =>
  mapBar(doc, c.bar, (bar) => ({ beats: bar.beats.map((b, k) => (k === c.beat ? f(b) : b)) }));

/** Puts `fret` on the cursor's string of the cursor's beat (replacing what was on that string). */
export function setFret(doc: EdDoc, c: Cursor, fret: number): EdDoc {
  const f = Math.max(0, Math.min(24, Math.round(fret)));
  return mapBeat(doc, c, (b) => ({ ...b, notes: [...b.notes.filter((n) => n.string !== c.string), { string: c.string, fret: f }].sort((x, y) => x.string - y.string) }));
}

export function clearFret(doc: EdDoc, c: Cursor): EdDoc {
  return mapBeat(doc, c, (b) => ({ ...b, notes: b.notes.filter((n) => n.string !== c.string) }));
}

export function setDuration(doc: EdDoc, c: Pick<Cursor, 'bar' | 'beat'>, d: Duration): EdDoc {
  return mapBeat(doc, { ...c, string: 1 }, (b) => ({ ...b, duration: d }));
}

/** Inserts a rest beat after the cursor (same duration) and returns the new doc. */
export function insertBeat(doc: EdDoc, c: Pick<Cursor, 'bar' | 'beat'>): EdDoc {
  return mapBar(doc, c.bar, (bar) => {
    const d = bar.beats[c.beat]?.duration ?? 4;
    const beats = [...bar.beats];
    beats.splice(c.beat + 1, 0, restBeat(d));
    return { beats };
  });
}

export function deleteBeat(doc: EdDoc, c: Pick<Cursor, 'bar' | 'beat'>): EdDoc {
  return mapBar(doc, c.bar, (bar) => (bar.beats.length <= 1 ? { beats: [restBeat(bar.beats[0]?.duration ?? 4)] } : { beats: bar.beats.filter((_, k) => k !== c.beat) }));
}

export function addBar(doc: EdDoc, after = doc.bars.length - 1, bar: EdBar = emptyBar()): EdDoc {
  const bars = [...doc.bars];
  bars.splice(after + 1, 0, structuredClone(bar));
  return { ...doc, bars };
}

export function deleteBar(doc: EdDoc, i: number): EdDoc {
  if (doc.bars.length <= 1) return { ...doc, bars: [emptyBar()] };
  return { ...doc, bars: doc.bars.filter((_, k) => k !== i) };
}

/** Replaces bar `i` with a copy of `bar` (paste). */
export function pasteBar(doc: EdDoc, i: number, bar: EdBar): EdDoc {
  return mapBar(doc, i, () => structuredClone(bar));
}

/**
 * Cursor step to the right: next beat, or the first beat of the next bar. When `grow` is set and the
 * cursor is on the last beat, a beat is added while the bar has room, else a new bar.
 */
export function stepRight(doc: EdDoc, c: Cursor, grow = false): { doc: EdDoc; cursor: Cursor } {
  const bar = doc.bars[c.bar];
  if (c.beat < bar.beats.length - 1) return { doc, cursor: { ...c, beat: c.beat + 1 } };
  if (grow) {
    if (barUsed(bar) < barCapacity(doc)) {
      const d = bar.beats[c.beat].duration;
      const room = barCapacity(doc) - barUsed(bar);
      const dur = DURATIONS.find((x) => x >= d && sixteenths(x) <= room) ?? (16 as Duration);
      const next = mapBar(doc, c.bar, (b) => ({ beats: [...b.beats, restBeat(dur)] }));
      return { doc: next, cursor: { ...c, beat: c.beat + 1 } };
    }
    if (c.bar === doc.bars.length - 1) return { doc: addBar(doc, c.bar, { beats: [restBeat(bar.beats[c.beat].duration)] }), cursor: { ...c, bar: c.bar + 1, beat: 0 } };
  }
  if (c.bar < doc.bars.length - 1) return { doc, cursor: { ...c, bar: c.bar + 1, beat: 0 } };
  return { doc, cursor: c };
}

export function stepLeft(doc: EdDoc, c: Cursor): Cursor {
  if (c.beat > 0) return { ...c, beat: c.beat - 1 };
  if (c.bar > 0) return { ...c, bar: c.bar - 1, beat: doc.bars[c.bar - 1].beats.length - 1 };
  return c;
}

/* ---------- alphaTex ---------- */

const esc = (s: string) => s.replace(/["\\]/g, '');

function beatTex(b: EdBeat): string {
  if (!b.notes.length) return `r.${b.duration}`;
  const ns = [...b.notes].sort((x, y) => x.string - y.string).map((n) => `${n.fret}.${n.string}`);
  return ns.length === 1 ? `${ns[0]}.${b.duration}` : `(${ns.join(' ')}).${b.duration}`;
}

export function toAlphaTex(doc: EdDoc): string {
  const head = [
    `\\title "${esc(doc.title) || 'Riff'}"`,
    `\\tempo ${Math.round(doc.tempo)}`,
    '.',
    '\\track "Gitar"',
    '\\staff {tabs}',
    `\\tuning ${doc.tuning.map(texPitch).join(' ')}`,
  ];
  const bars = doc.bars.map((bar, i) => `${i === 0 ? `\\ts ${doc.beatsPerBar} 4 ` : ''}${bar.beats.map(beatTex).join(' ')}`);
  return `${head.join('\n')}\n${bars.join(' |\n')} |\n`;
}

const NOTE_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "e4" → 64, "c#4" → 61, "bb3" → 58; null when it is not a pitch. */
export function parseTexPitch(t: string): number | null {
  const m = /^([a-g])(#|b)?(-?\d)$/i.exec(t.trim());
  if (!m) return null;
  const base = NOTE_PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return base + (Number(m[3]) + 1) * 12;
}

/** Splits the body into tokens, keeping (…) chords together and dropping {…} effects. */
function tokenize(body: string): string[] {
  const out: string[] = [];
  let i = 0;
  const s = body.replace(/\/\/.*$/gm, '');
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '{') {
      const j = s.indexOf('}', i);
      i = j < 0 ? s.length : j + 1;
      continue;
    }
    if (ch === '|') {
      out.push('|');
      i++;
      continue;
    }
    if (ch === '(') {
      const j = s.indexOf(')', i);
      let k = j < 0 ? s.length : j + 1;
      while (k < s.length && /[.\d]/.test(s[k])) k++;
      out.push(s.slice(i, k));
      i = k;
      continue;
    }
    let k = i;
    while (k < s.length && !/[\s|{(]/.test(s[k])) k++;
    out.push(s.slice(i, k));
    i = k;
  }
  return out;
}

const asDuration = (n: number): Duration | null => (DURATIONS.includes(n as Duration) ? (n as Duration) : null);

/**
 * Parses the alphaTex subset the editor writes (and simple hand-written tabs): metadata
 * \title \tempo \tuning \ts, then beats `fret.string[.dur]`, `(f.s f.s)[.dur]`, `r[.dur]`, `:dur`
 * and bar lines. Effects in {…} are ignored. Throws when nothing playable is found.
 */
export function parseAlphaTex(text: string): EdDoc {
  const doc = newDoc('');
  doc.bars = [];
  const dot = text.search(/^\s*\.\s*$/m);
  const metaPart = dot >= 0 ? text.slice(0, dot) : '';
  let body = dot >= 0 ? text.slice(dot).replace(/^\s*\./, '') : text;
  const title = /\\title\s+"([^"]*)"/.exec(metaPart) ?? /\\title\s+(\S+)/.exec(metaPart);
  if (title) doc.title = title[1];
  const tempo = /\\tempo\s+(\d+)/.exec(text);
  if (tempo) doc.tempo = Number(tempo[1]);
  // staff-level metadata lines in the body
  body = body.replace(/\\track\b[^\n]*|\\staff\b[^\n]*|\\instrument\b[^\n]*|\\capo\s+\d+/g, ' ');
  const tuning = /\\tuning\s+([^\n\\]+)/.exec(body);
  if (tuning) {
    const ps = tuning[1].trim().split(/\s+/).map(parseTexPitch);
    if (ps.length >= 4 && ps.every((p) => p != null)) doc.tuning = ps as number[];
    body = body.replace(tuning[0], ' ');
  }
  const ts = /\\ts\s+(\d+)\s+(\d+)/.exec(body);
  if (ts) {
    doc.beatsPerBar = Math.max(1, Math.round((Number(ts[1]) * 4) / Number(ts[2])));
    body = body.replace(ts[0], ' ');
  }
  body = body.replace(/\\\w+(\s+"[^"]*"|\s+\S+)?/g, ' ');

  let dur: Duration = 4;
  let bar: EdBeat[] = [];
  const flush = () => {
    if (bar.length) doc.bars.push({ beats: bar });
    bar = [];
  };
  for (const tok of tokenize(body)) {
    if (tok === '|') {
      flush();
      continue;
    }
    if (tok.startsWith(':')) {
      dur = asDuration(Number(tok.slice(1))) ?? dur;
      continue;
    }
    let notes: EdNote[] = [];
    let rest = tok;
    if (tok.startsWith('(')) {
      const close = tok.indexOf(')');
      notes = tok.slice(1, close).trim().split(/\s+/).map((n) => n.split('.').map(Number)).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map(([f, s]) => ({ fret: f, string: s }));
      rest = tok.slice(close + 1);
      const d = rest.startsWith('.') ? asDuration(Number(rest.slice(1))) : null;
      if (d) dur = d;
      bar.push({ duration: dur, notes });
      continue;
    }
    const parts = rest.split('.');
    if (parts[0] === 'r') {
      const d = parts[1] ? asDuration(Number(parts[1])) : null;
      if (d) dur = d;
      bar.push(restBeat(dur));
      continue;
    }
    const nums = parts.map(Number);
    if (nums.length >= 2 && nums.slice(0, 2).every(Number.isFinite)) {
      const d = nums[2] ? asDuration(nums[2]) : null;
      if (d) dur = d;
      bar.push({ duration: dur, notes: [{ fret: nums[0], string: nums[1] }] });
    }
  }
  flush();
  if (!doc.bars.length) throw new Error('alphaTex içinde nota bulunamadı.');
  if (!doc.title) doc.title = 'İçe aktarılan tab';
  return doc;
}
