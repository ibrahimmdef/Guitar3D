import type { ScaleId } from '../../music/scales';

/** Ready-made practice routines and the pure timer state of a running one. */

export type RoutineLength = 10 | 20 | 30;
export type StepKind = 'warmup' | 'technique' | 'piece' | 'free';

export type StepTarget =
  | { type: 'lesson'; id: string }
  | { type: 'chords'; names: string[] }
  | { type: 'scale'; root: number; scaleId: ScaleId; position: number }
  | { type: 'free' };

export interface RoutineStep {
  kind: StepKind;
  title: string;
  detail: string;
  seconds: number;
  target: StepTarget;
}

export interface Routine {
  length: RoutineLength;
  title: string;
  steps: RoutineStep[];
}

export const STEP_LABEL: Record<StepKind, string> = { warmup: 'Isınma', technique: 'Teknik', piece: 'Parça', free: 'Serbest' };

/** Minutes per step: warm-up, technique, piece, free play. */
const SPLIT: Record<RoutineLength, [number, number, number, number]> = {
  10: [2, 3, 3, 2],
  20: [3, 5, 8, 4],
  30: [5, 8, 12, 5],
};

interface LessonLike {
  id: string;
  title: string;
  level: number;
}

const CHORD_SETS = [['C', 'G', 'Am', 'F'], ['G', 'D', 'Em', 'C'], ['A', 'D', 'E'], ['Am', 'Dm', 'E7']];
const SCALE_SETS: { root: number; scaleId: ScaleId; position: number; name: string }[] = [
  { root: 9, scaleId: 'minor-pent', position: 0, name: 'La minör pentatonik, 1. kutu' },
  { root: 4, scaleId: 'minor-pent', position: 0, name: 'Mi minör pentatonik, 1. kutu' },
  { root: 7, scaleId: 'major', position: 0, name: 'Sol majör, 1. pozisyon' },
  { root: 9, scaleId: 'blues', position: 0, name: 'La blues, 1. kutu' },
];

/**
 * Builds a routine from the built-in lessons. `day` rotates the technique and piece so consecutive
 * days differ: even days chord changes, odd days a scale.
 */
export function buildRoutine(length: RoutineLength, lessons: LessonLike[], day = 0): Routine {
  const [w, t, p, f] = SPLIT[length];
  const sorted = [...lessons].sort((a, b) => a.level - b.level);
  const warm = lessons.find((l) => l.id === 'chromatic-warmup') ?? sorted[0];
  const pieces = sorted.filter((l) => l !== warm && l.level >= (length === 10 ? 1 : 2));
  const piece = pieces.length ? pieces[day % pieces.length] : sorted[sorted.length - 1];
  const chords = CHORD_SETS[(day >> 1) % CHORD_SETS.length];
  const scale = SCALE_SETS[(day >> 1) % SCALE_SETS.length];
  const technique: RoutineStep = day % 2 === 0
    ? { kind: 'technique', title: `Akor geçişleri: ${chords.join(' – ')}`, detail: 'Her akora dört vuruş; parmakları geçişten önce havada hazırla.', seconds: t * 60, target: { type: 'chords', names: chords } }
    : { kind: 'technique', title: scale.name, detail: 'Çıkıcı ve inici, metronomla yavaş başla; kökleri vurgula.', seconds: t * 60, target: { type: 'scale', root: scale.root, scaleId: scale.scaleId, position: scale.position } };
  const steps: RoutineStep[] = [];
  if (warm) steps.push({ kind: 'warmup', title: warm.title, detail: 'Parmakları ısıt: yavaş, temiz ve eşit.', seconds: w * 60, target: { type: 'lesson', id: warm.id } });
  steps.push(technique);
  if (piece) steps.push({ kind: 'piece', title: piece.title, detail: 'Zor ölçüyü döngüye al, tempo merdiveniyle hızlan.', seconds: p * 60, target: { type: 'lesson', id: piece.id } });
  steps.push({ kind: 'free', title: 'Serbest çalma', detail: 'Sevdiğin bir parçayı çal ya da bugünkü gamla doğaçla.', seconds: f * 60, target: { type: 'free' } });
  return { length, title: `${length} dakikalık rutin`, steps };
}

/** Day number (local) used to rotate routine content. */
export const dayNumber = (d = new Date()) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);

/* ---------- Running routine ---------- */

export interface RunState {
  length: RoutineLength;
  day: number;
  step: number;
  /** Seconds spent in the current step before `runningSince`. */
  stepSpent: number;
  /** Seconds spent in finished steps and in this step before `runningSince`. */
  totalSpent: number;
  /** ms timestamp while the timer runs, null while paused. */
  runningSince: number | null;
  startedAt: string;
}

export function startRun(length: RoutineLength, day: number, now: number): RunState {
  return { length, day, step: 0, stepSpent: 0, totalSpent: 0, runningSince: now, startedAt: new Date(now).toISOString() };
}

const live = (r: RunState, now: number) => (r.runningSince != null ? Math.max(0, (now - r.runningSince) / 1000) : 0);

export const stepElapsed = (r: RunState, now: number) => r.stepSpent + live(r, now);
export const totalElapsed = (r: RunState, now: number) => r.totalSpent + live(r, now);

export function stepRemaining(routine: Routine, r: RunState, now: number) {
  const step = routine.steps[r.step];
  return step ? Math.max(0, step.seconds - stepElapsed(r, now)) : 0;
}

export function pauseRun(r: RunState, now: number): RunState {
  if (r.runningSince == null) return r;
  const d = live(r, now);
  return { ...r, stepSpent: r.stepSpent + d, totalSpent: r.totalSpent + d, runningSince: null };
}

export function resumeRun(r: RunState, now: number): RunState {
  return r.runningSince != null ? r : { ...r, runningSince: now };
}

/**
 * Moves to the next step (done or skipped). Returns null when the routine is over; the time spent so
 * far stays in `totalSpent` of the returned / last state.
 */
export function advanceRun(routine: Routine, r: RunState, now: number): { state: RunState; finished: boolean } {
  const wasRunning = r.runningSince != null;
  const p = pauseRun(r, now);
  const next = { ...p, step: p.step + 1, stepSpent: 0, runningSince: wasRunning ? now : null };
  return next.step >= routine.steps.length ? { state: { ...p, runningSince: null }, finished: true } : { state: next, finished: false };
}

/** "04:59" */
export function formatClock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
