import { pc } from './notes';
import { fretMidi, type Tuning } from './tunings';

/** Fretboard memory game: question generation, answer checks and scoring. Pure. */

export interface GameLevel {
  id: string;
  label: string;
  /** Only C D E F G A B. */
  naturalOnly: boolean;
  maxFret: number;
  /** Ask for a specific string too. */
  withString: boolean;
}

export const GAME_LEVELS: GameLevel[] = [
  { id: 'l1', label: 'Doğal notalar · 0–5. perde', naturalOnly: true, maxFret: 5, withString: false },
  { id: 'l2', label: 'Doğal notalar · tel belli · 0–5', naturalOnly: true, maxFret: 5, withString: true },
  { id: 'l3', label: 'Tüm notalar · 0–7', naturalOnly: false, maxFret: 7, withString: false },
  { id: 'l4', label: 'Tüm notalar · tel belli · 0–12', naturalOnly: false, maxFret: 12, withString: true },
];

export const getLevel = (id: string) => GAME_LEVELS.find((l) => l.id === id) ?? GAME_LEVELS[0];

const NATURAL = [0, 2, 4, 5, 7, 9, 11];

export interface Question {
  pc: number;
  /** Tab string 1..6 when the level asks for one. */
  string?: number;
}

export interface Position {
  string: number;
  fret: number;
}

/** Every position of pitch class `p` on frets 0..maxFret (optionally only on one string). */
export function positionsOf(p: number, tuning: Tuning, maxFret: number, string?: number): Position[] {
  const out: Position[] = [];
  for (let s = 1; s <= tuning.midi.length; s++) {
    if (string && s !== string) continue;
    for (let f = 0; f <= maxFret; f++) if (pc(fretMidi(tuning, s, f)) === pc(p)) out.push({ string: s, fret: f });
  }
  return out;
}

/** A random question that has an answer on the allowed frets and differs from the previous one. */
export function nextQuestion(level: GameLevel, tuning: Tuning, rng: () => number = Math.random, prev?: Question | null): Question {
  const pool = level.naturalOnly ? NATURAL : Array.from({ length: 12 }, (_, i) => i);
  for (let tries = 0; tries < 50; tries++) {
    const p = pool[Math.floor(rng() * pool.length)];
    const string = level.withString ? 1 + Math.floor(rng() * tuning.midi.length) : undefined;
    if (prev && prev.pc === p && prev.string === string) continue;
    if (positionsOf(p, tuning, level.maxFret, string).length) return { pc: p, string };
  }
  // fall back to the first open string
  return { pc: pc(tuning.midi[0]), string: level.withString ? 1 : undefined };
}

/** A click on the neck: right note, right string (if asked) and within the level's frets. */
export function checkClick(q: Question, pos: Position, tuning: Tuning, level: GameLevel): boolean {
  if (pos.fret > level.maxFret) return false;
  if (q.string && pos.string !== q.string) return false;
  return pc(fretMidi(tuning, pos.string, pos.fret)) === q.pc;
}

/**
 * A played (mic) note: right pitch class; with a string asked, the pitch must also be reachable on
 * that string within the level's frets (the microphone cannot tell strings apart otherwise).
 */
export function checkPlayed(q: Question, midi: number, tuning: Tuning, level: GameLevel): boolean {
  const m = Math.round(midi);
  if (pc(m) !== q.pc) return false;
  if (!q.string) return true;
  const open = fretMidi(tuning, q.string, 0);
  return m >= open && m <= open + level.maxFret;
}

export interface ScoreState {
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  wrong: number;
}

export const initialScore = (): ScoreState => ({ score: 0, streak: 0, bestStreak: 0, correct: 0, wrong: 0 });

/**
 * 10 points per right answer, up to +10 for answering within 5 s (linear), times a streak
 * multiplier (×1, ×1.5 from 5 in a row, ×2 from 10). A wrong answer breaks the streak.
 */
export function scoreAnswer(st: ScoreState, correct: boolean, ms: number): { state: ScoreState; points: number } {
  if (!correct) return { state: { ...st, streak: 0, wrong: st.wrong + 1 }, points: 0 };
  const streak = st.streak + 1;
  const speed = Math.max(0, Math.min(10, Math.round(10 * (1 - ms / 5000))));
  const mult = streak >= 10 ? 2 : streak >= 5 ? 1.5 : 1;
  const points = Math.round((10 + speed) * mult);
  return {
    state: { score: st.score + points, streak, bestStreak: Math.max(st.bestStreak, streak), correct: st.correct + 1, wrong: st.wrong },
    points,
  };
}

export const accuracyPct = (st: ScoreState) => (st.correct + st.wrong ? Math.round((100 * st.correct) / (st.correct + st.wrong)) : 0);

/** Deterministic PRNG for tests and seeded rounds (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- best scores (localStorage) ---------- */

export function loadBest(key: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}

/** Saves `score` under `id` if it beats the stored one; returns true for a new record. */
export function saveBest(key: string, id: string, score: number): boolean {
  const all = loadBest(key);
  if ((all[id] ?? 0) >= score) return false;
  try {
    localStorage.setItem(key, JSON.stringify({ ...all, [id]: score }));
  } catch {
    /* ignore */
  }
  return true;
}
