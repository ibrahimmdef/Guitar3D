/**
 * Strumming patterns and their timing. Pure: no Web Audio here.
 *
 * A pattern is a row of equal steps. Step characters:
 *   D / d  down stroke (accented / normal)
 *   U / u  up stroke (accented / normal)
 *   X / x  muted down stroke ("chuck": the palm stops the strings)
 *   -      rest: the hand keeps moving but misses the strings
 */

export type Meter = '4/4' | '3/4' | '6/8';
export type StrokeDir = 'down' | 'up';

export interface Stroke {
  dir: StrokeDir;
  accent: boolean;
  muted: boolean;
}

export type Step = Stroke | null;

export interface MeterInfo {
  id: Meter;
  /** Counted pulses per bar (6/8 is felt in two dotted quarters). */
  pulses: number;
  /** Count labels shown under the lane, one per step at the given resolution. */
  label: string;
}

export const METERS: MeterInfo[] = [
  { id: '4/4', pulses: 4, label: '4/4' },
  { id: '3/4', pulses: 3, label: '3/4' },
  { id: '6/8', pulses: 2, label: '6/8' },
];

export interface StrumPattern {
  id: string;
  name: string;
  meter: Meter;
  /** Steps per counted pulse: 2 = eighths in 4/4, 4 = sixteenths, 3 = eighths in 6/8. */
  perPulse: number;
  steps: string;
  level: 1 | 2 | 3;
  hint: string;
}

export const PATTERNS: StrumPattern[] = [
  { id: 'quarters', name: 'Dörtlük aşağı', meter: '4/4', perPulse: 2, steps: 'D-d-d-d-', level: 1, hint: 'Her vuruşta bir aşağı. Kol yukarı dönerken teller çalınmaz.' },
  { id: 'eighths', name: 'Sekizlik aşağı-yukarı', meter: '4/4', perPulse: 2, steps: 'DuduDudu', level: 1, hint: 'Aşağı vuruşta, yukarı aradaki "ve"de. El hiç durmaz.' },
  { id: 'pop', name: 'Pop klasiği', meter: '4/4', perPulse: 2, steps: 'D-du-udu', level: 2, hint: 'Üçüncü vuruşta aşağı vuruşu atla ama eli sallamaya devam et.' },
  { id: 'folk', name: 'Halk ezgisi', meter: '4/4', perPulse: 2, steps: 'D-d-Dudu', level: 2, hint: 'İlk yarı sakin, ikinci yarı dolu.' },
  { id: 'offbeat', name: 'Arka vuruş', meter: '4/4', perPulse: 2, steps: '-u-u-u-u', level: 2, hint: 'Sadece "ve"lerde yukarı. Aşağı hareket boşta.' },
  { id: 'chuck', name: 'Susturmalı', meter: '4/4', perPulse: 2, steps: 'D-Xu-uXu', level: 3, hint: 'X: avuç içiyle telleri kesip vur, perküsif bir "çak" sesi.' },
  { id: 'sixteenths', name: 'Onaltılık', meter: '4/4', perPulse: 4, steps: 'D-du-udu-udu-udu', level: 3, hint: 'Her vuruş dörde bölünür; ağır tempoda başla.' },
  { id: 'waltz', name: 'Vals', meter: '3/4', perPulse: 2, steps: 'D-d-d-', level: 1, hint: 'Bir-iki-üç: birinci vuruş vurgulu.' },
  { id: 'waltz-fill', name: 'Süslü vals', meter: '3/4', perPulse: 2, steps: 'D-dudu', level: 2, hint: 'İkinci ve üçüncü vuruşa yukarı vuruş eklenir.' },
  { id: 'six-eight', name: '6/8 temel', meter: '6/8', perPulse: 3, steps: 'DduDdu', level: 2, hint: 'İki büyük vuruş, her biri üçe bölünür.' },
  { id: 'six-eight-ballad', name: '6/8 balad', meter: '6/8', perPulse: 3, steps: 'D-uD-u', level: 2, hint: 'Ağır ve salınan; vurgular 1 ve 4\'te.' },
];

export const getPattern = (id: string) => PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];

export function parseSteps(steps: string): Step[] {
  return [...steps].map((c) => {
    switch (c) {
      case 'D': return { dir: 'down', accent: true, muted: false };
      case 'd': return { dir: 'down', accent: false, muted: false };
      case 'U': return { dir: 'up', accent: true, muted: false };
      case 'u': return { dir: 'up', accent: false, muted: false };
      case 'X': return { dir: 'down', accent: true, muted: true };
      case 'x': return { dir: 'down', accent: false, muted: true };
      default: return null;
    }
  });
}

export const meterInfo = (m: Meter) => METERS.find((x) => x.id === m)!;

/** Seconds per step at `bpm` counted pulses per minute. */
export const stepSeconds = (p: StrumPattern, bpm: number) => 60 / bpm / p.perPulse;

/** Count label of each step: "1 ve 2 ve…", sixteenths "1 e ve a", 6/8 "1 2 3 4 5 6". */
export function countLabels(p: StrumPattern): string[] {
  const n = p.steps.length;
  return Array.from({ length: n }, (_, i) => {
    if (p.meter === '6/8') return String(i + 1);
    const beat = Math.floor(i / p.perPulse) + 1;
    const sub = i % p.perPulse;
    if (sub === 0) return String(beat);
    if (p.perPulse === 4) return ['', 'e', 've', 'a'][sub];
    return 've';
  });
}

export interface StepEvent {
  /** Seconds from the start. */
  time: number;
  bar: number;
  index: number;
  stroke: Step;
  /** Metronome click on this step: 2 = bar start, 1 = pulse, 0 = none. */
  click: 0 | 1 | 2;
}

/** All step events of `bars` bars, starting at `start` seconds. */
export function stepEvents(p: StrumPattern, bpm: number, bars: number, start = 0): StepEvent[] {
  const steps = parseSteps(p.steps);
  const dt = stepSeconds(p, bpm);
  const out: StepEvent[] = [];
  for (let b = 0; b < bars; b++) {
    steps.forEach((stroke, i) => {
      const k = b * steps.length + i;
      out.push({ time: start + k * dt, bar: b, index: i, stroke, click: i === 0 ? 2 : i % p.perPulse === 0 ? 1 : 0 });
    });
  }
  return out;
}

/** Expected stroke times (rests excluded) of `bars` bars. */
export const strokeTimes = (p: StrumPattern, bpm: number, bars: number, start = 0) =>
  stepEvents(p, bpm, bars, start).filter((e) => e.stroke).map((e) => e.time);

/**
 * True when every down stroke falls on an even step and every up stroke on an odd one: the hand
 * swings down-up without stopping. Not applied to 6/8, which is felt in threes.
 */
export function handMotionConsistent(p: StrumPattern): boolean {
  if (p.meter === '6/8') return true;
  return parseSteps(p.steps).every((s, i) => !s || (s.dir === 'down' ? i % 2 === 0 : i % 2 === 1));
}
