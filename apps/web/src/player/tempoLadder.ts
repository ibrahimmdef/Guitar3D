/**
 * Tempo ladder / speed trainer state machine. Starts slow, raises the speed by `step` after
 * `passes` clean passes in a row (up to `target`), lowers it by `step` after `failPasses` failed
 * passes in a row, never below the floor (`min`, by default the start speed).
 */
export interface LadderConfig {
  start: number;
  target: number;
  /** Clean passes in a row needed to step up. */
  passes: number;
  /** Speed change per step (default 0.05 = 5 %). */
  step?: number;
  /** Lowest speed the ladder drops to (default: the start speed). */
  min?: number;
  /** Failed passes in a row before the speed drops (default 2). */
  failPasses?: number;
}

export interface LadderState {
  speed: number;
  /** Clean passes in a row at the current speed. */
  clean: number;
  /** Failed passes in a row at the current speed. */
  fails: number;
  target: number;
  passes: number;
  /** Highest speed with at least one clean pass, or null. */
  best: number | null;
  /** The target speed was played cleanly `passes` times: the climb is over. */
  done: boolean;
  /** Lowest speed it drops to. */
  floor: number;
}

/**
 * count: a clean pass, streak not complete yet · up: speed raised · target: the streak was completed
 * at the target, climb finished · strike: a failed pass, not enough to drop · down: speed lowered ·
 * floor: would drop but is already at the floor.
 */
export type LadderEvent = 'count' | 'up' | 'target' | 'strike' | 'down' | 'floor';

const round = (v: number) => Math.round(v * 100) / 100;
export const DEFAULT_STEP = 0.05;
export const DEFAULT_FAIL_PASSES = 2;
const ABS_MIN = 0.25;

export function startLadder(cfg: LadderConfig): LadderState {
  const target = round(Math.max(ABS_MIN, cfg.target));
  const speed = round(Math.min(target, Math.max(ABS_MIN, cfg.start)));
  return {
    speed,
    clean: 0,
    fails: 0,
    target,
    passes: Math.max(1, Math.round(cfg.passes)),
    best: null,
    done: false,
    floor: round(Math.min(speed, Math.max(ABS_MIN, cfg.min ?? speed))),
  };
}

/** Next state after one pass through the loop. */
export function ladderStep(
  s: LadderState,
  result: 'clean' | 'miss',
  cfg: Pick<LadderConfig, 'step' | 'failPasses'> = {},
): { state: LadderState; event: LadderEvent } {
  const step = cfg.step ?? DEFAULT_STEP;
  const failPasses = Math.max(1, cfg.failPasses ?? DEFAULT_FAIL_PASSES);
  if (result === 'miss') {
    const fails = s.fails + 1;
    if (fails < failPasses) return { state: { ...s, clean: 0, fails }, event: 'strike' };
    const speed = round(Math.max(Math.min(s.floor, s.speed), s.speed - step));
    return { state: { ...s, speed, clean: 0, fails: 0, done: false }, event: speed < s.speed ? 'down' : 'floor' };
  }
  const best = round(Math.max(s.best ?? 0, s.speed));
  const clean = s.clean + 1;
  if (clean < s.passes) return { state: { ...s, clean, fails: 0, best }, event: 'count' };
  const speed = round(Math.min(s.target, s.speed + step));
  if (speed > s.speed) return { state: { ...s, speed, clean: 0, fails: 0, best, done: false }, event: 'up' };
  return { state: { ...s, clean: 0, fails: 0, best, done: true }, event: 'target' };
}

/** A scored pass is clean when its score reaches `threshold` (%). */
export const passResult = (accuracy: number, threshold: number): 'clean' | 'miss' => (accuracy >= threshold ? 'clean' : 'miss');
