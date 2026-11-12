/**
 * ASCII guitar tab → alphaTex (alphaTab 1.9) converter. Framework free.
 *
 * Understands the classic six-line notation:
 *
 *     e|-----0-----|-0h2-----|
 *     B|---1---1---|-----3p1-|
 *     G|-2-------2-|---------|
 *     D|-----------|---------|
 *     A|-----------|---------|
 *     E|-----------|---------|
 *
 * - string labels are optional (e B G D A E, lower/upper case, alternative tunings like `D|`, `Eb|`);
 *   the top line is the highest string unless the labels clearly say otherwise (`E A D G B e`);
 * - multi-digit frets, `h` `p` (hammer-on / pull-off), `/` `\` `s` (slide), `b` (bend, `7b9`, `7b9r7`),
 *   `x` (dead note), `~` (vibrato), `<12>` (natural harmonic), `( )` ghost brackets are dropped;
 * - bar lines `|` (any number of systems, separated by blank lines or text);
 * - rhythm comes from character spacing: each bar is one measure of the chosen time signature and the
 *   note columns are quantised to an eighth or sixteenth grid. Systems without bar lines (or when
 *   `charsPerBeat` is given) use absolute spacing instead.
 */

export interface AsciiTabOptions {
  /** Tempo in BPM. Defaults to a `Tempo: 120`/`120 bpm` line in the text, else 90. */
  tempo?: number;
  /** Time signature of every bar, default [4, 4]. */
  timeSignature?: [number, number];
  /** Quantisation grid: 8 = eighths, 16 = sixteenths (default). */
  quantize?: 8 | 16;
  /** Absolute spacing: this many characters make one beat. Ignores bar widths for rhythm. */
  charsPerBeat?: number;
  title?: string;
  artist?: string;
  trackName?: string;
}

export interface AsciiTabResult {
  alphaTex: string;
  title?: string;
  artist?: string;
  tempo: number;
  /** Tuning from high to low string, e.g. ['E4','B3','G3','D3','A2','E2']. */
  tuning: string[];
  systems: number;
  bars: number;
  notes: number;
  warnings: string[];
}

/** One string of one system: content after the first bar line, label (may be ''). */
interface TabLine {
  label: string;
  content: string;
}

export interface TabSystem {
  /** Six lines, high string first. */
  lines: TabLine[];
  /** 0-based line number of the first line in the source text. */
  startLine: number;
}

interface ParsedNote {
  /** alphaTex string number: 1 = high e … 6 = low E. */
  string: number;
  /** -1 = dead note. */
  fret: number;
  col: number;
  len: number;
  hammer?: boolean;
  slide?: boolean;
  vibrato?: boolean;
  harmonic?: boolean;
  /** Bend curve in quarter tones, e.g. [0, 4] or [0, 4, 0]. */
  bend?: number[];
}

interface Beat {
  pos: number;
  notes: ParsedNote[];
}

