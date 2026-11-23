import { describe, expect, it } from 'vitest';
import { ladderStep, passResult, startLadder } from './tempoLadder';

describe('tempo ladder', () => {
  it('starts at the chosen speed, clamped to the target', () => {
    expect(startLadder({ start: 0.6, target: 1, passes: 3 })).toEqual({ speed: 0.6, clean: 0, fails: 0, target: 1, passes: 3, best: null, done: false, floor: 0.6 });
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
    expect(r).toMatchObject({ event: 'target', state: { speed: 1, best: 1, done: true } });
  });

  it('drops 5 % after two missed passes in a row, not below the floor', () => {
    const s = ladderStep(startLadder({ start: 0.6, target: 1, passes: 3, min: 0.5 }), 'clean').state;
    const r = ladderStep(ladderStep(s, 'miss').state, 'miss');
    expect(r).toMatchObject({ event: 'down', state: { speed: 0.55, clean: 0, best: 0.6 } });
    const low = startLadder({ start: 0.3, target: 1, passes: 3 });
    expect(ladderStep(low, 'miss', { failPasses: 1 })).toMatchObject({ event: 'floor', state: { speed: 0.3 } });
  });

  it('judges listen-mode passes by accuracy', () => {
    expect(passResult(92, 90)).toBe('clean');
    expect(passResult(89, 90)).toBe('miss');
  });
});
