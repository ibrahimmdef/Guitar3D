import type { BuiltinLessonDef } from './types';

export const hammerPull: BuiltinLessonDef = {
  id: 'hammer-pull',
  title: 'Hammer-on and Pull-off Practice',
  level: 3,
  tempo: 72,
  source: 'original',
  goal: 'Pick once and sound the second note with the fretting hand only (legato).',
  description: 'First hammer-ons from an open string, then pull-offs to an open string, and finally both between fretted notes.',
  tip: 'For a hammer-on, bring the finger down just behind the fret like a hammer. For a pull-off, don\'t lift the finger straight up; release the string with a slight downward pull. Play slowly until both notes sound equally loud.',
  bars: `
:8 0.1{h} 2.1 0.1{h} 3.1 0.2{h} 1.2 0.2{h} 3.2 |
0.3{h} 2.3 0.4{h} 2.4 0.5{h} 2.5 0.6{h} 3.6 |
3.1{h} 0.1 2.1{h} 0.1 3.2{h} 0.2 1.2{h} 0.2 |
2.3{h} 0.3 2.4{h} 0.4 2.5{h} 0.5 3.6{h} 0.6 |
2.3{h} 4.3 4.3{h} 2.3 2.4{h} 4.4 4.4{h} 2.4 |
(0.6 2.5 2.4).1
`,
};
