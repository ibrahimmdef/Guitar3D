import { chordComfort, reach } from '@guitar3d/shared';
import type { SimpleBar, SimpleBeat, SimpleNote } from './model';

export type IssueKind =
  | 'shift'
  | 'stretch'
  | 'barre'
  | 'speed'
  | 'hammer'
  | 'slide'
  | 'bend'
  | 'palmMute'
  | 'chordChange'
  | 'pull'
  | 'harmonic'
  | 'deadNote'
  | 'stringSkip';

/** Display label of every issue kind. */
export const ISSUE_LABELS: Record<IssueKind, string> = {
  shift: 'Position shift',
  stretch: 'Stretch',
  barre: 'Barre',
  speed: 'Speed',
  hammer: 'Hammer-on',
  pull: 'Pull-off',
  slide: 'Slide',
  bend: 'Bend',
  palmMute: 'Palm mute',
  harmonic: 'Harmonic',
  deadNote: 'Dead note',
  chordChange: 'Chord change',
  stringSkip: 'String skip',
};

export interface Issue {
  kind: IssueKind;
  bar: number;
  /** Text to show: `detail`, plus `advice` the first time that advice appears in the piece. */
  message: string;
  weight: number;
  /** What happens in this bar and what to do about it (frets, strings, fingers). */
  detail: string;
  /** General how-to for this kind of difficulty. */
  advice: string;
}

export interface BarReport {
  bar: number;
  /** 1 (easy) to 5 (very hard). At most one issue per kind. */
  difficulty: number;
  issues: Issue[];
  /** Average attacked notes per second at the bar's tempo. */
  notesPerSecond: number;
  /** Raw difficulty score that `difficulty` is derived from. */
  score: number;
  /** Fastest run of four consecutive notes, in notes per second. */
  peakNotesPerSecond: number;
  /** Fret of the index finger at the first fretted note of the bar; null when only open strings are played. */
  handPosition: number | null;
  /** Largest fret distance held at once (0 for single notes). */
  fretSpan: number;
  /** Position shifts of two frets or more inside this bar. */
  shiftCount: number;
  /** Largest shift distance in frets. */
  maxShift: number;
  /** Picked string changes that jump over at least one string. */
  stringSkips: number;
}

export interface Report {
  bars: BarReport[];
  hardestBars: number[];
  suggestedStartSpeed: number;
  summary: string[];
  /** Difficulty of the piece as a whole, 1–5 (driven by its hardest quarter). */
  overallDifficulty: number;
}

// ---------------------------------------------------------------------------------------------
// Hand model
// ---------------------------------------------------------------------------------------------

const FINGER = ['', 'index', 'middle', 'ring', 'pinky'];
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** Hand reach and chord comfort are shared with the fingering optimiser (@guitar3d/shared). */
export { reach, chordComfort };
const nutFactor = (lowestFret: number) => (lowestFret <= 3 ? 1.4 : lowestFret <= 6 ? 1.15 : lowestFret <= 9 ? 1 : 0.85);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round5 = (v: number) => Math.round(v / 5) * 5;

interface Shift {
  from: number;
  to: number;
  dist: number;
  /** Seconds between the previous fretted note and this one. */
  avail: number;
  /** An open string or rest sits right before the shift. */
  free: boolean;
  prev: number;
}

interface Ev {
  bi: number;
  beat: SimpleBeat;
  notes: SimpleNote[];
  fretted: SimpleNote[];
  lo: number;
  hi: number;
  t: number;
  dur: number;
  /** At least one note starts here (not only ties). */
  attack: boolean;
  /** Strings whose note is sounded by a hammer-on / pull-off instead of the pick. */
  legato: Map<number, number>;
  pos: number | null;
  shift?: Shift;
}

function flatten(bars: SimpleBar[]): { events: Ev[]; barSeconds: number[] } {
  const events: Ev[] = [];
  const barSeconds: number[] = [];
  let t = 0;
  let pending = new Map<number, number>();
  bars.forEach((bar, bi) => {
    const tempo = bar.tempo > 0 ? bar.tempo : 120;
    let seconds = 0;
    for (const beat of bar.beats) {
      const dur = (beat.quarters * 60) / tempo;
      const fretted = beat.notes.filter((n) => n.fret > 0 && !n.dead);
      const frets = fretted.map((n) => n.fret);
      const legato = new Map<number, number>();
      if (beat.notes.length > 0) {
        for (const n of beat.notes) if (pending.has(n.string)) legato.set(n.string, pending.get(n.string)!);
        pending = new Map(beat.notes.filter((n) => n.hammer).map((n) => [n.string, n.fret]));
      }
      events.push({
        bi, beat, notes: beat.notes, fretted,
        lo: frets.length ? Math.min(...frets) : 0,
        hi: frets.length ? Math.max(...frets) : 0,
        t: t + seconds, dur,
        attack: beat.notes.some((n) => !n.tied),
        legato,
        pos: null,
      });
      seconds += dur;
    }
    barSeconds.push(seconds);
    t += seconds;
  });
  return { events, barSeconds };
}

