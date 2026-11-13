import { describe, expect, it } from 'vitest';
import { barEvents, bassMidi, chordLabel, padMidi, parseProgression, presetChords, stepTime } from './backing';

describe('parseProgression', () => {
  it('reads letter and solfège chords with separators', () => {
    expect(parseProgression('Am - F | C, G7')?.map(chordLabel)).toEqual(['Am', 'F', 'C', 'G7']);
    expect(parseProgression('Lam Fa Do Sol')?.map(chordLabel)).toEqual(['Am', 'F', 'C', 'G']);
    expect(parseProgression('Dm7 Cmaj7 F#m Bb')?.map(chordLabel)).toEqual(['Dm7', 'Cmaj7', 'F#m', 'A#']);
  });
  it('rejects unreadable input', () => {
    expect(parseProgression('')).toBeNull();
    expect(parseProgression('Am Xyz')).toBeNull();
    expect(parseProgression('Am7b13')).toBeNull();
  });
});

describe('presets', () => {
  it('builds I–V–vi–IV in G and the 12-bar blues in A', () => {
    expect(presetChords('pop', 7).map(chordLabel)).toEqual(['G', 'D', 'Em', 'C']);
    const blues = presetChords('blues', 9).map(chordLabel);
    expect(blues).toHaveLength(12);
    expect(blues.slice(8)).toEqual(['E7', 'D7', 'A7', 'E7']);
  });
});

describe('bar events', () => {
  it('rock: kick on 1 and 3, snare on 2 and 4, eighth bass on the root', () => {
    const ev = barEvents({ root: 9, quality: 'm' }, 'rock', false);
    expect(ev.filter((e) => e.kind === 'snare').map((e) => e.step)).toEqual([4, 12]);
    expect(ev.filter((e) => e.kind === 'kick').map((e) => e.step)).toEqual([0, 8, 10]);
    const bass = ev.filter((e) => e.kind === 'bass');
    expect(bass).toHaveLength(8);
    expect(bass.every((e) => e.kind === 'bass' && e.midi === 33)).toBe(true);
    expect(ev.some((e) => e.kind === 'pad')).toBe(false);
  });
  it('adds a pad chord when asked', () => {
    const pad = barEvents({ root: 0, quality: 'maj7' }, 'ballad', true).find((e) => e.kind === 'pad');
    expect(pad && pad.kind === 'pad' && pad.midi).toEqual([48, 52, 55, 59]);
  });
  it('keeps the bass low and the pad near middle C', () => {
    expect(bassMidi(4)).toBe(28);
    expect(bassMidi(3)).toBe(39);
    expect(Math.max(...padMidi({ root: 11, quality: '7' }))).toBeLessThanOrEqual(64);
  });
  it('swings off-beats in shuffle', () => {
    expect(stepTime(2, 60, 'rock')).toBeCloseTo(0.5);
    expect(stepTime(2, 60, 'shuffle')).toBeCloseTo(2 / 3);
    expect(stepTime(4, 120, 'shuffle')).toBeCloseTo(0.5);
  });
});
