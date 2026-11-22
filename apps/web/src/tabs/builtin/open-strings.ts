import type { BuiltinLessonDef } from './types';

export const openStrings: BuiltinLessonDef = {
  id: 'open-strings',
  title: 'Open Strings',
  level: 1,
  tempo: 70,
  source: 'original',
  goal: 'Get to know the six strings and pick them one at a time with even strokes.',
  description: 'The fretting hand doesn\'t press at all. Play each string four times, then move across the strings in order.',
  tip: 'Play every note with a downstroke and count with the metronome: 1-2-3-4. Rest your wrist lightly on the bridge and touch the string with just the tip of the pick.',
  bars: `
:4 0.6 0.6 0.6 0.6 | 0.5 0.5 0.5 0.5 | 0.4 0.4 0.4 0.4 |
0.3 0.3 0.3 0.3 | 0.2 0.2 0.2 0.2 | 0.1 0.1 0.1 0.1 |
0.1 0.2 0.3 0.4 | 0.5 0.6 0.5 0.4 | 0.3 0.2 0.1 0.2 |
0.6.1
`,
};
