import { describe, expect, it } from 'vitest';
import { buildShareHash, parseShareQuery } from './share';
import { parseRoute } from './router';

describe('share links', () => {
  it('round-trips every field', () => {
    const p = { source: { kind: 'lesson' as const, id: 'turku-halay-adimi' }, guitarId: 'builtin', loop: [2, 5] as [number, number], speed: 0.8 };
    const hash = buildShareHash(p);
    expect(hash).toBe('#/share?lesson=turku-halay-adimi&g=builtin&loop=3-6&speed=80');
    expect(parseShareQuery(hash.split('?')[1])).toEqual(p);
  });
  it('keeps only valid values', () => {
    expect(parseShareQuery('tab=abc&loop=0-2&speed=999&v=short&g=../x')).toEqual({ source: { kind: 'tab', id: 'abc' } });
    expect(parseShareQuery('loop=1')).toBeNull();
  });
  it('is routed to the player with the share settings', () => {
    const r = parseRoute('#/share?tab=abc&loop=2');
    expect(r).toEqual({ name: 'player', source: { kind: 'tab', id: 'abc' }, share: { source: { kind: 'tab', id: 'abc' }, loop: [1, 1] } });
    expect(parseRoute('#/share?nothing=1')).toEqual({ name: 'library' });
  });
});
