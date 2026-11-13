import { describe, expect, it } from 'vitest';
import { alignOffset, needsSeek, videoRate, parseT, parseYouTube, videoTimeFor } from './youtube';

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
    expect(videoRate(0.65)).toBe(0.65);
    expect(videoRate(0.1)).toBe(0.25);
    expect(videoRate(3)).toBe(2);
  });
});

describe('needsSeek', () => {
  const base = { playing: true, prevSongMs: 10_000, songMs: 10_050, videoSec: 10.05, targetSec: 10.05, msSinceFix: 5000, ytState: 1 };
  it('leaves an in-sync video alone', () => expect(needsSeek(base)).toBe(false));
  it('corrects drift, but not more often than every 1.5 s', () => {
    expect(needsSeek({ ...base, videoSec: 10.6 })).toBe(true);
    expect(needsSeek({ ...base, videoSec: 10.6, msSinceFix: 500 })).toBe(false);
  });
  it('follows a loop jump immediately', () => {
    expect(needsSeek({ ...base, prevSongMs: 20_000, songMs: 4_000, targetSec: 4, videoSec: 20, msSinceFix: 100 })).toBe(true);
  });
  it('does not seek while buffering', () => expect(needsSeek({ ...base, videoSec: 12, ytState: 3 })).toBe(false));
  it('paused: follows tab moves only', () => {
    expect(needsSeek({ ...base, playing: false, songMs: 10_000 })).toBe(false);
    expect(needsSeek({ ...base, playing: false, songMs: 14_000 })).toBe(true);
  });
});