/**
 * Follows the fretting hand through the piece. The hand sits at a position (fret of the index finger)
 * and covers `reach` frets above it. It only moves when a note falls outside that window, and then
 * as little as possible, taking the next few notes into account. Open strings never move it.
 */
function trackHand(events: Ev[]) {
  let pos: number | null = null;
  let prev = -1;
  let free = false;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.fretted.length === 0) {
      free = true;
      continue;
    }
    const fits = (p: number) => e.lo >= p && e.hi <= p + reach(p);
    if (pos === null || !fits(pos)) {
      let lo = e.lo;
      let hi = e.hi;
      let seen = 0;
      for (let j = i + 1; j < events.length && seen < 5 && events[j].bi <= e.bi + 1; j++) {
        const n = events[j];
        if (n.fretted.length === 0) continue;
        seen++;
        const nl = Math.min(lo, n.lo);
        const nh = Math.max(hi, n.hi);
        if (nh - nl > reach(nl)) break;
        lo = nl;
        hi = nh;
      }
      // A chord wider than the reach is a stretch: the index finger takes its lowest fret.
      const top = Math.min(lo, e.lo);
      const bottom = Math.min(top, Math.max(1, hi - reach(top)));
      // Small moves are extensions (as little as possible); a real move up, or any chord, lands the
      // index finger on the lowest fret.
      let next: number = pos === null ? top : clamp(pos, bottom, top);
      if (pos !== null && (e.fretted.length >= 2 || next - pos > 1)) next = top;
      if (pos !== null && next !== pos) {
        const before = events[prev];
        e.shift = { from: pos, to: next, dist: Math.abs(next - pos), avail: e.t - before.t, free, prev };
      }
      pos = next;
    }
    e.pos = pos;
    prev = i;
    free = false;
  }
}

// ---------------------------------------------------------------------------------------------
// Chord shapes
// ---------------------------------------------------------------------------------------------

interface Shape {
  bi: number;
  /** Index of the first event of the shape. */
  first: number;
  /** string -> fret (0 = open). */
  notes: Map<number, number>;
  /** Contains at least one beat with several notes (strummed), otherwise an arpeggio. */
  strum: boolean;
  beats: number;
}

const frettedOf = (s: Shape) => [...s.notes].filter(([, f]) => f > 0).map(([string, fret]) => ({ string, fret }));
const shapeKey = (s: Shape) => frettedOf(s).sort((a, b) => b.string - a.string).map((n) => `${n.string}:${n.fret}`).join(',');

const CHORD_NAMES: Record<string, string> = {
  '5:3,4:2,2:1': 'C', '5:3,4:2,3:3,2:1': 'C7',
  '6:3,5:2,1:3': 'G', '6:3,5:2,2:3,1:3': 'G', '6:3,1:3': 'G', '6:3,5:2,1:1': 'G7',
  '4:2,3:2,2:1': 'Am', '4:2,2:1': 'Am7',
  '5:2,4:2': 'Em', '5:2,4:2,3:1': 'E', '5:2,3:1': 'E7',
  '4:2,3:2,2:2': 'A', '4:2,2:2': 'A7',
  '3:2,2:3,1:2': 'D', '3:2,2:3,1:1': 'Dm', '3:2,2:1,1:2': 'D7',
  '4:3,3:2,2:1,1:1': 'F', '6:1,5:3,4:3,3:2,2:1,1:1': 'F', '4:3,3:2,2:1': 'Fmaj7',
  '5:2,4:4,3:4,2:3,1:2': 'Bm', '5:2,4:1,3:2,1:2': 'B7',
};
const chordName = (s: Shape): string | null => CHORD_NAMES[shapeKey(s)] ?? null;
/** Usual fingerings (string -> finger) where the generic lowest-fret-first rule would be unusual. */
const CHORD_FINGERS: Record<string, Record<number, number>> = {
  G: { 6: 2, 5: 1, 2: 4, 1: 3 },
  Em: { 5: 2, 4: 3 },
};

