import type { BuiltinLessonDef } from './types';

/** Ludwig van Beethoven, Symphony No. 9 theme (public domain), in C major. */
export const odeToJoy: BuiltinLessonDef = {
  id: 'ode-to-joy',
  title: 'Neşeye Övgü (Beethoven)',
  level: 2,
  tempo: 96,
  source: 'public-domain',
  goal: 'Uzun bir melodiyi ezberden çalmak; noktalı dörtlük ritmi.',
  description: 'Beethoven\'ın 9. Senfonisi\'nin ünlü teması. Birinci pozisyonda, 1. ve 2. tellerde çalınır.',
  tip: 'Melodi dört cümleden oluşur; her cümleyi ayrı döngüye alıp sonra birleştir. Noktalı dörtlükte "bir-ve-iki" say, kısa nota "ve" üzerine gelir.',
  bars: `
:4 0.1 0.1 1.1 3.1 | 3.1 1.1 0.1 3.2 | 1.2 1.2 3.2 0.1 | 0.1.4{d} 3.2.8 3.2.2 |
0.1.4 0.1.4 1.1.4 3.1.4 | 3.1 1.1 0.1 3.2 | 1.2 1.2 3.2 0.1 | 3.2.4{d} 1.2.8 1.2.2 |
3.2.4 3.2.4 0.1.4 1.2.4 | 3.2.4 0.1.8 1.1.8 0.1.4 1.2.4 | 3.2.4 0.1.8 1.1.8 0.1.4 3.2.4 | 1.2.4 3.2.4 0.3.2 |
0.1.4 0.1.4 1.1.4 3.1.4 | 3.1 1.1 0.1 3.2 | 1.2 1.2 3.2 0.1 | 3.2.4{d} 1.2.8 1.2.2
`,
};
