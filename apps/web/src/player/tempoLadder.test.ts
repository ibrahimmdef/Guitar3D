import { describe, expect, it } from 'vitest';
import { ladderStep, passResult, startLadder } from './tempoLadder';

describe('tempo ladder', () => {
  it('starts at the chosen speed, clamped to the target', () => {
    expect(startLadder({ start: 0.6, target: 1, passes: 3 })).toEqual({ speed: 0.6, clean: 0, target: 1, passes: 3, best: null });
    expect(startLadder({ start: 1.2, target: 0.9, passes: 0 })).toMatchObject({ speed: 0.9, passes: 1 });
  });

  it('climbs 5 % after N clean passes, up to the target', () => {
    let s = startLadder({ start: 0.9, target: 1, passes: 2 });
    let r = ladderStep(s, 'clean');
    expect(r.event).toBe('count');
    expect(r.state).toMatchObject({ speed: 0.9, clean: 1, best: 0.9 });
    r = ladderStep(r.state, 'clean');
    expect(r).toMatchObject({ event: 'up', state: { speed: 0.95, clean: 0 } });
    s = ladderStep(ladderStep(r.state, 'clean').state, 'clean').state;
    expect(s.speed).toBe(1);
    r = ladderStep(ladderStep(s, 'clean').state, 'clean');
    expect(r).toMatchObject({ event: 'target', state: { speed: 1, best: 1 } });
  });

  it('drops 5 % after a missed pass and resets the count, not below the floor', () => {
    const s = ladderStep(startLadder({ start: 0.6, target: 1, passes: 3 }), 'clean').state;
    const r = ladderStep(s, 'miss');
    expect(r).toMatchObject({ event: 'down', state: { speed: 0.55, clean: 0, best: 0.6 } });
    let low = startLadder({ start: 0.3, target: 1, passes: 3 });
    const f = ladderStep(low, 'miss');
    expect(f).toMatchObject({ event: 'floor', state: { speed: 0.3 } });
    low = ladderStep(low, 'miss', { min: 0.25 }).state;
    expect(low.speed).toBe(0.25);
  });

  it('judges listen-mode passes by accuracy', () => {
    expect(passResult(92, 90)).toBe('clean');
    expect(passResult(89, 90)).toBe('miss');
  });
});