/** Shapes held by the fretting hand: strummed chords and arpeggios that never re-fret a string. */
function findShapes(events: Ev[]): Shape[] {
  const shapes: Shape[] = [];
  let acc: Shape | null = null;
  const flush = () => {
    if (acc) {
      const fr = frettedOf(acc);
      const frets = fr.map((n) => n.fret);
      const span = frets.length ? Math.max(...frets) - Math.min(...frets) : 0;
      const enough = acc.strum ? acc.notes.size >= 2 : acc.notes.size >= 3 && acc.beats >= 3;
      if (enough && fr.length >= 1 && span <= 4) shapes.push(acc);
    }
    acc = null;
  };
  events.forEach((e, i) => {
    const notes = e.notes.filter((n) => !n.dead);
    if (notes.length === 0) return;
    if (acc && (acc.bi !== e.bi || notes.some((n) => acc!.notes.has(n.string) && acc!.notes.get(n.string) !== n.fret))) flush();
    if (!acc) acc = { bi: e.bi, first: i, notes: new Map(), strum: false, beats: 0 };
    for (const n of notes) acc.notes.set(n.string, n.fret);
    if (notes.length >= 2) acc.strum = true;
    acc.beats++;
  });
  flush();
  return shapes;
}

export interface Barre {
  fret: number;
  /** Thinnest and thickest string under the barre finger. */
  fromString: number;
  toString: number;
  full: boolean;
}

/**
 * A barre is needed when the lowest fret of a shape sounds on several strings and there are not
 * enough fingers to take those notes one by one. An open string between them rules it out.
 */
function barreOf(shape: Shape): Barre | null {
  const fr = frettedOf(shape);
  if (fr.length < 4) return null;
  const fret = Math.min(...fr.map((n) => n.fret));
  const strings = fr.filter((n) => n.fret === fret).map((n) => n.string);
  if (strings.length < 2) return null;
  const fromString = Math.min(...strings);
  const toString = Math.max(...strings);
  for (let s = fromString + 1; s < toString; s++) if (shape.notes.get(s) === 0) return null;
  const covered = toString - fromString + 1;
  if (fr.length > 4 && covered >= 3) return { fret, fromString, toString, full: true };
  const thinnest = Math.min(...fr.map((n) => n.string));
  if (strings.length === 2 && covered === 2 && fromString === thinnest) return { fret, fromString, toString, full: false };
  return null;
}

/** Suggested finger (1 = index … 4 = pinky) for every fretted string of a shape. */
function fingerMap(shape: Shape, barre: Barre | null): Map<number, number> {
  const fr = frettedOf(shape).sort((a, b) => a.fret - b.fret || b.string - a.string);
  const map = new Map<number, number>();
  if (fr.length === 0) return map;
  const known = barre ? undefined : CHORD_FINGERS[chordName(shape) ?? ''];
  const lo = fr[0].fret;
  let last = barre ? 1 : 0;
  for (const n of fr) {
    if (barre && n.fret === barre.fret && n.string >= barre.fromString && n.string <= barre.toString) {
      map.set(n.string, 1);
    } else if (known?.[n.string]) {
      map.set(n.string, known[n.string]);
    } else {
      last = clamp(Math.max(last + 1, n.fret - lo + 1), 1, 4);
      map.set(n.string, last);
    }
  }
  return map;
}

/** Finger suggestion as text, thickest string first; strings under a barre are left out. */
function fingering(shape: Shape, barre: Barre | null): string {
  const fingers = fingerMap(shape, barre);
  return frettedOf(shape)
    .filter((n) => !(barre && n.fret === barre.fret && n.string >= barre.fromString && n.string <= barre.toString))
    .sort((a, b) => b.string - a.string)
    .map((n) => `${ord(n.string)} string ${ord(n.fret)} fret ${FINGER[fingers.get(n.string)!]}`)
    .join(', ');
}

// ---------------------------------------------------------------------------------------------
// Per-bar analysis
// ---------------------------------------------------------------------------------------------

