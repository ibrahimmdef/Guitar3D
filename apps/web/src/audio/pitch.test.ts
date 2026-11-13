import { describe, expect, it } from 'vitest';
import { accuracy, centsOff, detectPitch, freqToMidi, initialJudge, judgeStep, matchPitch, midiToFreq, type Pitch } from './pitch';

const SR = 44100;

function tone(freq: number, partials: number[] = [1], n = 2048, amp = 0.5, phase = 0.3) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    partials.forEach((a, k) => (v += a * Math.sin(2 * Math.PI * freq * (k + 1) * (i / SR) + phase * k)));
    b[i] = amp * v;
  }
  return b;
}

const within = (got: number, want: number, cents = 10) => Math.abs(centsOff(got, freqToMidi(want))) <= cents;

describe('detectPitch (YIN)', () => {
  it.each([82.41, 110, 146.83, 196, 246.94, 329.63, 440, 880])('finds a %f Hz sine', (f) => {
    const p = detectPitch(tone(f), SR);
    expect(p).not.toBeNull();
    expect(within(p!.freq, f)).toBe(true);
    expect(p!.clarity).toBeGreaterThan(0.85);
  });

  it('finds the fundamental of a harmonic-rich tone, not an overtone', () => {
    const p = detectPitch(tone(110, [1, 0.8, 0.6, 0.4, 0.3]), SR);
    expect(within(p!.freq, 110)).toBe(true);
  });

  it('finds the fundamental when the second harmonic is louder', () => {
    const p = detectPitch(tone(98, [0.6, 1, 0.5]), SR);
    expect(within(p!.freq, 98)).toBe(true);
  });

  it('works at 48 kHz', () => {
    const b = new Float32Array(2048).map((_, i) => 0.4 * Math.sin((2 * Math.PI * 196 * i) / 48000));
    expect(within(detectPitch(b, 48000)!.freq, 196)).toBe(true);
  });

  it('returns null for silence and for noise', () => {
    expect(detectPitch(new Float32Array(2048), SR)).toBeNull();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const noise = new Float32Array(2048).map(() => 0.3 * rnd());
    expect(detectPitch(noise, SR)).toBeNull();
  });
});

describe('pitch matching', () => {
  it('converts between MIDI and Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(freqToMidi(82.41)).toBeCloseTo(40, 1);
    expect(centsOff(440 * 2 ** (25 / 1200), 69)).toBeCloseTo(25, 5);
  });

  it('matches within ±50 cents and picks the closest chord tone', () => {
    expect(matchPitch(midiToFreq(64) * 2 ** (40 / 1200), [64])).toBe(0);
    expect(matchPitch(midiToFreq(64) * 2 ** (60 / 1200), [64])).toBe(-1);
    expect(matchPitch(midiToFreq(59), [55, 59, 62])).toBe(1);
    expect(matchPitch(midiToFreq(60), [])).toBe(-1);
  });
});

describe('judgeStep', () => {
  const at = (midi: number): Pitch => ({ freq: midiToFreq(midi), clarity: 0.95 });
  const run = (frames: (Pitch | null)[], targets: number[]) => {
    let s = initialJudge();
    const events: string[] = [];
    for (const f of frames) {
      const r = judgeStep(s, f, targets, { hitFrames: 2, missFrames: 3 });
      s = r.state;
      if (r.event) events.push(r.event);
    }
    return events;
  };

  it('hits after the target holds', () => {
    expect(run([at(64), at(64)], [64])).toEqual(['hit']);
    expect(run([at(64), null, at(64)], [64])).toEqual([]);
  });

  it('reports one miss for a stable wrong pitch, then still allows the hit', () => {
    expect(run([at(62), at(62), at(62), at(62), at(62), at(64), at(64)], [64])).toEqual(['miss', 'hit']);
  });

  it('ignores unstable wrong pitches', () => {
    expect(run([at(60), at(62), at(65), at(67)], [64])).toEqual([]);
  });

  it('computes first-try accuracy', () => {
    expect(accuracy(10, 8)).toBe(80);
    expect(accuracy(0, 0)).toBe(0);
  });
});
