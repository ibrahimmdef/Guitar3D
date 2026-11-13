/**
 * Tempo ladder state machine: start slow, raise the speed by `step` after `passes` clean passes in a
 * row (up to `target`), drop by `step` after a missed pass (down to `min`).
 */
export interface LadderConfig {
  start: number;
  target: number;
  passes: number;
  step?: number;
  min?: number;
}

export interface LadderState {
  speed: number;
  /** Clean passes in a row at the current speed. */
  clean: number;
  target: number;
  passes: number;
  /** Highest speed with at least one clean pass, or null. */
  best: number | null;
}

export type LadderEvent = 'count' | 'up' | 'target' | 'down' | 'floor';

const round = (v: number) => Math.round(v * 100) / 100;
const DEFAULT_STEP = 0.05;
const DEFAULT_MIN = 0.3;

export function startLadder(cfg: LadderConfig): LadderState {
  const target = round(Math.max(DEFAULT_MIN, cfg.target));
  return { speed: round(Math.min(target, Math.max(cfg.min ?? DEFAULT_MIN, cfg.start))), clean: 0, target, passes: Math.max(1, Math.round(cfg.passes)), best: null };
}

/** Next state after one pass through the loop. */
export function ladderStep(s: LadderState, result: 'clean' | 'miss', cfg: Pick<LadderConfig, 'step' | 'min'> = {}): { state: LadderState; event: LadderEvent } {
  const step = cfg.step ?? DEFAULT_STEP;
  const min = cfg.min ?? DEFAULT_MIN;
  if (result === 'miss') {
    const speed = round(Math.max(min, s.speed - step));
    return { state: { ...s, speed, clean: 0 }, event: speed < s.speed ? 'down' : 'floor' };
  }
  const best = Math.max(s.best ?? 0, s.speed);
  const clean = s.clean + 1;
  if (clean < s.passes) return { state: { ...s, clean, best }, event: 'count' };
  const speed = round(Math.min(s.target, s.speed + step));
  return { state: { ...s, speed, clean: 0, best }, event: speed > s.speed ? 'up' : 'target' };
}

/** A listen-mode pass is clean when its first-try accuracy reaches `threshold` (%). */
export const passResult = (accuracy: number, threshold: number): 'clean' | 'miss' => (accuracy >= threshold ? 'clean' : 'miss');