const ADVICE = {
  shift: 'Practice the shift on its own as just two notes (departure and arrival); look at the target fret first and let the hand follow.',
  stretch: 'Drop your thumb to the middle of the back of the neck and push the wrist forward; press just behind the fret wire. If your hand strains, stop; don\'t force it.',
  barre: 'Press the index finger very close to the fret wire, rolled slightly onto its side; the force should come from the weight of the arm, not the finger. Play the strings one by one to find the buzzing one.',
  chordChange: 'Practice the change on its own: four beats of the old chord, four beats of the new one. Lift the fingers together, put them down together.',
  speed: 'Raise the speed by 5% after every three clean passes. Keep your fingers just above the strings and make the picking motion smaller.',
  stringSkip: 'Moving to a higher string, take it with a downstroke (↓); coming back to a lower string, with an upstroke (↑). Keep the wrist still and don\'t look at the string you skip.',
  hammer: 'Don\'t pick the second note: bring the finger down just behind the fret like a hammer, fast and firm.',
  pull: 'Don\'t lift the finger straight up; release it with a slight downward pull so the second note sounds too. Have the lower finger already pressed.',
  slide: 'Ease the pressure a little while sliding but don\'t lift the finger off the string; stop at the target fret and press again.',
  bend: 'Don\'t bend with one finger; put one or two more fingers behind it. Play the target fret first and keep its pitch in your ear.',
  palmMute: 'Rest the fleshy edge of your picking hand lightly just in front of the bridge; the sound should be muffled but the pitch still audible.',
  harmonic: 'Don\'t press down: just touch the string right above the fret wire and lift the finger right after picking.',
  deadNote: 'Touch the string with a fretting finger but don\'t press; picking should give only a dull "click".',
} satisfies Record<IssueKind, string>;

const SUBDIVISION: [number, string][] = [
  [1 / 8, 'thirty-second notes'], [1 / 6, 'sixteenth-note sextuplets'], [1 / 4, 'sixteenth notes'],
  [1 / 3, 'eighth-note triplets'], [1 / 2, 'eighth notes'], [1, 'quarter notes'],
];

interface Context {
  events: Ev[];
  barSeconds: number[];
  shapes: Shape[];
}

const timeFactor = (avail: number) => (avail < 0.3 ? 1.4 : avail < 0.6 ? 1 : avail < 1.5 ? 0.7 : 0.35);

function levelOf(score: number): number {
  return score < 0.7 ? 1 : score < 1.5 ? 2 : score < 2.6 ? 3 : score < 3.8 ? 4 : 5;
}

