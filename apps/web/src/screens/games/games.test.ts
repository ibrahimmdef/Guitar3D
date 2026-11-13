import { describe, expect, it } from 'vitest';
import { stableNote } from './useCountdown';

describe('stableNote', () => {
  it('reports a note once after enough identical frames', () => {
    let st = null as { midi: number; frames: number } | null;
    const out: (number | null)[] = [];
    for (const m of [57.1, 56.9, 57.2, 57, 57, 60, null, 60]) {
      const r = stableNote(st, m, 4);
      st = r.state;
      out.push(r.stable);
    }
    expect(out).toEqual([null, null, null, 57, null, null, null, null]);
  });
});
