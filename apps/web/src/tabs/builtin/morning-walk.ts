import type { BuiltinLessonDef } from './types';

/** Short melody written for this app (A minor, first five frets). */
export const morningWalk: BuiltinLessonDef = {
  id: 'morning-walk',
  title: 'Morning Walk',
  level: 3,
  tempo: 88,
  source: 'original',
  goal: 'Combine what you\'ve learned in one melody: string changes, mixed rhythm and the first five frets.',
  description: 'An original eight-bar melody in A minor. Quarter, eighth and half notes together.',
  tip: 'Clap and count the rhythm first, then play. Reach with your pinky for the 5th fret in bar 6; the G sharp in bar 7 (3rd string, 1st fret) gives the melody its minor color; fret it with your index finger.',
  bars: `
:4 2.3 1.2 0.1 1.2 |
3.2.8 0.1.8 1.1.4 0.1.2 |
3.1.4 0.1.4 3.2.8 1.2.8 0.2.4 |
2.3.2 2.4.2 |
2.3.4 1.2.4 0.1.4 3.1.4 |
5.1.8 3.1.8 1.1.4 0.1.2 |
3.2.8 0.1.8 3.2.8 1.2.8 0.2.4 1.3.4 |
2.3.1
`,
};