function analyzeOne(bar: SimpleBar, bi: number, ctx: Context): BarReport {
  const { events, shapes } = ctx;
  const idx: number[] = [];
  events.forEach((e, i) => {
    if (e.bi === bi) idx.push(i);
  });
  const evs = idx.map((i) => events[i]);
  const issues = new Map<IssueKind, Issue>();
  const add = (kind: IssueKind, weight: number, detail: string) => {
    const old = issues.get(kind);
    if (old && old.weight >= weight) return;
    issues.set(kind, { kind, bar: bar.index, weight, detail, advice: ADVICE[kind], message: `${detail} ${ADVICE[kind]}` });
  };

  // --- Speed: real tempo, tuplets already folded into beat lengths ---------------------------
  const seconds = ctx.barSeconds[bi];
  const onsets = evs.filter((e) => e.attack).map((e) => e.t);
  const nps = seconds > 0 ? onsets.length / seconds : 0;
  let peak = nps;
  for (let i = 0; i + 3 < onsets.length; i++) {
    const span = onsets[i + 3] - onsets[i];
    if (span > 0) peak = Math.max(peak, 3 / span);
  }
  let crossings = 0;
  let skips = 0;
  let skipWeight = 0;
  let worstSkip: { from: number; to: number; dt: number } | null = null;
  for (const i of idx) {
    const e = events[i];
    const p = events[i - 1];
    if (!p || !e.attack || e.notes.length !== 1 || p.notes.length !== 1 || !p.attack) continue;
    if (e.legato.size > 0 || e.t - p.t > 1) continue;
    const from = p.notes[0].string;
    const to = e.notes[0].string;
    const jump = Math.abs(to - from);
    if (jump >= 1) crossings++;
    if (jump < 2) continue;
    const dt = e.t - p.t;
    skips++;
    skipWeight += (dt < 0.2 ? 0.5 : dt < 0.35 ? 0.3 : dt < 0.6 ? 0.12 : 0.04) * (jump >= 4 ? 1.3 : 1);
    if (!worstSkip || jump > Math.abs(worstSkip.to - worstSkip.from)) worstSkip = { from, to, dt };
  }

  if (peak >= 5) {
    const start = clamp(round5(350 / peak), 40, 85);
    const shortest = Math.min(...bar.beats.filter((b) => b.quarters > 0 && b.notes.length > 0).map((b) => b.quarters));
    const sub = SUBDIVISION.find(([q]) => Math.abs(q - shortest) < 0.02)?.[1];
    const picking = crossings >= 3 ? ' Keep the down-up (↓↑) picking order across string changes too.' : '';
    add('speed', Math.min(3, 0.8 + (peak - 5) * 0.45),
      `Fast passage: ~${peak.toFixed(1)} notes per second (${sub ?? 'short notes'} at ${Math.round(bar.tempo)} bpm). Loop it at ${start}% speed (≈${Math.round((bar.tempo * start) / 100)} bpm) first.${picking}`);
  }

  // --- Right hand: string skips ----------------------------------------------------------------
  skipWeight = Math.min(2, skipWeight);
  if (worstSkip && skipWeight >= 0.45) {
    const dir = worstSkip.to < worstSkip.from
      ? `after the ${ord(worstSkip.from)} string, take the ${ord(worstSkip.to)} string with a downstroke (↓)`
      : `after the ${ord(worstSkip.from)} string, take the ${ord(worstSkip.to)} string with an upstroke (↑)`;
    add('stringSkip', skipWeight, `String skip: ${skips > 1 ? `${skips} times, the widest ` : ''}from the ${ord(worstSkip.from)} string to the ${ord(worstSkip.to)}; ${dir}.`);
  }

  // --- Left hand: span per beat --------------------------------------------------------------
  let fretSpan = 0;
  for (const e of evs) {
    if (e.fretted.length < 2) continue;
    const span = e.hi - e.lo;
    fretSpan = Math.max(fretSpan, span);
    const over = span - chordComfort(e.lo);
    if (over > 0) {
      add('stretch', Math.min(3, (0.3 + 0.6 * over) * nutFactor(e.lo)),
        `Wide stretch: frets ${e.lo}–${e.hi} are held at the same time (index on fret ${e.lo}, pinky on fret ${e.hi}).`);
    }
  }

  // --- Left hand: span over a short sliding window --------------------------------------------
  for (const i of idx) {
    const e = events[i];
    if (e.fretted.length === 0) continue;
    // Already explained as a shift, or reached by sliding into it.
    if (e.shift && e.shift.dist >= 2) continue;
    const before = events[i - 1];
    if (before && before.notes.some((p) => p.slide && e.notes.some((n) => n.string === p.string))) continue;
    let lo = e.lo;
    let hi = e.hi;
    let seen = 0;
    for (let j = i - 1; j >= 0 && seen < 3 && e.t - events[j].t <= 0.76; j--) {
      const p = events[j];
      if (p.fretted.length === 0) continue;
      seen++;
      lo = Math.min(lo, p.lo);
      hi = Math.max(hi, p.hi);
    }
    if (seen > 0 && hi - lo === reach(lo) + 1 && e.hi - e.lo <= chordComfort(e.lo)) {
      add('stretch', 0.7 * nutFactor(lo),
        `Fast change at frets ${lo}–${hi}: instead of shifting your hand, keep the index finger on fret ${lo} and reach fret ${hi} with the pinky.`);
    }
  }

  // --- Left hand: position shifts --------------------------------------------------------------
  const shifts = evs.filter((e) => e.shift && e.shift.dist >= 2);
  let shiftWeight = 0;
  let worst: Ev | null = null;
  let worstW = 0;
  for (const e of shifts) {
    const s = e.shift!;
    if (s.avail >= 1.5 && s.dist < 4) continue;
    const w = (s.dist >= 7 ? 1.6 : s.dist >= 4 ? 1.1 : 0.6) * timeFactor(s.avail) * (s.free ? 0.7 : 1);
    shiftWeight += w;
    if (w > worstW) {
      worstW = w;
      worst = e;
    }
  }
  if (worst) {
    const s = worst.shift!;
    const count = shifts.length;
    const target = worst.fretted.reduce((a, b) => (b.fret < a.fret ? b : a));
    const finger = FINGER[clamp(target.fret - s.to + 1, 1, 4)];
    const from = events[s.prev];
    const sameString = from.notes.length === 1 && worst.notes.length === 1 && from.notes[0].string === worst.notes[0].string;
    const how = s.free
      ? ' Move your hand during the open string or rest just before.'
      : sameString
        ? ' Slide without lifting the finger off the string, easing the pressure (guide finger).'
        : '';
    add('shift', Math.min(3, worstW + 0.25 * (shiftWeight - worstW)),
      `Position shift: from position ${s.from} to position ${s.to}, ${s.dist} frets toward the ${s.to > s.from ? 'body' : 'headstock'}. ` +
      `Land with your ${finger} finger on the ${ord(target.string)} string, ${ord(target.fret)} fret.${how}${count > 1 ? ` ${count} shifts in this bar.` : ''}`);
  }

  // --- Chord shapes: barre and chord changes ---------------------------------------------------
  let changeWeight = 0;
  let changes = 0;
  let worstChange: { w: number; detail: string } | null = null;
  shapes.forEach((shape, si) => {
    if (shape.bi !== bi) return;
    const barre = barreOf(shape);
    const fingers = fingering(shape, barre);
    if (barre) {
      const rest = fingers ? ` Other fingers: ${fingers}.` : '';
      if (barre.full) {
        add('barre', 1.6 + (barre.fret <= 2 ? 0.4 : 0),
          `Barre: cover all strings from the ${ord(barre.toString)} to the ${ord(barre.fromString)} string with the index finger at the ${ord(barre.fret)} fret.${rest}`);
      } else {
        add('barre', 0.7,
          `Mini barre: at the ${ord(barre.fret)} fret, roll the tip of the index finger flat and press the ${ord(barre.toString)} and ${ord(barre.fromString)} strings together.${rest}`);
      }
    }

    const prev = shapes[si - 1];
    if (!prev || shape.bi - prev.bi > 1) return;
    const before = frettedOf(prev);
    const now = frettedOf(shape);
    const same = (a: { string: number; fret: number }, b: { string: number; fret: number }) => a.string === b.string && a.fret === b.fret;
    if (now.every((n) => before.some((p) => same(n, p)))) return;
    // A note only anchors the change when the same finger holds it in both shapes.
    const fingersBefore = fingerMap(prev, barreOf(prev));
    const fingersNow = fingerMap(shape, barre);
    const anchors = now.filter((n) => before.some((p) => same(n, p)) && fingersBefore.get(n.string) === fingersNow.get(n.string));
    const movedNotes = now.filter((n) => !anchors.includes(n));
    // Fingers to place, not notes: a barre finger counts once.
    const moved = new Set(movedNotes.map((n) => fingersNow.get(n.string))).size;
    if (moved === 0) return;
    // The same shape moved along the neck is a shift, not a new chord.
    const deltas = new Set(now.map((n) => n.fret - (before.find((p) => p.string === n.string)?.fret ?? NaN)));
    if (now.length === before.length && deltas.size === 1 && !Number.isNaN([...deltas][0])) return;
    if (moved < 2 && !barre) return;

    const avail = shape.first > 0 ? events[shape.first].t - events[shape.first - 1].t : 2;
    const w = Math.min(1.6, 0.35 * moved) * (shape.strum ? 1 : 0.6) * (avail < 0.3 ? 1.4 : avail < 0.9 ? 1 : 0.8);
    changes++;
    changeWeight += w;
    if (worstChange && worstChange.w >= w) return;

    const a = chordName(prev);
    const b = chordName(shape);
    const title = a && b ? `Chord change ${a} → ${b}` : b ? `Change to ${b}` : 'Shape change';
    let how: string;
    if (anchors.length > 0) {
      const anchor = anchors.map((n) => `${ord(n.string)} string ${ord(n.fret)} fret`).join(' and ');
      how = `Anchor finger: ${anchor} stays in place, don't lift it; place the other fingers around it.`;
    } else {
      const bass = now.reduce((x, y) => (y.string > x.string ? y : x));
      how = `No common finger; place the finger on the lowest string first (${ord(bass.string)} string ${ord(bass.fret)} fret) and let the others follow.`;
    }
    worstChange = { w, detail: `${title}: ${moved} fingers move. ${how}${!barre && fingers ? ` New shape: ${fingers}.` : ''}` };
  });
  if (worstChange) {
    const wc = worstChange as { w: number; detail: string };
    add('chordChange', Math.min(2.2, wc.w + 0.2 * (changeWeight - wc.w)), `${wc.detail}${changes > 1 ? ` ${changes} changes in this bar.` : ''}`);
  }

  // --- Techniques ------------------------------------------------------------------------------
  const tech = (kind: IssueKind, base: number, per: number, cap: number, count: number, detail: string) => {
    if (count > 0) add(kind, Math.min(cap, base + per * (count - 1)), `${detail}${count > 1 ? ` ${count} times in this bar.` : ''}`);
  };
  const legato: { pull: boolean; string: number; from: number; to: number | null }[] = [];
  for (const i of idx) {
    for (const n of events[i].notes) {
      if (!n.hammer) continue;
      let to: number | null = null;
      for (let j = i + 1; j < events.length && to === null; j++) {
        if (events[j].notes.length === 0) continue;
        to = events[j].notes.find((m) => m.string === n.string)?.fret ?? null;
        break;
      }
      legato.push({ pull: n.pull ?? (to !== null && to < n.fret), string: n.string, from: n.fret, to });
    }
  }
  const fretName = (f: number) => (f === 0 ? 'open string' : `${ord(f)} fret`);
  const hammers = legato.filter((l) => !l.pull);
  const pulls = legato.filter((l) => l.pull);
  if (hammers.length) {
    const h = hammers[0];
    tech('hammer', 0.5, 0.1, 1.2, hammers.length,
      `Hammer-on: ${ord(h.string)} string, ${fretName(h.from)}${h.to !== null ? ` → ${fretName(h.to)}` : ''}; pick only the first note.`);
  }
  if (pulls.length) {
    const p = pulls[0];
    tech('pull', 0.6, 0.1, 1.3, pulls.length,
      `Pull-off: ${ord(p.string)} string, ${fretName(p.from)}${p.to !== null ? ` → ${fretName(p.to)}` : ''}; ${p.to ? 'fret both fingers in advance and release the upper one with a pull' : 'release the finger with a pull and let the open string ring'}.`);
  }
  const all = evs.flatMap((e) => e.notes);
  const first = (pred: (n: SimpleNote) => boolean | undefined) => all.find(pred);
  const count = (pred: (n: SimpleNote) => boolean | undefined) => all.filter(pred).length;
  const where = (n: SimpleNote) => `${ord(n.string)} string ${fretName(n.fret)}`;
  const slide = first((n) => n.slide);
  if (slide) tech('slide', 0.6, 0.1, 1.2, count((n) => n.slide), `Slide: slide from ${where(slide)} with the same finger.`);
  const bend = first((n) => n.bend);
  if (bend) tech('bend', 1.2, 0.2, 2, count((n) => n.bend), `Bend: ${where(bend)}; bend with the ring finger, supported by the index and middle fingers behind it.`);
  const pm = first((n) => n.palmMute);
  if (pm) add('palmMute', 0.3, `Palm mute: ${count((n) => n.palmMute)} notes played muted (starting on the ${ord(pm.string)} string).`);
  const harm = first((n) => n.harmonic);
  if (harm) tech('harmonic', 0.7, 0.1, 1.2, count((n) => n.harmonic), `Harmonic: on the ${where(harm)}.`);
  const dead = first((n) => n.dead);
  if (dead) tech('deadNote', 0.3, 0.05, 0.6, count((n) => n.dead), `Dead note: on the ${ord(dead.string)} string.`);

  // --- Score -----------------------------------------------------------------------------------
  const list = [...issues.values()].sort((a, b) => b.weight - a.weight);
  const speedLoad = issues.has('speed') ? 0 : clamp((peak - 2.5) * 0.3, 0, 0.75);
  const fretLoad = evs.some((e) => e.fretted.length > 0) ? 0.2 : 0;
  const score = list.reduce((s, i) => s + i.weight, 0) + speedLoad + fretLoad;
  const dists = shifts.map((e) => e.shift!.dist);
  return {
    bar: bar.index,
    difficulty: levelOf(score),
    issues: list,
    notesPerSecond: nps,
    score,
    peakNotesPerSecond: peak,
    handPosition: evs.find((e) => e.pos !== null)?.pos ?? null,
    fretSpan,
    shiftCount: shifts.length,
    maxShift: dists.length ? Math.max(...dists) : 0,
    stringSkips: skips,
  };
}

