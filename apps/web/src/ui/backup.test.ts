import { describe, expect, it } from 'vitest';
import { applyLocal, collectLocal, parseBundle } from './backup';

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
}

describe('backup bundle', () => {
  it('collects only guitar3d keys', () => {
    const s = memory({ 'guitar3d.settings.v1': '{}', 'guitar3d.course.v1': '[]', other: 'x' });
    expect(collectLocal(s)).toEqual({ 'guitar3d.settings.v1': '{}', 'guitar3d.course.v1': '[]' });
  });
  it('applies only guitar3d string values', () => {
    const s = memory();
    expect(applyLocal({ 'guitar3d.a': '1', evil: '2', 'guitar3d.b': 3 }, s)).toBe(1);
    expect([...s.m.keys()]).toEqual(['guitar3d.a']);
  });
  it('validates the file', () => {
    expect(() => parseBundle('nope')).toThrow(/JSON/);
    expect(() => parseBundle('{"format":"x"}')).toThrow(/Guitar3D/);
    expect(parseBundle('{"format":"guitar3d-backup","server":{"version":1}}').local).toEqual({});
  });
});
