import { describe, expect, it } from 'vitest';
import { pickMime, sortTakes } from './recordings';

describe('recordings helpers', () => {
  it('picks the first supported format', () => {
    expect(pickMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMime((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickMime(() => false)).toBe('');
  });
  it('sorts newest first', () => {
    expect(sortTakes([{ createdAt: '2026-01-01' }, { createdAt: '2026-03-01' }]).map((t) => t.createdAt)).toEqual(['2026-03-01', '2026-01-01']);
  });
});