function analyzeBars(bars: SimpleBar[]): BarReport[] {
  const { events, barSeconds } = flatten(bars);
  trackHand(events);
  const ctx: Context = { events, barSeconds, shapes: findShapes(events) };
  return bars.map((bar, bi) => analyzeOne(bar, bi, ctx));
}

/**
 * Analyses one bar on its own. `prevLastNotes` are the notes sounding right before it (the last
 * beat of the previous bar), so shifts and chord changes across the bar line are seen.
 */
export function analyzeBar(bar: SimpleBar, prevLastNotes: SimpleNote[] | null = null): BarReport {
  if (!prevLastNotes || prevLastNotes.length === 0) return analyzeBars([bar])[0];
  const lead: SimpleBar = { index: bar.index - 1, tempo: bar.tempo, beats: [{ quarters: 1, notes: prevLastNotes }] };
  return analyzeBars([lead, bar])[1];
}

/**
 * Notes the fretting hand lands on after a position shift of two frets or more: `beat` is the index
 * in `bars[i].beats`. Used by the speed trainer to say "late on the position shift in bar 5".
 */
export function shiftLandings(bars: SimpleBar[]): { bar: number; beat: number; dist: number }[] {
  const { events } = flatten(bars);
  trackHand(events);
  const out: { bar: number; beat: number; dist: number }[] = [];
  let bi = -1;
  let k = 0;
  for (const e of events) {
    if (e.bi !== bi) {
      bi = e.bi;
      k = 0;
    }
    if (e.shift && e.shift.dist >= 2) out.push({ bar: bars[e.bi].index, beat: k, dist: e.shift.dist });
    k++;
  }
  return out;
}

