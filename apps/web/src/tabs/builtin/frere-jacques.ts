import type { BuiltinLessonDef } from './types';

/** Traditional French round (public domain), in C major. */
export const frereJacques: BuiltinLessonDef = {
  id: 'frere-jacques',
  title: 'Tembel Çocuk (Frère Jacques)',
  level: 2,
  tempo: 90,
  source: 'public-domain',
  goal: 'Sekizlik notalara giriş ve üç tel arasında geçiş.',
  description: 'Geleneksel Fransız kanonu. Her cümle iki kez çalınır; beşinci ölçüde sekizlik notalar gelir.',
  tip: 'Sekizlikleri "bir-ve-iki-ve" diye say ve aşağı-yukarı pena kullan. Son iki ölçüde 3. telin açık Sol notasına inerken sol elini yerinden oynatma.',
  bars: `
:4 1.2 3.2 0.1 1.2 | 1.2 3.2 0.1 1.2 |
0.1.4 1.1.4 3.1.2 | 0.1.4 1.1.4 3.1.2 |
3.1.8 5.1.8 3.1.8 1.1.8 0.1.4 1.2.4 | 3.1.8 5.1.8 3.1.8 1.1.8 0.1.4 1.2.4 |
1.2.4 0.3.4 1.2.2 | 1.2.4 0.3.4 1.2.2
`,
};
