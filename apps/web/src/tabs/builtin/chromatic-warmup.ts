import type { BuiltinLessonDef } from './types';

export const chromaticWarmup: BuiltinLessonDef = {
  id: 'chromatic-warmup',
  title: 'Chromatic Warm-up 1-2-3-4',
  level: 1,
  tempo: 66,
  source: 'original',
  goal: 'One finger per fret: fretting-hand finger independence and syncing both hands.',
  description: 'Press frets 1, 2, 3 and 4 in turn with the index, middle, ring and pinky; go from the low string to the high one, then come back down.',
  tip: 'Lift your fingers at most 1 cm off the string and keep each pressed finger in place until the next note sounds. Alternate the pick down and up.',
  bars: `
:8 1.6 2.6 3.6 4.6 1.5 2.5 3.5 4.5 |
1.4 2.4 3.4 4.4 1.3 2.3 3.3 4.3 |
1.2 2.2 3.2 4.2 1.1 2.1 3.1 4.1 |
4.1 3.1 2.1 1.1 4.2 3.2 2.2 1.2 |
4.3 3.3 2.3 1.3 4.4 3.4 2.4 1.4 |
4.5 3.5 2.5 1.5 4.6 3.6 2.6 1.6 |
1.6.1
`,
};