const PRACTICE: Partial<Record<IssueKind, string>> = {
  barre: 'There are barre chords: every day spend two minutes just fretting the barre shape, playing the strings one by one and fixing the ones that don\'t ring clean.',
  shift: 'There are position shifts: practice each shift separately with the metronome, using only the departure and arrival notes.',
  stretch: 'There are wide stretches: warm up with a 1-2-3-4 chromatic exercise first, try the same shape around the 7th fret, then move it back down.',
  chordChange: 'For chord changes, do the "one-minute" drill: count how many clean changes between two chords you make in one minute and beat it every day.',
  stringSkip: 'There are string skips: practice the picking hand separately; mute the strings with your fretting hand and play only the picking pattern.',
  hammer: 'Hammer-on and pull-off notes should sound as strong as picked notes; record yourself and listen.',
  bend: 'Check the pitch of your bends: first fret and listen to the target note normally, then bend to reach the same pitch.',
};

export function analyze(bars: SimpleBar[]): Report {
  const reports = analyzeBars(bars);

  // General advice is spelled out once, in the first bar that needs it; later bars keep the specifics.
  const explained = new Set<string>();
  for (const r of reports) {
    for (const issue of r.issues) {
      if (explained.has(issue.advice)) issue.message = issue.detail;
      else explained.add(issue.advice);
    }
  }

  const hardestBars = reports
    .filter((r) => r.difficulty >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((r) => r.bar)
    .sort((a, b) => a - b);

  const sorted = reports.map((r) => r.score).sort((a, b) => b - a);
  const top = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 4)));
  const overallDifficulty = top.length ? levelOf(top.reduce((s, v) => s + v, 0) / top.length) : 1;

  const fastest = reports.reduce<BarReport | null>((a, r) => (!a || r.peakNotesPerSecond > a.peakNotesPerSecond ? r : a), null);
  const maxNps = fastest?.peakNotesPerSecond ?? 0;
  const bySpeed = maxNps >= 8 ? 0.5 : maxNps >= 6.5 ? 0.6 : maxNps >= 5 ? 0.7 : maxNps >= 3.5 ? 0.8 : 0.9;
  const suggestedStartSpeed = Math.min(bySpeed, overallDifficulty >= 5 ? 0.6 : overallDifficulty >= 4 ? 0.7 : 1);

  const summary: string[] = [];
  if (hardestBars.length) {
    summary.push(`Focus on these bars first: ${hardestBars.map((b) => b + 1).join(', ')}. Loop each one separately.`);
  } else if (reports.length) {
    summary.push('No clear difficulty in this piece: aim for steady rhythm and clean tone from start to finish.');
  }
  const tempo = bars.find((b) => b.index === fastest?.bar)?.tempo ?? bars[0]?.tempo;
  const bpm = tempo ? ` (≈${Math.round(tempo * suggestedStartSpeed)} bpm)` : '';
  summary.push(`Suggested starting speed: ${Math.round(suggestedStartSpeed * 100)}%${bpm}. Raise it by 5% after 3 clean passes in a row.`);

  const totals = new Map<IssueKind, number>();
  for (const r of reports) for (const i of r.issues) totals.set(i.kind, (totals.get(i.kind) ?? 0) + i.weight);
  if (totals.has('pull')) totals.set('hammer', (totals.get('hammer') ?? 0) + totals.get('pull')!);
  [...totals]
    .filter(([kind]) => PRACTICE[kind])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .forEach(([kind]) => summary.push(PRACTICE[kind]!));

  return { bars: reports, hardestBars, suggestedStartSpeed, summary, overallDifficulty };
}
