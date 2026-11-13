import { describe, expect, it } from 'vitest';
import { mergeSetup } from './tabSetup';

describe('per-tab capo / tuning setup', () => {
  it('merges, clamps and drops empty entries', () => {
    let all = mergeSetup({}, 't1', { capo: 3 });
    expect(all).toEqual({ t1: { capo: 3 } });
    all = mergeSetup(all, 't1', { tuningId: 'drop-d' });
    expect(all.t1).toEqual({ capo: 3, tuningId: 'drop-d' });
    all = mergeSetup(all, 't1', { capo: 40 });
    expect(all.t1.capo).toBe(12);
    all = mergeSetup(all, 't1', { tuningId: '' });
    expect(all.t1).toEqual({ capo: 12 });
    all = mergeSetup(all, 't1', { capo: undefined });
    expect(all).toEqual({});
  });
});
