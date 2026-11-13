import { describe, expect, it } from 'vitest';
import { a11yAttributes, DEFAULT_SETTINGS, prefersReducedMotion } from './settings';

describe('accessibility settings', () => {
  it('are off by default', () => {
    expect(Object.values(a11yAttributes(DEFAULT_SETTINGS)).filter(Boolean)).toEqual([]);
  });
  it('map to html data attributes', () => {
    expect(a11yAttributes({ highContrast: true, colorBlind: true, largeMarkers: true, motion: 'reduce' })).toEqual({ contrast: 'high', palette: 'cb', markers: 'large', motion: 'reduce' });
    expect(prefersReducedMotion({ motion: 'reduce' })).toBe(true);
  });
});
