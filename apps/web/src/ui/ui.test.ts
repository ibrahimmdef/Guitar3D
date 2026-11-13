import { describe, expect, it } from 'vitest';
import { formatPercent, formatTime, relativeTime } from './format';
import { ladderAfter, practiceStep } from './practiceFlow';
import { parseRoute, playLesson, playTab, routeHref } from './router';
import { hotkeyName, zoomDelta } from './shortcuts';

describe('router', () => {
  it('parses screens and falls back to the library', () => {
    expect(parseRoute('')).toEqual({ name: 'library' });
    expect(parseRoute('#/nope')).toEqual({ name: 'library' });
    expect(parseRoute('#/guitar')).toEqual({ name: 'guitar' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    for (const name of ['chords', 'scales', 'tuner', 'routines', 'progress'] as const) {
      expect(parseRoute(`#/${name}`)).toEqual({ name });
      expect(routeHref({ name })).toBe(`#/${name}`);
    }
  });

  it('parses tabs and lessons, keeping #/play/demo as the warm-up lesson', () => {
    expect(parseRoute('#/play/abc')).toEqual(playTab('abc'));
    expect(parseRoute('#/lesson/spider')).toEqual(playLesson('spider'));
    expect(parseRoute('#/play/demo')).toEqual(playLesson('warmup'));
    expect(parseRoute('#/play')).toEqual(playLesson('warmup'));
  });

  it('round-trips ids with special characters', () => {
    for (const r of [playTab('a b/ç?'), playLesson('x%y')]) expect(parseRoute(routeHref(r))).toEqual(r);
  });

  it('survives malformed escapes', () => {
    expect(parseRoute('#/play/%E0%A4%A')).toEqual(playTab('%E0%A4%A'));
  });
});

describe('hotkeyName', () => {
  const k = (key: string, mods: Partial<KeyboardEvent> = {}) => hotkeyName({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it('normalises keys', () => {
    expect(k(' ')).toBe('Space');
    expect(k('L')).toBe('l');
    expect(k('?')).toBe('?');
    expect(k('ArrowLeft')).toBe('ArrowLeft');
    expect(k('+')).toBe('+');
  });
  it('ignores browser chords', () => {
    expect(k('l', { ctrlKey: true })).toBeNull();
    expect(k('1', { metaKey: true })).toBeNull();
    expect(k('m', { altKey: true })).toBeNull();
  });
});

describe('format', () => {
  it('formats time and percent', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65_400)).toBe('1:05');
    expect(formatTime(-10)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatPercent(0.75)).toBe('%75');
  });
  it('formats relative times in Turkish', () => {
    const now = Date.parse('2026-01-10T12:00:00Z');
    expect(relativeTime(undefined)).toBeNull();
    expect(relativeTime('garbage')).toBeNull();
    expect(relativeTime('2026-01-10T11:59:30Z', now)).toBe('az önce');
    expect(relativeTime('2026-01-09T12:00:00Z', now)).toBe('dün');
  });
});

describe('practice flow', () => {
  const base = { loop: null, playing: false, speed: 1, ladderSpeed: 0.6 };
  it('walks choose → slow → loop → climb', () => {
    expect(practiceStep(base)).toBe('choose');
    expect(practiceStep({ ...base, loop: [2, 2] })).toBe('slow');
    expect(practiceStep({ ...base, loop: [2, 2], speed: 0.6 })).toBe('loop');
    expect(practiceStep({ ...base, loop: [2, 2], speed: 0.6, playing: true })).toBe('climb');
  });

  it('raises speed after three clean runs, capped at the target', () => {
    let l = { speed: 0.6, clean: 0, target: 1 };
    l = ladderAfter(l, 'clean');
    l = ladderAfter(l, 'clean');
    const third = ladderAfter(l, 'clean');
    expect(third).toMatchObject({ speed: 0.65, clean: 0, leveledUp: true });
    expect(ladderAfter({ speed: 1, clean: 2, target: 1 }, 'clean')).toMatchObject({ speed: 1, leveledUp: false });
  });

  it('drops speed when stuck, never below 30%', () => {
    expect(ladderAfter({ speed: 0.6, clean: 2, target: 1 }, 'stuck')).toMatchObject({ speed: 0.55, clean: 0 });
    expect(ladderAfter({ speed: 0.3, clean: 0, target: 1 }, 'stuck').speed).toBe(0.3);
  });
});

describe('shortcut sheet', () => {
  it('documents every shortcut the player handles', async () => {
    const { SHORTCUTS } = await import('./shortcuts');
    const keys = SHORTCUTS.flatMap((g) => g.items.flatMap((i) => i.keys));
    for (const k of ['Space', '←', '→', 'L', 'M', '-', '+', '1', '2', '3', '4', 'V', 'T', 'P', '?']) expect(keys).toContain(k);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('zoomDelta', () => {
  it('maps Shift + -/+ to zoom and leaves plain keys to speed', () => {
    expect(zoomDelta({ key: '_', code: 'Minus', shiftKey: true })).toBe(-1);
    expect(zoomDelta({ key: '+', code: 'Equal', shiftKey: true })).toBe(1);
    expect(zoomDelta({ key: '+', code: 'NumpadAdd', shiftKey: true })).toBe(1);
    expect(zoomDelta({ key: '-', code: 'NumpadSubtract', shiftKey: true })).toBe(-1);
    expect(zoomDelta({ key: '-', code: 'Minus', shiftKey: false })).toBe(0);
    // Turkish Q: "+" is Shift+4 and stays a speed key.
    expect(zoomDelta({ key: '+', code: 'Digit4', shiftKey: true })).toBe(0);
  });
});
