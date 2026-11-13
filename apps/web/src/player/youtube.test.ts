import { describe, expect, it } from 'vitest';
import { alignOffset, nearestRate, parseT, parseYouTube, videoTimeFor } from './youtube';

describe('parseYouTube', () => {
  it('reads the common link forms', () => {
    expect(parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ id: 'dQw4w9WgXcQ', offset: 0 });
    expect(parseYouTube('youtu.be/dQw4w9WgXcQ?t=42')).toEqual({ id: 'dQw4w9WgXcQ', offset: 42 });
    expect(parseYouTube('https://m.youtube.com/shorts/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
    expect(parseYouTube('https://www.youtube.com/embed/dQw4w9WgXcQ?start=5')?.offset).toBe(5);
    expect(parseYouTube('dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
  });
  it('rejects other links', () => {
    expect(parseYouTube('https://vimeo.com/123')).toBeNull();
    expect(parseYouTube('merhaba')).toBeNull();
  });
});

describe('timing helpers', () => {
  it('parses t= values', () => {
    expect(parseT('1m30s')).toBe(90);
    expect(parseT('75')).toBe(75);
    expect(parseT('x')).toBe(0);
  });
  it('maps tab time to video time and back', () => {
    const off = alignOffset(12.5, 2000);
    expect(off).toBe(10.5);
    expect(videoTimeFor({ id: 'x', offset: off }, 4000)).toBe(14.5);
    expect(videoTimeFor({ id: 'x', offset: -3 }, 1000)).toBe(0);
  });
  it('rounds playback rates to YouTube steps', () => {
    expect(nearestRate(0.6)).toBe(0.5);
    expect(nearestRate(0.7)).toBe(0.75);
    expect(nearestRate(1.1)).toBe(1);
  });
});
