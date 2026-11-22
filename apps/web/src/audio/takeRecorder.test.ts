import { describe, expect, it } from 'vitest';
import { clickPlan, LEAD_IN, pickMimeType } from './takeRecorder';

describe('clickPlan', () => {
  it('counts in one bar and puts bar 1 right after it', () => {
    const p = clickPlan(120, { metronome: false });
    expect(p.clicks.map((c) => c.at)).toEqual([LEAD_IN, LEAD_IN + 0.5, LEAD_IN + 1, LEAD_IN + 1.5]);
    expect(p.clicks.map((c) => c.accent)).toEqual([true, false, false, false]);
    expect(p.downbeat).toBeCloseTo(LEAD_IN + 2, 6);
  });

  it('keeps clicking with the metronome on and accounts for output latency', () => {
    const p = clickPlan(60, { metronome: true, seconds: 10.3, latency: 0.03 });
    expect(p.clicks).toHaveLength(10);
    expect(p.clicks[4]).toEqual({ at: LEAD_IN + 4, accent: true });
    expect(p.downbeat).toBeCloseTo(LEAD_IN + 4.03, 6);
  });
});

describe('pickMimeType', () => {
  it('prefers Opus and falls back to whatever the browser has', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMimeType(() => false)).toBe('');
  });
});
