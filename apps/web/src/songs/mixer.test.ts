import { describe, expect, it } from 'vitest';
import { activePreset, applyPreset, clampSpeed, effectiveGains, formatTime, initialMix, loopJump, setLoopPoint, setVolume, syncCorrection, toggleMute, toggleSolo } from './mixer';

const stems = ['guitar', 'vocals', 'bass', 'drums'] as const;

describe('mixer gains', () => {
  it('plays everything at full volume by default', () => {
    expect(effectiveGains(initialMix(stems))).toEqual({ guitar: 1, vocals: 1, bass: 1, drums: 1 });
  });

  it('mutes and scales by volume', () => {
    let m = toggleMute(initialMix(stems), 'guitar');
    m = setVolume(m, 'bass', 0.4);
    expect(effectiveGains(m)).toEqual({ guitar: 0, vocals: 1, bass: 0.4, drums: 1 });
    expect(effectiveGains(setVolume(m, 'drums', 7)).drums).toBe(1);
  });

  it('solo wins over mute and silences the rest', () => {
    let m = toggleMute(initialMix(stems), 'guitar');
    m = toggleSolo(m, 'guitar');
    m = toggleSolo(m, 'bass');
    expect(effectiveGains(m)).toEqual({ guitar: 1, vocals: 0, bass: 1, drums: 0 });
    m = toggleSolo(toggleSolo(m, 'guitar'), 'bass');
    expect(effectiveGains(m).guitar).toBe(0); // un-soloed: the mute is back
  });

  it('applies presets and recognises them', () => {
    const base = setVolume(initialMix(stems), 'drums', 0.5);
    const play = applyPreset(base, 'playalong');
    expect(effectiveGains(play)).toEqual({ guitar: 0, vocals: 1, bass: 1, drums: 0.5 });
    expect(activePreset(play)).toBe('playalong');
    const solo = applyPreset(play, 'guitar-only');
    expect(effectiveGains(solo)).toEqual({ guitar: 1, vocals: 0, bass: 0, drums: 0 });
    expect(activePreset(solo)).toBe('guitar-only');
    expect(activePreset(applyPreset(solo, 'all'))).toBe('all');
    expect(activePreset(toggleMute(base, 'bass'))).toBeNull();
  });
});

describe('transport helpers', () => {
  it('clamps speed to 50–100 %', () => {
    expect(clampSpeed(0.3)).toBe(0.5);
    expect(clampSpeed(1.4)).toBe(1);
    expect(clampSpeed(0.754)).toBe(0.75);
  });

  it('orders A–B and jumps back at B', () => {
    let l = setLoopPoint({ a: null, b: null }, 'a', 30);
    l = setLoopPoint(l, 'b', 10);
    expect(l).toEqual({ a: 10, b: 30 });
    expect(loopJump(l, 29.9)).toBeNull();
    expect(loopJump(l, 30.01)).toBe(10);
    expect(loopJump({ a: 5, b: null }, 100)).toBeNull();
    expect(loopJump({ a: 5, b: 5.1 }, 6)).toBeNull();
  });

  it('corrects stem drift by nudging the rate or seeking', () => {
    expect(syncCorrection(10, 10.005, 0.8)).toEqual({ rate: 0.8 });
    const ahead = syncCorrection(10, 10.05, 1);
    expect(ahead.seek).toBeUndefined();
    expect(ahead.rate).toBeLessThan(1);
    expect(syncCorrection(10, 9.95, 1).rate).toBeGreaterThan(1);
    expect(syncCorrection(10, 10.5, 1)).toEqual({ rate: 1, seek: 10 });
  });

  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.9)).toBe('1:15');
    expect(formatTime(NaN)).toBe('0:00');
  });
});