const TAB_CHARS = /^[-0-9|hpbrs/\\x~()<>.^vtPM*=:\s]*$/;
const LABEL = /^[A-Ga-g][#b♯♭]?$/;
const STANDARD_MIDI = [64, 59, 55, 50, 45, 40];
const STANDARD_TUNING = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];
const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Parses one text line into a tab line, or null when it does not look like one. */
export function parseTabLine(raw: string): TabLine | null {
  const line = raw.replace(/\t/g, '    ').replace(/\s+$/, '');
  const m = /^\s*([A-Ga-g][#b♯♭]?)?\s*([|:]|(?=-))(.*)$/.exec(line);
  if (!m) return null;
  const label = m[1] ?? '';
  let content = m[3];
  if (!label && m[2] === ':') return null;
  // Cut trailing annotations such as "  x4" or " (repeat)" after the last bar line.
  const lastBar = content.lastIndexOf('|');
  if (lastBar >= 0 && /[A-Za-z]{2,}|\s/.test(content.slice(lastBar + 1)) && !/\d/.test(content.slice(lastBar + 1).replace(/x\s*\d+/i, ''))) {
    content = content.slice(0, lastBar + 1);
  }
  content = content.replace(/\s+[xX]\s*\d+\s*$/, '');
  if (!TAB_CHARS.test(content)) return null;
  const dashes = (content.match(/-/g) ?? []).length;
  if (dashes < 3 || dashes < content.replace(/\s/g, '').length * 0.4) return null;
  if (label && !LABEL.test(label)) return null;
  return { label, content };
}

/** Finds all six-line systems in a text. */
export function findTabSystems(text: string, warnings: string[] = []): TabSystem[] {
  const rows = text.split(/\r?\n/);
  const out: TabSystem[] = [];
  let run: { line: TabLine; idx: number }[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (run.length < 6) warnings.push(`${run[0].idx + 1}. satırdaki ${run.length} satırlık blok 6 telli tab değil, atlandı.`);
    else {
      for (let i = 0; i + 6 <= run.length; i += 6) out.push({ lines: run.slice(i, i + 6).map((r) => r.line), startLine: run[i].idx });
      if (run.length % 6) warnings.push(`${run[0].idx + 1}. satırdaki blokta ${run.length % 6} fazla satır atlandı.`);
    }
    run = [];
  };
  rows.forEach((r, idx) => {
    const t = parseTabLine(r);
    if (t) run.push({ line: t, idx });
    else flush();
  });
  flush();
  return out;
}

export function looksLikeAsciiTab(text: string) {
  return findTabSystems(text).length > 0;
}

function labelPc(l: string) {
  const t = l.replace('♯', '#').replace('♭', 'b');
  let pc = PC[t[0].toLowerCase()];
  if (t[1] === '#') pc += 1;
  if (t[1] === 'b') pc -= 1;
  return (pc + 12) % 12;
}

/** Semitone distance of labels (top → bottom) from standard tuning; lower = more plausible. */
function labelCost(labels: string[]) {
  return labels.reduce((s, l, i) => {
    const d = Math.abs(labelPc(l) - (STANDARD_MIDI[i] % 12));
    return s + Math.min(d, 12 - d) + (i === 0 && l === 'E' && labels[5] === 'e' ? 6 : 0);
  }, 0);
}

/**
 * Some tabs list the low string first ("E A D G B e" top → bottom). When all six lines are
 * labelled and the reversed order is clearly closer to a guitar tuning, the lines are flipped.
 */
export function orientSystem(sys: TabSystem, warnings: string[] = []): TabSystem {
  const labels = sys.lines.map((l) => l.label);
  if (labels.some((l) => !l)) return sys;
  const rev = [...labels].reverse();
  if (labelCost(rev) + 2 < labelCost(labels)) {
    warnings.push(`${sys.startLine + 1}. satırdaki sistem kalın telden başlıyor; tel sırası çevrildi.`);
    return { ...sys, lines: [...sys.lines].reverse() };
  }
  return sys;
}

/** Turns string labels into a tuning (high → low), picking the octave nearest to standard tuning. */
export function tuningFromLabels(labels: string[]): string[] | null {
  if (labels.length !== 6 || labels.some((l) => !l)) return null;
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const pc = labelPc(labels[i]);
    let best = 0;
    let bestD = Infinity;
    for (let oct = 1; oct <= 5; oct++) {
      const midi = 12 * (oct + 1) + pc;
      const d = Math.abs(midi - STANDARD_MIDI[i]);
      if (d < bestD) {
        bestD = d;
        best = midi;
      }
    }
    out.push(`${NAMES[best % 12]}${Math.floor(best / 12) - 1}`);
  }
  return out;
}

/** Tokenises one string of one bar segment into notes (columns relative to the segment). */
export function parseStringSegment(seg: string, string: number): ParsedNote[] {
  const notes: ParsedNote[] = [];
  let i = 0;
  let pending: 'hammer' | 'slide' | null = null;
  const readNum = (at: number) => {
    let j = at;
    while (j < seg.length && /\d/.test(seg[j]) && j - at < 2) j++;
    let text = seg.slice(at, j);
    // "24" is a fret, "35" is almost certainly two notes written without a dash.
    if (text.length === 2 && Number(text) > 24) text = text[0];
    return text;
  };
  while (i < seg.length) {
    const c = seg[i];
    const prev = notes[notes.length - 1];
    if (/\d/.test(c)) {
      const t = readNum(i);
      const n: ParsedNote = { string, fret: Number(t), col: i, len: t.length };
      if (pending && prev) {
        if (pending === 'hammer') prev.hammer = true;
        else prev.slide = true;
      }
      pending = null;
      notes.push(n);
      i += t.length;
      continue;
    }
    if (c === 'x' || c === 'X') {
      notes.push({ string, fret: -1, col: i, len: 1 });
      pending = null;
      i++;
      continue;
    }
    if (c === '<') {
      const m = /^<(\d{1,2})>/.exec(seg.slice(i));
      if (m) {
        notes.push({ string, fret: Number(m[1]), col: i + 1, len: m[1].length, harmonic: true });
        i += m[0].length;
        pending = null;
        continue;
      }
    }
    if ((c === 'h' || c === 'p' || c === 'H' || c === 'P') && prev) pending = 'hammer';
    else if ((c === '/' || c === '\\' || c === 's') && prev) pending = 'slide';
    else if (c === '~' && prev) prev.vibrato = true;
    else if ((c === 'b' || c === 'B') && prev && prev.fret >= 0) {
      // 7b9, 7b9r7, 7b (= full bend)
      const m = /^b(\(?(\d{1,2})\)?)?(r(\(?(\d{1,2})\)?))?/i.exec(seg.slice(i))!;
      const target = m[2] !== undefined ? Number(m[2]) : prev.fret + 2;
      const amount = Math.max(1, Math.min(12, (target - prev.fret) * 2));
      prev.bend = m[3] ? [0, amount, Math.max(0, (Number(m[5] ?? prev.fret) - prev.fret) * 2)] : [0, amount];
      i += m[0].length;
      pending = null;
      continue;
    } else if (c === 'r' && prev) {
      // stray release ("r7" after a bend already parsed) – swallow its number
      const m = /^r\(?\d{0,2}\)?/.exec(seg.slice(i))!;
      i += m[0].length;
      continue;
    }
    i++;
  }
  return notes;
}

/** Groups notes of all strings into beats: notes whose column spans overlap sound together. */
function groupBeats(notes: ParsedNote[]): { col: number; notes: ParsedNote[] }[] {
  const sorted = [...notes].sort((a, b) => a.col - b.col || a.string - b.string);
  const groups: { col: number; end: number; notes: ParsedNote[] }[] = [];
  for (const n of sorted) {
    const g = groups[groups.length - 1];
    if (g && n.col <= g.end && !g.notes.some((m) => m.string === n.string)) {
      g.notes.push(n);
      g.end = Math.max(g.end, n.col + n.len - 1);
    } else groups.push({ col: n.col, end: n.col + n.len - 1, notes: [n] });
  }
  return groups;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Places beat columns on the grid: increasing integer positions in [0, units). */
function quantise(groups: { col: number; notes: ParsedNote[] }[], toUnit: (col: number) => number, units: number, warnings: string[]): Beat[] {
  const beats: Beat[] = [];
  for (const g of groups) {
    let pos = Math.max(0, Math.round(toUnit(g.col)));
    const last = beats[beats.length - 1];
    if (last && pos <= last.pos) pos = last.pos + 1;
    if (pos >= units) {
      if (last && !g.notes.some((n) => last.notes.some((m) => m.string === n.string))) last.notes.push(...g.notes);
      else warnings.push('Ölçüye sığmayan bir nota atlandı; ızgarayı 16’lık yapmayı ya da tempo/ölçü ayarını dene.');
      continue;
    }
    beats.push({ pos, notes: g.notes });
  }
  return beats;
}

/** Splits a length in sixteenths into note values (sixteenths), largest first. */
export function splitSixteenths(n: number): number[] {
  const vals = [16, 12, 8, 6, 4, 3, 2, 1];
  const out: number[] = [];
  let rest = n;
  while (rest > 0) {
    const v = vals.find((x) => x <= rest)!;
    out.push(v);
    rest -= v;
  }
  return out;
}

const DUR: Record<number, [number, boolean]> = { 16: [1, false], 12: [2, true], 8: [2, false], 6: [4, true], 4: [4, false], 3: [8, true], 2: [8, false], 1: [16, false] };

function noteTex(n: ParsedNote) {
  if (n.fret < 0) return `x.${n.string}`;
  const fx: string[] = [];
  if (n.hammer) fx.push('h');
  if (n.slide) fx.push('sl');
  if (n.vibrato) fx.push('v');
  if (n.harmonic) fx.push('nh');
  if (n.bend) fx.push(`b (${n.bend.join(' ')})`);
  return `${n.fret}.${n.string}${fx.length ? `{${fx.join(' ')}}` : ''}`;
}

class TexWriter {
  private dur = 0;
  readonly parts: string[] = [];
  emit(sixteenths: number, body: string) {
    const [d, dotted] = DUR[sixteenths];
    if (d !== this.dur) {
      this.parts.push(`:${d}`);
      this.dur = d;
    }
    this.parts.push(dotted ? `${body}{d}` : body);
  }
}

function beatBody(notes: ParsedNote[]) {
  const sorted = [...notes].sort((a, b) => a.string - b.string);
  return sorted.length === 1 ? noteTex(sorted[0]) : `(${sorted.map(noteTex).join(' ')})`;
}

function tieBody(notes: ParsedNote[]) {
  const ringing = notes.filter((n) => n.fret >= 0).sort((a, b) => a.string - b.string);
  if (!ringing.length) return 'r';
  return ringing.length === 1 ? `-.${ringing[0].string}` : `(${ringing.map((n) => `-.${n.string}`).join(' ')})`;
}

/** Writes one measure: beats at grid positions, `units` grid cells, each `unitLen` sixteenths long. */
function writeMeasure(w: TexWriter, beats: Beat[], units: number, unitLen: number) {
  if (!beats.length || beats[0].pos > 0) {
    for (const p of splitSixteenths((beats.length ? beats[0].pos : units) * unitLen)) w.emit(p, 'r');
  }
  beats.forEach((b, i) => {
    const end = i + 1 < beats.length ? beats[i + 1].pos : units;
    const pieces = splitSixteenths((end - b.pos) * unitLen);
    w.emit(pieces[0], beatBody(b.notes));
    const dead = b.notes.every((n) => n.fret < 0);
    for (const p of pieces.slice(1)) w.emit(p, dead ? 'r' : tieBody(b.notes));
  });
}

const escapeTex = (s: string) => s.replace(/["\\]/g, "'").replace(/\s+/g, ' ').trim();

function headerValue(text: string, keys: string) {
  const m = new RegExp(`^\\s*(?:${keys})\\s*[:=-]\\s*(.+)$`, 'im').exec(text);
  return m?.[1].trim() || undefined;
}

/** Converts ASCII tab text to alphaTex. Throws when no six-line tab system is found. */
export function asciiTabToAlphaTex(text: string, opts: AsciiTabOptions = {}): AsciiTabResult {
  const warnings: string[] = [];
  const systems = findTabSystems(text, warnings).map((s) => orientSystem(s, warnings));
  if (!systems.length) throw new Error('Metinde 6 telli bir ASCII tab bulunamadı (ör. "e|--0--3--|" satırları).');

  const [num, den] = opts.timeSignature ?? [4, 4];
  const q = opts.quantize ?? 16;
  const units = Math.round((num * q) / den);
  const unitLen = 16 / q;
  const textTempo = Number(/(?:tempo|bpm)\s*[:=]?\s*(\d{2,3})/i.exec(text)?.[1] ?? /(\d{2,3})\s*bpm/i.exec(text)?.[1]);
  const tempo = Math.round(opts.tempo ?? (textTempo >= 30 && textTempo <= 300 ? textTempo : 90));
  const title = opts.title ?? headerValue(text, 'title|song|şarkı|başlık');
  const artist = opts.artist ?? headerValue(text, 'artist|band|by|sanatçı|grup');

  let tuning = STANDARD_TUNING;
  const labelled = systems.map((s) => tuningFromLabels(s.lines.map((l) => l.label))).find(Boolean);
  if (labelled) tuning = labelled;

  // Split every system into bar segments.
  interface Segment {
    width: number;
    groups: { col: number; notes: ParsedNote[] }[];
    hasBars: boolean;
  }
  const segments: Segment[][] = systems.map((sys) => {
    const width = Math.max(...sys.lines.map((l) => l.content.length));
    const rows = sys.lines.map((l) => l.content.padEnd(width, '-'));
    const barCols: number[] = [];
    for (let c = 0; c < width; c++) if (rows.filter((r) => r[c] === '|').length >= 4) barCols.push(c);
    const cuts = [-1, ...barCols, width];
    const segs: Segment[] = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k] + 1;
      const b = cuts[k + 1];
      if (b - a < 2) continue; // "||", "|:" etc.
      const parts = rows.map((r) => r.slice(a, b));
      if (parts.every((p) => /^[\s:*]*$/.test(p.replace(/-/g, '')) && !/-{2,}/.test(p))) continue;
      const notes = parts.flatMap((p, i) => parseStringSegment(p, i + 1));
      segs.push({ width: b - a, groups: groupBeats(notes), hasBars: barCols.length > 0 });
    }
    // Drop a trailing empty stub after the last bar line ("|---" leftovers).
    while (segs.length > 1 && segs[segs.length - 1].groups.length === 0 && segs[segs.length - 1].width < 4) segs.pop();
    return segs;
  });

  const all = segments.flat();
  const leadGlobal = median(all.filter((s) => s.groups.length).map((s) => s.groups[0].col));
  // Absolute spacing: median gap between onsets counts as an eighth unless told otherwise.
  const gaps = all.flatMap((s) => s.groups.slice(1).map((g, i) => g.col - s.groups[i].col)).filter((g) => g > 0);
  const charsPerSixteenth = opts.charsPerBeat ? opts.charsPerBeat / 4 : Math.max(0.5, median(gaps) / 2 || 1);

  const w = new TexWriter();
  const bars: string[][] = [];
  let noteCount = 0;
  const pushMeasure = (beats: Beat[]) => {
    const start = w.parts.length;
    writeMeasure(w, beats, units, unitLen);
    bars.push(w.parts.slice(start));
    noteCount += beats.reduce((s, b) => s + b.notes.length, 0);
  };

  for (const seg of all) {
    const absolute = opts.charsPerBeat !== undefined || !seg.hasBars;
    if (!absolute) {
      const first = seg.groups[0]?.col ?? 0;
      const lead = Math.min(first, leadGlobal);
      const span = Math.max(1, seg.width - lead);
      pushMeasure(quantise(seg.groups, (c) => ((c - lead) / span) * units, units, warnings));
      continue;
    }
    // Absolute mode: cut the segment into as many measures as its notes need.
    const cps = charsPerSixteenth * unitLen;
    const lead = Math.min(seg.groups[0]?.col ?? 0, leadGlobal);
    const placed = quantise(seg.groups, (c) => (c - lead) / cps, Number.MAX_SAFE_INTEGER, warnings);
    const measures = Math.max(1, Math.ceil(((placed[placed.length - 1]?.pos ?? 0) + 1) / units));
    for (let m = 0; m < measures; m++) {
      pushMeasure(placed.filter((b) => b.pos >= m * units && b.pos < (m + 1) * units).map((b) => ({ ...b, pos: b.pos - m * units })));
    }
  }
  if (!noteCount) warnings.push('Tabda hiç nota bulunamadı.');

  const head = [
    title ? `\\title "${escapeTex(title)}"` : '',
    artist ? `\\artist "${escapeTex(artist)}"` : '',
    `\\tempo ${tempo}`,
    `\\track "${escapeTex(opts.trackName ?? 'Gitar')}"`,
    '\\staff {tabs}',
    `\\tuning (${tuning.join(' ')})`,
  ].filter(Boolean);
  const body = bars.map((b, i) => (i === 0 ? `\\ts ${num} ${den} ` : '') + b.join(' ') + ' |').join('\n');
  return {
    alphaTex: `${head.join('\n')}\n${body}\n`,
    title,
    artist,
    tempo,
    tuning,
    systems: systems.length,
    bars: bars.length,
    notes: noteCount,
    warnings,
  };
}
