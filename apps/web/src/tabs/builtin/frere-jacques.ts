import type { BuiltinLessonDef } from './types';

/** Traditional French round (public domain), in C major. */
export const frereJacques: BuiltinLessonDef = {
  id: 'frere-jacques',
  title: 'Frère Jacques',
  level: 2,
  tempo: 90,
  source: 'public-domain',
  goal: 'An introduction to eighth notes and moving between three strings.',
  description: 'Traditional French round. Each phrase is played twice; eighth notes arrive in the fifth bar.',
  tip: 'Count the eighths "one-and-two-and" and use down-up picking. In the last two bars, keep your fretting hand in place as you drop to the open G of the 3rd string.',
  bars: `
:4 1.2 3.2 0.1 1.2 | 1.2 3.2 0.1 1.2 |
0.1.4 1.1.4 3.1.2 | 0.1.4 1.1.4 3.1.2 |
3.1.8 5.1.8 3.1.8 1.1.8 0.1.4 1.2.4 | 3.1.8 5.1.8 3.1.8 1.1.8 0.1.4 1.2.4 |
1.2.4 0.3.4 1.2.2 | 1.2.4 0.3.4 1.2.2
`,
};
