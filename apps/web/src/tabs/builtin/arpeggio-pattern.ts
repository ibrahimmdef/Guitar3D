import type { BuiltinLessonDef } from './types';

export const arpeggioPattern: BuiltinLessonDef = {
  id: 'arpeggio-pattern',
  title: 'Arpeggio Pattern: Am - C - G - Em',
  level: 2,
  tempo: 72,
  source: 'original',
  goal: 'Pick the strings one at a time while holding the chord; string skipping in the picking hand.',
  description: 'One chord per bar: go up from the bass note to the thin strings and back. The chord shape stays held through the bar.',
  tip: 'Fret the whole chord at the start of the bar and let the notes ring over each other. Going from Am to C, the index and middle fingers stay in place; only the ring finger moves.',
  bars: `
:8 0.5 2.4 2.3 1.2 0.1 1.2 2.3 2.4 |
3.5 2.4 0.3 1.2 0.1 1.2 0.3 2.4 |
3.6 0.4 0.3 0.2 3.1 0.2 0.3 0.4 |
0.6 2.5 2.4 0.3 0.2 0.3 2.4 2.5 |
0.5 2.4 2.3 1.2 0.1 1.2 2.3 2.4 |
3.5 2.4 0.3 1.2 0.1 1.2 0.3 2.4 |
3.6 0.4 0.3 0.2 3.1 0.2 0.3 0.4 |
(0.5 2.4 2.3 1.2 0.1).1
`,
};
