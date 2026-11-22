import type { BuiltinLessonDef } from './types';

export const emPentatonic: BuiltinLessonDef = {
  id: 'em-pentatonic',
  title: 'E Minor Pentatonic Box',
  level: 2,
  tempo: 76,
  source: 'original',
  goal: 'Memorize the E minor pentatonic scale in open position: the most used pattern in solos.',
  description: 'Two notes per string: the open string and the 2nd or 3rd fret. Up and down across six strings plus a short closing phrase.',
  tip: 'Use your middle finger on the 2nd fret and your ring finger on the 3rd, so your hand never shifts. Keep the down-up picking order across every string change.',
  bars: `
:8 0.6 3.6 0.5 2.5 0.4 2.4 0.3 2.3 |
0.2 3.2 0.1 3.1 3.1 0.1 3.2 0.2 |
2.3 0.3 2.4 0.4 2.5 0.5 3.6 0.6 |
0.6 3.6 0.5 2.5 0.4 2.4 0.3 2.3 |
0.2 3.2 0.1 3.1 3.1 0.1 3.2 0.2 |
2.3 0.3 2.4 0.4 2.5 0.5 3.6 0.6 |
0.1 3.2 0.2 2.3 0.3 2.4 0.4 2.5 |
0.6.1
`,
};
