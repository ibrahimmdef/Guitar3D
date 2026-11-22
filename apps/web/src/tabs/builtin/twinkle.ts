import type { BuiltinLessonDef } from './types';

/** Traditional melody (public domain), in C major on the two thinnest strings. */
export const twinkle: BuiltinLessonDef = {
  id: 'twinkle',
  title: 'Twinkle Twinkle Little Star',
  level: 1,
  tempo: 80,
  source: 'public-domain',
  goal: 'First melody: find notes on two strings and count a quarter/half-note rhythm.',
  description: 'The traditional children\'s song everyone knows. Uses only the 1st and 2nd strings.',
  tip: 'Put your index finger on the 1st fret and ring finger on the 3rd; for the A on the 5th fret, reach with your pinky without shifting your hand. Hold half notes for two beats.',
  bars: `
:4 1.2 1.2 3.1 3.1 | 5.1 5.1 3.1.2 |
1.1.4 1.1.4 0.1.4 0.1.4 | 3.2.4 3.2.4 1.2.2 |
3.1.4 3.1.4 1.1.4 1.1.4 | 0.1.4 0.1.4 3.2.2 |
3.1.4 3.1.4 1.1.4 1.1.4 | 0.1.4 0.1.4 3.2.2 |
1.2.4 1.2.4 3.1.4 3.1.4 | 5.1.4 5.1.4 3.1.2 |
1.1.4 1.1.4 0.1.4 0.1.4 | 3.2.4 3.2.4 1.2.2
`,
};
