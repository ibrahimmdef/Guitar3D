import type { BuiltinLessonDef } from './types';

export const openChords: BuiltinLessonDef = {
  id: 'open-chords',
  title: 'Chord Changes: C - G - Am - F',
  level: 3,
  tempo: 70,
  source: 'original',
  goal: 'Change between four basic chords without breaking the rhythm.',
  description: 'The C - G - Am - F progression behind thousands of songs. First each chord twice, then chord changes within the bar. F is played here in its small (four-string) form.',
  tip: 'One beat before the change, lift your fingers and form the new shape in the air. C and Am share the index and middle fingers; on F, press the 1st and 2nd strings together with your index finger.',
  bars: `
:2 (3.5 2.4 0.3 1.2 0.1) (3.5 2.4 0.3 1.2 0.1) |
(3.6 2.5 0.4 0.3 0.2 3.1) (3.6 2.5 0.4 0.3 0.2 3.1) |
(0.5 2.4 2.3 1.2 0.1) (0.5 2.4 2.3 1.2 0.1) |
(3.4 2.3 1.2 1.1) (3.4 2.3 1.2 1.1) |
(3.5 2.4 0.3 1.2 0.1) (3.6 2.5 0.4 0.3 0.2 3.1) |
(0.5 2.4 2.3 1.2 0.1) (3.4 2.3 1.2 1.1) |
(3.5 2.4 0.3 1.2 0.1) (3.6 2.5 0.4 0.3 0.2 3.1) |
(3.5 2.4 0.3 1.2 0.1).1
`,
};
